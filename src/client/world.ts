import * as THREE from 'three';
import { scene, hash, vnoise, rnd, smoothstep, clamp, lerp, SKY, toonMaterial, toonRamp } from './core';
import { loadProp } from './assets';
import {
  WORLD_R, LAKE, SEA, WATERS, BANDIT_CAMP, ORCHARD, DARK_FOREST, PORT, CRAB_BEACH, GATES, CAVE, RITUAL,
  terrainHeight, distToPath,
} from '../shared/terrain';

// terreno é compartilhado com o servidor (shared/terrain); re-exportado para o resto do cliente
export { WORLD_R, LAKE, SEA, WATERS, BANDIT_CAMP, ORCHARD, DARK_FOREST, PORT, CRAB_BEACH, GATES, CAVE, RITUAL, terrainHeight, distToPath };

// estátua do herói que surge na praça ao vencer o arco principal (consequência visível)
export const heroStatue = { group: null };

// baú trancado da caverna — o jogo precisa saber onde ele está (chave de prata)
export const lockedChest = { x: CAVE.x, z: CAVE.z - 13, opened: false, group: null };

// nós de coleta (ervas e minério) — o jogo cuida da colheita/respawn
export const gatherables = [];
// estações de crafting (pontos de interação)
export const FORGE = { x: 6, z: 5 };
export const CAULDRON = { x: -3, z: 2 };

// clima — determinístico a partir da hora do mundo: todos os clientes veem a mesma chuva
export const weather = { rainF: 0, raining: false };

// ============================================================ build
const windowMats = [];   // glow at night
const lampLights = [];
const flames = [];
const smokes = [];
let stars, moonSprite, sunSprite, fireflies, water, waterGeo;
let rain, seaWater, lightBeam, lightBeamTarget;
export let forSaleSign = null;
// interior da caverna (domo/piso/estalagmites/tochas) — escondido no mundo aberto p/ não
// aparecer como um "domo preto" à distância; visível só quando o jogador está dentro (Fase 36).
export let caveInterior = null;
const boats = [];
const gateGlows = [];
const clouds = [];
const butterflies = [];
const birds = [];
export const chests = [];
export const MAP_FEATURES = [];   // minimap statics {x, z, color, r}
export const colliders = [];      // cilindros de colisão {x, z, r} — casas, árvores, pedras…

// cel-shaded (look Fable) — antes era Lambert; toon dá bandas suaves de luz
function lambert(color, opts = {}) { return toonMaterial(color, opts); }

