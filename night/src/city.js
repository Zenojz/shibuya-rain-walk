// The buildings: every one round the crossing as OpenStreetMap has it (its footprint, its height), raised and
// clothed by what it is — the towers in glass curtain walls, their offices lit floor by floor (a firm to each run
// of windows, its own white or warm light, some working late, some gone home), looked into: the ceiling's rows
// of lights, the rooms' depth behind the glass; the mid-rise blocks of the shopping streets in their panels and
// windows; and every ground floor that faces a street a lit shop front, its light spilling onto the pavement.
// All drawn by one facade shader, from a few numbers on each wall (how far along it, how high, what kind).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { U, GLSL_COMMON, col } from './materials.js';
import { rng } from './util.js';
import { GLASS_RAIN } from './glassrain.js';
import { offset } from './geom.js';

// what each building is dressed as
export const KIND = { OFFICE: 0, GLASS: 1, FLATS: 2, SHOPS: 3, STATION: 4 };
// the towers with a hotel in them, and where (metres up): its rooms lit warm, the offices round them white
//   (セルリアンタワー: offices low, the Tokyu hotel's rooms above about the 17th floor; 渋谷ストリーム: the Excel
//   hotel on the 9th–13th floors — Panasonic's lighting report)
const HOTEL = { 'セルリアンタワー': [70, 160], '渋谷ストリーム': [38, 60] };
// the towers in the escalators' view drawn as they are (round 15), each its parts up its height [from, to, kind, colour]:
//   渋谷PARCO   its shopping floors (to about 40 m), and over them the tower a curtain wall of blue glass — Takenaka's
//               rendering (Impress Watch, 2019-06)
//   道玄坂通     dark grey in horizontal louvres; its shops, its offices 2–10F, Hotel Indigo 11–28F — PPIH's rendering and
//               the floor guide (Travel Watch, 2023)
const STYLE = {
  '渋谷Parco': [[0, 40, KIND.SHOPS, '#cfccc4'], [40, null, 7, '#6f7f96']],
  '道玄坂通 dogenzaka-dori': [[0, 9, KIND.SHOPS, '#3a3d43'], [9, 44, 8, '#2c2f34'], [44, null, 9, '#2c2f34']],
};
const named = {
  'Q-FRONT': 'custom', 'MAGNET SHIBUYA': 'custom', '渋谷スクランブルスクエア': 'custom', '渋谷駅前ビル': 'custom', 'Shibuya 109': 'custom',
};
function kindOf(b, h) {
  if (b.kind === 'train_station') return KIND.STATION;
  if (b.kind === 'apartments' || b.kind === 'residential' || /ホテル|hotel|マンション/i.test(b.name)) return KIND.FLATS;
  if (h > 60) return KIND.GLASS;
  if (b.kind === 'retail' || b.kind === 'commercial') return KIND.SHOPS;
  return h > 24 ? KIND.OFFICE : KIND.SHOPS;
}

