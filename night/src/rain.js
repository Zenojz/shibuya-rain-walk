// The rain, as the weather scenes' (weather-wallpaper: the freezing rain's street, the thunderstorm's sea — the ones
// that were liked): not long white lines but drops, each its own size (most a millimetre or two, a few four), falling
// at the speed its size gives it, drawn as the short streak a camera's shutter sees (one or two tenths of a metre);
// soft across (a gaussian, not a hard rod), the nearest out of focus — wider, fainter, no brighter in all; one too
// small for a pixel fades rather than growing into a far white rod. A drop gives no light of its own: it is seen only
// where light falls on it — the shop fronts, the lamps, the screens — in their colour, and a little of the sky's;
// it glints as it falls. Gusts carry sheets of it, thicker and thinner, never an even screen. A box of them always
// round the camera. Where each lands, a splash: a little crown of droplets thrown up and out, and gone in a fifth
// of a second (thousands round you, each landing somewhere new every time). The rings on the water are the ground's.
import * as THREE from 'three';
import { U, GLSL_COMMON } from './materials.js';

// (indoors: the kombini; and SHIBUYA SKY's 46F, 45F and the tunnel between, under the roof — in the roof's frame, the
// escalators' run left out: skygallery.js)
const ROOM = `uniform vec2 uRoomO, uRoomU, uGalO, uGalU, uGalV, uGalY; uniform vec3 uRoomS;
  bool inRoom(vec3 p){ vec2 rq = p.xz - uRoomO; float rx = dot(rq, uRoomU), rz = dot(rq, vec2(-uRoomU.y, uRoomU.x));
    vec2 gq = p.xz - uGalO; float gu = dot(gq, uGalU), gv = dot(gq, uGalV);
    bool gal = gu > -10.2 && gu < 49.2 && gv > 0.3 && gv < 50.6 && !(gu < 21.8 && gv < 9.45) && p.y > uGalY.x && p.y < uGalY.y;
    return (rx > 0.0 && rx < uRoomS.x && rz > -0.3 && rz < uRoomS.y && p.y < uRoomS.z + 1.2) || gal; }`;

