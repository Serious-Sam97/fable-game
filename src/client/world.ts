import * as THREE from 'three';
import { scene, hash, vnoise, rnd, smoothstep, clamp, lerp, SKY } from './core';
import { WORLD_R, LAKE, BANDIT_CAMP, ORCHARD, DARK_FOREST, terrainHeight, distToPath } from '../shared/terrain';

// terreno é compartilhado com o servidor (shared/terrain); re-exportado para o resto do cliente
export { WORLD_R, LAKE, BANDIT_CAMP, ORCHARD, DARK_FOREST, terrainHeight, distToPath };

// ============================================================ build
const windowMats = [];   // glow at night
const lampLights = [];
const flames = [];
const smokes = [];
let stars, moonSprite, sunSprite, fireflies, water, waterGeo;
const clouds = [];
const butterflies = [];
const birds = [];
export const chests = [];
export const MAP_FEATURES = [];   // minimap statics {x, z, color, r}
export const colliders = [];      // cilindros de colisão {x, z, r} — casas, árvores, pedras…

function lambert(color, opts = {}) { return new THREE.MeshLambertMaterial({ color, ...opts }); }

export function buildWorld() {
  buildGround();
  buildWater();
  buildSkyObjects();
  buildVegetation();
  buildVillage();
  buildBanditCamp();
  buildOrchard();
  buildDarkForest();
  buildChests();
  buildAmbientLife();
}

// ------------------------------------------------ ground
function buildGround() {
  const geo = new THREE.PlaneGeometry(440, 440, 150, 150);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const cGrass = new THREE.Color(0x679a42), cGrass2 = new THREE.Color(0x527f33),
        cDirt = new THREE.Color(0x9a7a4d), cRock = new THREE.Color(0x8d8d8d),
        cSand = new THREE.Color(0xc2ab72), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    c.lerpColors(cGrass, cGrass2, vnoise(x * 0.18, z * 0.18));
    if (h > 7) c.lerp(cRock, Math.min(1, (h - 7) / 5));
    const dL = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (dL < LAKE.r + 10) c.lerp(cSand, smoothstep(LAKE.r + 10, LAKE.r - 4, dL));
    const dP = distToPath(x, z);
    if (dP < 5) c.lerp(cDirt, smoothstep(5, 2.2, dP) * 0.85);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);
}

// ------------------------------------------------ water
function buildWater() {
  waterGeo = new THREE.CircleGeometry(LAKE.r + 6, 40, 0, Math.PI * 2);
  waterGeo.rotateX(-Math.PI / 2);
  water = new THREE.Mesh(waterGeo, new THREE.MeshPhongMaterial({
    color: 0x3a7a9c, transparent: true, opacity: 0.82, shininess: 120, specular: 0x88bbdd,
  }));
  water.position.set(LAKE.x, LAKE.waterY, LAKE.z);
  scene.add(water);
  // reeds
  for (let i = 0; i < 24; i++) {
    const a = rnd(i, 40) * Math.PI * 2;
    const r = LAKE.r + 2 + rnd(i, 41) * 5;
    const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
    const y = terrainHeight(x, z);
    if (y < LAKE.waterY - 0.5 || y > LAKE.waterY + 2) continue;
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.6, 4), lambert(0x5a7a3a));
    reed.position.set(x, y + 0.7, z);
    reed.rotation.z = (rnd(i, 42) - 0.5) * 0.3;
    scene.add(reed);
  }
  MAP_FEATURES.push({ x: LAKE.x, z: LAKE.z, color: '#3a7a9c', r: 9 });
}