const FACADE_GLSL = /* glsl */`
  // the kinds: floor height, window module, glass (0 punched windows … 1 a curtain wall), how many lights are on
  void kindParams(float kind, out float fh, out float mw, out float glassy, out float litK){
    if (kind < 0.5) { fh = 3.6; mw = 1.8; glassy = 0.45; litK = 0.55; }        // office block
    else if (kind < 1.5) { fh = 4.1; mw = 1.5; glassy = 1.0; litK = 0.62; }    // glass tower
    else if (kind < 2.5) { fh = 3.0; mw = 2.4; glassy = 0.35; litK = 0.45; }   // flats, hotels
    else if (kind < 3.5) { fh = 3.5; mw = 2.2; glassy = 0.3; litK = 0.5; }     // shopping-street block
    else if (kind < 4.5) { fh = 5.0; mw = 3.0; glassy = 0.7; litK = 0.9; }     // the station
    else if (kind < 5.5) { fh = 5.0; mw = 1.0; glassy = 1.0; litK = 1.0; }     // a store's glass front, every floor open
    else if (kind < 6.5) { fh = 4.4; mw = 1.2; glassy = 1.0; litK = 0.9; }     // a landmark tower's offices
    else if (kind < 7.5) { fh = 4.2; mw = 1.5; glassy = 1.0; litK = 0.62; }    // a curtain wall, all glass (渋谷PARCO's tower)
    else { fh = 3.8; mw = 1.8; glassy = 0.55; litK = 0.6; }                    // a tower in horizontal louvres (道玄坂通: 8 its offices, 9 its hotel)
  }
  // looking into a lit room behind the glass: the ray goes in through (fu, fv) of the window and meets the
  // ceiling (rows of light panels), the floor (desks), or the back wall
  vec3 roomColour(vec3 Vt, float fu, float fv, float mw, float fh, vec3 lightC, float seed, float zoneU, float kind){
    vec3 ro = vec3(fu * mw, fv * fh, 0.0), rd = normalize(-Vt);
    float D = 5.0 + 3.0 * hash12(vec2(seed, 1.7)), ceil = fh - 0.45, flo = 0.0, desk = 0.74;
    float tb = D / max(-rd.z, 1e-3), tc = rd.y > 0.0 ? (ceil - ro.y) / rd.y : 1e9, tf = rd.y < 0.0 ? (flo - ro.y) / rd.y : 1e9, td = rd.y < 0.0 && ro.y > desk ? (desk - ro.y) / rd.y : 1e9;
    float t = min(tb, min(tc, tf));
    vec3 hit = ro + rd * t, c;
    if (t == tc) {
      // the ceiling: tiles, and lights in rows — long panels across the room, every 2.4 m along and 1.8 m deep
      vec2 q = vec2(hit.x + zoneU, hit.z) / vec2(2.4, 1.8); vec2 f = fract(q);
      float panel = step(abs(f.x - 0.5), 0.3) * step(abs(f.y - 0.5), 0.09);
      if (kind > 1.5 && kind < 2.5) panel = step(length((f - 0.5) * vec2(2.4, 1.8)), 0.22);   // (a hotel room's round downlight)
      c = lightC * (0.3 + 1.5 * panel) * exp(-t * 0.06);
    } else if (t == tf && td < tb) {
      // a desk top: some places light, some a dark monitor; the floor between dark
      vec3 hd = ro + rd * td; vec2 q = vec2(hd.x + zoneU, hd.z) / vec2(1.6, 2.2); vec2 id = floor(q), f = fract(q);
      float onDesk = step(abs(f.y - 0.5), 0.3) * step(abs(f.x - 0.5), 0.46);
      float mon = step(0.55, hash12(id + seed)) * step(abs(f.y - 0.62), 0.08) * step(abs(f.x - 0.5), 0.2);
      c = onDesk > 0.5 ? lightC * mix(0.55, 0.12, mon) + vec3(0.05, 0.12, 0.25) * mon * 2.0 : lightC * 0.12;
    } else if (t == tf) {
      c = lightC * 0.14;
    } else {
      // the back wall, with a darker band of furniture along its foot
      c = lightC * mix(0.5, 0.28, step(hit.y, 1.1)) * exp(-t * 0.05);
    }
    return c;
  }
  // a shop behind its window, looked into: a white ceiling of downlights, a light tiled floor, two rows of low
  // gondolas of goods across it, tall shelving at the back under the shop's band of colour, people about.
  // The goods are things, not a picture of them: each a box (or a few bottles) standing on its shelf board, set
  // back a little or forward, its own height; its face, its top (lit from the ceiling, brighter) and its side
  // (darker) each seen as the eye looks in, the gaps between them dark, the board's edge catching the light.
  vec3 packaging(float h, float h2){
    // real packs: mostly white or pale with one strong colour; some all colour; a few dark
    vec3 strong = 0.5 + 0.5 * cos(6.2831 * (h + vec3(0.0, 0.33, 0.67))); strong = mix(vec3(dot(strong, vec3(0.333))), strong, 0.72);
    return h2 < 0.45 ? mix(vec3(0.93, 0.92, 0.9), strong, 0.25) : h2 < 0.85 ? strong * 0.9 + 0.05 : vec3(0.16, 0.15, 0.17);
  }
  // shelving whose front is qf into the shop, its back qb, its boards every rowH from y0 to y1; the ray (ro, rd) in
  // the bay's frame (x along, y up, q = -z into the shop). tHit < 0 when the ray misses it.
  uniform sampler2D uPack; uniform float uPackOn; float gPix = 0.01, gCamD = 5.0;   // (set at the top of main: a pixel's size on the wall, the camera's distance)
  vec3 shelving(vec3 ro, vec3 rd, float qf, float qb, float y0, float y1, float rowH, float seed, vec3 L, float aisle, out float tHit){
    tHit = -1.0;
    float rq = -rd.z; if (rq < 1e-3) return vec3(0.0);
    float tf = qf / rq; vec3 hf = ro + rd * tf;
    if (hf.y < y0 || hf.y > y1) return vec3(0.0);
    if (aisle > 0.0 && step(abs(fract((hf.x + seed * 2.0) / aisle) - 0.5), 0.12) > 0.5) return vec3(0.0);
    tHit = tf;
    float row = floor((hf.y - y0) / rowH), yb = y0 + row * rowH + 0.035, yt = yb + rowH - 0.035;
    // the board's front edge: a pale lip with the price strip
    if (hf.y < yb) return mix(vec3(0.85), vec3(0.95, 0.9, 0.4), step(0.5, fract(hf.x * 1.3 + seed))) * L * 0.9;
    // which item along the board
    float cw = 0.24, sx = hf.x + seed * 7.0 + row * 0.37, ci = floor(sx / cw);
    float h1 = hash12(vec2(ci, row + seed * 3.0)), h2 = hash12(vec2(ci + 5.0, row - seed)), h3 = hash12(vec2(ci - 2.0, row + 9.0 + seed));
    float bottles = step(0.7, h3);                                     // (a few bottles in a row, narrow, a cap each)
    float sub = bottles > 0.5 ? cw / 3.0 : cw, si = floor(sx / sub), sx0 = si * sub;
    float gap = bottles > 0.5 ? 0.012 : 0.018;
    float x0 = sx0 + gap - (seed * 7.0 + row * 0.37), x1 = sx0 + sub - gap - (seed * 7.0 + row * 0.37);
    float hi = (rowH - 0.035) * (bottles > 0.5 ? 0.82 + 0.1 * h1 : 0.5 + 0.42 * h1);
    float inset = 0.03 + 0.12 * h2, bq0 = qf + inset, bq1 = qb - 0.02;
    // the ray against that item's box: slabs in x, y, q
    vec3 bmin = vec3(x0, yb, bq0), bmax = vec3(x1, yb + hi, bq1);
    vec3 o = vec3(ro.x, ro.y, 0.0), d = vec3(rd.x, rd.y, rq);
    vec3 inv = 1.0 / (abs(d) + 1e-5) * sign(d + 1e-7);
    vec3 ta = (bmin - o) * inv, tb = (bmax - o) * inv, t0 = min(ta, tb), t1 = max(ta, tb);
    float tn = max(max(t0.x, t0.y), t0.z), tx = min(min(t1.x, t1.y), t1.z);
    vec3 goods = packaging(h1 * 3.1 + h2, hash12(vec2(ci + 11.0, row * 1.7 + seed)));
    if (tn < tx && tn > 0.0) {
      tHit = tn; vec3 p = o + d * tn;
      float face = t0.z >= max(t0.x, t0.y) ? 0.0 : t0.y >= t0.x ? 1.0 : 2.0;   // 0 its front, 1 its top, 2 its side
      vec3 c = goods;
      if (face < 0.5) {
        float v = (p.y - yb) / hi;
        // its print, from the same packaging picture as the store's goods (packs.js): a bottle's label, a pack's front;
        // the mip level from how big a texel is from here (the window's pixel, grown by the depth looked through)
        float tile = bottles > 0.5 ? 128.0 + floor(h1 * 48.0) : floor(h2 * 128.0);
        vec2 cell = vec2(mod(tile, 16.0), 15.0 - floor(tile / 16.0)), uvt = (cell + 0.02 + clamp(vec2((p.x - x0) / (x1 - x0), v), 0.0, 1.0) * 0.96) / 16.0;
        float lod = log2(max(gPix * (1.0 + tn / max(gCamD, 0.5)) * 2048.0 / ((x1 - x0) * 16.0) * 1.0, 1e-4));
        c = uPackOn > 0.5 ? textureLod(uPack, uvt, clamp(lod, 0.0, 7.0)).rgb : c;
        c *= 0.82 + 0.18 * v;                                          // (the board above shades its foot)
      } else if (face < 1.5) c *= 1.18;                                // (the top, under the ceiling's lights)
      else c *= 0.62;                                                  // (its side)
      return c * L;
    }
    // missed the item: the dark gap behind, down to the board or the back panel
    return (rd.y < 0.0 ? vec3(0.42, 0.42, 0.44) : vec3(0.2, 0.2, 0.22)) * L * (0.6 + 0.4 * smoothstep(yt, yb, hf.y));
  }
  vec3 shopColour(vec3 Vt, float fu, float fv, float bw, float bh, float seed, float kindS){
    vec3 ro = vec3(fu * bw, fv * bh, 0.0), rd = normalize(-Vt);
    float D = 6.5 + 2.0 * hash12(vec2(seed, 5.0)), C = 3.0;
    vec3 L = kindS < 0.45 ? vec3(1.0, 0.99, 0.95) : kindS < 0.75 ? vec3(1.0, 0.86, 0.68) * 0.85 : vec3(0.95, 0.9, 1.0) * 0.9;
    vec3 band = 0.5 + 0.5 * cos(6.2831 * (hash12(vec2(seed, 13.0)) + vec3(0.0, 0.33, 0.67)));
    float tb = D / max(-rd.z, 1e-3), tc = rd.y > 0.0 ? (C - ro.y) / rd.y : 1e9, tf = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
    float t = min(tb, min(tc, tf));
    // the low gondolas (two rows, 1.45 m tall, 0.6 m deep) and the people among them, nearest first
    for (int k = 0; k < 2; k++) {
      float dz = 2.0 + 2.3 * float(k), th; 
      vec3 sc = shelving(ro, rd, dz - 0.6, dz, 0.08, 1.45, 0.34, seed + float(k), L * (0.95 - 0.1 * float(k)), 3.6, th);
      if (th > 0.0 && th < t) return sc * exp(-th * 0.03);
      float tg = dz / max(-rd.z, 1e-3); vec3 hg = ro + rd * tg;
      if (tg < t && hg.y > 0.0) {
        // someone in the aisle
        float px = fract((hg.x + seed * 5.0 + float(k) * 1.7) / 4.3) - 0.5, ph = 1.55 + 0.2 * hash12(vec2(seed, float(k)));
        if (abs(px) < 0.11 && hg.y < ph && hash12(vec2(floor((hg.x + seed * 5.0 + float(k) * 1.7) / 4.3), seed + float(k))) < 0.55) {
          vec3 cloth = 0.25 + 0.5 * cos(6.2831 * (hash12(vec2(floor(hg.x / 4.3), seed * 3.0 + float(k))) + vec3(0.0, 0.33, 0.67)));
          return (hg.y > ph - 0.25 ? vec3(0.95, 0.8, 0.7) * 0.6 : cloth * 0.55) * L;
        }
      }
    }
    // the tall shelving along the back wall, under the shop's band
    { float th; vec3 sc = shelving(ro, rd, D - 0.45, D, 0.15, 2.2, 0.36, seed + 7.0, L * 0.9, 0.0, th); if (th > 0.0 && th < t + 0.5) return sc * exp(-th * 0.03); }
    vec3 hit = ro + rd * t, c;
    if (t == tc) {
      vec2 q = fract(vec2(hit.x, hit.z) / 1.2) - 0.5; float dl = exp(-dot(q, q) * 90.0);
      c = L * (0.6 + 1.7 * dl);
    } else if (t == tf) {
      vec2 tl = fract(hit.xz / 0.6); float j = step(0.04, tl.x) * step(0.04, tl.y);
      c = L * (0.5 + 0.12 * j) + L * 0.25 * exp(-dot(fract(hit.xz / 1.2) - 0.5, fract(hit.xz / 1.2) - 0.5) * 30.0);   // (the downlights in the shine of the floor)
    } else {
      float bandK = step(2.3, hit.y) * step(hit.y, 2.75);
      c = mix(L * 0.7, band * 1.3, bandK);
    }
    return c * exp(-min(t, 14.0) * 0.03);
  }
`;