// ---- vento: uniforme compartilhado, atualizado por frame ----
const windUniform = { value: 0 };
const swayTrees = []; // { group, phase, amp }
// material que balança ao vento (a folhagem/grama inclina conforme a altura do vértice)
function windMaterial(color, amp = 0.18) {
  const m = new THREE.MeshLambertMaterial({ color });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniform;
    sh.uniforms.uAmp = { value: amp };
    sh.vertexShader = 'uniform float uTime;\nuniform float uAmp;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         vec3 wp = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
       #else
         vec3 wp = vec3(modelMatrix[3][0], 0.0, modelMatrix[3][2]);
       #endif
       float ph = uTime * 1.6 + wp.x * 0.25 + wp.z * 0.2;
       float sway = sin(ph) * uAmp * max(transformed.y, 0.0);
       transformed.x += sway;
       transformed.z += sway * 0.45;`
    );
  };
  return m;
}

// ============================================================ props do mundo (Bloco B)
// As funções de build REGISTRAM posições (plantings/rockPlacements); dressWorld() carrega os
// GLB do Kenney (async) e os instancia. Se um GLB faltar, cai no procedural — nada quebra.
const NAT = '/models/nature/Models/GLTF format/';
const plantings = [];       // { x, z, s, kind }
const rockPlacements = [];  // { x, z, s }
const TREE_SETS = {
  oak:   ['tree_oak', 'tree_default', 'tree_fat', 'tree_detailed'],
  pine:  ['tree_pineTallA', 'tree_pineTallB', 'tree_pineTallC', 'tree_pineRoundC'],
  apple: ['tree_default', 'tree_detailed', 'tree_fat'],
  dead:  ['tree_thin', 'tree_simple'],
};
const ROCK_SET = ['rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD', 'rock_tallA', 'rock_tallC', 'rock_tallE'];
// vegetação de chão (Fase 14): { set:[nomes], h:[min,max], collide, sway }
const scatterPlacements = []; // { x, z, kind }
const SCATTER = {
  bush:     { set: ['plant_bush', 'plant_bushDetailed', 'plant_bushLarge', 'plant_bushSmall'], h: [0.7, 1.2], collide: 0, sway: 0.05 },
  fern:     { set: ['plant_flatTall', 'plant_flatShort', 'grass_leafsLarge', 'grass_large'], h: [0.5, 0.9], collide: 0, sway: 0.06 },
  flower:   { set: ['flower_redA', 'flower_redB', 'flower_yellowA', 'flower_yellowB', 'flower_purpleA', 'flower_purpleB'], h: [0.35, 0.5], collide: 0, sway: 0.05 },
  mushroom: { set: ['mushroom_red', 'mushroom_redGroup', 'mushroom_tan', 'mushroom_tanGroup', 'mushroom_redTall'], h: [0.25, 0.45], collide: 0, sway: 0 },
  stump:    { set: ['stump_round', 'stump_old', 'stump_square', 'log'], h: [0.4, 0.7], collide: 0.5, sway: 0 },
};

// mobília urbana (Fase 16) — props decorativos avulsos posicionados à mão
const TOWN = '/models/town/Models/GLB format/';
const SURV = '/models/survival/Models/GLB format/';
const decorPlacements = []; // { x, z, url, h, collide }
function decor(x, z, url, h, collide = 0) {
  decorPlacements.push({ x, z, url, h, collide });
}
const HOUSE_PIECES = ['wall', 'wall-door', 'wall-window-round'];
const housePlacements = []; // { x, z, w, d, rot }

// monta uma casa de N×M módulos com paredes, porta, janelas, telhado e chaminé fumegante
function buildTownHouse(x, z, w, d, rot, tpl) {
  const wallT = tpl[TOWN + 'wall.glb'];
  if (!wallT) { // fallback: cabana procedural
    const c = makeCottage(w, d, 3, rot);
    c.position.set(x, terrainHeight(x, z), z);
    scene.add(c);
    return;
  }
  const M = 2.2, H = 2;
  const cols = Math.min(4, Math.max(2, Math.round(w / M)));
  const rows = Math.min(4, Math.max(2, Math.round(d / M)));
  const hw = cols * M / 2, hd = rows * M / 2;
  const g = new THREE.Group();
  // O módulo de parede do kit tem a origem FORA do centro (malha deslocada ~0.45 no
  // X local, o eixo da espessura). Como cada lado da casa usa uma rotação diferente,
  // esse offset joga frente/fundo pra dentro e leste/oeste pra fora → degrau e vão em
  // cada canto. Medimos o offset por peça e o cancelamos na posição, deixando toda
  // parede rente à borda (retângulo fechado, cantos encostando).
  const _centerX = new Map();
  const place = (name, lx, lz, ly, ry) => {
    const tplO = tpl[TOWN + name + '.glb'] || wallT;
    const o = tplO.clone(true);
    o.scale.setScalar(M);
    o.rotation.y = ry;
    let cx = _centerX.get(name);
    if (cx === undefined) {
      const c = new THREE.Box3().setFromObject(tplO).getCenter(new THREE.Vector3());
      cx = isFinite(c.x) ? c.x : 0;
      _centerX.set(name, cx);
    }
    const off = cx * M; // offset da malha em unidades de mundo (X local, pós-escala)
    o.position.set(lx - off * Math.cos(ry), ly, lz + off * Math.sin(ry));
    g.add(o);
  };
  const doorCol = Math.floor(cols / 2);
  for (let lvl = 0; lvl < H; lvl++) {
    const y = lvl * M;
    const winOr = (n) => (lvl === 1 ? 'wall-window-round' : n);
    for (let c = 0; c < cols; c++) {
      const lx = -hw + (c + 0.5) * M;
      const front = (lvl === 0 && c === doorCol) ? 'wall-door' : winOr('wall');
      place(front, lx, -hd, y, -Math.PI / 2);       // frente (-Z)
      place(winOr('wall'), lx, hd, y, Math.PI / 2);  // fundo (+Z)
    }
    for (let r = 0; r < rows; r++) {
      const lz = -hd + (r + 0.5) * M;
      place(winOr('wall'), -hw, lz, y, Math.PI);     // oeste (-X)
      place(winOr('wall'), hw, lz, y, 0);            // leste (+X)
    }
  }
  // telhado em pirâmide (4 águas) com beiral, cor telha
  const rw = Math.max(cols, rows) * M;
  // fator 0.82: a face plana do telhado (a ~0.707·raio, virada p/ as paredes após o
  // giro de 45°) alcança ~1.16·(meia-largura) → cobre as paredes com um beiral leve.
  const roof = new THREE.Mesh(new THREE.ConeGeometry(rw * 0.82, M * 1.15, 4), lambert(0xb0563a));
  roof.position.y = H * M + M * 0.55;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set((cols * M) / rw, 1, (rows * M) / rw);
  g.add(roof);
  // chaminé + fumaça (detalhe aconchegante, como na cabana)
  const chimY = H * M + M * 0.6;
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, M * 1.1, 0.5), lambert(0x77706a));
  chim.position.set(hw * 0.5, chimY, -hd * 0.4);
  g.add(chim);
  const smokeCv = document.createElement('canvas'); smokeCv.width = smokeCv.height = 64;
  const sctx = smokeCv.getContext('2d');
  const sgr = sctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  sgr.addColorStop(0, 'rgba(220,220,220,.5)'); sgr.addColorStop(1, 'rgba(220,220,220,0)');
  sctx.fillStyle = sgr; sctx.fillRect(0, 0, 64, 64);
  const smokeTex = new THREE.CanvasTexture(smokeCv);
  const puffs = [];
  const smokeBaseY = chimY + M * 0.8;
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false }));
    puff.position.set(hw * 0.5, smokeBaseY, -hd * 0.4);
    puff.scale.setScalar(0.8);
    g.add(puff);
    puffs.push({ sp: puff, t: i / 4 });
  }
  smokes.push({ puffs, baseY: smokeBaseY });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.position.set(x, terrainHeight(x, z), z);
  g.rotation.y = rot;
  scene.add(g);
}

// props com culling por distância (Fase 46): esconde detalhe distante → menos draw calls olhando
// o horizonte. A névoa já esconde o pop; props pequenos têm distância curta, árvores/rochas longa.
const cullables = []; // { obj, x, z, d2 }
// instancia um template de prop em (x,z), assentando a base no terreno
function placeProp(tpl, x, z, { h = null, scale = null, ry = 0, collide = 0, sway = 0, sink = 0, cull = 0 } = {}) {
  const g = tpl.clone(true);
  const s = scale != null ? scale : h / tpl.userData.h;
  g.scale.setScalar(s);
  g.position.set(x, terrainHeight(x, z) - tpl.userData.minY * s - sink, z);
  g.rotation.y = ry;
  scene.add(g);
  if (collide > 0) colliders.push({ x, z, r: collide });
  if (sway > 0) swayTrees.push({ group: g, phase: rnd(x + 3, z + 7) * Math.PI * 2, amp: sway });
  if (cull > 0) cullables.push({ obj: g, x, z, d2: cull * cull });
  return g;
}
// reavalia visibilidade por distância do jogador (throttled — algumas vezes por segundo)
let _cullT = 0, _cullOn = true;
export function setCulling(on) { _cullOn = on; if (!on) for (const c of cullables) c.obj.visible = true; _cullT = 0; }
export function cullStats() { let hidden = 0; for (const c of cullables) if (!c.obj.visible) hidden++; return { total: cullables.length, hidden }; }
function updateCulling(dt, px, pz) {
  if (!_cullOn) return;
  _cullT -= dt;
  if (_cullT > 0) return;
  _cullT = 0.2;
  for (const c of cullables) {
    const dx = c.x - px, dz = c.z - pz;
    c.obj.visible = (dx * dx + dz * dz) < c.d2;
  }
}
const pick = (arr, x, z) => arr[Math.floor(rnd(x * 7.3 + 11, z * 3.1 + 5) * arr.length) % arr.length];

// instancia N cópias de um template (Fase 48): 1 InstancedMesh por submesh do GLB → milhares de
// props com custo de poucos draw calls. Sem sway individual (aceitável em vegetação de chão).
const _im = new THREE.Matrix4(), _ip = new THREE.Vector3(), _iq = new THREE.Quaternion(), _is = new THREE.Vector3(), _iy = new THREE.Vector3(0, 1, 0);
function instanceProp(tpl, places) {
  if (!places.length) return;
  tpl.updateWorldMatrix(true, true);
  const subs = [];
  tpl.traverse((o) => { if (o.isMesh) subs.push({ geo: o.geometry, mat: o.material, local: o.matrixWorld.clone() }); });
  for (const sub of subs) {
    const inst = new THREE.InstancedMesh(sub.geo, sub.mat, places.length);
    inst.castShadow = true; inst.receiveShadow = true;
    inst.frustumCulled = false; // cobrem a área toda; é 1 draw call de qualquer forma
    for (let i = 0; i < places.length; i++) {
      const p = places[i];
      _iq.setFromAxisAngle(_iy, p.ry); _is.setScalar(p.s); _ip.set(p.x, p.y, p.z);
      inst.setMatrixAt(i, _im.compose(_ip, _iq, _is).multiply(sub.local));
    }
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }
}

async function dressWorld() {
  const urls = new Set();
  for (const set of Object.values(TREE_SETS)) for (const n of set) urls.add(NAT + n + '.glb');
  for (const n of ROCK_SET) urls.add(NAT + n + '.glb');
  for (const cfg of Object.values(SCATTER)) for (const n of cfg.set) urls.add(NAT + n + '.glb');
  for (const n of HOUSE_PIECES) urls.add(TOWN + n + '.glb');
  for (const dp of decorPlacements) urls.add(dp.url);
  const tpl = {};
  await Promise.all([...urls].map((u) => loadProp(u).then((t) => { tpl[u] = t; }).catch(() => {})));

  for (const h of housePlacements) buildTownHouse(h.x, h.z, h.w, h.d, h.rot, tpl);
  for (const dp of decorPlacements) {
    const t = tpl[dp.url]; if (!t) continue;
    placeProp(t, dp.x, dp.z, { h: dp.h, ry: rnd(dp.x + 1, dp.z + 2) * Math.PI * 2, collide: dp.collide });
  }

  for (const p of plantings) {
    const t = tpl[NAT + pick(TREE_SETS[p.kind] || TREE_SETS.oak, p.x, p.z) + '.glb'];
    if (t) placeProp(t, p.x, p.z, {
      h: p.s * 4.2, ry: rnd(p.x, p.z) * Math.PI * 2,
      collide: 0.5 + p.s * 0.12, sway: (p.kind === 'pine' ? 0.02 : 0.03) / Math.max(0.6, p.s),
      cull: 290, // árvores: some só além da névoa (sem pop visível)
    });
    else addTreeProcedural(p.x, p.z, p.s, p.kind); // fallback
  }
  for (const rk of rockPlacements) {
    const t = tpl[NAT + pick(ROCK_SET, rk.x, rk.z) + '.glb'];
    if (t) placeProp(t, rk.x, rk.z, { scale: rk.s * 1.4, ry: rnd(rk.x, rk.z) * Math.PI * 2, collide: rk.s * 0.7, sink: rk.s * 0.12, cull: 240 });
    else placeRockProcedural(rk.x, rk.z, rk.s);
  }
  // vegetação de chão agrupada por GLB → InstancedMesh (Fase 48): ~280 clones viram poucos draw calls
  const scatterGroups = new Map(); // template → [{x,y,z,ry,s}]
  for (const sp of scatterPlacements) {
    const cfg = SCATTER[sp.kind]; if (!cfg) continue;
    const t = tpl[NAT + pick(cfg.set, sp.x, sp.z) + '.glb'];
    if (!t) continue; // sem fallback procedural para detalhe fino — só não aparece
    const h = cfg.h[0] + rnd(sp.x + 2, sp.z + 9) * (cfg.h[1] - cfg.h[0]);
    const s = h / t.userData.h, y = terrainHeight(sp.x, sp.z) - t.userData.minY * s;
    if (!scatterGroups.has(t)) scatterGroups.set(t, []);
    scatterGroups.get(t).push({ x: sp.x, y, z: sp.z, ry: rnd(sp.x, sp.z) * Math.PI * 2, s });
    if (cfg.collide > 0) colliders.push({ x: sp.x, z: sp.z, r: cfg.collide });
  }
  for (const [t, places] of scatterGroups) instanceProp(t, places);
}

export function buildWorld() {
  buildGround();
  buildWater();
  buildSkyObjects();
  buildVegetation();
  buildGroundDetail(); // micro-detalhe de chão (Fase 28) — depois da vegetação (usa plantings)
  buildVillage();
  buildPort();
  buildGates();
  buildCave();
  buildRitual();
  buildBanditCamp();
  buildOrchard();
  buildDarkForest();
  buildChests();
  buildGatherables();
  buildAmbientLife();
  buildRain();
  dressWorld(); // troca árvores/pedras procedurais pelos props Kenney (async, com fallback)
}

// ------------------------------------------------ biomas (Fase 29)
// Cada região tem paleta e vegetação próprias — dá pra saber onde você está só pela cor.
// Influência com falloff suave por proximidade ao centro; a vila (origem) fica neutra (dourado Fable).
// grade: pequeno desvio do color grade global por região (Fase 30) — {warm,sat,duo,tintAmt}
const BIOMES = [
  { name: 'forest',  x: -15, z: 95,  r: 62, col: 0x3f5f3a, str: 0.60, trees: 'pine',  wet: 0.75, grade: { warm: -0.02, sat: 0.00, duo: 0.03, tintAmt: 0.00 } }, // Floresta Sombria
  { name: 'marsh',   x: 60,  z: 150, r: 54, col: 0x6f7546, str: 0.58, trees: 'dead',  wet: 0.95, grade: { warm: -0.01, sat: -0.14, duo: 0.05, tintAmt: 0.00 } }, // Charco do Ritual — doentio
  { name: 'arid',    x: -70, z: -60, r: 48, col: 0x93844c, str: 0.52, trees: 'dead',  wet: 0.12, grade: { warm: 0.04, sat: -0.06, duo: 0.02, tintAmt: 0.02 } },  // Terras do bando — poeirento
  { name: 'orchard', x: 55,  z: 25,  r: 44, col: 0x86a53e, str: 0.42, trees: 'apple', wet: 0.55, grade: { warm: 0.03, sat: 0.05, duo: 0.00, tintAmt: 0.03 } },   // Pomar — viçoso e dourado
  { name: 'coast',   x: 232, z: 70,  r: 98, col: 0x9fa877, str: 0.50, trees: 'pine',  wet: 0.30, grade: { warm: -0.02, sat: 0.02, duo: -0.02, tintAmt: -0.02 } }, // Costa — arejada e clara
];
const _bcol = new THREE.Color();
// grade por região: desvios + cor de tint (dourado puxado levemente p/ o tom da região), por influência
const _gold = new THREE.Color(0xffd9a0), _gtmp = new THREE.Color(), _gtint = new THREE.Color();
const _gradeOut = { warm: 0, sat: 0, duo: 0, tintAmt: 0, tintR: 1, tintG: 1, tintB: 1 };
export function biomeGrade(x, z) {
  let warm = 0, sat = 0, duo = 0, tintAmt = 0;
  _gtint.copy(_gold);
  for (const b of BIOMES) {
    const w = smoothstep(b.r, b.r * 0.35, Math.hypot(x - b.x, z - b.z));
    if (w <= 0) continue;
    const g = b.grade;
    warm += g.warm * w; sat += g.sat * w; duo += g.duo * w; tintAmt += g.tintAmt * w;
    _gtint.lerp(_gtmp.set(b.col), w * 0.22); // tinge o dourado levemente com a cor da região
  }
  _gradeOut.warm = warm; _gradeOut.sat = sat; _gradeOut.duo = duo; _gradeOut.tintAmt = tintAmt;
  _gradeOut.tintR = _gtint.r; _gradeOut.tintG = _gtint.g; _gradeOut.tintB = _gtint.b;
  return _gradeOut;
}
// mistura os tons de bioma na cor base do vértice (antes de rocha/areia/caminho)
function biomeTint(x, z, c) {
  for (const b of BIOMES) {
    const w = smoothstep(b.r, b.r * 0.35, Math.hypot(x - b.x, z - b.z)) * b.str;
    if (w > 0) c.lerp(_bcol.set(b.col), Math.min(0.85, w));
  }
}
// bioma dominante num ponto (ou null se em terreno neutro) — guia a vegetação
function dominantBiome(x, z) {
  let best = null, bw = 0.3;
  for (const b of BIOMES) {
    const w = smoothstep(b.r, b.r * 0.35, Math.hypot(x - b.x, z - b.z));
    if (w > bw) { bw = w; best = b; }
  }
  return best;
}

// ------------------------------------------------ ground
function buildGround() {
  const geo = new THREE.PlaneGeometry(720, 720, 220, 220);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const cGrass = new THREE.Color(0x679a42), cGrass2 = new THREE.Color(0x527f33),
        cDirt = new THREE.Color(0x9a7a4d), cRock = new THREE.Color(0x8d8d8d),
        cRockDk = new THREE.Color(0x6b675f), cSand = new THREE.Color(0xc2ab72), c = new THREE.Color();
  const D = 2.2; // passo p/ estimar a inclinação a partir da altura dos vizinhos
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    // inclinação (gradiente da altura): encostas íngremes viram rocha
    const slope = Math.hypot(terrainHeight(x + D, z) - h, terrainHeight(x, z + D) - h) / D;
    c.lerpColors(cGrass, cGrass2, vnoise(x * 0.18, z * 0.18));
    biomeTint(x, z, c); // paleta por região (Fase 29) — antes dos overlays de rocha/areia/caminho
    // rocha por inclinação + por altitude, com variação de tom
    const rockF = Math.max(smoothstep(0.32, 0.8, slope), smoothstep(5.5, 11, h));
    if (rockF > 0) c.lerp(vnoise(x * 0.3, z * 0.3) > 0.5 ? cRock : cRockDk, rockF * 0.92);
    // manchas de terra/desgaste espalhadas (clareiras pisadas) — antes da praia/caminho
    const patch = vnoise(x * 0.045 + 13, z * 0.045 + 7);
    if (patch > 0.70) c.lerp(cDirt, smoothstep(0.70, 0.86, patch) * 0.42);
    for (const w of WATERS) {
      const dW = Math.hypot(x - w.x, z - w.z);
      // borda praia↔grama irregular (ruído)
      const edge = dW + (vnoise(x * 0.5 + 3, z * 0.5 + 9) - 0.5) * 2.4;
      if (edge < w.r + w.shore) c.lerp(cSand, smoothstep(w.r + w.shore * 0.7, w.r - w.shore * 0.4, edge));
    }
    // caminho de terra batida com borda irregular
    const dP = distToPath(x, z) - (vnoise(x * 0.4, z * 0.4) - 0.3) * 2.2;
    if (dP < 5) c.lerp(cDirt, smoothstep(5, 1.8, dP) * 0.88);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp }));
  ground.receiveShadow = true;
  scene.add(ground);
}

// ------------------------------------------------ water
// ---- água: shader com fresnel, ondulação e brilho do sol ----
const waterUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
  uSunColor: { value: new THREE.Color(0xfff0d0) },
  uNightF: { value: 0 },
  uSkyHorizon: { value: new THREE.Color(0x8fc4ec) }, // reflexo do céu (Fase 38)
  uSkyTop: { value: new THREE.Color(0x5a9fd8) },
};
const waterMats = [];
function makeWaterMaterial(deep, shallow, center = null, shoreR = 0) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      ...waterUniforms,
      uDeep: { value: new THREE.Color(deep) },
      uShallow: { value: new THREE.Color(shallow) },
      uCenter: { value: new THREE.Vector2(center ? center.x : 0, center ? center.z : 0) },
      uShoreR: { value: shoreR },
    },
    vertexShader: `
      varying vec3 vWorld; varying vec3 vNormalW;
      uniform float uTime;
      void main(){
        vec3 p = position;
        // ondas suaves cruzadas deslocam a altura
        p.y += sin(p.x*0.25 + uTime*1.3) * 0.12 + cos(p.z*0.3 - uTime*1.1) * 0.1;
        vec4 wp = modelMatrix * vec4(p,1.0);
        vWorld = wp.xyz;
        // normal aproximada das ondas
        float nx = cos(p.x*0.25 + uTime*1.3) * 0.25;
        float nz = -sin(p.z*0.3 - uTime*1.1) * 0.25;
        vNormalW = normalize(vec3(nx, 1.0, nz));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      varying vec3 vWorld; varying vec3 vNormalW;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSunDir; uniform vec3 uSunColor;
      uniform vec3 uSkyHorizon; uniform vec3 uSkyTop;
      uniform float uTime; uniform float uNightF; uniform vec2 uCenter; uniform float uShoreR;
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 N = normalize(vNormalW);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);      // reflexo raso nas bordas
        float shimmer = sin(vWorld.x*0.8 + uTime*2.0) * cos(vWorld.z*0.7 - uTime*1.7);
        vec3 col = mix(uDeep, uShallow, clamp(fres + shimmer*0.06, 0.0, 1.0));
        // caustics: luz ondulante em camadas (sutil, some à noite)
        float caust = sin(vWorld.x*1.3 + uTime*1.5) * sin(vWorld.z*1.1 - uTime*1.2)
                    + sin((vWorld.x+vWorld.z)*0.9 + uTime*2.1);
        col += uShallow * max(caust, 0.0) * 0.05 * (1.0 - uNightF);
        // brilho especular do sol
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(N, H), 0.0), 60.0);
        col += uSunColor * spec * (1.0 - uNightF) * 0.9;
        // reflexo do ambiente (Fase 38): reflete o gradiente do céu + disco do sol, pesado
        // pelo fresnel (mais reflexo nas bordas), como a água real reage ao céu à volta
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uSkyHorizon, uSkyTop, clamp(R.y, 0.0, 1.0));
        float sunRefl = pow(max(dot(R, uSunDir), 0.0), 220.0);
        sky += uSunColor * sunRefl * (1.0 - uNightF) * 1.5;
        col = mix(col, sky, clamp(fres * 0.9 + 0.12, 0.0, 0.85));
        // espuma: cristas animadas por todo o espelho
        float crest = sin(vWorld.x*0.6 - uTime*0.9) * sin(vWorld.z*0.55 + uTime*0.7);
        float foam = smoothstep(0.85, 0.99, crest);
        // espuma na margem radial (lago): anel perto do raio da praia, ondulado
        if (uShoreR > 0.0) {
          float d = distance(vWorld.xz, uCenter);
          float band = smoothstep(uShoreR, uShoreR-1.3, d) * smoothstep(uShoreR-4.0, uShoreR-2.2, d);
          float wob = 0.55 + 0.45*sin(atan(vWorld.z-uCenter.y, vWorld.x-uCenter.x)*22.0 + uTime*2.0);
          foam = max(foam, band * wob);
        }
        col = mix(col, vec3(0.92,0.96,1.0), foam * (1.0 - uNightF*0.55));
        col = mix(col, col*0.35, uNightF);                     // escurece à noite
        float alpha = max(mix(0.78, 0.95, fres), foam*0.7);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  waterMats.push(m);
  return m;
}