// ------------------------------------------------ sky objects
function buildSkyObjects() {
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 420; i++) {
    const a = rnd(i, 50) * Math.PI * 2, e = rnd(i, 51) * Math.PI * 0.48;
    const r = 420;
    sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r + 20, Math.sin(a) * Math.cos(e) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false,
  }));
  scene.add(stars);

  const mkGlow = (color, scale) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const gr = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color + 'cc'); gr.addColorStop(1, color + '00');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, fog: false, depthWrite: false }));
    s.scale.setScalar(scale);
    return s;
  };
  sunSprite = mkGlow('#fff2c8', 90);
  moonSprite = mkGlow('#dfe8ff', 42);
  scene.add(sunSprite, moonSprite);

  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 8; i++) {
    const cl = new THREE.Group();
    const n = 3 + Math.floor(rnd(i, 60) * 3);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(6 + rnd(i, j + 61) * 6, 8, 6), cloudMat);
      puff.position.set(j * 8 - n * 4, rnd(i, j + 62) * 3, rnd(i, j + 63) * 6 - 3);
      puff.scale.y = 0.45;
      cl.add(puff);
    }
    cl.position.set((rnd(i, 64) - 0.5) * 500, 95 + rnd(i, 65) * 30, (rnd(i, 66) - 0.5) * 500);
    clouds.push(cl);
    scene.add(cl);
  }
}

// ------------------------------------------------ vegetation
function addTree(x, z, s, kind) {
  const y = terrainHeight(x, z);
  if (y < LAKE.waterY + 0.4) return;
  const g = new THREE.Group();
  if (kind === 'pine') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.38 * s, 2.2 * s, 6), lambert(0x5a4028));
    trunk.position.y = 1.1 * s;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry((2.0 - i * 0.5) * s, 2.2 * s, 7), lambert(i % 2 ? 0x2a5c2a : 0x336633));
      cone.position.y = (2.4 + i * 1.3) * s;
      g.add(cone);
    }
  } else if (kind === 'dead') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.3 * s, 3.4 * s, 5), lambert(0x4a4038));
    trunk.position.y = 1.7 * s;
    trunk.rotation.z = (rnd(x, z) - 0.5) * 0.3;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.09 * s, 1.4 * s, 4), lambert(0x4a4038));
      br.position.set((rnd(x + i, z) - 0.5) * 0.8, (2 + i * 0.6) * s, (rnd(x, z + i) - 0.5) * 0.8);
      br.rotation.z = 0.8 + rnd(i, x) * 1.2;
      g.add(br);
    }
  } else {  // oak
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.45 * s, 2.6 * s, 7), lambert(0x6b4a2a));
    trunk.position.y = 1.3 * s;
    g.add(trunk);
    const greens = [0x3f7a2f, 0x4c8a38, 0x37702c];
    for (let i = 0; i < 4; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry((1.5 + rnd(x + i, z) * 0.8) * s, 8, 6), lambert(greens[i % 3]));
      puff.position.set((rnd(x, z + i) - 0.5) * 1.6 * s, (3.1 + rnd(x + i, z + i) * 1.2) * s, (rnd(x + i * 2, z) - 0.5) * 1.6 * s);
      puff.scale.y = 0.8;
      puff.castShadow = true;
      g.add(puff);
    }
    if (kind === 'apple') {
      for (let i = 0; i < 6; i++) {
        const ap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), lambert(0xc83a2a));
        ap.position.set((rnd(x + i, z + 9) - 0.5) * 2.6 * s, (2.8 + rnd(x + i * 3, z) * 1.4) * s, (rnd(x, z + i * 3) - 0.5) * 2.6 * s);
        g.add(ap);
      }
    }
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.position.set(x, y, z);
  g.rotation.y = rnd(x, z) * Math.PI * 2;
  scene.add(g);
  colliders.push({ x, z, r: 0.45 * s }); // tronco
}