function facadeMaterial() {
  return new THREE.ShaderMaterial({
    name: 'facade',
    uniforms: { ...U, uPack: { value: null }, uPackOn: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec4 aFac; attribute vec3 color; attribute vec3 aT;
      varying vec4 vFac; varying vec3 vN, vW, vC, vT; flat varying float vSeed;
      void main(){ vFac = aFac; vSeed = aFac.z; vC = color; vN = normalize(mat3(modelMatrix) * normal); vT = aT; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      ${GLSL_COMMON}
      ${FACADE_GLSL}
      varying vec4 vFac; varying vec3 vN, vW, vC, vT; uniform float uCheap;
      // (the wall's seed not interpolated: up to ~1000, a constant interpolated came out a little different at each
      // pixel on some GPUs (D3D11), and the hashes made every pixel a different window: the walls sparkled)
      flat varying float vSeed;
      void main(){
        vec3 n = normalize(vN), T = normalize(vec3(vT.x, 0.0, vT.z)), B = vec3(0.0, 1.0, 0.0);
        gPix = length(fwidth(vW)); gCamD = distance(cameraPosition, vW);
        float u = vFac.x, v = vFac.y, seed = vSeed, kind = vFac.w;
        float fh, mw, glassy, litK; kindParams(kind, fh, mw, glassy, litK);
        mw *= 0.85 + 0.3 * hash12(vec2(seed, 3.0));
        float fl = floor(v / fh), fv = fract(v / fh), ci = floor(u / mw), fu = fract(u / mw);
        // how big a window is on the screen: far away, the detail gives way to its average
        float cell = max(fwidth(u / mw), fwidth(v / fh));
        // the glass of the window, and the frame and spandrel round it
        float mull = mix(0.2, 0.05, glassy), sill = mix(0.32, 0.2, glassy), head = mix(0.84, 0.97, glassy);
        bool curtain = kind > 6.5 && kind < 7.5; if (curtain) { mull = 0.03; sill = 0.025; head = 0.995; }   // (a curtain wall: glass floor to floor, a thin transom at each)
        float g = step(mull, fu) * step(fu, 1.0 - mull) * step(sill, fv) * step(fv, head);
        float edge = fwidth(fu) + fwidth(fv);
        g = smoothstep(0.0, 1.0, g);
        bool ground = v < 4.6 && kind < 3.5;
        // who is in. Offices: a firm to a long run of the floor (10–30 m), nearly every floor working late, a few whole
        // floors dark; flats and hotels: a room to a window, about half lit; the shopping blocks: a tenant to a floor
        float flats = max(step(1.5, kind) * step(kind, 2.5), step(8.5, kind)), shops = step(2.5, kind) * step(kind, 3.5);   // (9: a hotel's floors, lit as flats are)
        float zoneW = flats > 0.5 ? mw : shops > 0.5 ? 60.0 : kind > 5.5 ? 45.0 : 10.0 + 20.0 * hash12(vec2(seed, 9.0));
        float zoneOff = hash12(vec2(fl, seed + 1.0)) * zoneW;
        float zone = floor((u + zoneOff) / zoneW);
        float floorShare = flats > 0.5 || shops > 0.5 ? 1.0 : kind > 5.5 ? 0.88 : mix(0.88, 0.85, uDay);
        float floorOn = step(hash12(vec2(fl * 1.37, seed + 2.0)), floorShare);
        float r = hash13(vec3(fl, zone, seed));
        float onShare = flats > 0.5 ? 0.5 : shops > 0.5 ? 0.86 : kind > 5.5 ? 0.9 : 0.8;
        float onK = onShare * (fl < 1.0 ? 0.0 : 1.0);
        float on = step(r, onK) * floorOn;
        float warmth = hash13(vec3(zone, fl * 0.37, seed + 4.0));
        vec3 lightC = flats > 0.5 ? (warmth < 0.75 ? vec3(1.0, 0.8, 0.58) : vec3(0.9, 0.93, 1.0))
                    : warmth < 0.72 ? vec3(0.84, 0.92, 1.0) : warmth < 0.9 ? vec3(1.0, 0.9, 0.74) : vec3(0.92, 0.98, 0.9);
        if (shops > 0.5) { float tk = hash12(vec2(fl, seed)); lightC = tk < 0.45 ? vec3(1.0, 0.95, 0.88) : tk < 0.8 ? vec3(1.0, 0.8, 0.58) : tk < 0.9 ? vec3(0.85, 0.5, 1.0) : vec3(1.0, 0.45, 0.6); }   // (a café, a clinic, now and then a karaoke bar's colour)
        float cellK = 0.82 + 0.25 * hash13(vec3(ci, fl, seed + 6.0));
        float blinds = step(0.86, hash13(vec3(ci, fl, seed + 8.0)));
        lightC *= cellK * 0.95 * (1.0 - 0.45 * blinds * step(0.5, fract(fv * fh * 6.0)));
        // half the lit office zones only half lit (the desks gone home, the corridor's light on); the ordinary towers
        // a little dimmer than the landmarks, so the eye goes to those and to the street
        float dimZone = step(0.75, hash13(vec3(zone + 11.0, fl, seed))) * step(kind, 1.5);
        lightC *= mix(1.0, 0.5, dimZone) * (kind > 5.5 ? 1.0 : 0.92);
        // the view into the room, in the wall's own frame
        vec3 V = normalize(cameraPosition - vW), Vt = vec3(dot(V, T), dot(V, B), dot(V, n));
        vec3 room = on > 0.5 ? (uCheap > 0.5 ? lightC * 0.9 : roomColour(Vt, fu, fv, mw, fh, lightC, seed + fl * 7.0 + zone, u - fu * mw, kind > 8.5 ? 2.0 : kind)) : vec3(0.0);   // (in the wet street's mirror, just the room's light)
        if (kind > 4.5 && kind < 5.5) { on = 1.0; room = uCheap > 0.5 ? vec3(0.9, 0.85, 0.75) : shopColour(Vt, fract(u / 3.0), fv, 3.0, fh, seed + fl * 5.0 + floor(u / 3.0), 0.6 + 0.2 * hash12(vec2(fl, seed))) * 0.95; }
        // the unlit glass: a dark blue mirror of the night sky, lighter low down where it sees the street
        float up = reflect(-V, n).y;
        vec3 sky = mix(uHaze * 0.9, uSky * 0.55, smoothstep(-0.1, 0.5, up)) * 0.8 + vec3(0.01, 0.012, 0.02);
        float fres = 0.08 + 0.92 * pow(1.0 - max(dot(V, n), 0.0), 4.0);
        if (curtain) { fres = 0.32 + 0.68 * fres; sky *= 0.96 + 0.06 * hash12(vec2(fl, seed + 3.0)); }   // (reflective glass: the sky in it, a floor's panes a shade off the next)
        room *= mix(1.0, 0.55, uDay);                                     // (by day the sky in the glass outshines the rooms)
        vec3 glassC = room * (1.0 - fres * 0.6) + sky * mix(0.6, 1.0, fres);
        if (curtain) glassC = room * mix(1.0, 0.22, uDay) * (1.0 - fres * 0.6) + sky * mix(0.6, 1.0, fres) * vec3(0.9, 0.97, 1.08);   // (reflective glass: by day the sky in it, the rooms hardly seen; a little blue)
        if (kind > 6.5) glassC *= 1.0 - 0.32 * smoothstep(head - 0.16, head, fv);   // (set back in the wall: the head's shadow on the glass under it)
        if (kind > 7.5) glassC *= 0.8;                                    // (behind the louvres: less of the sky in it)
        // the wall: its own colour, lit as the street is
        vec3 wallC = cleanColour(vC) * mix(0.62, 1.0, uDay) * toonLight(n, vW) * (1.0 - 0.45 * contactShade(vW));
        float night = uLightsOn * (1.0 - uDay);
        wallC += cleanColour(vC) * night * (vec3(1.0, 0.84, 0.66) * (shops > 0.5 ? 0.26 : 0.15) * exp(-max(v - 3.0, 0.0) / 11.0) + vec3(0.05, 0.047, 0.045));
        // the ground floor: a shop front, lit (or the dark of a lobby)
        if (ground) {
          float bw = 4.0 + 3.0 * hash12(vec2(seed, 11.0)), bay = floor(u / bw), fb = fract(u / bw), bh = 3.3;
          float sh = hash12(vec2(bay, seed)), open = step(0.18, sh);
          float sg = step(0.35, v) * step(v, bh) * step(0.05, fb) * step(fb, 0.95);
          float mullion = 1.0 - step(0.02, abs(fract(u / (bw * 0.5)) - 0.5) * 2.0 - 0.0) ;
          vec3 shop = open > 0.5 ? (uCheap > 0.5 ? vec3(0.85, 0.82, 0.75) : shopColour(Vt, fb, clamp((v - 0.35) / (bh - 0.35), 0.0, 1.0), bw * 0.9, bh - 0.35, seed + bay * 3.7, hash12(vec2(bay + 9.0, seed)))) : vec3(0.02, 0.025, 0.04) + sky * 0.4;
          shop = mix(shop, sky * 1.2, fres * 0.35);
          // (in the rain, the drops on its glass: drawn over it by shopRainMesh() below)
          vec3 sc = mix(wallC, shop, sg);
          // the fascia over it: the shop's colour, its name in light
          float fascia = step(bh + 0.15, v) * step(v, bh + 1.0) * step(0.03, fb) * step(fb, 0.97);
          vec3 fc = 0.5 + 0.5 * cos(6.2831 * (hash12(vec2(bay, seed + 20.0)) + vec3(0.0, 0.33, 0.67)));
          float letters = step(0.45, vnoise(vec2(u * 2.6, v * 4.0) + bay * 17.0)) * step(abs(v - bh - 0.57), 0.22) * step(abs(fb - 0.5), 0.3);
          sc = mix(sc, mix(fc * 0.55, vec3(1.5), letters * open) * (0.5 + 0.9 * open), fascia);
          gl_FragColor = vec4(fogIt(sc, vW), 1.0); return;
        }
        vec3 c = mix(wallC, glassC, g);
        // further off, the windows too small to draw: each floor's run of offices as the average of its windows
        // (lit or not, its own light) — so the floors still band; then, a floor under a pixel, the wall's average
        float winA = (1.0 - 2.0 * mull) * (head - sill), roomK = 0.62 * mix(1.0, 0.55, uDay);
        vec3 skyA = sky * mix(0.45, 0.8, fres);
        vec3 mid = mix(wallC, lightC * on * roomK + skyA, winA);
        vec3 avgL = (flats > 0.5 ? vec3(1.0, 0.84, 0.66) : shops > 0.5 ? vec3(1.0, 0.88, 0.76) : vec3(0.88, 0.93, 1.0)) * 0.9;
        vec3 far = mix(wallC, avgL * onK * floorShare * roomK * (1.0 - 0.12 * step(kind, 1.5)) + skyA, winA);
        c = mix(c, mid, smoothstep(0.35, 0.8, cell));
        c = mix(c, far, smoothstep(1.0, 2.2, cell));
        if (kind > 7.5) {                                                 // (horizontal louvres over the whole face, every 45 cm, a third of it blade: grey metal lit from above; far off, their average)
          float lq = v / 0.45, lf = fract(lq), lw = fwidth(lq);
          float blade = smoothstep(0.62 - lw, 0.62 + lw, lf) * (1.0 - smoothstep(0.95 - lw, 0.95 + lw, lf));
          vec3 bladeC = vec3(0.3, 0.315, 0.345) * mix(0.5, 1.0, uDay) * toonLight(normalize(n + vec3(0.0, 0.8, 0.0)), vW) + vec3(0.015, 0.016, 0.02) * uLightsOn;
          c = mix(c, bladeC, mix(blade, 0.33, smoothstep(0.35, 1.0, lw)) * 0.92);
        }
        if (kind > 6.5) {                                                 // (its crown: the top 4.5 m a band of screen round the plant — lighter on the glass tower, dark on the louvred one)
          float top = vT.y;                                               // (the wall's top, metres: aT.y)
          float crown = step(top - 4.5, v);
          vec3 cc = (kind < 7.5 ? vec3(0.62, 0.66, 0.72) : vec3(0.2, 0.21, 0.235)) * mix(0.55, 1.0, uDay) * toonLight(n, vW) * (0.9 + 0.1 * step(0.5, fract(u / 0.3)));
          c = mix(c, cc, crown * step(1.0, top));
        }
        gl_FragColor = vec4(fogIt(c, vW), 1.0);
      }`,
  });
}

const roofMat = () => new THREE.ShaderMaterial({
  name: 'roof', uniforms: { ...U },
  vertexShader: `attribute vec3 color; varying vec3 vC, vN, vW; void main(){ vC = color; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  // (at night a roof is grey concrete in the glow of the signs and windows round it, its stains and patches seen)
  // (from above: the seams of its waterproofing every 2.5 m, darker where the rain stands and runs to the drains, the
  //  odd patch of repair — so it is a roof and not the top of a block)
  fragmentShader: `${GLSL_COMMON} varying vec3 vC, vN, vW; void main(){ vec3 n = normalize(vN); vec3 base = cleanColour(vC) * (0.85 + 0.3 * vnoise(vW.xz * 0.35)) * (0.92 + 0.08 * step(0.5, fract(vW.x * 0.25 + 0.5 * step(0.5, fract(vW.z * 0.25)))));
    if (n.y > 0.9) { vec2 q = vW.xz / 2.5, e = abs(fract(q) - 0.5), fw = fwidth(q);
      vec2 sm = smoothstep(vec2(0.5) - max(fw, 0.012) * 1.2, vec2(0.5), e); float seam = max(sm.x, sm.y) * (1.0 - smoothstep(0.15, 0.4, max(fw.x, fw.y)));
      float stain = smoothstep(0.55, 0.85, vnoise(vW.xz * 0.12 + 3.0)), repair = step(0.86, vnoise(floor(vW.xz / 3.0) * 0.7 + 9.0));
      base *= (1.0 - 0.12 * seam) * (1.0 - 0.22 * stain) * (1.0 + 0.1 * repair); }
    float night = uLightsOn * (1.0 - uDay); vec3 c = base * toonLight(n, vW) * (1.0 - 0.4 * night) + base * night * vec3(0.22, 0.2, 0.19); gl_FragColor = vec4(fogIt(c, vW), 1.0); }`,
});

export class City {
  constructor(L, light, { skip = new Set() } = {}) {
    const R = rng(731);
    this.list = []; this.colliders = []; this.towerTops = [];
    const walls = [], roofs = [];
    for (const b of L.buildings) {
      if (named[b.name] === 'custom' || skip.has(b.id)) { this.list.push({ b, custom: true }); continue; }
      let h = b.h ?? 10; if (b.part && !b.h) continue;
      const y0 = b.minh || 0; if (h - y0 < 2.5) continue;
      const d = Math.hypot(b.c[0], b.c[1]);
      const kind = kindOf(b, h), seed = (parseInt(b.id.slice(1)) % 997) + 0.5;
      // the wall colour: towers grey-blue glass frames, the street's blocks their tiles and panels
      const tone = kind === KIND.GLASS ? col(R.pick(['#5d6a80', '#6b7486', '#55607a', '#7a8494']))
        : col(R.pick(['#b9b2a8', '#a9adb4', '#c9c2b6', '#9aa0a8', '#8e8a86', '#d1cbc0', '#7d8696', '#b6a898']));
      const ht = HOTEL[b.name];
      const st = STYLE[b.name];
      if (st) for (const [a, z, k, c] of st) { const ya = Math.max(y0, a), yb = z == null ? h : Math.min(h, z); if (yb > ya) walls.push(wallGeometry(b.pts, ya, yb, k, seed + a * 0.013, col(c))); }
      else if (ht) { walls.push(wallGeometry(b.pts, y0, ht[0], kind, seed, tone), wallGeometry(b.pts, ht[0], Math.min(h, ht[1]), KIND.FLATS, seed + 0.25, tone)); if (h > ht[1]) walls.push(wallGeometry(b.pts, ht[1], h, kind, seed + 0.5, tone)); }
      else walls.push(wallGeometry(b.pts, y0, h, kind, seed, tone));
      if (y0 < 0.5) { const rc = col(R.pick(['#55595f', '#60646a', '#4b4f56', '#6c7074', '#5c6660', '#66625c'])); roofs.push(roofGeometry(b.pts, h, rc)); if (h >= 8) roofs.push(parapetGeometry(b.pts, h, rc.clone().multiplyScalar(1.22))); }   // (concrete greys, a green-grey or a warm grey coating; the parapet round its edge a little paler)
      this.list.push({ b, h, kind });
      if (y0 < 0.5) this.colliders.push(b.pts);
      // the shop fronts' light on the pavement: along every wall facing out, if near enough to be seen
      if (d < 260 && y0 < 0.5 && kind !== KIND.STATION) for (let i = 0; i < b.pts.length; i++) {
        const [x0, z0] = b.pts[i], [x1, z1] = b.pts[(i + 1) % b.pts.length], len = Math.hypot(x1 - x0, z1 - z0); if (len < 2.5) continue;
        const nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
        for (let s = 1.5; s < len - 1; s += 3.0) {
          if (R() < 0.3) continue;
          const warm = R() < 0.65, c = warm ? col('#ffd8a8', 0.9) : col('#d8e8ff', 0.8);
          light.pool(x0 + (x1 - x0) * s / len, z0 + (z1 - z0) * s / len, nx, nz, 4.5, 2.6, 4.2, c);
        }
      }
      if (h > 60) this.towerTops.push({ pts: b.pts, h });
    }
    this.facade = facadeMaterial(); this.roof = roofMat();
    this.meshes = [];
    const wg = mergeGeometries(walls), rg = mergeGeometries(roofs);
    if (wg) this.meshes.push(new THREE.Mesh(wg, this.facade));
    if (rg) this.meshes.push(new THREE.Mesh(rg, this.roof));
    for (const m of this.meshes) { m.matrixAutoUpdate = false; m.frustumCulled = false; }
    const sr = shopRainMesh(walls); if (sr) this.meshes.push(sr);
  }
}

// The rain on the shop windows of the ground floors (glassrain.js): a thin layer of its own laid over them — the
// strip of each shopping wall from 0.35 m to 3.3 m, the bays found as the facade shader finds them — darkening what
// shows through the glass and adding the drops' light (premultiplied: final = under * (1 - a) + rgb). Kept out of the
// facade shader: put in there it slowed every wall in the city (the shader grew too big to run fast).
export function shopRainMesh(geoms) {
  const P = [], N = [], F = [], Tn = [], Bs = [];
  for (const g of geoms) {
    const p = g.attributes.position.array, n = g.attributes.normal.array, fa = g.attributes.aFac.array, t = g.attributes.aT.array;
    for (let q = 0; q + 5 < g.attributes.position.count; q += 6) {   // (each wall a quad: b0, t1, b1, b0, t0, t1)
      const kind = fa[q * 4 + 3], glass = kind > 4.5 && kind < 5.5; if (kind > 3.5 && !glass) continue;   // (shopping walls' ground floors; the all-glass fronts and the subway's glass stair-houses)
      const yb0 = fa[q * 4 + 1], yt = fa[(q + 1) * 4 + 1], ya = glass ? yb0 + 0.08 : Math.max(yb0, 0.35), yc = glass ? Math.min(yt, yb0 + 4.6) : Math.min(yt, 3.3); if (yc <= ya + 0.05) continue;
      const b0 = q, b1 = q + 2, seed = fa[q * 4 + 2], u0 = fa[b0 * 4], u1 = fa[b1 * 4];
      const X0 = [p[b0 * 3], p[b0 * 3 + 2]], X1 = [p[b1 * 3], p[b1 * 3 + 2]];
      for (const [X, y, uu] of [[X0, ya, u0], [X1, yc, u1], [X1, ya, u1], [X0, ya, u0], [X0, yc, u0], [X1, yc, u1]]) {
        P.push(X[0], y, X[1]); N.push(n[q * 3], 0, n[q * 3 + 2]); F.push(uu, y, seed, kind); Tn.push(t[q * 3], 0, t[q * 3 + 2]); Bs.push(ya, yc - ya);
      }
    }
  }
  if (!P.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('aFac', new THREE.Float32BufferAttribute(F, 4)); g.setAttribute('aT', new THREE.Float32BufferAttribute(Tn, 3)); g.setAttribute('aBase', new THREE.Float32BufferAttribute(Bs, 2));
  const m = new THREE.ShaderMaterial({
    name: 'shop rain', uniforms: { ...U }, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    vertexShader: /* glsl */`attribute vec4 aFac; attribute vec3 aT; attribute vec2 aBase; varying vec4 vFac; varying vec3 vN, vW, vT; varying vec2 vBase; flat varying float vSeed;
      void main(){ vFac = aFac; vSeed = aFac.z; vT = aT; vBase = aBase; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`${GLSL_COMMON}
      ${GLASS_RAIN}
      varying vec4 vFac; varying vec3 vN, vW, vT; varying vec2 vBase; flat varying float vSeed;   // (flat: see the facade)
      void main(){
        float fw = length(fwidth(vW)), dist = distance(cameraPosition, vW);
        if (uRain < 0.01 || dist > 30.0) discard;                       // (further off it can't be told from the glass)
        float u = vFac.x, v = vFac.y, seed = vSeed;
        float bw = 4.0 + 3.0 * hash12(vec2(seed, 11.0)), bay = floor(u / bw), fb = fract(u / bw);   // (as the facade shader has them)
        if ((fb < 0.05 || fb > 0.95) && vFac.w < 3.5) discard;
        vec3 n = normalize(vN), lit = uSky * 1.2 + streetLight(vW, n) * 0.6;
        vec4 d = rainOnGlass(vec2(u, v - vBase.x), vBase.y, uTime, fw, vW, normalize(vT), lit, lit * 0.25);
        d *= min(uRain, 1.0) * (1.0 - smoothstep(18.0, 30.0, dist));
        if (d.a < 0.002 && dot(d.rgb, vec3(1.0)) < 0.002) discard;
        gl_FragColor = vec4(d.rgb, d.a);
      }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.userData.noInk = true;
  return mesh;
}

// a building's walls: one quad (two triangles) a side, carrying how far along the wall, how high, its seed and kind
export function wallGeometry(pts, y0, y1, kind, seed, color, skip = null) {
  const P = [], N = [], F = [], C = [], Tn = [];
  let u = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length], len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.05) continue;
    if (skip && skip(i, x0, z0, x1, z1)) { u += len + 0.37; continue; }
    const nx = (z1 - z0) / len, nz = -(x1 - x0) / len, tx = (x1 - x0) / len, tz = (z1 - z0) / len;
    const b0 = [x0, y0, z0], b1 = [x1, y0, z1], t1 = [x1, y1, z1], t0 = [x0, y1, z0];
    const fb0 = [u, y0], fb1 = [u + len, y0], ft1 = [u + len, y1], ft0 = [u, y1];
    for (const [p, f] of [[b0, fb0], [t1, ft1], [b1, fb1], [b0, fb0], [t0, ft0], [t1, ft1]]) {
      P.push(...p); N.push(nx, 0, nz); F.push(f[0], f[1], seed, kind); C.push(color.r, color.g, color.b); Tn.push(tx, kind > 6.5 ? y1 : 0, tz);   // (aT.y: the wall's top, for the towers drawn as they are — their crown)
    }
    u += len + 0.37;                                                  // (each wall a little off from the last: the windows don't wrap round the corner)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aFac', new THREE.Float32BufferAttribute(F, 4)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(Tn, 3));
  return g;
}
// a roof's parapet: the low wall round its edge, 0.9 m up, a quarter of a metre thick (its inner face and its top; the
// outer face is the building's wall run on up) — from above it is what outlines a roof
const ringArea = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
export function parapetGeometry(pts, h, color) {
  let inner = offset(pts, -0.25); if (Math.abs(ringArea(inner)) > Math.abs(ringArea(pts))) inner = offset(pts, 0.25);
  const P = [], N = [], C = [], H = h + 0.9;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length, a = pts[i], b = pts[j], ia = inner[i], ib = inner[j], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.3) continue;
    const quad = (q, n) => { for (const k of [0, 1, 2, 0, 2, 3]) { P.push(...q[k]); N.push(...n); C.push(color.r, color.g, color.b); } };
    quad([[a[0], H, a[1]], [ia[0], H, ia[1]], [ib[0], H, ib[1]], [b[0], H, b[1]]], [0, 1, 0]);   // (its top)
    const nx = ia[0] - a[0], nz = ia[1] - a[1], nl = Math.hypot(nx, nz) || 1;
    quad([[ia[0], h, ia[1]], [ib[0], h, ib[1]], [ib[0], H, ib[1]], [ia[0], H, ia[1]]], [nx / nl, 0, nz / nl]);   // (its inner face, toward the roof)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}
export function roofGeometry(pts, y, color) {
  const shape = pts.map(([x, z]) => new THREE.Vector2(x, z)), tris = THREE.ShapeUtils.triangulateShape(shape, []);
  const P = [], N = [], C = [];
  for (const [a, b, c] of tris) {
    const A = pts[a], Bp = pts[b], Cp = pts[c];
    const cross = (Bp[0] - A[0]) * (Cp[1] - A[1]) - (Bp[1] - A[1]) * (Cp[0] - A[0]);   // (facing up: counter-clockwise seen from above, z south)
    const order = cross < 0 ? [A, Bp, Cp] : [A, Cp, Bp];
    for (const p of order) { P.push(p[0], y, p[1]); N.push(0, 1, 0); C.push(color.r, color.g, color.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}