function buildWater() {
  waterGeo = new THREE.PlaneGeometry((LAKE.r + 6) * 2, (LAKE.r + 6) * 2, 24, 24);
  waterGeo.rotateX(-Math.PI / 2);
  water = new THREE.Mesh(waterGeo, makeWaterMaterial(0x1a4a6a, 0x6ab0d0, LAKE, LAKE.r + 1.5));
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
  // oceano da costa leste — plano grande e calmo (as ondas ficam por conta do specular)
  const seaGeo = new THREE.PlaneGeometry((SEA.r + 60) * 2, (SEA.r + 60) * 2, 48, 48);
  seaGeo.rotateX(-Math.PI / 2);
  seaWater = new THREE.Mesh(seaGeo, makeWaterMaterial(0x123a5a, 0x4a9ac0));
  seaWater.position.set(SEA.x, SEA.waterY, SEA.z);
  scene.add(seaWater);
  MAP_FEATURES.push({ x: 288, z: 0, color: '#2e6a8e', r: 26 });
}

// ------------------------------------------------ sky objects
let skyDome;
const skyTopCol = new THREE.Color(0x3a78c8), skyBotCol = new THREE.Color(0xbfe0f0);
function buildSkyObjects() {
  // domo de céu com gradiente (zênite → horizonte) — segue a câmera, atrás de tudo
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { topColor: { value: new THREE.Color(0x3a78c8) }, botColor: { value: new THREE.Color(0xbfe0f0) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color(0xffe6b0) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 topColor; uniform vec3 botColor; uniform vec3 sunDir; uniform vec3 sunColor;
      void main(){
        float h = clamp(vDir.y*1.15+0.15, 0.0, 1.0);
        vec3 col = mix(botColor, topColor, pow(h, 0.7));
        float sd = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * pow(sd, 16.0) * 0.35;         // brilho concentrado perto do sol
        col += sunColor * pow(max(1.0-vDir.y,0.0),3.0) * pow(sd,3.0) * 0.14; // glow suave no horizonte
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  skyDome = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), domeMat);
  skyDome.renderOrder = -1;
  scene.add(skyDome);

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

  // céu povoado: mais nuvens, tamanhos/alturas variados, base levemente sombreada (volume)
  for (let i = 0; i < 20; i++) {
    const cl = new THREE.Group();
    const n = 4 + Math.floor(rnd(i, 60) * 4);
    const op = 0.62 + rnd(i, 67) * 0.28;
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: op, depthWrite: false });
    for (let j = 0; j < n; j++) {
      const R = 6 + rnd(i, j + 61) * 8;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(R, 8, 6), cloudMat);
      puff.position.set(j * 9 - n * 4.5 + (rnd(i, j + 68) - 0.5) * 4, rnd(i, j + 62) * 4, rnd(i, j + 63) * 8 - 4);
      puff.scale.y = 0.42;
      cl.add(puff);
    }
    const scl = 0.7 + rnd(i, 69) * 1.1;
    cl.scale.setScalar(scl);
    cl.position.set((rnd(i, 64) - 0.5) * 620, 88 + rnd(i, 65) * 46, (rnd(i, 66) - 0.5) * 620);
    clouds.push(cl);
    scene.add(cl);
  }
}