function buildVegetation() {
  for (let i = 0; i < 100; i++) {
    const a = rnd(i, 1) * Math.PI * 2;
    const r = 24 + rnd(i, 2) * 155;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (distToPath(x, z) < 4) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 8) continue;
    if (z > 60 && x < 20 && x > -50) continue; // dark forest area handled separately
    addTree(x, z, 0.8 + rnd(i, 3) * 0.8, rnd(i, 4) > 0.6 ? 'pine' : 'oak');
  }
  // rocks
  const rockMat = lambert(0x7d7d7d);
  for (let i = 0; i < 26; i++) {
    const a = rnd(i + 100, 1) * Math.PI * 2;
    const r = 16 + rnd(i + 100, 2) * 160;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = 0.5 + rnd(i + 100, 3) * 1.5;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    rock.position.set(x, terrainHeight(x, z) + s * 0.3, z);
    rock.rotation.set(rnd(i, 5) * 3, rnd(i, 6) * 3, 0);
    rock.castShadow = true;
    scene.add(rock);
    colliders.push({ x, z, r: s * 0.85 });
  }
  // instanced grass tufts
  {
    const blade = new THREE.ConeGeometry(0.16, 0.55, 4);
    blade.translate(0, 0.26, 0);
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x79ab4e });
    const inst = new THREE.InstancedMesh(blade, grassMat, 900);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < 1400 && n < 900; i++) {
      const a = rnd(i, 20) * Math.PI * 2;
      const r = 6 + rnd(i, 21) * 130;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = terrainHeight(x, z);
      if (y < LAKE.waterY + 0.3 || y > 7 || distToPath(x, z) < 2.5) continue;
      p.set(x, y, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd(i, 22) * Math.PI);
      sc.setScalar(0.7 + rnd(i, 23) * 0.8);
      m4.compose(p, q, sc);
      inst.setMatrixAt(n++, m4);
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }
  // flowers
  {
    const head = new THREE.SphereGeometry(0.09, 6, 5);
    head.translate(0, 0.36, 0);
    const colors = [0xe86a8a, 0xf0e05a, 0xe8e8f0, 0xb06ae8];
    for (let ci = 0; ci < colors.length; ci++) {
      const inst = new THREE.InstancedMesh(head, new THREE.MeshLambertMaterial({ color: colors[ci] }), 70);
      const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
      let n = 0;
      for (let i = 0; i < 200 && n < 70; i++) {
        const a = rnd(i + ci * 50, 30) * Math.PI * 2;
        const r = 5 + rnd(i + ci * 50, 31) * 100;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const y = terrainHeight(x, z);
        if (y < LAKE.waterY + 0.3 || y > 6 || distToPath(x, z) < 2.5) continue;
        p.set(x, y, z);
        m4.compose(p, q, sc);
        inst.setMatrixAt(n++, m4);
      }
      inst.count = n;
      inst.instanceMatrix.needsUpdate = true;
      scene.add(inst);
    }
  }
}

// ------------------------------------------------ village
function makeCottage(w, d, hgt, rotY) {
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.BoxGeometry(w, hgt * 0.45, d), lambert(0x8a8478));
  stone.position.y = hgt * 0.225;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, hgt * 0.55, d + 0.3), lambert(0xe0d2b0));
  wall.position.y = hgt * 0.45 + hgt * 0.275;
  g.add(stone, wall);
  // timber beams
  const beamMat = lambert(0x4a3520);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, hgt * 0.55, 0.14), beamMat);
      beam.position.set((-w / 2 + 0.2 + i * (w - 0.4) / 2), hgt * 0.72, sx * (d / 2 + 0.16));
      g.add(beam);
    }
    const hor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.14, 0.14), beamMat);
    hor.position.set(0, hgt * 0.47, sx * (d / 2 + 0.16));
    g.add(hor);
  }
  // pyramid thatch roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.82, hgt * 0.65, 4), lambert(0xb8935a));
  roof.position.y = hgt + hgt * 0.32;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  g.add(roof);
  // door + windows
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.1), lambert(0x4a3018));
  door.position.set(0, 0.75, d / 2 + 0.18);
  g.add(door);
  const winMat = new THREE.MeshLambertMaterial({ color: 0x3a3020, emissive: 0xffB84a, emissiveIntensity: 0 });
  windowMats.push(winMat);
  for (const sx of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.08), winMat);
    win.position.set(sx * w * 0.28, hgt * 0.72, d / 2 + 0.18);
    g.add(win);
  }
  // chimney + smoke anchor
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, hgt * 0.8, 0.5), lambert(0x77706a));
  chim.position.set(w * 0.3, hgt * 1.25, -d * 0.2);
  g.add(chim);
  const smokeMatCv = document.createElement('canvas');
  smokeMatCv.width = smokeMatCv.height = 64;
  const sctx = smokeMatCv.getContext('2d');
  const sgr = sctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  sgr.addColorStop(0, 'rgba(220,220,220,.55)'); sgr.addColorStop(1, 'rgba(220,220,220,0)');
  sctx.fillStyle = sgr; sctx.fillRect(0, 0, 64, 64);
  const smokeTex = new THREE.CanvasTexture(smokeMatCv);
  const puffs = [];
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false }));
    puff.position.set(w * 0.3, hgt * 1.65, -d * 0.2);
    puff.scale.setScalar(0.8);
    g.add(puff);
    puffs.push({ sp: puff, t: i / 4 });
  }
  smokes.push({ puffs, baseY: hgt * 1.65 });
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.rotation.y = rotY;
  return g;
}