export class Rain {
  constructor(n = 26000, size = 40, height = 24) {
    const g = new THREE.InstancedBufferGeometry(), base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const seed = new Float32Array(n * 4); for (let i = 0; i < n; i++) seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4)); g.instanceCount = n;
    const room = { uRoomO: { value: new THREE.Vector2(1e5, 1e5) }, uRoomU: { value: new THREE.Vector2(1, 0) }, uRoomS: { value: new THREE.Vector3(0, 0, 0) },
      uGalO: { value: new THREE.Vector2(1e5, 1e5) }, uGalU: { value: new THREE.Vector2(1, 0) }, uGalV: { value: new THREE.Vector2(0, 1) }, uGalY: { value: new THREE.Vector2(0, 0) } };
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { ...U, uCam: { value: new THREE.Vector3() }, uSize: { value: size }, uH: { value: height }, uK: { value: 1 }, uTanHalf: { value: 0.55 }, ...room },
      vertexShader: /* glsl */`
        ${GLSL_COMMON}
        ${ROOM}
        attribute vec4 aSeed; uniform vec3 uCam; uniform float uSize, uH, uK, uTanHalf; uniform vec2 uRes; varying float vA, vS, vX; varying vec3 vL;
        void main(){
          // its size (most small), its speed by its size, the wind on it
          float key = aSeed.w, dia = 0.0011 + 0.0034 * pow(key, 1.8), v = 4.6 + 4.6 * sqrt(key);
          vec3 vel = vec3(0.55, -v, 0.22);
          // its place in a box that follows the camera (wrapped), falling, drifting with the wind as it goes
          float y = mod(aSeed.y * uH - uTime * v, uH);
          vec3 p = vec3(aSeed.x * uSize, y, aSeed.z * uSize);
          p.xz += vel.xz * (uH - y) / v;
          p.x = mod(p.x - uCam.x + uSize * 0.5, uSize) + uCam.x - uSize * 0.5;
          p.z = mod(p.z - uCam.z + uSize * 0.5, uSize) + uCam.z - uSize * 0.5;
          p.y += max(uCam.y - uH * 0.35, -0.5);
          vec3 toEye = uCam - p; float dist = max(length(toEye), 0.01);
          vec3 dir = normalize(vel), side = normalize(cross(dir, toEye / dist));
          // as wide as it is, or a pixel; near the eye out of focus
          float blur = 1.0 + 1.6 * (1.0 - smoothstep(0.7, 2.6, dist)), pixel = 2.0 * dist * uTanHalf / uRes.y;
          float width = max(dia, pixel * 0.9) * blur, shutter = 0.016 + 0.008 * aSeed.x;
          float s = position.y + 0.5;                                      // (0 its tail, where it was as the shutter opened; 1 the drop)
          vec3 w = p - vel * shutter * (1.0 - s) + side * position.x * width * 3.0;
          vS = s; vX = position.x * 3.0;
          // the light on it: the street's (shop fronts, lamps, screens) where it falls, and a little sky; it glints
          vL = streetLight(p, vec3(0.0, 1.0, 0.0)) * 3.2 + uSky * 1.0 + vec3(0.07, 0.08, 0.11);   // (the sky's and the city's glow, faint: in the dark it is only just there)
          float sheet = 0.35 + 0.65 * smoothstep(0.25, 0.75, vnoise((p.xz - vel.xz * uTime) * 0.06 + aSeed.y * 0.0));
          float glint = 0.65 + 0.35 * sin(uTime * (8.0 + 9.0 * aSeed.z) + aSeed.x * 40.0);
          vA = uRain * uK * smoothstep(0.5, 1.4, dist) * (1.0 - smoothstep(uSize * 0.32, uSize * 0.5, dist)) * step(0.0, p.y) * pow(dia * blur / width, 0.6) * sheet * glint;
          if (inRoom(p)) vA = 0.0;                                       // (none indoors)
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `varying float vA, vS, vX; varying vec3 vL;
        void main(){ float a = exp(-vX * vX * 2.2) * pow(smoothstep(0.0, 1.0, vS), 0.8) * (1.0 - smoothstep(0.9, 1.0, vS));   // (soft across; its tail fading in, the drop at its head)
          gl_FragColor = vec4(vL * a * vA * 0.9, 1.0); }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.layers.set(1); this.mesh.userData.noInk = true; this.mesh.renderOrder = 8;
    this.room = room;
    // ---- the splashes
    const ns = 2400, sg = new THREE.InstancedBufferGeometry();
    sg.index = base.index; sg.setAttribute('position', base.attributes.position); sg.setAttribute('uv', base.attributes.uv);
    const ss = new Float32Array(ns * 4); for (let i = 0; i < ns; i++) ss.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    sg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(ss, 4)); sg.instanceCount = ns;
    this.splashMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { ...U, uCam: { value: new THREE.Vector3() }, uSize: { value: 26 }, uMask: { value: null }, uBox: { value: new THREE.Vector4(-220, -220, 440, 440) }, ...room },
      vertexShader: /* glsl */`
        ${GLSL_COMMON}
        ${ROOM}
        attribute vec4 aSeed; uniform vec3 uCam; uniform float uSize; uniform sampler2D uMask; uniform vec4 uBox;
        varying vec2 vUv; varying float vT, vA, vBig; flat varying float vSeed; varying vec3 vL;
        float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
        void main(){
          // each lands somewhere new each time round; each time it is a different drop: its size (most tiny, a few big),
          // how long its splash lasts
          float period = 0.6 + 0.9 * aSeed.w, cyc = floor((uTime + aSeed.y * 9.0) / period), t = fract((uTime + aSeed.y * 9.0) / period) * period;
          float seed = h1(aSeed.x * 37.1 + cyc * 1.91) * 97.0; vSeed = seed;
          float big = pow(h1(seed + 0.3), 3.0); vBig = big;
          float life = 0.09 + 0.2 * big + 0.05 * h1(seed + 1.7);
          vT = t / life;
          vec2 r = vec2(h1(aSeed.x * 91.7 + cyc * 3.1), h1(aSeed.z * 53.3 + cyc * 7.7)) - 0.5;
          r = sign(r) * pow(abs(r) * 2.0, vec2(1.6)) * 0.5;              // (more of them near: the box squeezed toward the camera)
          vec3 p = vec3(uCam.x + r.x * uSize, 0.0, uCam.z + r.y * uSize);
          vec2 m = (p.xz - uBox.xy) / uBox.zw; float road = (m.x > 0.0 && m.y > 0.0 && m.x < 1.0 && m.y < 1.0) ? texture2D(uMask, m).r : 1.0;
          p.y = road > 0.5 ? 0.012 : 0.162;
          float s = 0.06 + 0.2 * big;
          vec3 toC = normalize(uCam - p), side = normalize(cross(vec3(0.0, 1.0, 0.0), toC)), up = vec3(0.0, 1.0, 0.0);
          vec3 w = p + side * position.x * s * 2.0 + up * (position.y + 0.5) * s * 1.4;
          vUv = uv;
          // its colour: the light where it falls (the shop fronts, screens, lamps) — in the dark, hardly to be seen
          vL = streetLight(vec3(p.x, 0.0, p.z), vec3(0.0, 1.0, 0.0)) * 1.5 + uSky * 0.7 + vec3(0.05, 0.06, 0.08);
          float d = distance(p, uCam);
          vA = uRain * step(vT, 1.0) * smoothstep(0.6, 1.6, d) * (1.0 - smoothstep(uSize * 0.3, uSize * 0.5, d)) * step(0.4, uWet) * (0.35 + 0.65 * h1(seed + 4.4));
          if (inRoom(p)) vA = 0.0;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */`varying vec2 vUv; varying float vT, vA, vBig; flat varying float vSeed; varying vec3 vL;
        float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
        void main(){
          if (vA < 0.001) discard;
          vec2 q = vec2(vUv.x - 0.5, vUv.y) * vec2(2.0, 1.4);
          float t = vT, a = 0.0, hl = 0.0, lean = (h1(vSeed + 9.1) - 0.5) * 0.5;
          int n = 2 + int(floor(h1(vSeed + 2.2) * (3.0 + 3.0 * vBig)));   // (two to seven droplets: more for a bigger drop)
          for (int i = 0; i < 7; i++) {
            if (i >= n) break;
            float fi = float(i), hs = h1(vSeed * 1.3 + fi * 7.17), ang = (hs - 0.5) * 2.4 + lean, sp = 0.45 + 0.75 * h1(vSeed + fi * 3.31);
            vec2 v0 = vec2(sin(ang) * sp, cos(ang) * sp * (0.6 + 0.6 * h1(vSeed + fi * 5.9)));
            vec2 c = v0 * t + vec2(0.0, -1.5 * t * t);
            vec2 dv = normalize(v0 + vec2(0.0, -3.0 * t) + 1e-4), e = q - c;
            float along = dot(e, dv), across = length(e - dv * along), rad = 0.025 + 0.035 * h1(vSeed + fi * 1.7);
            float drop = exp(-across * across / (rad * rad)) * exp(-pow(max(abs(along + rad * 0.6) - rad * 0.4, 0.0) / (rad * (1.0 + 2.0 * sp)), 2.0));
            a += drop * (0.55 + 0.45 * h1(vSeed + fi * 2.3)); hl += drop * smoothstep(0.0, rad, -along);
          }
          // a big drop's crown: the thin wall of water thrown up round the foot, seen as a low ellipse, gone quickly
          float rx = 0.12 + 0.4 * t, ell = length(vec2(q.x / rx, (q.y - 0.02) / (rx * 0.28))), crown = smoothstep(0.18, 0.0, abs(ell - 1.0)) * step(q.y, 0.04 + 0.25 * sin(3.1416 * min(t * 1.6, 1.0)) * rx) * vBig * (1.0 - t);
          a += crown * 0.8;
          a *= 1.0 - smoothstep(0.55, 1.0, t);
          vec3 c = vL * (0.45 + 0.9 * hl);                                // (clear water: the light through it, a glint on its side)
          gl_FragColor = vec4(c * a * vA * 1.7, 1.0);
        }`,
    });
    this.splashes = new THREE.Mesh(sg, this.splashMat); this.splashes.frustumCulled = false; this.splashes.layers.set(1); this.splashes.userData.noInk = true; this.splashes.renderOrder = 8;
  }
  setGround(ground) { this.splashMat.uniforms.uMask.value = ground.maskTex; this.splashMat.uniforms.uBox.value.set(...ground.box); }
  setRoom(o, u, s) { this.room.uRoomO.value.copy(o); this.room.uRoomU.value.copy(u); this.room.uRoomS.value.copy(s); }
  setGallery(F, y0, y1) { const r = this.room; r.uGalO.value.set(...F.toW(0, 0)); r.uGalU.value.set(F.ux, F.uz); r.uGalV.value.set(F.vx, F.vz); r.uGalY.value.set(y0, y1); }
  update(camera, street = true) {
    this.mat.uniforms.uCam.value.copy(camera.position); this.mat.uniforms.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2); this.splashMat.uniforms.uCam.value.copy(camera.position);
    this.mesh.visible = U.uRain.value > 0.01; this.splashes.visible = this.mesh.visible && street && camera.position.y < 30;
  }
}