// ------------------------------------------------ vegetation
// registra uma árvore para o dressWorld() colocar como GLB (fallback: addTreeProcedural)
function addTree(x, z, s, kind) {
  if (terrainHeight(x, z) < LAKE.waterY + 0.4) return;
  plantings.push({ x, z, s, kind });
}

function addTreeProcedural(x, z, s, kind) {
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
  // balança ao vento a partir da base (copas maiores inclinam mais)
  swayTrees.push({ group: g, phase: rnd(x + 3, z + 7) * Math.PI * 2, amp: (kind === 'pine' ? 0.02 : 0.035) / Math.max(0.6, s) });
}

function placeRockProcedural(x, z, s) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), lambert(0x7d7d7d));
  rock.position.set(x, terrainHeight(x, z) + s * 0.3, z);
  rock.rotation.set(rnd(x, 5) * 3, rnd(z, 6) * 3, 0);
  rock.castShadow = true;
  scene.add(rock);
  colliders.push({ x, z, r: s * 0.85 });
}

function buildVegetation() {
  for (let i = 0; i < 175; i++) {
    const a = rnd(i, 1) * Math.PI * 2;
    const r = 24 + rnd(i, 2) * 275;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (distToPath(x, z) < 4) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 8) continue;
    if (Math.hypot(x - PORT.x, z - PORT.z) < 26) continue; // porto limpo
    if (z > 60 && x < 20 && x > -50) continue; // dark forest area handled separately
    const bi = dominantBiome(x, z);
    if (bi && bi.wet < 0.3 && rnd(i, 5) > 0.45) continue; // regiões secas: mata rala
    let kind = rnd(i, 4) > 0.6 ? 'pine' : 'oak';
    if (bi) kind = bi.trees === 'apple' ? 'apple'
                 : bi.trees === 'dead' ? (rnd(i, 4) > 0.5 ? 'dead' : 'pine')
                 : (rnd(i, 4) > 0.25 ? 'pine' : 'oak'); // floresta/costa → mais pinheiros
    addTree(x, z, 0.8 + rnd(i, 3) * 0.8, kind);
  }
  // rocks — registra para o dressWorld() (GLB) com fallback procedural
  for (let i = 0; i < 42; i++) {
    const a = rnd(i + 100, 1) * Math.PI * 2;
    const r = 16 + rnd(i + 100, 2) * 290;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = 0.5 + rnd(i + 100, 3) * 1.5;
    if (terrainHeight(x, z) < SEA.waterY + 0.2) continue; // nada de pedra flutuando no mar
    if (Math.hypot(x - PORT.x, z - PORT.z) < 24) continue;
    rockPlacements.push({ x, z, s });
  }
  // vegetação de chão dispersa (arbustos, samambaias, flores, cogumelos, tocos)
  const SCATTER_KINDS = ['bush', 'bush', 'fern', 'fern', 'fern', 'flower', 'flower', 'mushroom', 'stump'];
  for (let i = 0; i < 520; i++) {
    const a = rnd(i + 700, 40) * Math.PI * 2;
    const r = 8 + rnd(i + 700, 41) * 290;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = terrainHeight(x, z);
    if (y < LAKE.waterY + 0.4 || y > 9) continue;
    if (distToPath(x, z) < 2.4) continue;
    if (Math.hypot(x - PORT.x, z - PORT.z) < 22) continue;
    let inWater = false;
    for (const w of WATERS) if (Math.hypot(x - w.x, z - w.z) < w.r + w.shore) inWater = true;
    if (inWater) continue;
    let kind = SCATTER_KINDS[Math.floor(rnd(i + 700, 42) * SCATTER_KINDS.length)];
    const bi = dominantBiome(x, z);
    if (bi) {
      if (bi.wet > 0.7) kind = rnd(i + 700, 43) > 0.45 ? 'fern' : 'mushroom';   // úmido: samambaias e cogumelos
      else if (bi.wet < 0.25) kind = rnd(i + 700, 43) > 0.6 ? 'stump' : 'bush'; // seco: tocos e arbustos ralos
    }
    scatterPlacements.push({ x, z, kind });
  }
  // instanced grass tufts
  {
    const blade = new THREE.ConeGeometry(0.16, 0.6, 4);
    blade.translate(0, 0.28, 0);
    const grassMat = windMaterial(0x79ab4e, 0.22);
    const CAP = 2600;
    const inst = new THREE.InstancedMesh(blade, grassMat, CAP);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const gc1 = new THREE.Color(0x79ab4e), gc2 = new THREE.Color(0x5f8a3a), gcol = new THREE.Color();
    let n = 0;
    for (let i = 0; i < 5200 && n < CAP; i++) {
      const a = rnd(i, 20) * Math.PI * 2;
      const r = 6 + rnd(i, 21) * 250;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = terrainHeight(x, z);
      if (y < LAKE.waterY + 0.4 || y > 8 || distToPath(x, z) < 2.2) continue;
      let inWater = false;
      for (const w of WATERS) if (Math.hypot(x - w.x, z - w.z) < w.r + w.shore) inWater = true;
      if (inWater) continue;
      p.set(x, y, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd(i, 22) * Math.PI);
      sc.setScalar(0.7 + rnd(i, 23) * 0.9);
      m4.compose(p, q, sc);
      inst.setMatrixAt(n, m4);
      gcol.lerpColors(gc1, gc2, rnd(i, 24));
      inst.setColorAt(n, gcol);
      n++;
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
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

// ------------------------------------------------ micro-detalhe de chão (Fase 28)
// Detritos 3D (folhas/galhos/pedrinhas) + decals pintados (pegadas, rachaduras, folhagem)
// que recompensam o olhar de perto. Tudo estático/instanciado — custo de frame ~zero.
// Texturas geradas em canvas (sem CSP). Decals hugueiam o terreno em áreas planas e secas.
function decalTex(draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  // alphaMap lê a LUMINÂNCIA (canal verde): fundo preto = transparente, branco = opaco.
  // Fundo preto opaco (não transparente) para que bordas cinza virem alpha suave de verdade.
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  draw(g);
  const t = new THREE.CanvasTexture(cv);
  t.needsUpdate = true;
  return t;
}
const footTex = () => decalTex((g) => {
  g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 6;
  g.beginPath(); g.ellipse(64, 78, 18, 30, 0, 0, Math.PI * 2); g.fill();   // sola/calcanhar
  g.beginPath(); g.ellipse(64, 40, 15, 15, 0, 0, Math.PI * 2); g.fill();   // planta/dedos
  for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(48 + i * 10, 26, 3.5, 4.5, 0, 0, Math.PI * 2); g.fill(); }
});
const crackTex = () => decalTex((g) => {
  g.strokeStyle = '#fff'; g.lineCap = 'round'; g.shadowColor = '#fff'; g.shadowBlur = 2;
  const cx = 64, cy = 64;
  for (let b = 0; b < 5; b++) {
    let a = (b / 5) * Math.PI * 2 + 0.4, x = cx, y = cy;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 1; s <= 5; s++) {
      a += Math.sin(b * 1.7 + s) * 0.5;
      x += Math.cos(a) * 11; y += Math.sin(a) * 11;
      g.lineWidth = Math.max(0.8, 3.4 - s * 0.5); g.lineTo(x, y);
    }
    g.stroke();
  }
});
const litterTex = () => decalTex((g) => {
  const rg = g.createRadialGradient(64, 64, 4, 64, 64, 60);
  rg.addColorStop(0, 'rgba(255,255,255,.85)'); rg.addColorStop(0.55, 'rgba(255,255,255,.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {   // salpicos (folhinhas caídas)
    const a = i * 2.39982, rr = 8 + (i * 6.7 % 50);
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.beginPath(); g.arc(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr, 2 + (i % 3), 0, 7); g.fill();
  }
});