function addLamp(x, z) {
  const y = terrainHeight(x, z);
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 6), lambert(0x2a2118));
  pole.position.y = 1.6;
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.34),
    new THREE.MeshLambertMaterial({ color: 0x2a2118, emissive: 0xffb84a, emissiveIntensity: 0 }));
  lantern.position.y = 3.1;
  const light = new THREE.PointLight(0xffa84a, 0, 14);
  light.position.y = 3.1;
  g.add(pole, lantern, light);
  g.position.set(x, y, z);
  pole.castShadow = true;
  scene.add(g);
  lampLights.push({ light, mat: lantern.material });
  colliders.push({ x, z, r: 0.3 });
}

export function addCampfire(x, z, big = false) {
  const y = terrainHeight(x, z);
  const g = new THREE.Group();
  const logMat = lambert(0x5a4028);
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 5), logMat);
    log.rotation.z = Math.PI / 2; log.rotation.y = (i / 5) * Math.PI;
    g.add(log);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(big ? 0.42 : 0.3, big ? 1.1 : 0.8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
  flame.position.y = 0.5;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(big ? 0.2 : 0.14, big ? 0.7 : 0.5, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd24a }));
  inner.position.y = 0.55;
  const light = new THREE.PointLight(0xff9a3a, 1.6, big ? 18 : 12);
  light.position.y = 1;
  g.add(flame, inner, light);
  g.position.set(x, y + 0.15, z);
  scene.add(g);
  flames.push({ flame, inner, light });
  colliders.push({ x, z, r: 0.7 });
}

function buildVillage() {
  const spots = [
    [-14, -4, 0.5], [13, -10, -0.6], [-10, 12, 2.5], [15, 8, -2.2],
  ];
  for (let i = 0; i < spots.length; i++) {
    const [x, z, rot] = spots[i];
    const w = 4.5 + rnd(i, 70) * 1.5, d = 4 + rnd(i, 71) * 1.5;
    const c = makeCottage(w, d, 3 + rnd(i, 72), rot);
    c.position.set(x, terrainHeight(x, z), z);
    scene.add(c);
    MAP_FEATURES.push({ x, z, color: '#8a6d4a', r: 4 });
    colliders.push({ x, z, r: Math.max(w, d) * 0.72 });
  }
  // well
  {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 10), lambert(0x8a8478));
    base.position.y = 0.45;
    const roofPost1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.12), lambert(0x4a3520));
    roofPost1.position.set(-0.9, 1.3, 0);
    const roofPost2 = roofPost1.clone(); roofPost2.position.x = 0.9;
    const wellRoof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 4), lambert(0xb8935a));
    wellRoof.position.y = 2.6; wellRoof.rotation.y = Math.PI / 4;
    g.add(base, roofPost1, roofPost2, wellRoof);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.position.set(0, terrainHeight(0, 0), 0);
    scene.add(g);
    colliders.push({ x: 0, z: 0, r: 1.5 }); // poço
  }
  // market stall
  {
    const g = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.0), lambert(0x6b4a2a));
    counter.position.y = 0.5;
    const postGeo = new THREE.BoxGeometry(0.1, 2.4, 0.1);
    for (const [px, pz] of [[-1.2, -0.4], [1.2, -0.4], [-1.2, 0.4], [1.2, 0.4]]) {
      const post = new THREE.Mesh(postGeo, lambert(0x4a3520));
      post.position.set(px, 1.2, pz);
      g.add(post);
    }
    const awning = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 1.6), lambert(0xa03028));
    awning.position.y = 2.45; awning.rotation.x = 0.12;
    g.add(counter, awning);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.position.set(9, terrainHeight(9, 3), 3);
    g.rotation.y = -0.9;
    scene.add(g);
    colliders.push({ x: 9, z: 3, r: 1.9 }); // feira do Barnum
  }
  addLamp(-4, -6); addLamp(6, -8); addLamp(-6, 7); addLamp(8, 8);
  addCampfire(3, -3);
  // fences along plaza edge
  const fenceMat = lambert(0x5a4530);
  for (let i = 0; i < 14; i++) {
    const a = -0.6 + i * 0.16;
    const x = Math.cos(a) * 21, z = Math.sin(a) * 21;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), fenceMat);
    post.position.set(x, terrainHeight(x, z) + 0.55, z);
    post.castShadow = true;
    scene.add(post);
    colliders.push({ x, z, r: 0.25 });
    if (i > 0) {
      const a0 = -0.6 + (i - 0.5) * 0.16;
      const mx = Math.cos(a0) * 21, mz = Math.sin(a0) * 21;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.4), fenceMat);
      rail.position.set(mx, terrainHeight(mx, mz) + 0.8, mz);
      rail.lookAt(x, terrainHeight(x, z) + 0.8, z);
      scene.add(rail);
    }
  }
}

