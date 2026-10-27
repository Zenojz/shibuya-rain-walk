// Tokyo beyond the streets we walk, as it is seen from 230 m up on Scramble Square's roof — built from the real
// map out to about 7 km (data/farcity.json, OpenStreetMap):
//   · every building 30 m or taller where it really stands, at its real height and on its real footprint (4000 of
//     them: Shinjuku's towers to the north-north-west, Roppongi, Azabudai and Toranomon to the east …), their glass
//     curtain walls lit from inside at night floor by floor, the flats' windows one by one;
//   · between them the low, close-packed city, block by block along the real streets — each district's buildings
//     turned with its own street grid, taller along the main roads and round the towers, lower and finer in the
//     residential quarters (two-storey houses, small blocks of flats, the white "mansions");
//   · the main roads as gaps in it by day and as lines of light at night, the Shuto Expressway's viaducts riding
//     over them, the railways, the parks and woods (Meiji Jingū, Yoyogi, Shinjuku Gyoen, Aoyama cemetery …);
//   · at night the city's lights: a point for every lit window — warm in the flats (some white, a few blue with a
//     television, a few green with a fluorescent tube), whole floors of white in the offices — the street lamps along
//     every road, the traffic's head and tail lights moving along the main roads and the expressway, the red
//     aviation lights blinking on the towers. Seen from far each point is a pixel; together they are the city.
// Past the map, out to the horizon, more of the same low city, its streets a grid.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { U, GLSL_COMMON, col } from './materials.js';
import { rng } from './util.js';

const LAT0 = 35.65948, LON0 = 139.70056, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110574;
export const at = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];

// a few landmarks the map doesn't give whole, shaped by hand: [name, lat, lon, height, kind]
const SHAPED = [
  ['東京タワー', 35.6586, 139.7454, 333, 'tokyotower'], ['東京スカイツリー', 35.7101, 139.8107, 634, 'skytree'], ['サンシャイン60', 35.7295, 139.7186, 240, 'slab'],
].map(([n, la, lo, h, k]) => ({ name: n, p: at(la, lo), h, kind: k }));

const E = 7200, RES = 8, N = Math.round(2 * E / RES);                 // (the map's square, metres; the masks' pixel size)
const WIDTH = [24, 9, 26, 9, 20, 8, 13, 10];                          // (carriageway width by road kind: motorway … tertiary)