function buildGroundDetail() {
  const Y = new THREE.Vector3(0, 1, 0);
  const slopeAt = (x, z) => { const h = terrainHeight(x, z), D = 2.0; return Math.hypot(terrainHeight(x + D, z) - h, terrainHeight(x, z + D) - h) / D; };
  const inWater = (x, z) => { for (const w of WATERS) if (Math.hypot(x - w.x, z - w.z) < w.r + w.shore) return true; return false; };
  const okGround = (x, z) => { const h = terrainHeight(x, z); return h > LAKE.waterY + 0.3 && h < 9 && !inWater(x, z) && slopeAt(x, z) < 0.3; };

  // ---- decals pintados (quads planos com alphaMap, assentados no terreno) ----
  const decalGeo = new THREE.PlaneGeometry(1, 1); decalGeo.rotateX(-Math.PI / 2);
  const decalMat = (tex, color, op) => new THREE.MeshToonMaterial({
    color, gradientMap: toonRamp, alphaMap: tex, transparent: true, opacity: op,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const layDecals = (tex, color, op, places) => {
    if (!places.length) return;
    const inst = new THREE.InstancedMesh(decalGeo, decalMat(tex, color, op), places.length);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    places.forEach((pl, i) => {
      p.set(pl.x, terrainHeight(pl.x, pl.z) + 0.04, pl.z);
      q.setFromAxisAngle(Y, pl.yaw); sc.set(pl.w, 1, pl.d);
      inst.setMatrixAt(i, m.compose(p, q, sc));
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 1;
    scene.add(inst);
  };

  // pegadas: pequenas trilhas de 3 passos alternados ao longo dos caminhos de terra
  const feet = [];
  for (let i = 0; i < 500 && feet.length < 180; i++) {
    const a = rnd(i + 2000, 1) * Math.PI * 2, r = 6 + rnd(i + 2000, 2) * 250;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (distToPath(x, z) > 2.2 || !okGround(x, z)) continue;
    const head = rnd(i + 2000, 3) * Math.PI * 2, dx = Math.cos(head), dz = Math.sin(head);
    for (let s = 0; s < 3; s++) {
      const off = s % 2 ? 0.22 : -0.22;
      const fx = x + dx * s * 0.82 - dz * off, fz = z + dz * s * 0.82 + dx * off;
      if (!okGround(fx, fz)) break;
      feet.push({ x: fx, z: fz, yaw: head, w: 0.3, d: 0.5 });
    }
  }
  layDecals(footTex(), 0x3a2c1b, 0.5, feet);

  // rachaduras: em manchas de terra seca e no terreno rochoso/inclinado
  const cracks = [];
  for (let i = 0; i < 700 && cracks.length < 110; i++) {
    const a = rnd(i + 3000, 1) * Math.PI * 2, r = 8 + rnd(i + 3000, 2) * 275;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!okGround(x, z) || distToPath(x, z) < 1.6) continue;
    if (vnoise(x * 0.045 + 13, z * 0.045 + 7) < 0.7 && slopeAt(x, z) < 0.16) continue;
    cracks.push({ x, z, yaw: rnd(i + 3000, 3) * Math.PI * 2, w: 0.8 + rnd(i + 3000, 4) * 1.2, d: 0.8 + rnd(i + 3000, 5) * 1.2 });
  }
  layDecals(crackTex(), 0x2a2118, 0.55, cracks);

  // folhagem caída: manchas macias sob as árvores
  const litter = [];
  for (const t of plantings) {
    if (litter.length >= 260) break;
    const n = t.kind === 'pine' ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const ang = rnd(t.x + k, t.z) * Math.PI * 2, rr = (0.5 + rnd(t.x, t.z + k) * 2.0) * (0.8 + t.s);
      const x = t.x + Math.cos(ang) * rr, z = t.z + Math.sin(ang) * rr;
      if (!okGround(x, z)) continue;
      litter.push({ x, z, yaw: rnd(x, z) * Math.PI * 2, w: 1.0 + rnd(x + 1, z) * 1.5, d: 1.0 + rnd(x, z + 1) * 1.5 });
    }
  }
  // cor terrosa quente (casa com o dourado Fable, não o teal frio dos props)
  layDecals(litterTex(), 0x8a5a2c, 0.5, litter);

  // ---- detritos 3D instanciados (folhas, galhos, pedrinhas) ----
  const e = new THREE.Euler(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const layDebris = (geo, mat, items) => {
    if (!items.length) return;
    const inst = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      p.set(it.x, terrainHeight(it.x, it.z) + it.lift, it.z);
      e.set(it.rx, it.ry, it.rz); q.setFromEuler(e); sc.setScalar(it.s);
      inst.setMatrixAt(i, m.compose(p, q, sc));
      if (it.c != null) inst.setColorAt(i, col.set(it.c));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    scene.add(inst);
  };

  // pedrinhas — espalhadas, mais densas junto a caminhos e manchas de terra
  const pebbles = [];
  const PEB_C = [0x8d8d8d, 0x7a756c, 0x9a9188, 0x6b675f];
  for (let i = 0; i < 1100 && pebbles.length < 560; i++) {
    const a = rnd(i + 4000, 1) * Math.PI * 2, r = 6 + rnd(i + 4000, 2) * 275;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!okGround(x, z)) continue;
    const near = distToPath(x, z) < 3 || vnoise(x * 0.045 + 13, z * 0.045 + 7) > 0.66 || slopeAt(x, z) > 0.16;
    if (!near && rnd(i + 4000, 6) > 0.35) continue;
    pebbles.push({ x, z, lift: 0.02, s: 0.05 + rnd(i + 4000, 3) * 0.11, rx: rnd(i + 4000, 4) * 3, ry: rnd(i + 4000, 5) * 6, rz: rnd(i + 4000, 7) * 3, c: PEB_C[Math.floor(rnd(i + 4000, 8) * PEB_C.length) % PEB_C.length] });
  }
  layDebris(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshToonMaterial({ gradientMap: toonRamp }), pebbles);

  // galhos — cilindros finos deitados, tom de madeira
  const twigs = [];
  for (let i = 0; i < 700 && twigs.length < 300; i++) {
    const a = rnd(i + 5000, 1) * Math.PI * 2, r = 8 + rnd(i + 5000, 2) * 265;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!okGround(x, z)) continue;
    const near = distToPath(x, z) < 4 || rnd(i + 5000, 6) > 0.55;
    if (!near) continue;
    twigs.push({ x, z, lift: 0.03, s: 0.7 + rnd(i + 5000, 3) * 0.9, rx: Math.PI / 2 + (rnd(i + 5000, 4) - 0.5) * 0.3, ry: rnd(i + 5000, 5) * 6, rz: 0, c: rnd(i + 5000, 7) > 0.5 ? 0x5a4028 : 0x6b4f30 });
  }
  const twigGeo = new THREE.CylinderGeometry(0.018, 0.024, 0.32, 4); // eixo Y; rx=PI/2 deita no chão
  layDebris(twigGeo, new THREE.MeshToonMaterial({ gradientMap: toonRamp }), twigs);

  // folhas — quadradinhos quase planos, tons de outono, aglomerados sob as árvores
  const leaves = [];
  const LEAF_C = [0xb5762c, 0xc98a2e, 0x8a9a3a, 0xa85a2a, 0xd0a840];
  for (const t of plantings) {
    if (leaves.length >= 900) break;
    if (t.kind === 'pine') continue;
    const n = 5 + Math.floor(rnd(t.x, t.z) * 5);
    for (let k = 0; k < n; k++) {
      const ang = rnd(t.x + k * 1.3, t.z) * Math.PI * 2, rr = rnd(t.x, t.z + k * 1.7) * 2.6 * (0.8 + t.s);
      const x = t.x + Math.cos(ang) * rr, z = t.z + Math.sin(ang) * rr;
      if (!okGround(x, z)) continue;
      leaves.push({ x, z, lift: 0.025, s: 0.8 + rnd(x, z + k) * 0.7, rx: -Math.PI / 2 + (rnd(x + k, z) - 0.5) * 0.4, ry: rnd(x, z + 1) * 6, rz: (rnd(x + 2, z) - 0.5) * 0.4, c: LEAF_C[Math.floor(rnd(x + k, z + k) * LEAF_C.length) % LEAF_C.length] });
    }
  }
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.11); // XY vertical; rx≈-PI/2 deita no chão
  layDebris(leafGeo, new THREE.MeshToonMaterial({ gradientMap: toonRamp, side: THREE.DoubleSide }), leaves);
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
  // fagulhas subindo (Fase 45): pontos aditivos que sobem da chama e reciclam
  const nE = big ? 16 : 10, epts = [], ephase = [];
  for (let i = 0; i < nE; i++) { epts.push(0, 0.6, 0); ephase.push(Math.random()); }
  const egeo = new THREE.BufferGeometry();
  egeo.setAttribute('position', new THREE.Float32BufferAttribute(epts, 3));
  const embers = new THREE.Points(egeo, new THREE.PointsMaterial({ color: 0xffb24a, size: 0.12, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(embers);
  g.position.set(x, y + 0.15, z);
  scene.add(g);
  flames.push({ flame, inner, light, embers, ephase, big });
  colliders.push({ x, z, r: 0.7 });
}

function buildVillage() {
  const spots = [
    [-14, -4, 0.5], [13, -10, -0.6], [-10, 12, 2.5], [15, 8, -2.2],
  ];
  for (let i = 0; i < spots.length; i++) {
    const [x, z, rot] = spots[i];
    const w = 4.5 + rnd(i, 70) * 1.5, d = 4 + rnd(i, 71) * 1.5;
    housePlacements.push({ x, z, w, d, rot });   // visual em dressWorld() (GLB, com fallback)
    MAP_FEATURES.push({ x, z, color: '#8a6d4a', r: 4 });
    colliders.push({ x, z, r: Math.max(w, d) * 0.72 });
  }
  // mobília urbana (Fase 16): barris, caixas, carroça, lanternas, baú na praça
  decor(3.4, 2.6, SURV + 'barrel.glb', 0.95, 0.4);
  decor(4.1, 3.1, SURV + 'barrel.glb', 0.95, 0.4);
  decor(2.9, 3.4, SURV + 'barrel-open.glb', 0.95, 0.4);
  decor(-4.2, 4.2, SURV + 'box.glb', 0.8, 0.4);
  decor(-4.8, 3.5, SURV + 'box-large.glb', 1.0, 0.5);
  decor(-3.7, 4.8, SURV + 'box-open.glb', 0.8, 0.4);
  decor(6.5, -3, TOWN + 'cart.glb', 1.3, 0.7);
  decor(-7.5, 6.5, TOWN + 'cart-high.glb', 1.4, 0.7);
  decor(-6.5, -6.5, TOWN + 'lantern.glb', 1.7, 0.2);
  decor(7.5, 7, TOWN + 'lantern.glb', 1.7, 0.2);
  decor(5, -5.5, SURV + 'chest.glb', 0.7, 0.4);
  // marco: moinho na borda da vila + placas de sinalização (Fase 20)
  decor(24, -6, TOWN + 'windmill.glb', 7.5, 1.4);
  decor(2.5, 13, NAT + 'sign.glb', 1.3, 0.2);
  decor(218, 43, NAT + 'sign.glb', 1.3, 0.2);
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
  // Forja (bigorna + fornalha brilhante)
  {
    const g = new THREE.Group();
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.8, 8), lambert(0x4a3520));
    stump.position.y = 0.4;
    const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.4), lambert(0x3a3a42));
    anvil.position.y = 0.95;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 6), lambert(0x3a3a42));
    horn.rotation.z = -Math.PI / 2; horn.position.set(0.6, 0.95, 0);
    const forge = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), lambert(0x55504a));
    forge.position.set(-1.4, 0.5, 0);
    const coals = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.8), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
    coals.position.set(-1.4, 1.05, 0);
    const forgeLight = new THREE.PointLight(0xff7a2a, 1.6, 8);
    forgeLight.position.set(-1.4, 1.4, 0);
    g.add(stump, anvil, horn, forge, coals, forgeLight);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.position.set(FORGE.x, terrainHeight(FORGE.x, FORGE.z), FORGE.z);
    scene.add(g);
    colliders.push({ x: FORGE.x, z: FORGE.z, r: 1.2 });
    colliders.push({ x: FORGE.x - 1.4, z: FORGE.z, r: 0.9 });
    flames.push({ flame: coals, inner: coals, light: forgeLight }); // reaproveita o pulsar
  }
  // Caldeirão de alquimia
  {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 0.7, 12), lambert(0x2a2a30));
    pot.position.y = 0.55;
    const brew = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12), new THREE.MeshBasicMaterial({ color: 0x7fe07a }));
    brew.position.y = 0.88;
    const brewLight = new THREE.PointLight(0x7fe07a, 0.8, 5);
    brewLight.position.y = 1.1;
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 5), lambert(0x1a1a20));
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.4, 0.2, Math.sin(a) * 0.4);
      g.add(leg);
    }
    g.add(pot, brew, brewLight);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.position.set(CAULDRON.x, terrainHeight(CAULDRON.x, CAULDRON.z), CAULDRON.z);
    scene.add(g);
    colliders.push({ x: CAULDRON.x, z: CAULDRON.z, r: 0.7 });
  }
  // placa "À Venda" na cabana comprável (15,8)
  {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 5), lambert(0x5a4530));
    post.position.y = 0.7;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.06), lambert(0xd8c89a));
    board.position.y = 1.2;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 80;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#3a2a12'; ctx.font = 'bold 22px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('À VENDA', 64, 34); ctx.font = '16px Georgia'; ctx.fillText('500 🪙', 64, 60);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
    sign.position.set(0, 1.2, 0.04);
    g.add(post, board, sign);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.position.set(15, terrainHeight(15, 11.8), 11.8);
    g.userData.forSaleSign = true; // o jogo esconde quando a casa é comprada
    scene.add(g);
    forSaleSign = g;
  }
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