// ------------------------------------------------ bandit camp
function buildBanditCamp() {
  const { x: cx, z: cz } = BANDIT_CAMP;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const x = cx + Math.cos(a) * 8, z = cz + Math.sin(a) * 8;
    const tent = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.8, 5), lambert(0x4a3a2e));
    tent.position.set(x, terrainHeight(x, z) + 1.3, z);
    tent.castShadow = true;
    scene.add(tent);
    colliders.push({ x, z, r: 2.2 });
  }
  for (let i = 0; i < 4; i++) {
    const x = cx + (rnd(i, 80) - 0.5) * 14, z = cz + (rnd(i, 81) - 0.5) * 14;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), lambert(0x7a5c34));
    crate.position.set(x, terrainHeight(x, z) + 0.45, z);
    crate.rotation.y = rnd(i, 82) * 1.5;
    crate.castShadow = true;
    scene.add(crate);
    colliders.push({ x, z, r: 0.75 });
  }
  // banner
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 6), lambert(0x3a2a18));
  pole.position.set(cx, terrainHeight(cx, cz) + 2.2, cz);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshLambertMaterial({ color: 0x8a1c1c, side: THREE.DoubleSide }));
  flag.position.set(cx + 0.85, terrainHeight(cx, cz) + 3.8, cz);
  scene.add(pole, flag);
  addCampfire(cx + 3, cz + 2, true);
  MAP_FEATURES.push({ x: cx, z: cz, color: '#8a1c1c', r: 5 });
}

// ------------------------------------------------ orchard (beetles)
function buildOrchard() {
  for (let i = 0; i < 9; i++) {
    const x = ORCHARD.x - 12 + (i % 3) * 12 + (rnd(i, 90) - 0.5) * 5;
    const z = ORCHARD.z - 12 + Math.floor(i / 3) * 12 + (rnd(i, 91) - 0.5) * 5;
    addTree(x, z, 0.75 + rnd(i, 92) * 0.3, 'apple');
  }
  MAP_FEATURES.push({ x: ORCHARD.x, z: ORCHARD.z, color: '#c83a2a', r: 5 });
}

// ------------------------------------------------ dark forest (hobbes + balverine)
function buildDarkForest() {
  for (let i = 0; i < 34; i++) {
    const x = DARK_FOREST.x + (rnd(i, 95) - 0.5) * 70;
    const z = DARK_FOREST.z - 25 + rnd(i, 96) * 60;
    if (distToPath(x, z) < 3.5) continue;
    addTree(x, z, 1.0 + rnd(i, 97) * 1.0, rnd(i, 98) > 0.35 ? 'pine' : 'dead');
  }
  MAP_FEATURES.push({ x: DARK_FOREST.x, z: DARK_FOREST.z, color: '#3a2a4a', r: 6 });
}