export class FarCity {
  static async load(url = './data/farcity.json', opts) {
    const [d, w] = await Promise.all([fetch(url).then(r => r.json()), fetch('./data/farwater.json').then(r => (r.ok ? r.json() : null)).catch(() => null)]);
    d.water = w ? waterMask(w) : null;
    return new FarCity(d, opts);
  }
  constructor(D, { inner = 470, horizon = 12500 } = {}) {
    const t0 = performance.now(), T = (window.__farT = []), mark = k => T.push([k, Math.round(performance.now() - t0)]);
    this.group = new THREE.Group(); this.group.name = 'far city';
    const R = rng(2026);
    this.inner = inner;
    this.lights = new LightBuffer(2600000);
    // ---------------------------------------------------------------- the masks: what is road, rail, green, tower
    const canvas = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
    const P = ([x, z]) => [(x + E) / RES, (z + E) / RES];
    const line = (g, pts) => { g.beginPath(); pts.forEach((p, i) => { const [a, b] = P(p); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); };
    const path = (g, pts) => { g.beginPath(); pts.forEach((p, i) => { const [a, b] = P(p); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); };
    const cat = canvas(), cg = cat.getContext('2d', { willReadFrequently: true });
    cg.fillStyle = '#000'; cg.fillRect(0, 0, N, N); cg.lineCap = cg.lineJoin = 'round'; cg.globalCompositeOperation = 'lighter';
    cg.fillStyle = 'rgb(0,255,0)'; for (const [, , pts] of D.green) { path(cg, pts); cg.fill(); }
    cg.strokeStyle = 'rgb(0,0,255)'; cg.lineWidth = 15 / RES; for (const [, pts] of D.rail) line(cg, pts);
    cg.strokeStyle = 'rgb(255,0,0)'; for (const [t, , lanes, , pts] of D.roads) { cg.lineWidth = Math.max(WIDTH[t], lanes * 3.4) / RES; line(cg, pts); }
    const tallC = canvas(), tg = tallC.getContext('2d', { willReadFrequently: true });
    tg.fillStyle = '#000'; tg.fillRect(0, 0, N, N); tg.fillStyle = tg.strokeStyle = '#fff'; tg.lineWidth = 10 / RES;
    for (const t of D.tall) { path(tg, t[5]); tg.fill(); tg.stroke(); }
    tg.beginPath(); tg.arc(E / RES, E / RES, inner / RES, 0, 7); tg.fill();
    // how near a main road (soft), how many towers round about (soft)
    const art0 = canvas(), a0 = art0.getContext('2d');
    a0.fillStyle = '#000'; a0.fillRect(0, 0, N, N); a0.strokeStyle = '#fff'; a0.lineCap = 'round';
    for (const [t, , , , pts] of D.roads) if (t <= 6) { a0.lineWidth = (t <= 5 ? 90 : 55) / RES; a0.globalAlpha = t <= 5 ? 1 : 0.6; line(a0, pts); }
    const art = canvas(), ag = art.getContext('2d', { willReadFrequently: true });
    ag.filter = 'blur(5px)'; ag.drawImage(art0, 0, 0); ag.filter = 'none';   // (blurred once, the whole picture: a filter on each stroke is very slow)
    const dens = canvas(), dg = dens.getContext('2d', { willReadFrequently: true });
    dg.fillStyle = '#000'; dg.fillRect(0, 0, N, N); dg.globalCompositeOperation = 'lighter';
    for (const t of D.tall) {
      const [a, b] = P(cen(t[5])), r = 420 / RES, g = dg.createRadialGradient(a, b, 0, a, b, r), k = Math.min(1, t[0] / 160) * 0.22;
      g.addColorStop(0, `rgba(255,255,255,${k})`); g.addColorStop(1, 'rgba(255,255,255,0)'); dg.fillStyle = g; dg.fillRect(a - r, b - r, 2 * r, 2 * r);
    }
    mark('masks drawn');
    const CAT = cg.getImageData(0, 0, N, N).data, TALL = tg.getImageData(0, 0, N, N).data, ART = ag.getImageData(0, 0, N, N).data, DEN = dg.getImageData(0, 0, N, N).data;
    const px = (x, z) => { const i = Math.floor((x + E) / RES), j = Math.floor((z + E) / RES); return i < 0 || j < 0 || i >= N || j >= N ? -1 : (j * N + i) * 4; };
    const wet = D.water ? D.water.at : () => 0;                        // (Tokyo Bay, the rivers, the moats: no building on them)
    this.water = D.water;
    const blocked = (x, z) => { const k = px(x, z); if (k < 0) return wet(x, z) > 0; return CAT[k] > 60 || CAT[k + 1] > 60 || CAT[k + 2] > 60 || TALL[k] > 60 || wet(x, z) > 0; };
    const arterial = (x, z) => { const k = px(x, z); return k < 0 ? 0 : ART[k] / 255; };
    const density = (x, z) => { const k = px(x, z); return k < 0 ? 0 : Math.min(1, DEN[k] / 255); };
    this.catTex = new THREE.CanvasTexture(cat); this.catTex.colorSpace = THREE.NoColorSpace; this.catTex.anisotropy = 8; this.catTex.flipY = false;   // (row 0 the north edge, as the shader reads it)
    mark('masks read');
    // ---------------------------------------------------------------- each district's street grid: its turn
    const TS = 150, TN = Math.ceil(2 * E / TS), tc = new Float32Array(TN * TN), ts = new Float32Array(TN * TN);
    for (const [t, , , , pts] of D.roads) for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0); if (L < 4) continue;
      const a = Math.atan2(z1 - z0, x1 - x0) * 4, ti = Math.floor(((x0 + x1) / 2 + E) / TS), tj = Math.floor(((z0 + z1) / 2 + E) / TS);
      if (ti < 0 || tj < 0 || ti >= TN || tj >= TN) continue; const w = L * (t <= 5 ? 2 : 1); tc[tj * TN + ti] += Math.cos(a) * w; ts[tj * TN + ti] += Math.sin(a) * w;
    }
    const turnAt = (ti, tj) => {                                        // (smoothed over the tiles round it)
      let c = 0, s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const i = ti + a, j = tj + b; if (i < 0 || j < 0 || i >= TN || j >= TN) continue; const w = a || b ? 0.5 : 1; c += tc[j * TN + i] * w; s += ts[j * TN + i] * w; }
      return Math.hypot(c, s) < 1 ? R() * Math.PI / 2 : Math.atan2(s, c) / 4;
    };
    // ---------------------------------------------------------------- the low city
    const RINGS = [[inner, 1500, 21, 0.4, 1.0], [1500, 3000, 28, 0.28, 1.2], [3000, 5000, 38, 0.2, 1.5], [5000, 7400, 50, 0.14, 1.9], [7400, horizon, 86, 0.09, 2.6]];   // [from, to, cell, the share of lit windows that get a point, how big each point is]
    const SECT = 12, lists = RINGS.map(() => Array.from({ length: SECT }, () => []));
    const ringOf = d => RINGS.findIndex(r => d >= r[0] && d < r[1]);
    const T2 = Math.ceil(2 * horizon / TS);
    for (let tj = 0; tj < T2; tj++) for (let ti = 0; ti < T2; ti++) {
      const x0 = -horizon + ti * TS, z0 = -horizon + tj * TS, cx = x0 + TS / 2, cz = z0 + TS / 2, dc = Math.hypot(cx, cz);
      if (dc > horizon + TS || dc < inner - TS) continue;
      const inMap = Math.abs(cx) < E && Math.abs(cz) < E;
      const turn = inMap ? turnAt(Math.floor((cx + E) / TS), Math.floor((cz + E) / TS)) : (R() * Math.PI / 2), co = Math.cos(turn), si = Math.sin(turn);
      const ring = ringOf(Math.max(inner, dc)); if (ring < 0) continue; const cell = RINGS[ring][2];
      for (let a = -TS * 0.75; a < TS * 0.75; a += cell) for (let b = -TS * 0.75; b < TS * 0.75; b += cell) {
        const x = cx + a * co - b * si + (R() - 0.5) * cell * 0.25, z = cz + a * si + b * co + (R() - 0.5) * cell * 0.25;
        if (x < x0 || x >= x0 + TS || z < z0 || z >= z0 + TS) continue;
        const d = Math.hypot(x, z); if (d < inner || d > horizon) continue;
        const rg = ringOf(d); if (rg < 0) continue;
        if (inMap ? blocked(x, z) : (outsideStreet(a, b, ti, tj) || wet(x, z) > 0)) continue;
        if (R() < 0.07) continue;                                     // (a car park, a schoolyard, a shrine's trees)
        const ar = arterial(x, z), de = density(x, z), r1 = R(), r2 = R();
        // what it is, and how tall: houses in the quiet quarters, flats, offices and shops along the main roads
        let kind, h;
        if (ar < 0.25 && de < 0.25 && r1 < 0.55 - d / 30000) { kind = 0; h = 6 + 4 * r2; }   // two-, three-storey houses
        else if (ar > 0.4 || de > 0.35) { kind = 2; h = 14 + 36 * Math.pow(r2, 1.3) * (0.6 + ar * 0.6) + 50 * de * R(); }   // offices, shops, hotels
        else { kind = 1; h = 9 + 16 * Math.pow(r2, 1.4); if (R() < 0.12) h = 24 + 26 * R(); }   // flats; now and then a tall white "mansion"
        if (!inMap) h = Math.min(h, 32) * (0.8 + 0.4 * R());
        h = Math.min(h, 28 + 2 * R());                                  // (under 30 m: every building of 30 m or more is in the map's own list, drawn where it stands — these are the rest)
        const fill = kind === 0 ? 0.55 : 0.78, w = cell * (fill - 0.12 + R() * 0.2), dd = cell * (fill - 0.15 + R() * 0.28);
        if (!inMap && (wet(x + co * w * 0.5, z + si * w * 0.5) || wet(x - co * w * 0.5, z - si * w * 0.5))) continue;
        if (inMap && cell <= 28 && (blocked(x + co * w * 0.5, z + si * w * 0.5) || blocked(x - co * w * 0.5, z - si * w * 0.5) || blocked(x - si * dd * 0.5, z + co * dd * 0.5) || blocked(x + si * dd * 0.5, z - co * dd * 0.5))) continue;
        const rot = turn + (R() < 0.08 ? (R() - 0.5) * 0.5 : 0), seed = R();
        const s = Math.floor(((Math.atan2(x, -z) + Math.PI) / (2 * Math.PI)) * SECT) % SECT;
        const bx = [x, z, w, h, dd, rot, seed, kind, 0];
        lists[rg][s].push(bx);
        this.windows(bx, RINGS[rg][3], RINGS[rg][4], R, ar);
      }
    }
    mark('low city laid out');
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat = farMat();
    this.boxes = 0;
    lists.forEach((ringLists, ri) => ringLists.forEach(list => { if (list.length) { this.group.add(instanced(box, list, RINGS[ri][2], mat)); this.boxes += list.length; } }));
    this.roofClutter([...lists[0].flat(), ...lists[1].flat()], R, box, mat);
    mark('boxes built');
    // ---------------------------------------------------------------- the real towers
    this.tall = D.tall.filter(t => Math.hypot(...cen(t[5])) > 520);
    this.group.add(this.towerMesh(this.tall, R));
    mark('towers');
    // ---------------------------------------------------------------- roads, expressway, rail, parks, the ground
    this.roads(D.roads, R);
    this.rail(D.rail);
    mark('roads, rail');
    this.group.add(this.forest(D.green, CAT, px, R));
    mark('forest');
    this.group.add(this.shaped());
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(30000, 72).rotateX(-Math.PI / 2).translate(0, -0.6, 0), groundMat(this.catTex, E, D.water)); gnd.renderOrder = -5; this.group.add(gnd); this.ground = gnd;
    // ---------------------------------------------------------------- the lights, and the cars
    if (D.water) this.farShore(D.water, horizon, R);
    this.lightPoints = this.lights.build(); this.group.add(this.lightPoints);
    mark('lights');
    this.group.add(this.cars.build());
    this.group.traverse(o => { o.layers.set(1); o.userData.noInk = true; });
    this.red = [];                                                     // (the aviation lights are among the light points)
    this.stats = { boxes: this.boxes, towers: this.tall.length, lights: this.lights.n, cars: this.cars.n, trees: this.trees, ms: Math.round(performance.now() - t0) };
  }
  // beyond the low city's horizon, across the bay: the far shores' lights — Urayasu, Funabashi, Kawasaki, the
  // industrial piers (white and sodium orange along the water), the towns behind — as points only, thinner further
  // off; no buildings (at 13–21 km a building is under a pixel)
  farShore(W, horizon, R) {
    const L = this.lights, rMax = W.E - 200;
    for (let i = 0; i < 260000; i++) {
      const r = horizon + (rMax - horizon) * Math.sqrt(R()), a = R() * Math.PI * 2, x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (W.at(x, z)) continue;
      const az = (a * 180 / Math.PI + 360) % 360; if (az < 40 || az > 215) { if (R() > 0.25) continue; }   // (most toward the bay: east to south)
      const coast = W.at(x + 120, z) || W.at(x - 120, z) || W.at(x, z + 120) || W.at(x, z - 120);   // (by the water: the piers, the ports)
      if (!coast && R() > 0.55) continue;
      const c = coast ? (R() < 0.55 ? [1, 0.62, 0.3] : [0.9, 0.94, 1]) : (R() < 0.7 ? [1, 0.72, 0.42] : [0.92, 0.94, 1]);
      L.add(x, 8 + R() * (coast ? 40 : 20), z, c, coast ? 1.3 : 0.9, coast ? 9 : 7, 0.05 + R() * 0.5, 0);
    }
  }
  // a building's lit windows as points on its faces. keep: the share of lit windows that get a point (far off fewer,
  // and bigger); offices lit a floor at a time, flats a window at a time, houses a light or two
  windows([x, z, w, h, d, rot, seed, kind], keep, size, R, ar = 0) {
    const L = this.lights, co = Math.cos(rot), si = Math.sin(rot);
    // the faces: [normal x, z, along x, z, how far out from the middle, how wide] (the box's local x along (co, si), z along (−si, co))
    const faces = [[co, si, -si, co, w / 2, d], [-co, -si, si, -co, w / 2, d], [-si, co, co, si, d / 2, w], [si, -co, -co, -si, d / 2, w]];
    if (kind === 0) {                                                  // a house: a window or two lit, warm
      const n = R() < 0.75 ? 1 + Math.floor(R() * 2.5) : 0;
      for (let i = 0; i < n; i++) { const [nx, nz, tx, tz, off, fw] = faces[Math.floor(R() * 4)], t = (R() - 0.5) * fw * 0.7, y = 1.4 + Math.floor(R() * Math.max(1, h / 3)) * 2.9;
        L.add(x + nx * (off + 0.3) + tx * t, y, z + nz * (off + 0.3) + tz * t, warm(R), 0.8 + 0.4 * R(), (1.4 + R()) * size, 0.05 + R() * 0.9, 0); }
      return;
    }
    const fh = kind === 2 ? 3.7 : 2.9, cw = kind === 2 ? 2.4 : 3.3, floors = Math.max(1, Math.floor((h - 1) / fh));
    for (const [nx, nz, tx, tz, off, fw] of faces) {
      const cols = Math.max(1, Math.floor(fw / cw));
      for (let fl = kind === 2 ? 1 : 0; fl < floors; fl++) {
        // offices: the floor lit or dark as a whole (a firm working late, or gone home); flats: window by window
        if (kind === 2 && R() > 0.62) continue;
        const floorOn = 0.05 + R() * 0.9, cC = kind === 2 ? office(R) : null;
        for (let c = 0; c < cols; c++) {
          const lit = kind === 2 ? R() < 0.9 : R() < 0.42; if (!lit || R() > keep) continue;
          const t = -fw / 2 + (c + 0.5) * fw / cols, y = (fl + 0.6) * fh;
          L.add(x + nx * (off + 0.3) + tx * t, y, z + nz * (off + 0.3) + tz * t, kind === 2 ? cC : flat(R), kind === 2 ? 0.85 + 0.35 * R() : 0.45 + 0.75 * R() ** 0.7, (kind === 2 ? 1.5 : 1.25) * size, kind === 2 ? floorOn : 0.04 + R() * 0.95, 0);
        }
      }
    }
    // a lit sign on the roof of some of the shops and offices along the main roads
    if (kind === 2 && ar > 0.45 && R() < 0.18) {
      const C = [[1, 0.25, 0.2], [1, 0.95, 0.9], [0.3, 0.6, 1], [1, 0.8, 0.2], [0.3, 1, 0.5]][Math.floor(R() * 5)];
      for (let k = -2; k <= 2; k++) L.add(x + co * k * w * 0.12, h + 2.5, z + si * k * w * 0.12, C, 1.4, 2.2 * size, 0.2, 0);
    }
  }
  // water tanks, plant rooms, stairheads on the roofs near enough to see (low boxes standing on their roofs)
  roofClutter(list, R, box, mat) {
    const items = [];
    for (const [x, z, w, h, d, rot, , kind] of list) {
      if (kind === 0 || R() < 0.35) continue;
      const n = 1 + Math.floor(R() * 2.2), co = Math.cos(rot), si = Math.sin(rot);
      for (let i = 0; i < n; i++) { const a = (R() - 0.5) * w * 0.6, b = (R() - 0.5) * d * 0.6, s = 2 + R() * Math.min(w, d) * 0.25; items.push([x + a * co - b * si, z + a * si + b * co, s, 1.5 + R() * 2.5, s * (0.6 + R() * 0.6), rot, R(), 3, h]); }
    }
    if (items.length) this.group.add(instanced(box, items, 30, mat));
  }
  // the towers: their footprints raised to their heights, the walls drawn by the tower shader
  towerMesh(list, R) {
    const P = [], N = [], F = [], C = [], T = [], rp = [], rn = [], rc = [];
    const glass = ['#5f6f86', '#6c7b90', '#8291a3', '#4f5d72', '#7d8a96', '#9aa3ab'], stone = ['#c9c4ba', '#b9b6b0', '#d6d0c4', '#a9a49c'];
    for (const [h, minh, , part, use, pts] of list) {
      const seed = R(), kind = use === 1 ? 1 : use === 2 ? 2 : 0, c = col(kind === 1 ? R.pick(stone) : R.pick(glass));
      let u = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length], L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.2) continue;
        const nx = (z1 - z0) / L, nz = -(x1 - x0) / L;
        const q = [[x0, minh, z0, u], [x1, minh, z1, u + L], [x1, h, z1, u + L], [x0, h, z0, u]];
        for (const k of [0, 2, 1, 0, 3, 2]) { const [x, y, z, uu] = q[k]; P.push(x, y, z); N.push(nx, 0, nz); F.push(uu, y, seed, kind); C.push(c.r, c.g, c.b); T.push(h, 0, 0); }
        u += L + 0.3;
      }
      // the roof (facing up), and the aviation lights on it
      const shape = pts.map(([x, z]) => new THREE.Vector2(x, z));
      for (const [a, b, cc] of THREE.ShapeUtils.triangulateShape(shape, [])) {
        const A = pts[a], B = pts[b], Cp = pts[cc], cross = (B[0] - A[0]) * (Cp[1] - A[1]) - (B[1] - A[1]) * (Cp[0] - A[0]);
        for (const p of cross < 0 ? [A, B, Cp] : [A, Cp, B]) { rp.push(p[0], h, p[1]); rn.push(0, 1, 0); rc.push(0.32, 0.33, 0.35); }
      }
      if (h >= 90 && !part) { const n = h > 150 ? 4 : 2, step = Math.max(1, Math.floor(pts.length / n)); for (let i = 0; i < pts.length; i += step) this.lights.add(pts[i][0], h + 1.2, pts[i][1], [1, 0.12, 0.06], 1.6, 3.2, 0.0, 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('aFac', new THREE.Float32BufferAttribute(F, 4)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aTop', new THREE.Float32BufferAttribute(T, 3));
    const walls = new THREE.Mesh(g, towerMat()); walls.frustumCulled = false;
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('normal', new THREE.Float32BufferAttribute(rn, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
    const roofs = new THREE.Mesh(rg, plainMat()); roofs.frustumCulled = false;
    const grp = new THREE.Group(); grp.add(walls, roofs); return grp;
  }
  // the main roads: their lamps (warm sodium on some, white LED on others, one road the same all along), the
  // traffic's lights moving along them; the Shuto Expressway's viaducts with their lamps and their own traffic
  roads(list, R) {
    const L = this.lights, cars = this.cars = new CarBuffer(260000), parts = [];
    const UP = new THREE.Vector3(0, 1, 0);
    const deck = (pts, w, y, thick) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.5) continue;
        const q = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(x1 - x0, z1 - z0));
        const g = new THREE.BoxGeometry(w, thick, len + 0.6).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, y - thick / 2, (z0 + z1) / 2), q, new THREE.Vector3(1, 1, 1))); g.deleteAttribute('uv'); parts.push(g);
        for (let s = 18; s < len; s += 36) { const t = s / len; const cg = new THREE.BoxGeometry(w * 0.35, y - thick, 2.2).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x0 + (x1 - x0) * t, (y - thick) / 2, z0 + (z1 - z0) * t), q, new THREE.Vector3(1, 1, 1))); cg.deleteAttribute('uv'); parts.push(cg); }
      }
    };
    for (const [t, up, lanes, oneway, pts] of list) {
      if (Math.max(Math.hypot(...pts[0]), Math.hypot(...pts.at(-1))) < 260) continue;
      const w = Math.max(WIDTH[t], lanes * 3.4), elevated = up && t <= 1, y = elevated ? 14 : 0;
      if (elevated) deck(pts, w, y, 2.0);
      const sodium = R() < (t <= 3 ? 0.75 : 0.6), lamp = sodium ? [1, 0.58, 0.22] : [1, 0.9, 0.75], gap = t <= 3 ? 12 : t <= 5 ? 15 : 22;
      let acc = R() * gap;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.5) continue;
        const ux = (x1 - x0) / len, uz = (z1 - z0) / len, nx = -uz, nz = ux;
        for (; acc < len; acc += gap) {
          const x = x0 + ux * acc, z = z0 + uz * acc; if (Math.hypot(x, z) < 260) continue;
          for (const s of t <= 5 ? [-1, 1] : [R() < 0.5 ? -1 : 1]) L.add(x + nx * s * (w / 2 + 0.5), y + (elevated ? 1.2 : 8), z + nz * s * (w / 2 + 0.5), lamp, t <= 5 ? 1.5 : 1.0, elevated ? 2.0 : 2.4, 0.18 + R() * 0.12, 0);
        }
        acc -= len;
        // the traffic on the bigger roads
        if (t <= 5 && len > 20 && Math.hypot((x0 + x1) / 2, (z0 + z1) / 2) > 260) {
          const nCar = Math.floor(len / (t <= 1 ? 26 : 38) * (0.6 + R() * 0.8));
          for (let k = 0; k < nCar; k++) {
            const dir = oneway ? 1 : (R() < 0.5 ? 1 : -1), lane = oneway ? (R() - 0.5) * w * 0.6 : dir * (1.5 + R() * Math.max(1, w / 2 - 3));
            const a = [x0 + nx * lane, y + 0.9, z0 + nz * lane], b = [x1 + nx * lane, y + 0.9, z1 + nz * lane];
            cars.add(dir > 0 ? a : b, dir > 0 ? b : a, R(), (9 + R() * 7) / len, R() < 0.5 ? 0 : 1);
          }
        }
      }
    }
    if (parts.length) { const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); const m = new THREE.Mesh(g, plainMat('#8a8d92', true)); m.frustumCulled = false; this.group.add(m); }
  }
  rail(list) {
    const parts = [], UP = new THREE.Vector3(0, 1, 0);
    for (const [up, pts] of list) {
      if (!up) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.5 || Math.hypot((x0 + x1) / 2, (z0 + z1) / 2) < 300) continue;
        const g = new THREE.BoxGeometry(9, 1.6, len + 0.4).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, 7.2, (z0 + z1) / 2), new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(x1 - x0, z1 - z0)), new THREE.Vector3(1, 1, 1)));
        g.deleteAttribute('uv'); parts.push(g);
      }
    }
    if (parts.length) { const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); const m = new THREE.Mesh(g, plainMat('#7e7a76')); m.frustumCulled = false; this.group.add(m); }
  }
  // the parks' and woods' trees: soft dark crowns packed over the green on the map
  forest(green, CAT, px, R) {
    const list = [];
    for (const [k, a, pts] of green) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const n = Math.min(3500, Math.round(a / (k === 2 ? 60 : k === 3 ? 260 : 110)));
      for (let i = 0, got = 0; i < n * 3 && got < n && list.length < 60000; i++) {
        const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0); if (Math.hypot(x, z) < 480) continue;
        const q = px(x, z); if (q < 0 || CAT[q + 1] < 128 || CAT[q] > 60) continue;
        got++; list.push([x, z, (k === 1 ? 3 : 4) + R() * (k === 2 ? 7 : 5), (k === 1 ? 5 : 8) + R() * (k === 2 ? 16 : 10), R()]);
      }
    }
    const blob = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const im = new THREE.InstancedMesh(blob, forestMat(), list.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const seed = new Float32Array(list.length);
    list.forEach(([x, z, r, h, sd], i) => { M.compose(p.set(x, 0, z), q, sc.set(r, h, r)); im.setMatrixAt(i, M); seed[i] = sd; });
    im.geometry = blob.clone(); im.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1)); im.frustumCulled = false;
    this.trees = list.length; return im;
  }
  // Tokyo Tower's lattice (lit warm orange at night, its Landmark Light), the Skytree (pale blue), Sunshine 60
  shaped() {
    const parts = [], add = (g, c, light = 0) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); const n = g.attributes.position.count, C = new Float32Array(n * 4); const cc = col(c); for (let i = 0; i < n; i++) C.set([cc.r, cc.g, cc.b, light], i * 4); g.setAttribute('aCol', new THREE.BufferAttribute(C, 4)); parts.push(g); };
    const cylAt = (x, y, z, r0, r1, h, c, seg = 16, light = 0) => add(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z), c, light);
    for (const t of SHAPED) {
      const [x, z] = t.p, H = t.h;
      if (t.kind === 'tokyotower') {
        for (let k = 0; k < 8; k++) { const y0 = (k / 8) * 250, y1 = ((k + 1) / 8) * 250, w0 = 40 * (1 - k / 8) ** 1.6 + 4, w1 = 40 * (1 - (k + 1) / 8) ** 1.6 + 4;
          add(new THREE.CylinderGeometry(w1 / 1.4, w0 / 1.4, y1 - y0, 4, 1, true).rotateY(Math.PI / 4).translate(x, y0 + (y1 - y0) / 2, z), k % 2 ? '#f4f2ee' : '#e8532a', 1.0); }
        add(new THREE.BoxGeometry(22, 10, 22).rotateY(Math.PI / 4).translate(x, 150, z), '#ffd9a0', 1.0); add(new THREE.BoxGeometry(12, 6, 12).rotateY(Math.PI / 4).translate(x, 226, z), '#ffd9a0', 1.0);
        cylAt(x, 250, z, 1.2, 4, 83, '#e8532a', 8, 0.8);
        this.lights.add(x, H + 1, z, [1, 0.12, 0.06], 1.8, 4, 0, 1);
      } else if (t.kind === 'skytree') {
        cylAt(x, 0, z, 18, 34, 350, '#9fc6ff', 12, 0.55); cylAt(x, 350, z, 13, 18, 100, '#9fc6ff', 12, 0.55); cylAt(x, 340, z, 22, 22, 14, '#e8f2ff', 16, 1.0); cylAt(x, 445, z, 16, 16, 9, '#e8f2ff', 16, 1.0); cylAt(x, 455, z, 2, 9, 179, '#9fc6ff', 8, 0.5);
        this.lights.add(x, H, z, [1, 0.12, 0.06], 2.0, 6, 0, 1);
      } else { add(new THREE.BoxGeometry(46, H, 40).translate(x, H / 2, z), '#9aa3ad', 0.0); this.lights.add(x, H + 1, z, [1, 0.12, 0.06], 1.6, 4, 0, 1); }
    }
    const g = mergeGeometries(parts); parts.forEach(p => p.dispose());
    const m = new THREE.Mesh(g, shapedMat()); m.frustumCulled = false; return m;
  }
  // each frame: how big a metre looks one metre away (for the points)
  // the glow of the near streets beyond the near ground (painted by nearsigns.js): what light lies on them at night
  setNearGlow(tex, box) { const u = this.ground.material.uniforms; u.uNear.value = tex; u.uNearBox.value.set(...box); }
  update(camera, renderer) {
    const h = renderer.getDrawingBufferSize(this._v || (this._v = new THREE.Vector2())).y, k = h / (2 * Math.tan(camera.fov * Math.PI / 360));
    this.lightPoints.material.uniforms.uScale.value = k; this.cars.mesh.material.uniforms.uScale.value = k;
  }
}