// ------------------------------------------------ Porto Bruma (segunda cidade, na costa)
function buildPort() {
  // casinhas de pescador
  const spots = [
    [214, 30, 0.8], [228, 26, -0.4], [212, 50, 2.2],
  ];
  for (let i = 0; i < spots.length; i++) {
    const [x, z, rot] = spots[i];
    const w = 4 + rnd(i, 300) * 1.2, d = 3.6 + rnd(i, 301) * 1.2;
    housePlacements.push({ x, z, w, d, rot });  // GLB em dressWorld() (fallback procedural)
    colliders.push({ x, z, r: Math.max(w, d) * 0.72 });
  }
  MAP_FEATURES.push({ x: PORT.x, z: PORT.z, color: '#8a6d4a', r: 6 });

  // mobília do porto (Fase 17): caixas, barris, baús em terra perto das casas de pescador
  decor(216, 32, SURV + 'barrel.glb', 0.95, 0.4);
  decor(217, 31, SURV + 'barrel.glb', 0.95, 0.4);
  decor(215.5, 34, SURV + 'box-large.glb', 1.0, 0.5);
  decor(226, 28, SURV + 'box.glb', 0.8, 0.4);
  decor(230, 24.5, SURV + 'barrel-open.glb', 0.95, 0.4);
  decor(214, 48, SURV + 'box-open.glb', 0.8, 0.4);
  decor(210.5, 52, SURV + 'chest.glb', 0.7, 0.4);
  decor(228, 30, SURV + 'bucket.glb', 0.5, 0);

  // píer de madeira avançando sobre o mar
  const plankMat = lambert(0x6b4a2a);
  const postMat = lambert(0x4a3520);
  for (let i = 0; i < 7; i++) {
    const px = 238 + i * 2.6;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.18, 3.2), plankMat);
    deck.position.set(px, SEA.waterY + 0.9, 40);
    deck.castShadow = true;
    scene.add(deck);
    for (const sz of [-1.3, 1.3]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.4, 6), postMat);
      post.position.set(px + 1.1, SEA.waterY - 0.6, 40 + sz);
      scene.add(post);
    }
  }
  // barcos de pesca atracados
  for (let i = 0; i < 2; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), lambert(i ? 0x7a4a30 : 0x5a6a7a));
    hull.scale.set(1.5, 0.55, 0.8);
    hull.position.y = 0.1;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.09, 6, 16), lambert(0x4a3520));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.55;
    rim.scale.set(1.4, 0.75, 1);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 6), postMat);
    mast.position.y = 1.8;
    boat.add(hull, rim, mast);
    boat.position.set(250 + i * 6, SEA.waterY + 0.15, 33 + i * 12);
    boat.rotation.y = rnd(i, 310) * 2;
    scene.add(boat);
    boats.push(boat);
  }
  // farol na ponta rochosa
  {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 2, 10), lambert(0x8a8478));
    base.position.y = 1;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 10, 10), lambert(0xe8e0d0));
    tower.position.y = 7;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.45, 1.6, 10), lambert(0xa03028));
    band.position.y = 6;
    const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 8),
      new THREE.MeshLambertMaterial({ color: 0x3a3020, emissive: 0xffd24a, emissiveIntensity: 0.4 }));
    lampRoom.position.y = 12.7;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1, 8), lambert(0x8a1c1c));
    roof.position.y = 13.9;
    g.add(base, tower, band, lampRoom, roof);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const y = terrainHeight(240, 62);
    g.position.set(240, y, 62);
    scene.add(g);
    colliders.push({ x: 240, z: 62, r: 2.6 });
    // facho giratório
    lightBeam = new THREE.SpotLight(0xfff2c0, 0, 260, 0.22, 0.5);
    lightBeam.position.set(240, y + 12.7, 62);
    lightBeamTarget = new THREE.Object3D();
    scene.add(lightBeam, lightBeamTarget);
    lightBeam.target = lightBeamTarget;
  }
  // banca da mercadora + postes
  {
    const g = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 1.0), lambert(0x6b4a2a));
    counter.position.y = 0.5;
    const awning = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 1.6), lambert(0x2e5a8e));
    awning.position.y = 2.3;
    awning.rotation.x = 0.12;
    for (const [px, pz] of [[-1.1, -0.4], [1.1, -0.4], [-1.1, 0.4], [1.1, 0.4]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), lambert(0x4a3520));
      post.position.set(px, 1.15, pz);
      g.add(post);
    }
    g.add(counter, awning);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.position.set(221, terrainHeight(221, 46), 46);
    g.rotation.y = 0.6;
    scene.add(g);
    colliders.push({ x: 221, z: 46, r: 1.8 });
  }
  addLamp(218, 36); addLamp(230, 44);
  addCampfire(224, 34);
  // caixotes e redes na praia dos caranguejos
  for (let i = 0; i < 3; i++) {
    const x = CRAB_BEACH.x - 6 + i * 5, z = CRAB_BEACH.z - 4 + (i % 2) * 6;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), lambert(0x7a5c34));
    crate.position.set(x, terrainHeight(x, z) + 0.45, z);
    crate.rotation.y = rnd(i, 320) * 1.5;
    crate.castShadow = true;
    scene.add(crate);
    colliders.push({ x, z, r: 0.75 });
  }
}

// ------------------------------------------------ Portais Cullis (viagem rápida)
function buildGates() {
  for (const gpos of GATES) {
    const y = terrainHeight(gpos.x, gpos.z);
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.34, 8, 22), lambert(0x8a8478));
    ring.position.y = 2.0;
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24),
      new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    glow.position.y = 2.0;
    const light = new THREE.PointLight(0x7fe8ff, 1.2, 10);
    light.position.y = 2.2;
    for (const sx of [-1, 1]) {
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), lambert(0x77706a));
      stone.position.set(sx * 1.9, 0.35, 0.3);
      g.add(stone);
    }
    g.add(ring, glow, light);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.position.set(gpos.x, y, gpos.z);
    g.rotation.y = rnd(gpos.x, gpos.z) * Math.PI;
    scene.add(g);
    gateGlows.push(glow);
    colliders.push({ x: gpos.x, z: gpos.z, r: 1.0 });
    MAP_FEATURES.push({ x: gpos.x, z: gpos.z, color: '#7fe8ff', r: 2 });
  }
}