// ------------------------------------------------ chests
function buildChests() {
  const spots = [
    { x: -17, z: -8, loot: { gold: 50 } },
    { x: 62, z: 32, loot: { gold: 30, hpPot: 1 } },
    { x: BANDIT_CAMP.x + 5, z: BANDIT_CAMP.z - 4, loot: { gold: 100, willPot: 1 } },
    { x: LAKE.x - 20, z: LAKE.z + 18, loot: { gold: 80, hpPot: 1 } },
  ];
  for (const s of spots) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), lambert(0x6b4a2a));
    base.position.y = 0.3;
    const lid = new THREE.Group();
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.7), lambert(0x7a5634));
    lidMesh.position.set(0, 0.15, 0.35);
    lid.add(lidMesh);
    lid.position.set(0, 0.6, -0.35);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.12, 0.74), lambert(0xc8a24b));
    trim.position.y = 0.55;
    g.add(base, lid, trim);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const y = terrainHeight(s.x, s.z);
    g.position.set(s.x, y, s.z);
    g.rotation.y = rnd(s.x, s.z) * Math.PI * 2;
    scene.add(g);
    chests.push({ group: g, lid, pos: new THREE.Vector3(s.x, y, s.z), loot: s.loot, opened: false });
    colliders.push({ x: s.x, z: s.z, r: 0.8 });
  }
}