const cen = pts => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
// past the map: a street every 130 m one way, every 160 m the other, in each tile's own frame
function outsideStreet(a, b, ti, tj) { const h = Math.sin(ti * 12.9898 + tj * 78.233) * 43758.5; const o = (h - Math.floor(h)) * 130; return ((a + o + 1e4) % 130) < 15 || ((b + o * 1.3 + 1e4) % 160) < 13; }
// the colours of windows: warm in flats (most), white, now and then a television's blue or a tube's green
function flat(R) { const r = R(); return r < 0.62 ? [1, 0.52 + 0.14 * R(), 0.2 + 0.14 * R()] : r < 0.84 ? [1, 0.82, 0.58] : r < 0.93 ? [0.88, 0.92, 1] : r < 0.97 ? [0.6, 0.76, 1] : [0.72, 1, 0.78]; }
function warm(R) { return R() < 0.8 ? [1, 0.68 + 0.1 * R(), 0.4] : [1, 0.88, 0.7]; }
function office(R) { const r = R(); return r < 0.45 ? [0.88, 0.94, 1] : r < 0.85 ? [1, 0.93, 0.8] : [1, 0.78, 0.5]; }

// the city's lights: a point each, packed small (a position; colour and when it comes on; size, brightness, kind)
export class LightBuffer {
  constructor(cap) { this.cap = cap; this.n = 0; this.P = new Float32Array(cap * 3); this.C = new Uint8Array(cap * 4); this.S = new Uint8Array(cap * 4); }
  // c: rgb 0–1; b: brightness 0–2; size: metres; onAt 0–1: lit once the hour's "lights on" passes it; kind 1: a red aviation light, blinking
  add(x, y, z, c, b, size, onAt, kind) {
    if (this.n >= this.cap) return; const i = this.n++;
    this.P[i * 3] = x; this.P[i * 3 + 1] = y; this.P[i * 3 + 2] = z;
    this.C[i * 4] = c[0] * 255; this.C[i * 4 + 1] = c[1] * 255; this.C[i * 4 + 2] = c[2] * 255; this.C[i * 4 + 3] = Math.min(1, onAt) * 255;
    this.S[i * 4] = Math.min(255, size / 8 * 255); this.S[i * 4 + 1] = Math.min(255, b / 2 * 255); this.S[i * 4 + 2] = kind * 255; this.S[i * 4 + 3] = Math.random() * 255;
  }
  build() {
    const g = new THREE.BufferGeometry(), n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.P.slice(0, n * 3), 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.C.slice(0, n * 4), 4, true));
    g.setAttribute('aS', new THREE.BufferAttribute(this.S.slice(0, n * 4), 4, true));
    this.P = this.C = this.S = null;
    const m = new THREE.Points(g, lightMat()); m.frustumCulled = false; m.renderOrder = 4; m.name = 'city lights';
    return m;
  }
}
class CarBuffer {
  constructor(cap) { this.cap = cap; this.n = 0; this.A = new Float32Array(cap * 3); this.B = new Float32Array(cap * 3); this.K = new Float32Array(cap * 3); }
  add(a, b, phase, rate, tail) { if (this.n >= this.cap) return; const i = this.n++; this.A.set(a, i * 3); this.B.set(b, i * 3); this.K.set([phase, rate, tail], i * 3); }
  build() {
    const g = new THREE.BufferGeometry(), n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.A.slice(0, n * 3), 3)); g.setAttribute('aB', new THREE.BufferAttribute(this.B.slice(0, n * 3), 3)); g.setAttribute('aK', new THREE.BufferAttribute(this.K.slice(0, n * 3), 3));
    const m = new THREE.Points(g, carMat()); m.frustumCulled = false; m.renderOrder = 4; this.mesh = m; return m;
  }
}