// ------------------------------------------------ Caverna dos Hobbes (dungeon)
const caveTorches = [];
function buildCave() {
  const { x: cx, z: cz } = CAVE;
  const rockMat = lambert(0x4a4640);
  const rockMat2 = lambert(0x3a3630);
  const R = 20; // raio da câmara

  // parede rochosa em anel de rochas GLB (Fase 19), com um vão ao sul p/ o corredor
  const y0 = terrainHeight(cx, cz);
  const CAVE_ROCKS = ['rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD', 'rock_largeE', 'rock_largeF', 'rock_tallA', 'rock_tallD', 'rock_tallH'];
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    if (a > 1.2 && a < 1.95) continue;
    const wx = cx + Math.cos(a) * R, wz = cz + Math.sin(a) * R;
    const s = 3.2 + rnd(i, 400) * 2.2;
    decor(wx, wz, NAT + CAVE_ROCKS[i % CAVE_ROCKS.length] + '.glb', s * 1.4, s * 0.8); // rocha GLB
    colliders.push({ x: wx, z: wz, r: s * 0.8 });
  }
  // pedregulhos e potes espalhados no piso (detritos)
  for (let i = 0; i < 6; i++) {
    const a = rnd(i, 410) * Math.PI * 2, r = rnd(i, 411) * (R - 6);
    const dx = cx + Math.cos(a) * r, dz = cz + Math.sin(a) * r;
    decor(dx, dz, NAT + (i % 2 ? 'rock_smallA' : 'pot_large') + '.glb', 0.6 + rnd(i, 412) * 0.5, 0.4);
  }
  // interior escondido no mundo aberto (só visível dentro da caverna) — o domo/piso/tochas
  // apareciam como um "domo preto" à distância. As rochas-parede (via decor) ficam de fora
  // do grupo → seguem visíveis como um afloramento natural que marca a entrada.
  caveInterior = new THREE.Group();
  caveInterior.visible = false;
  scene.add(caveInterior);
  // teto de rocha (domo achatado) — bloqueia o céu → penumbra + sombra
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R + 2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), rockMat2);
  dome.scale.y = 0.55;
  dome.material = new THREE.MeshLambertMaterial({ color: 0x2a2620, side: THREE.BackSide });
  dome.position.set(cx, y0 + 1, cz);
  dome.castShadow = true;
  caveInterior.add(dome);
  // piso escuro
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 28), lambert(0x2e2a24));
  floor.rotateX(-Math.PI / 2);
  floor.position.set(cx, y0 + 0.05, cz);
  floor.receiveShadow = true;
  caveInterior.add(floor);
  // estalagmites
  for (let i = 0; i < 14; i++) {
    const a = rnd(i, 410) * Math.PI * 2, r = rnd(i, 411) * (R - 3);
    const sx = cx + Math.cos(a) * r, sz = cz + Math.sin(a) * r;
    if (Math.hypot(sx - cx, sz - (cz - 13)) < 3) continue; // deixa o baú livre
    const h = 1 + rnd(i, 412) * 2.5;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.35 + rnd(i, 413) * 0.3, h, 6), rockMat);
    spike.position.set(sx, y0 + h / 2, sz);
    spike.castShadow = true;
    caveInterior.add(spike);
    if (h > 2) colliders.push({ x: sx, z: sz, r: 0.4 });
  }
  // tochas nas paredes
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const tx = cx + Math.cos(a) * (R - 2), tz = cz + Math.sin(a) * (R - 2);
    const ty = terrainHeight(tx, tz);
    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 5), lambert(0x2a2118));
    bracket.position.set(tx, ty + 1.4, tz);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), new THREE.MeshBasicMaterial({ color: 0xff9a3a }));
    flame.position.set(tx, ty + 2.1, tz);
    const light = new THREE.PointLight(0xffa040, 2.2, 16);
    light.position.set(tx, ty + 2.2, tz);
    caveInterior.add(bracket, flame, light);
    caveTorches.push({ flame, light });
  }
  // baú trancado (tesouro) — precisa da Chave de Prata
  {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 1.0), lambert(0x6b4a2a));
    base.position.y = 0.42;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.0), lambert(0x7a5634));
    lid.position.y = 0.95;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.14, 1.06), lambert(0xd8d8e0));
    trim.position.y = 0.72;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.14), lambert(0xe8e8f0));
    lock.position.set(0, 0.72, 0.53);
    const glow = new THREE.PointLight(0xd8e0ff, 1.0, 6);
    glow.position.set(0, 1.4, 0);
    g.add(base, lid, trim, lock, glow);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const ly = terrainHeight(lockedChest.x, lockedChest.z);
    g.position.set(lockedChest.x, ly, lockedChest.z);
    scene.add(g);
    lockedChest.group = g;
    lockedChest.lid = lid;
    colliders.push({ x: lockedChest.x, z: lockedChest.z, r: 0.9 });
  }
  MAP_FEATURES.push({ x: cx, z: cz, color: '#2a2620', r: 8 });
  // marco da boca da caverna no mundo aberto
  {
    const { entX, entZ } = CAVE;
    const g = new THREE.Group();
    const ey = terrainHeight(entX, entZ);
    for (const sx of [-1.6, 1.6]) {
      const pillar = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), rockMat);
      pillar.position.set(sx, 1.4, 0);
      g.add(pillar);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.2, 1.4), rockMat2);
    lintel.position.set(0, 2.9, 0);
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3), new THREE.MeshBasicMaterial({ color: 0x0a0806 }));
    dark.position.set(0, 1.5, 0.1);
    g.add(lintel, dark);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.position.set(entX, ey, entZ);
    g.rotation.y = Math.PI;
    scene.add(g);
    colliders.push({ x: entX - 1.6, z: entZ, r: 1.2 });
    colliders.push({ x: entX + 1.6, z: entZ, r: 1.2 });
    MAP_FEATURES.push({ x: entX, z: entZ, color: '#1a1610', r: 3 });
  }
}

// ------------------------------------------------ Pedras do Ritual (clímax do arco)
let ritualGlows = [];
function buildRitual() {
  const { x: cx, z: cz } = RITUAL;
  const y0 = terrainHeight(cx, cz);
  // círculo de menires — pedras verticais GLB (Fase 18), colocadas no dressWorld()
  const RITUAL_STONES = ['stone_tallA', 'stone_tallC', 'stone_tallE', 'stone_tallG', 'stone_tallI', 'statue_obelisk', 'statue_column', 'statue_columnDamaged'];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sx = cx + Math.cos(a) * 9, sz = cz + Math.sin(a) * 9;
    const sy = terrainHeight(sx, sz);
    const h = 3.5 + rnd(i, 500) * 1.5;
    decor(sx, sz, NAT + RITUAL_STONES[i] + '.glb', h, 0.9); // menir GLB (fallback: nada)
    colliders.push({ x: sx, z: sz, r: 0.9 });
    // runas brilhantes
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0x8a2aff, transparent: true, opacity: 0.7 }));
    rune.position.set(sx + Math.cos(a) * -0.5, sy + 1.8, sz + Math.sin(a) * -0.5);
    rune.lookAt(cx, sy + 1.8, cz);
    scene.add(rune);
    ritualGlows.push(rune);
  }
  // altar central com selo de energia
  const altar = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.8, 10), lambert(0x48434e));
  altar.position.set(cx, y0 + 0.4, cz);
  altar.castShadow = true;
  scene.add(altar);
  const seal = new THREE.Mesh(new THREE.CircleGeometry(2.0, 32), new THREE.MeshBasicMaterial({ color: 0x6a1aa0, transparent: true, opacity: 0.5 }));
  seal.rotateX(-Math.PI / 2);
  seal.position.set(cx, y0 + 0.82, cz);
  scene.add(seal);
  ritualGlows.push(seal);
  MAP_FEATURES.push({ x: cx, z: cz, color: '#8a2aff', r: 5 });
}

// ------------------------------------------------ recursos coletáveis (ervas + minério)
function buildGatherables() {
  const herbMat = lambert(0x4a8a3a), flowerMat = lambert(0x8adcff);
  const oreMat = lambert(0x6a6e78), crystalMat = new THREE.MeshBasicMaterial({ color: 0x7fd0ff });
  const makeHerb = () => {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.6, 4), herbMat);
      const a = (i / 5) * Math.PI * 2;
      blade.position.set(Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12);
      blade.rotation.z = (Math.random() - 0.5) * 0.4;
      g.add(blade);
    }
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), flowerMat);
    bud.position.y = 0.55;
    g.add(bud);
    return g;
  };
  const makeOre = () => {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), oreMat);
    rock.position.y = 0.3;
    g.add(rock);
    for (let i = 0; i < 3; i++) {
      const cr = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), crystalMat);
      cr.position.set((Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.2, (Math.random() - 0.5) * 0.5);
      cr.rotation.z = (Math.random() - 0.5);
      g.add(cr);
    }
    return g;
  };
  const spots = [];
  // ervas em campos e perto d'água; minério em regiões rochosas / caverna
  for (let i = 0; i < 22; i++) spots.push(['herb', i]);
  for (let i = 0; i < 14; i++) spots.push(['ore', i + 100]);
  for (const [kind, seed] of spots) {
    const a = rnd(seed, 1) * Math.PI * 2;
    const r = 20 + rnd(seed, 2) * (kind === 'ore' ? 280 : 200);
    let x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = terrainHeight(x, z);
    if (y < -1 || distToPath(x, z) < 3) continue;
    let inWater = false;
    for (const w of WATERS) if (Math.hypot(x - w.x, z - w.z) < w.r + w.shore) inWater = true;
    if (inWater) continue;
    const model = kind === 'herb' ? makeHerb() : makeOre();
    model.position.set(x, y, z);
    model.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(model);
    gatherables.push({ kind, x, z, model, cooldown: 0 });
  }
  // alguns nós de minério garantidos na caverna
  for (let i = 0; i < 3; i++) {
    const gx = CAVE.x - 8 + i * 8, gz = CAVE.z + 6;
    const model = makeOre();
    model.position.set(gx, terrainHeight(gx, gz), gz);
    model.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(model);
    gatherables.push({ kind: 'ore', x: gx, z: gz, model, cooldown: 0 });
  }
}

// estátua do herói na praça — consequência visível da vitória (final bondoso)
export function spawnHeroStatue(evil = false) {
  if (heroStatue.group) return;
  const g = new THREE.Group();
  const stone = evil ? 0x3a3240 : 0xd8d0c0;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 1.0, 8), lambert(0x8a8478));
  base.position.y = 0.5;
  const figBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 6, 12), lambert(stone));
  figBody.position.y = 1.7;
  const figHead = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), lambert(stone));
  figHead.position.y = 2.5;
  // espada erguida
  const sword = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.3, 0.04), lambert(stone));
  sword.position.set(0.5, 2.4, 0);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 8), lambert(stone));
  arm.position.set(0.4, 2.0, 0); arm.rotation.z = -0.7;
  g.add(base, figBody, figHead, sword, arm);
  if (!evil) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 20), new THREE.MeshBasicMaterial({ color: 0xffe07a }));
    halo.rotation.x = Math.PI / 2; halo.position.y = 2.95;
    g.add(halo);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.position.set(-6, terrainHeight(-6, -2), -2);
  scene.add(g);
  colliders.push({ x: -6, z: -2, r: 1.5 });
  heroStatue.group = g;
  MAP_FEATURES.push({ x: -6, z: -2, color: evil ? '#6a2a8a' : '#ffe07a', r: 2 });
}

// ------------------------------------------------ chuva
const FLASH = new THREE.Color(0xdce8ff); // cor do clarão do relâmpago
function buildRain() {
  const N = 1400;
  const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pts[i * 3] = (Math.random() - 0.5) * 70;
    pts[i * 3 + 1] = Math.random() * 26;
    pts[i * 3 + 2] = (Math.random() - 0.5) * 70;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  rain = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x9ab8d8, size: 0.14, transparent: true, opacity: 0, depthWrite: false,
  }));
  rain.visible = false;
  scene.add(rain);
}