// ------------------------------------------------ ambient life
function buildAmbientLife() {
  // fireflies
  {
    const geo = new THREE.BufferGeometry();
    const pts = [], seeds = [];
    for (let i = 0; i < 90; i++) {
      const a = rnd(i, 110) * Math.PI * 2;
      const r = 5 + rnd(i, 111) * 90;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pts.push(x, terrainHeight(x, z) + 1 + rnd(i, 112) * 2, z);
      seeds.push(rnd(i, 113) * 10);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xd8ff6a, size: 0.22, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    fireflies.userData.seeds = seeds;
    fireflies.userData.base = pts.slice();
    scene.add(fireflies);
  }
  // butterflies
  const bColors = [0xf0a0c0, 0xf0e06a, 0x9ad0f0];
  for (let i = 0; i < 10; i++) {
    const wingGeo = new THREE.PlaneGeometry(0.22, 0.18);
    const mat = new THREE.MeshBasicMaterial({ color: bColors[i % 3], side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const b = new THREE.Group();
    const w1 = new THREE.Mesh(wingGeo, mat); w1.position.x = -0.1;
    const w2 = new THREE.Mesh(wingGeo, mat); w2.position.x = 0.1;
    b.add(w1, w2);
    const a = rnd(i, 120) * Math.PI * 2, r = 6 + rnd(i, 121) * 60;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    b.position.set(x, terrainHeight(x, z) + 1.2, z);
    b.userData = { w1, w2, cx: x, cz: z, seed: rnd(i, 122) * 20 };
    scene.add(b);
    butterflies.push(b);
  }
  // birds — two circling flocks
  for (let f = 0; f < 2; f++) {
    for (let i = 0; i < 4; i++) {
      const bird = new THREE.Group();
      const wGeo = new THREE.PlaneGeometry(0.9, 0.3);
      const wMat = new THREE.MeshBasicMaterial({ color: 0x2a2520, side: THREE.DoubleSide });
      const wl = new THREE.Mesh(wGeo, wMat); wl.position.x = -0.45;
      const wr = new THREE.Mesh(wGeo, wMat); wr.position.x = 0.45;
      bird.add(wl, wr);
      bird.userData = { flock: f, i, wl, wr };
      scene.add(bird);
      birds.push(bird);
    }
  }
}

// ============================================================ per-frame world update
export function updateWorld(time, dt, playerPos) {
  const nf = SKY.nightF;
  // celestial sprites follow the player
  const ang = SKY.dayT * Math.PI * 2;
  sunSprite.position.set(playerPos.x + Math.cos(ang) * 380, Math.sin(ang) * 380, playerPos.z + 120);
  moonSprite.position.set(playerPos.x - Math.cos(ang) * 360, -Math.sin(ang) * 360, playerPos.z - 100);
  sunSprite.material.opacity = clamp(Math.sin(ang) * 2 + 0.3, 0, 1);
  moonSprite.material.opacity = clamp(-Math.sin(ang) * 2, 0, 1);
  stars.material.opacity = nf * 0.9;
  stars.position.set(playerPos.x, 0, playerPos.z);

  // windows & lamps
  for (const wm of windowMats) wm.emissiveIntensity = nf * 1.6;
  for (const l of lampLights) {
    const flick = 1 + Math.sin(time * 9 + l.light.position.x) * 0.08;
    l.light.intensity = nf * 1.8 * flick;
    l.mat.emissiveIntensity = nf * 2.2 * flick;
  }
  for (const f of flames) {
    f.flame.scale.y = 1 + Math.sin(time * 12 + f.light.position.x) * 0.25;
    f.inner.scale.y = 1 + Math.cos(time * 15) * 0.3;
    f.light.intensity = 1.4 + Math.sin(time * 11) * 0.3 + nf * 0.6;
  }
  // chimney smoke
  for (const s of smokes) {
    for (const p of s.puffs) {
      p.t += dt * 0.22;
      if (p.t > 1) p.t -= 1;
      p.sp.position.y = s.baseY + p.t * 4;
      p.sp.material.opacity = (1 - p.t) * 0.5;
      p.sp.scale.setScalar(0.7 + p.t * 1.8);
    }
  }
  // clouds drift
  for (const c of clouds) {
    c.position.x += dt * 1.2;
    if (c.position.x > playerPos.x + 280) c.position.x = playerPos.x - 280;
  }
  // water waves
  {
    const pos = waterGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, Math.sin(time * 1.4 + x * 0.4 + z * 0.3) * 0.1);
    }
    pos.needsUpdate = true;
  }
  // fireflies at night
  {
    fireflies.material.opacity = nf;
    if (nf > 0.02) {
      const pos = fireflies.geometry.attributes.position;
      const base = fireflies.userData.base, seeds = fireflies.userData.seeds;
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        pos.setX(i, base[i * 3] + Math.sin(time * 0.7 + s) * 1.5);
        pos.setY(i, base[i * 3 + 1] + Math.sin(time * 1.1 + s * 2) * 0.6);
        pos.setZ(i, base[i * 3 + 2] + Math.cos(time * 0.5 + s) * 1.5);
      }
      pos.needsUpdate = true;
    }
  }
  // butterflies by day
  for (const b of butterflies) {
    b.visible = nf < 0.5;
    if (!b.visible) continue;
    const u = b.userData;
    b.position.x = u.cx + Math.sin(time * 0.5 + u.seed) * 3;
    b.position.z = u.cz + Math.cos(time * 0.4 + u.seed) * 3;
    b.position.y = terrainHeight(b.position.x, b.position.z) + 1.1 + Math.sin(time * 2 + u.seed) * 0.4;
    const flap = Math.sin(time * 14 + u.seed) * 0.9;
    u.w1.rotation.y = flap; u.w2.rotation.y = -flap;
  }
  // birds circle by day
  for (const b of birds) {
    b.visible = nf < 0.6;
    if (!b.visible) continue;
    const u = b.userData;
    const t = time * 0.12 + u.i * 0.5 + u.flock * 3;
    const cx = u.flock ? -60 : 50, cz = u.flock ? 40 : -30;
    b.position.set(cx + Math.cos(t) * 45, 38 + Math.sin(time * 0.4 + u.i) * 3, cz + Math.sin(t) * 45);
    b.rotation.y = -t - Math.PI / 2;
    const flap = Math.sin(time * 5 + u.i * 2) * 0.7;
    u.wl.rotation.z = flap; u.wr.rotation.z = -flap;
  }
}