// ---------------------------------------------------------------- materials
// a light point: as big as it really is when near, never smaller than a pixel when far (dimmer then, but there);
// lit once the hour's lights-on passes its own moment; the aviation lights blinking; through the haze, not lost in it
const POINT_FOG = `float pointFog(float d){ return exp(-d * uFogDensity * 0.3); }`;
function lightMat() {
  return new THREE.ShaderMaterial({
    name: 'city lights', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 800 }, uTime: U.uTime, uLightsOn: U.uLightsOn, uFogDensity: U.uFogDensity, uDay: U.uDay, uLightK: U.uCityLightK },
    vertexShader: `attribute vec4 aCol, aS; uniform float uScale, uTime, uLightsOn, uFogDensity, uDay, uLightK; varying vec3 vC;
      ${POINT_FOG}
      void main(){
        float on = smoothstep(aCol.a - 0.04, aCol.a, uLightsOn);
        if (aS.z > 0.5) on = step(fract(uTime * 0.55 + aS.w), 0.14);   // (the aviation lights: a flash every two seconds or so)
        vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
        if (on < 0.01 || d < 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        float sz = aS.x * 8.0 * uScale / d, px = clamp(sz, 1.0, 7.0);
        float b = aS.y * 2.0 * on * mix(1.0, max(sz, 0.25), step(sz, 1.0) * 0.55) * pointFog(d) * uLightK;
        b *= mix(1.0, 0.75, uDay);                                     // (by day the lit windows are outshone)
        vC = aCol.rgb * b;
        gl_PointSize = px; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float r = dot(q, q) * 4.0; if (r > 1.0) discard; gl_FragColor = vec4(vC * (1.0 - r) * (1.0 - r) * 1.4, 1.0); }`,
  });
}
function carMat() {
  return new THREE.ShaderMaterial({
    name: 'far traffic', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 800 }, uTime: U.uTime, uLightsOn: U.uLightsOn, uFogDensity: U.uFogDensity, uLightK: U.uCityLightK },
    vertexShader: `attribute vec3 aB, aK; uniform float uScale, uTime, uLightsOn, uFogDensity, uLightK; varying vec3 vC;
      ${POINT_FOG}
      void main(){
        vec3 p = mix(position, aB, fract(aK.x + uTime * aK.y));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = -mv.z;
        float sz = 1.4 * uScale / d, px = clamp(sz, 1.0, 5.0);
        float b = (0.55 + 0.6 * uLightsOn) * mix(1.0, max(sz, 0.3), step(sz, 1.0) * 0.5) * pointFog(d) * uLightK;
        vC = (aK.z > 0.5 ? vec3(1.0, 0.12, 0.08) * 0.9 : vec3(1.0, 0.95, 0.85)) * b;
        gl_PointSize = px; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float r = dot(q, q) * 4.0; if (r > 1.0) discard; gl_FragColor = vec4(vC * (1.0 - r), 1.0); }`,
  });
}
// the low city's walls by day: the sun on the side that faces it, its windows a fine pattern (dark glass, a glint where
// the sun catches it), sinking into the haze; at night dark (their lights are the points), the street's glow at their feet
const FAR_GLSL = /* glsl */`
  vec3 farLight(vec3 n, vec3 w, vec3 base, float seed, vec2 uvw){
    float up = n.y * 0.5 + 0.5;
    vec3 amb = mix(uGround, uSky, smoothstep(0.15, 0.85, up));
    float sun = smoothstep(0.0, 0.45, dot(n, uMoonDir));
    float lowShade = mix(0.55, 1.0, smoothstep(0.0, 40.0, w.y));
    vec3 c = base * (amb * (0.85 + 0.15 * lowShade) + uMoonCol * sun * lowShade * uDay);
    vec2 q = vec2(uvw.x / 2.0, w.y / 3.2), f = fract(q);
    float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.3, f.y) * step(f.y, 0.85) * step(abs(n.y), 0.5);
    float fw = fwidth(q.x) + fwidth(q.y), vis = 1.0 - smoothstep(0.25, 0.9, fw);
    vec3 V = normalize(cameraPosition - w);
    float glint = pow(max(dot(reflect(-V, n), uMoonDir), 0.0), 60.0) * uDay;
    vec3 winC = base * 0.32 + uSky * 0.35 + vec3(1.6, 1.1, 0.6) * glint * 2.0;
    c = mix(c, winC, win * vis * 0.6 * uDay);
    c += vec3(1.0, 0.72, 0.45) * 0.012 * (1.0 - uDay) * (1.0 - smoothstep(0.0, 30.0, w.y));
    return c;
  }
`;
function farMat() {
  return new THREE.ShaderMaterial({
    name: 'farcity', uniforms: { ...U },
    vertexShader: `attribute vec4 aSeed; varying vec3 vN, vW, vL; flat varying vec4 vS;
      void main(){ vS = aSeed; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vL = position * vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${GLSL_COMMON} ${FAR_GLSL} varying vec3 vN, vW, vL; flat varying vec4 vS;   // (flat: an interpolated seed differed pixel to pixel on some GPUs, and the hashes made the walls sparkle)
      void main(){
        vec3 n = normalize(vN); float s = vS.x, kind = vS.z;
        // Tokyo's colours: white, pale grey and beige tile mostly; a few brown brick, dark glass, cream; houses' walls
        float k = floor(s * 8.0);
        vec3 base = k < 2.0 ? vec3(0.8, 0.8, 0.78) : k < 3.0 ? vec3(0.62, 0.63, 0.64) : k < 4.0 ? vec3(0.74, 0.67, 0.56) : k < 5.0 ? vec3(0.58, 0.54, 0.5)
                  : k < 6.0 ? vec3(0.52, 0.4, 0.34) : k < 7.0 ? vec3(0.36, 0.41, 0.49) : vec3(0.78, 0.74, 0.65);
        if (kind < 0.5) base = mix(vec3(0.82, 0.78, 0.7), vec3(0.7, 0.68, 0.64), fract(s * 7.0));
        if (n.y > 0.5) {
          base = mix(vec3(0.44, 0.45, 0.46), vec3(0.55, 0.55, 0.53), fract(s * 13.0));
          if (kind < 0.5) base = fract(s * 3.0) < 0.5 ? vec3(0.28, 0.3, 0.34) : fract(s * 5.0) < 0.5 ? vec3(0.42, 0.3, 0.26) : vec3(0.36, 0.42, 0.46);   // (houses' roofs: slate, brown, blue)
          if (kind > 0.5 && kind < 2.5 && fract(s * 5.3) > 0.86) base = vec3(0.27, 0.4, 0.34);   // (a painted roof)
          if (kind > 2.5) base = vec3(0.5, 0.52, 0.53);
        }
        float u = abs(n.x) > 0.5 ? vL.z : vL.x;
        vec3 c = farLight(n, vW, base, s, vec2(u + s * 30.0, 0.0));
        gl_FragColor = vec4(fogIt(c, vW), 1.0);
      }`,
  });
}
// the real towers: glass curtain walls (or the flats' and hotels' stone and windows), lit from inside at night —
// the offices floor by floor, a bright band under each ceiling, the dark line of each floor's slab; the flats window
// by window, warm. By day the glass gives back the sky and catches the low sun.
function towerMat() {
  return new THREE.ShaderMaterial({
    name: 'fartowers', uniforms: { ...U },
    vertexShader: `attribute vec4 aFac; attribute vec3 color, aTop; varying vec4 vF; varying vec3 vC, vN, vW; varying float vTop; flat varying float vSeed;
      void main(){ vF = aFac; vSeed = aFac.z; vC = color; vTop = aTop.x; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${GLSL_COMMON} varying vec4 vF; varying vec3 vC, vN, vW; varying float vTop; flat varying float vSeed;   // (flat: as the low city's)
      void main(){
        vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
        float u = vF.x, v = vF.y, seed = vSeed, kind = vF.w;
        float fh = kind > 1.5 ? 3.4 : kind > 0.5 ? 3.1 : 4.1, cw = kind > 1.5 ? 3.6 : kind > 0.5 ? 2.8 : 1.5;
        float fl = floor(v / fh), fv = fract(v / fh), ci = floor(u / cw), fu = fract(u / cw);
        float cell = max(fwidth(v / fh), fwidth(u / cw));
        // by day: the glass gives back the sky (and the sun, low); the slab bands
        float upR = reflect(-V, n).y;
        vec3 sky = mix(uHaze * 1.1, uSky * 1.5, smoothstep(-0.1, 0.5, upR));
        float fres = 0.15 + 0.85 * pow(1.0 - max(dot(V, n), 0.0), 3.0);
        float glint = pow(max(dot(reflect(-V, n), uMoonDir), 0.0), 24.0);
        float sun = smoothstep(0.0, 0.4, dot(n, uMoonDir)) * mix(uKeyH.x, 1.0, smoothstep(uKeyH.y, uKeyH.z, vW.y));
        float glass = kind < 0.5 ? 1.0 : 0.45;
        float slab = 1.0 - step(0.16, fv);
        vec3 wall = vC * (mix(uGround, uSky, 0.6) + uMoonCol * sun);
        vec3 dayGlass = vC * 0.35 * (uSky + uMoonCol * sun * 0.5) + sky * fres * 0.8 + uMoonCol * glint * 1.6 * uDay;
        float isWin = kind < 0.5 ? (1.0 - slab) : step(0.15, fu) * step(fu, 0.85) * step(0.22, fv) * step(fv, 0.88);
        vec3 c = mix(wall, dayGlass, glass * isWin);
        if (kind < 0.5) c = mix(c, wall * 0.9, slab);
        // at night: the light inside. Offices: each floor of each firm (24 m along) lit or dark — a bright band under
        // its ceiling, the slab's dark line, the mullions faint; flats and hotels: each window its own, warm
        float cellV = fwidth(v / fh), cellU = fwidth(u / cw);
        float zone = floor(u / (kind < 0.5 ? 24.0 : cw)), h = hash13(vec3(fl, zone, seed * 97.0));
        float litP = kind < 0.5 ? 0.72 : kind > 1.5 ? 0.62 : 0.5;
        float onAt = hash13(vec3(fl * 1.7, zone + 3.0, seed * 31.0));
        float lit = step(h, litP) * smoothstep(onAt - 0.05, onAt, uLightsOn);
        vec3 lc = kind < 0.5 ? (hash12(vec2(fl, seed * 13.0)) < 0.65 ? vec3(1.0, 0.93, 0.8) : vec3(0.88, 0.94, 1.0)) : (hash12(vec2(ci, fl + seed)) < 0.75 ? vec3(1.0, 0.72, 0.42) : vec3(1.0, 0.88, 0.7));
        lc *= 0.62 + 0.4 * hash13(vec3(zone, fl, seed + 5.0));
        float mullK = 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.09, min(fu, 1.0 - fu))) * (1.0 - smoothstep(0.3, 0.8, cellU));
        float band = kind < 0.5 ? mix(0.45, 1.0, smoothstep(0.3, 0.85, fv)) * (1.0 - slab) * mullK
                                : isWin * (0.5 + 0.5 * hash13(vec3(ci, fl, seed + 9.0)));
        // (a floor too thin to see: its own average across it — lit floors still lit, dark ones dark)
        float bandAvg = kind < 0.5 ? 0.62 : 0.34;
        band = mix(band, bandAvg, smoothstep(0.35, 0.9, max(cellV, kind < 0.5 ? 0.0 : cellU)));
        vec3 inside = lc * band * lit * 0.95;
        // (floors themselves too thin to see: the tower's average, the share of its floors lit)
        inside = mix(inside, lc * litP * bandAvg * 0.95 * smoothstep(0.05, 0.9, uLightsOn), smoothstep(1.0, 2.2, cellV));
        // the crown: a lit band round the top of some
        float crown = step(vTop - 6.0, v) * step(0.55, hash12(vec2(seed, 2.0))) * (1.0 - uDay);
        vec3 night = mix(wall * 0.2, dayGlass * 0.22, glass) + inside + vec3(0.95, 0.97, 1.0) * crown * 0.55;
        c = mix(night, c + inside * 0.25, uDay);
        gl_FragColor = vec4(fogIt(c, vW), 1.0);
      }`,
  });
}
// (deck: the expressway's deck, its carriageway lit orange-white by its lamps at night, as from above it shows)
function plainMat(hex = null, deck = false) {
  return new THREE.ShaderMaterial({
    name: 'farplain', uniforms: { ...U, uC: { value: hex ? col(hex) : new THREE.Color(1, 1, 1) } }, defines: { ...(hex ? {} : { VCOL: 1 }), ...(deck ? { DECK: 1 } : {}) },
    vertexShader: `
      #ifdef VCOL
        attribute vec3 color;
      #endif
      varying vec3 vN, vW, vC; void main(){
      #ifdef VCOL
        vC = color;
      #else
        vC = vec3(1.0);
      #endif
      vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${GLSL_COMMON} uniform vec3 uC; varying vec3 vN, vW, vC;
      void main(){ vec3 n = normalize(vN); float sun = smoothstep(0.0, 0.45, dot(n, uMoonDir)) * uDay;
        vec3 c = vC * uC * (mix(uGround, uSky, n.y * 0.5 + 0.5) + uMoonCol * sun);
      #ifdef DECK
        c = mix(c * 0.6, vec3(0.05, 0.05, 0.055), step(0.5, n.y)) + vec3(1.0, 0.66, 0.34) * uLightsOn * (1.0 - uDay * 0.95) * mix(0.03, 0.12 * (0.7 + 0.6 * vnoise(vW.xz * 0.08)), step(0.5, n.y));
      #endif
        gl_FragColor = vec4(fogIt(c, vW), 1.0); }`,
  });
}
function shapedMat() {
  return new THREE.ShaderMaterial({
    name: 'farshaped', uniforms: { ...U },
    vertexShader: `attribute vec4 aCol; varying vec3 vN, vW; varying vec4 vC; void main(){ vC = aCol; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${GLSL_COMMON} varying vec3 vN, vW; varying vec4 vC;
      void main(){ vec3 n = normalize(vN); float sun = smoothstep(0.0, 0.45, dot(n, uMoonDir)) * uDay;
        vec3 c = vC.rgb * (mix(uGround, uSky, n.y * 0.5 + 0.5) + uMoonCol * sun);
        c += vC.rgb * vC.a * mix(1.5, 0.1, uDay) * uLightsOn;           // (lit at night)
        vec3 d = vW - cameraPosition; float f = 1.0 - exp(-length(d) * uFogDensity * 0.45);
        gl_FragColor = vec4(mix(c, uFogColor, f), 1.0); }`,
  });
}
function forestMat() {
  return new THREE.ShaderMaterial({
    name: 'forest', uniforms: { ...U },
    vertexShader: `attribute float aSeed; varying vec3 vN, vW; varying float vS; void main(){ vS = aSeed; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${GLSL_COMMON} varying vec3 vN, vW; varying float vS;
      void main(){ vec3 n = normalize(vN); vec3 base = mix(vec3(0.07, 0.15, 0.08), vec3(0.14, 0.23, 0.1), vS);
        base = mix(base, vec3(0.32, 0.22, 0.08), step(0.86, vS));
        float sun = smoothstep(0.0, 0.5, dot(n, uMoonDir)) * uDay;
        vec3 c = base * (mix(uGround, uSky, n.y * 0.5 + 0.5) + uMoonCol * sun);
        gl_FragColor = vec4(fogIt(c, vW), 1.0); }`,
  });
}
// the ground under it all, painted from the map: asphalt where the roads are, the parks' green, the railways'
// ballast, concrete between; at night the roads glow faintly under their lamps
const BLACK = new THREE.DataTexture(new Uint8Array(4), 1, 1); BLACK.needsUpdate = true;
function groundMat(tex, E, water) {
  return new THREE.ShaderMaterial({
    name: 'farground', uniforms: { ...U, uCat: { value: tex }, uE: { value: E }, uNear: { value: BLACK }, uNearBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uWater: { value: water ? water.tex : BLACK }, uWE: { value: water ? water.E : 1 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${GLSL_COMMON} uniform sampler2D uCat, uNear, uWater; uniform float uE, uWE; uniform vec4 uNearBox; varying vec3 vW;
      void main(){
        vec2 uv = (vW.xz + uE) / (2.0 * uE); vec3 k = vec3(0.0);
        if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) k = texture2D(uCat, uv).rgb;
        vec3 base = vec3(0.4, 0.4, 0.41) * (0.9 + 0.2 * vnoise(vW.xz * 0.02));
        base = mix(base, vec3(0.2, 0.21, 0.23), k.r); base = mix(base, vec3(0.12, 0.2, 0.1), k.g * (1.0 - k.r)); base = mix(base, vec3(0.33, 0.3, 0.27), k.b * (1.0 - k.r));
        vec3 c = base * (mix(uGround, uSky, 0.8) * 0.9 + uMoonCol * 0.2 * uDay);
        c += vec3(1.0, 0.6, 0.28) * k.r * 0.085 * (0.55 + 0.9 * vnoise(vW.xz * 0.06)) * uLightsOn * (1.0 - uDay * 0.95);   // (the lamps' pools along it, not one even band)
        vec2 nu = (vW.xz - uNearBox.xy) / uNearBox.zw;
        if (nu.x > 0.0 && nu.y > 0.0 && nu.x < 1.0 && nu.y < 1.0) c += texture2D(uNear, nu).rgb * uLightsOn * (1.0 - uDay * 0.95);
        // the water — Tokyo Bay, the rivers, the moats (farwater.json): seen from up here at a low angle it is mostly the
        // sky turned back (the low sky's colour, lighter toward the horizon), broken by the swell into long ripples
        // across the view; at night the lights along its shores and on the bridges laid on it in streaks toward you, the
        // dark water between
        vec4 wm = texture2D(uWater, clamp((vW.xz + uWE) / (2.0 * uWE), 0.0003, 0.9997));
        float wet = smoothstep(0.3, 0.7, wm.r);
        if (wet > 0.001) {
          vec3 V = normalize(cameraPosition - vW); float cosT = max(V.y, 0.002), fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
          vec2 to = normalize(vW.xz - cameraPosition.xz), side = vec2(-to.y, to.x); float along = dot(vW.xz, to), across = dot(vW.xz, side);
          float swell = 0.65 * vnoise(vec2(across * 0.004, along * 0.03 + uTime * 0.05)) + 0.35 * vnoise(vec2(across * 0.02, along * 0.12 - uTime * 0.11));
          vec3 skyLow = (uFogColor * 1.15 + uSky * 0.45 + uHaze * 0.25) * mix(vec3(0.92, 0.97, 1.08), vec3(1.0), 0.3) + uMoonCol * 0.1 * uDay;   // (the low sky in it: a little brighter, cooler, than the haze over the land — a silvery band)
          vec3 body = mix(vec3(0.012, 0.02, 0.032), vec3(0.16, 0.2, 0.22) * (uSky * 0.7 + 0.25), uDay);   // (the water's own colour, under the reflection: grey-green by day, near black at night)
          vec3 wc = body * (1.0 - fres) + skyLow * fres * (0.62 + 0.55 * swell);
          float night = uLightsOn * (1.0 - uDay * 0.95), shore = wm.b;
          float streak = smoothstep(0.62, 0.92, vnoise(vec2(across * 0.09, along * 0.006 + uTime * 0.03))) * smoothstep(0.5, 0.95, vnoise(vec2(across * 0.35 + 3.0, along * 0.05 - uTime * 0.2)));
          wc += mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.9, 1.0), step(0.6, vnoise(vec2(across * 0.02, 7.0)))) * streak * shore * night * 0.9;
          wc *= mix(1.0, 0.85, wm.g * (1.0 - fres));                    // (the open sea a little deeper than the rivers)
          c = mix(c, wc, wet);
        }
        // the haze: over the water less of it than over the city's ground (no dust and warmth rising off it), so the bay
        // reads far off as a pale band of the sky's light under the horizon, the far shore beyond
        vec3 d = vW - cameraPosition; float f = 1.0 - exp(-length(d) * uFogDensity * mix(0.8, 0.42, wet));
        gl_FragColor = vec4(mix(c, uFogColor, f), 1.0);
      }`,
  });
}
// many boxes, one draw: each its place (raised by y0: a roof's clutter stands on its roof), turn, size; its seed, height, kind
function instanced(box, list, cell, mat) {
  const n = list.length, im = new THREE.InstancedMesh(box, mat, n), M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const seed = new Float32Array(n * 4); let cx = 0, cz = 0, rad = 0;
  list.forEach(([x, z, w, h, d, rot, sd, kind, y0 = 0], i) => { q.setFromAxisAngle(up, -rot); M.compose(p.set(x, y0, z), q, s.set(w, h, d)); im.setMatrixAt(i, M); seed.set([sd, h, kind, 0], i * 4); cx += x / n; cz += z / n; });
  for (const [x, z] of list) rad = Math.max(rad, Math.hypot(x - cx, z - cz));
  im.geometry = box.clone(); im.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  im.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 60, cz), rad + cell + 400);
  im.boundingSphere = im.geometry.boundingSphere; im.computeBoundingSphere = () => {};
  return im;
}

// the water picture from farwater.json (tools/bake-water.cjs): 16 m a pixel over ±21 km — r: water, g: the sea (from the
// coastline, filled in from points out in Tokyo Bay), b: how near the shore (the shore's lights fall on the water there).
// Read back on the CPU too (at): 0 land, 1 river or lake, 2 sea.
const WR = 16;
function waterMask(w) {
  const WE = w.extent, N = Math.round(2 * WE / WR), P = ([x, z]) => [(x + WE) / WR, (z + WE) / WR];
  const cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d', { willReadFrequently: true });
  const line = pts => { g.beginPath(); pts.forEach((p, i) => { const [a, b] = P(p); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); };
  // the coastline as a wall, then the sea filled in from the bay
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N); g.strokeStyle = '#fff'; g.lineWidth = 2.2; g.lineCap = g.lineJoin = 'round';
  for (const pts of w.coast) line(pts);
  const im = g.getImageData(0, 0, N, N).data, M = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) M[i] = im[i * 4] > 100 ? 1 : 0;
  const seeds = [[35.58, 139.86], [35.52, 139.88], [35.6, 139.83]].map(([la, lo]) => [(lo - 139.70056) * 111320 * Math.cos(35.65948 * Math.PI / 180), -(la - 35.65948) * 110574]);
  const Q = new Int32Array(N * N); let qh = 0, qt = 0;
  for (const s of seeds) { const [a, b] = P(s).map(Math.floor), k = b * N + a; if (a >= 0 && b >= 0 && a < N && b < N && M[k] === 0) { M[k] = 2; Q[qt++] = k; } }
  while (qh < qt) { const k = Q[qh++], a = k % N, b = (k - a) / N; for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = a + da, y = b + db; if (x < 0 || y < 0 || x >= N || y >= N) continue; const j = y * N + x; if (M[j] === 0) { M[j] = 2; Q[qt++] = j; } } }
  for (let i = 0; i < N * N; i++) if (M[i] === 1) M[i] = 0;          // (the coastline's own line: land, but see below)
  // the rivers, canals, moats, lakes: their areas (islands cut out), the narrow ones' centre lines at their width
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N); g.fillStyle = g.strokeStyle = '#fff';
  for (const a of w.areas) { g.beginPath(); for (const ring of [...a.o, ...a.i]) ring.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }), g.closePath(); g.fill('evenodd'); }
  for (const [wd, pts] of w.lines) { g.lineWidth = Math.max(1.0, wd / WR); line(pts); }
  const ri = g.getImageData(0, 0, N, N).data;
  for (let i = 0; i < N * N; i++) if (M[i] === 0 && ri[i * 4] > 110) M[i] = 1;
  // how near the shore: the water blurred, inverted, inside the water
  const id = g.createImageData(N, N); for (let i = 0; i < N * N; i++) { const v = M[i] ? 255 : 0; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  g.putImageData(id, 0, 0); const bl = document.createElement('canvas'); bl.width = bl.height = N; const bg = bl.getContext('2d', { willReadFrequently: true }); bg.filter = 'blur(10px)'; bg.drawImage(cv, 0, 0);
  const B = bg.getImageData(0, 0, N, N).data, T = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { const wv = M[i] ? 255 : 0; T[i * 4] = wv; T[i * 4 + 1] = M[i] === 2 ? 255 : 0; T[i * 4 + 2] = M[i] ? Math.max(0, Math.min(255, (255 - B[i * 4]) * 2.2)) : 0; T[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(T, N, N, THREE.RGBAFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  const at = (x, z) => { const a = Math.floor((x + WE) / WR), b = Math.floor((z + WE) / WR); return a < 0 || b < 0 || a >= N || b >= N ? 0 : M[b * N + a]; };
  const seaShare = M.reduce((s, v) => s + (v === 2), 0) / (N * N), riverShare = M.reduce((s, v) => s + (v === 1), 0) / (N * N);
  return { tex, at, E: WE, N, seaShare, riverShare };
}