// ------------------------------------------------ bandit camp
function buildBanditCamp() {
  const { x: cx, z: cz } = BANDIT_CAMP;
  // tendas GLB + fogueira central (Fase 20)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const x = cx + Math.cos(a) * 8, z = cz + Math.sin(a) * 8;
    decor(x, z, NAT + (i % 2 ? 'tent_detailedOpen' : 'tent_smallClosed') + '.glb', 2.6, 2.0);
  }
  decor(cx, cz - 2, NAT + 'campfire_stones.glb', 0.5, 0);
  for (let i = 0; i < 4; i++) {
    const x = cx + (rnd(i, 80) - 0.5) * 14, z = cz + (rnd(i, 81) - 0.5) * 14;
    decor(x, z, SURV + (i % 2 ? 'box.glb' : 'barrel.glb'), 0.85, 0.5);
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
let motes, windLeaves;
function buildAmbientLife() {
  // poeira/pólen dourado flutuando ao sol (partículas de atmosfera — magia de Fable)
  {
    const N = 240;
    const pts = [], seeds = [];
    for (let i = 0; i < N; i++) {
      pts.push((rnd(i, 130) - 0.5) * 90, rnd(i, 131) * 10, (rnd(i, 132) - 0.5) * 90);
      seeds.push(rnd(i, 133) * 12);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    motes = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffe9b0, size: 0.09, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    }));
    motes.userData.base = pts.slice();
    motes.userData.seeds = seeds;
    scene.add(motes);
  }
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
  // folhas ao vento (Fase 45): folhinhas âmbar/verdes que derivam com as rajadas e seguem o jogador
  {
    const N = 90, pts = [], seeds = [], cols = [];
    const LC = [[0.71, 0.46, 0.17], [0.79, 0.54, 0.18], [0.54, 0.60, 0.23], [0.66, 0.35, 0.16]];
    for (let i = 0; i < N; i++) {
      pts.push((rnd(i, 140) - 0.5) * 100, 0.5 + rnd(i, 141) * 7, (rnd(i, 142) - 0.5) * 100);
      seeds.push(rnd(i, 143) * 15);
      const c = LC[Math.floor(rnd(i, 144) * LC.length) % LC.length]; cols.push(c[0], c[1], c[2]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    windLeaves = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.24, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, fog: true }));
    windLeaves.userData.base = pts.slice(); windLeaves.userData.seeds = seeds;
    scene.add(windLeaves);
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
  updateCulling(dt, playerPos.x, playerPos.z); // LOD por distância (Fase 46)
  // ---- vento ----
  windUniform.value = time;
  const gust = 1 + Math.sin(time * 0.35) * 0.5; // rajadas suaves
  for (const t of swayTrees) {
    // só balança árvores próximas (custo baixo)
    if (Math.abs(t.group.position.x - playerPos.x) > 120 || Math.abs(t.group.position.z - playerPos.z) > 120) continue;
    const s = Math.sin(time * 1.3 + t.phase) * t.amp * gust;
    t.group.rotation.x = s;
    t.group.rotation.z = s * 0.6;
  }
  // ---- domo de céu (gradiente + sol) ----
  const ang = SKY.dayT * Math.PI * 2;
  const sunAlt = Math.sin(ang), az = Math.cos(ang);
  if (skyDome) {
    skyDome.position.copy(playerPos);
    const u = skyDome.material.uniforms;
    const dayTop = new THREE.Color(0x2f6fc8), dayBot = new THREE.Color(0xcfe6f2);
    const duskTop = new THREE.Color(0x5a3a7a), duskBot = new THREE.Color(0xe8945a);
    const nightTop = new THREE.Color(0x060a1e), nightBot = new THREE.Color(0x1a2340);
    const t = Math.max(0, Math.min(1, sunAlt * 2.2)); // 0 no crepúsculo, 1 no meio-dia
    if (sunAlt > 0) {
      u.topColor.value.lerpColors(duskTop, dayTop, t);
      u.botColor.value.lerpColors(duskBot, dayBot, t);
    } else {
      const tn = Math.max(0, Math.min(1, -sunAlt * 3));
      u.topColor.value.lerpColors(duskTop, nightTop, tn);
      u.botColor.value.lerpColors(duskBot, nightBot, tn);
    }
    u.sunDir.value.set(az, sunAlt, 0.35).normalize();
    u.sunColor.value.setHex(sunAlt > 0.2 ? 0xfff0d0 : 0xff9a5a);
  }
  // celestial sprites follow the player
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
    if (f.embers) { // fagulhas sobem, derivam e reciclam (Fase 45)
      const pos = f.embers.geometry.attributes.position, top = f.big ? 3.6 : 2.5;
      for (let i = 0; i < f.ephase.length; i++) {
        const k = (time * 0.45 + f.ephase[i]) % 1;
        pos.setXYZ(i, Math.sin((time + i) * 2.4) * 0.32 * k, 0.6 + k * top, Math.cos((time * 1.2 + i) * 2.4) * 0.32 * k);
      }
      pos.needsUpdate = true;
    }
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
  // poeira dourada deriva com o vento e segue o jogador; some à noite
  if (motes) {
    motes.material.opacity = 0.5 * (1 - nf);
    motes.position.set(Math.floor(playerPos.x / 90) * 90, 0, Math.floor(playerPos.z / 90) * 90);
    const pos = motes.geometry.attributes.position;
    const base = motes.userData.base, seeds = motes.userData.seeds;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      pos.setX(i, base[i * 3] + Math.sin(time * 0.25 + s) * 3 + time * 0.4 % 90);
      pos.setY(i, base[i * 3 + 1] + Math.sin(time * 0.4 + s * 2) * 1.2);
      pos.setZ(i, base[i * 3 + 2] + Math.cos(time * 0.2 + s) * 3);
    }
    pos.needsUpdate = true;
  }
  // folhas ao vento (Fase 45): deriva direcional (+x) que envolve, com rajada e bob; some à noite
  if (windLeaves) {
    windLeaves.material.opacity = 0.65 * (1 - nf * 0.55);
    windLeaves.position.set(Math.floor(playerPos.x / 100) * 100, 0, Math.floor(playerPos.z / 100) * 100);
    const pos = windLeaves.geometry.attributes.position;
    const base = windLeaves.userData.base, seeds = windLeaves.userData.seeds;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      pos.setX(i, ((base[i * 3] + 50 + time * 5 + s * 7) % 100) - 50 + Math.sin(time * 0.6 + s) * 3);
      pos.setY(i, base[i * 3 + 1] + Math.sin(time * 0.9 + s * 1.5) * 1.4);
      pos.setZ(i, base[i * 3 + 2] + Math.cos(time * 0.5 + s) * 3);
    }
    pos.needsUpdate = true;
  }
  // água (shader): tempo, direção do sol e fator de noite
  waterUniforms.uTime.value = time;
  waterUniforms.uSunDir.value.set(az, Math.max(0.05, sunAlt), 0.3).normalize();
  waterUniforms.uSunColor.value.setHex(sunAlt > 0.2 ? 0xfff0d0 : 0xff9a5a);
  waterUniforms.uNightF.value = nf;
  // céu refletido: horizonte = cor de fundo atual (dia/dusk/noite), zênite mais escuro/azul
  if (scene.background && scene.background.isColor) {
    waterUniforms.uSkyHorizon.value.copy(scene.background);
    waterUniforms.uSkyTop.value.copy(scene.background).multiplyScalar(0.62);
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

  // ---- clima: mesmo para todos os clientes (derivado da hora do mundo) ----
  const slot = Math.floor(SKY.dayT * 6);
  weather.raining = hash(SKY.day * 7.31 + slot * 3.7, slot * 9.13) < 0.32;
  const target = weather.raining ? 1 : 0;
  weather.rainF += (target - weather.rainF) * Math.min(1, dt * 0.25);
  rain.visible = weather.rainF > 0.03;
  rain.material.opacity = weather.rainF * 0.55;
  if (rain.visible) {
    rain.position.set(playerPos.x, playerPos.y, playerPos.z);
    const rp = rain.geometry.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      let ry = rp.getY(i) - dt * 32;
      if (ry < 0) {
        ry += 26;
        rp.setX(i, (Math.random() - 0.5) * 70);
        rp.setZ(i, (Math.random() - 0.5) * 70);
      }
      rp.setY(i, ry);
    }
    rp.needsUpdate = true;
  }
  // relâmpagos em tempestade forte — flash breve no céu e na névoa
  if (weather.rainF > 0.5) {
    weather.lightning = (weather.lightning || 0) - dt;
    if (weather.lightning <= 0 && Math.random() < dt * 0.12) weather.lightning = 0.16 + Math.random() * 0.1;
  }
  if (weather.lightning > 0) {
    weather.lightning -= dt;
    const f = Math.max(0, weather.lightning) / 0.26;
    scene.background.lerp(FLASH, f * 0.75);
    scene.fog.color.lerp(FLASH, f * 0.75);
  }

  // barcos balançando no cais
  for (let i = 0; i < boats.length; i++) {
    boats[i].position.y = SEA.waterY + 0.15 + Math.sin(time * 0.9 + i * 2) * 0.12;
    boats[i].rotation.z = Math.sin(time * 0.7 + i) * 0.05;
  }
  // portais Cullis pulsando
  for (const gl of gateGlows) {
    gl.rotation.z = time * 0.8;
    gl.material.opacity = 0.45 + Math.sin(time * 2.2) * 0.15;
  }
  // runas do ritual pulsando (energia sombria)
  for (const r of ritualGlows) {
    r.material.opacity = 0.4 + Math.sin(time * 1.8 + r.position.x) * 0.25;
  }
  // tochas da caverna bruxuleando — flicker orgânico multi-frequência (Fase 36)
  for (const t of caveTorches) {
    const ph = t.light.position.x + t.light.position.z;
    const flick = 0.78 + Math.sin(time * 11 + ph) * 0.12 + Math.sin(time * 23 + ph * 1.7) * 0.07 + Math.sin(time * 41 + ph) * 0.04;
    t.flame.scale.y = 0.85 + flick * 0.5;
    t.flame.scale.x = 0.92 + Math.sin(time * 17 + ph) * 0.08;
    t.light.intensity = 2.7 * flick;
    t.light.color.setHSL(0.07 + Math.sin(time * 13 + ph) * 0.015, 0.85, 0.55); // tremor de matiz quente
  }
  // facho do farol varrendo o mar à noite
  if (lightBeam) {
    lightBeam.intensity = nf * 5;
    const a = time * 0.5;
    lightBeamTarget.position.set(240 + Math.cos(a) * 80, 0, 62 + Math.sin(a) * 80);
    lightBeamTarget.updateMatrixWorld();
  }
}
