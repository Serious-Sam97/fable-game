// ============================================================================
// Bancada de calibração de modelos (Fase 1 do plano gráfico)
// Rota isolada em /debug-models.html — NÃO afeta o jogo.
// Mostra cada modelo com: eixos, bounding box, altura real, clips de animação
// e uma seta VERDE (+Z = "frente do mundo") para calibrar faceOffset.
// ============================================================================
import * as THREE from 'three';
import { loadGLTF, Actor } from './assets';
import { makeWeaponModel } from './models';

// espelha attachHeroWeapon() do game.ts — para calibrar a arma na mão com câmera livre
function attachWeapon(actor: Actor, key: string) {
  const bone = actor.bone('FistR');
  if (!bone) return;
  const w = makeWeaponModel(key);
  const inv = 1 / (actor.root.scale.x || 1);
  w.scale.setScalar(inv * 0.9);
  w.rotation.set(0.32, 0, 0.06);
  w.position.set(0, 0.06 * inv, 0.04 * inv);
  bone.add(w);
}

// --- o que inspecionar. kind:'actor' = animado; 'prop' = estático (Bloco B) ---
const ITEMS = [
  // elenco animado (como o jogo usa hoje)
  { url: '/models/characters/Knight_Male.gltf',        label: 'herói (Knight)',    kind: 'actor', anim: ['Idle'], weapon: 'espada_longa' },
  { url: '/models/animals/Husky.gltf',                 label: 'cão (Husky)',       kind: 'actor', anim: ['Walk', 'Gallop'] },
  { url: '/models/animals/Wolf.gltf',                  label: 'lobo (Wolf)',       kind: 'actor', anim: ['Gallop', 'Walk'] },
  { url: '/models/characters/Goblin_Male.gltf',        label: 'hobbe (Goblin)',    kind: 'actor', anim: ['Run', 'Walk'] },
  { url: '/models/characters/Ninja_Male.gltf',         label: 'bandido (Ninja)',   kind: 'actor', anim: ['Run', 'Walk'] },
  { url: '/models/characters/Soldier_Male.gltf',       label: 'guarda (Soldier)',  kind: 'actor', anim: ['Run', 'Walk'] },
  { url: '/models/characters/Knight_Golden_Male.gltf', label: 'Malachi (Golden)',  kind: 'actor', anim: ['Run', 'Walk'] },
  { url: '/models/characters/Wizard.gltf',             label: 'NPC Wizard',        kind: 'actor', anim: ['Walk'] },
  { url: '/models/monsters/Big/glTF/Demon.gltf',       label: 'balverine (Demon)', kind: 'actor', anim: ['Run', 'Walk'] },
  { url: '/models/monsters/Big/glTF/Yeti.gltf',        label: 'troll (Yeti)',      kind: 'actor', anim: ['Walk', 'Run'] },
  // props do mundo (Bloco B) — referência de escala nativa
  { url: '/models/nature/Models/GLTF format/tree_oak.glb',  label: 'árvore (oak)',  kind: 'prop' },
  { url: '/models/nature/Models/GLTF format/rock_largeA.glb', label: 'pedra',       kind: 'prop' },
  { url: '/models/town/Models/GLB format/wall.glb',         label: 'parede casa',   kind: 'prop' },
];

const canvas = document.getElementById('dbg') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x223040);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);

scene.add(new THREE.HemisphereLight(0xd6ecff, 0x5a6a40, 1.4));
const dir = new THREE.DirectionalLight(0xfff2d0, 1.6); dir.position.set(6, 12, 8); scene.add(dir);
scene.add(new THREE.GridHelper(120, 60, 0x557, 0x334));

// seta de referência global: +Z (verde) e +X (vermelho) na origem
function refArrow(dirVec: THREE.Vector3, color: number, at: THREE.Vector3, len = 2.4) {
  const a = new THREE.ArrowHelper(dirVec.clone().normalize(), at, len, color, 0.5, 0.3);
  scene.add(a); return a;
}

const SPACING = 4;
const NORM_H = 2.2; // normaliza todo ator a esta altura, para todos ficarem visíveis/comparáveis
const hud = document.getElementById('hud')!;
const lines: string[] = ['<b>BANCADA DE MODELOS</b>  (seta verde = +Z / frente do mundo)'];
const actors: Actor[] = [];

// altura confiável: bounding box da GEOMETRIA (bind pose), não do esqueleto posado
function geomHeight(root: THREE.Object3D) {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((o: any) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox);
    // aplica só escala/rotação do mundo do mesh (bind pose), ignorando o skinning posado
    tmp.applyMatrix4(o.matrixWorld);
    box.union(tmp);
  });
  return box.max.y - box.min.y;
}

function labelSprite(text: string, y: number, color = '#e9c96a') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, 512, 128);
  g.font = 'bold 40px monospace'; g.fillStyle = color; g.textAlign = 'center';
  g.fillText(text, 256, 78);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(4, 1, 1); spr.position.y = y;
  return spr;
}

async function build() {
  let x = -((ITEMS.length - 1) * SPACING) / 2;
  for (const it of ITEMS) {
    const at = new THREE.Vector3(x, 0, 0);
    try {
      const gltf = await loadGLTF(it.url);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const h = +(box.max.y - box.min.y).toFixed(2);
      const w = +(box.max.x - box.min.x).toFixed(2);
      const d = +(box.max.z - box.min.z).toFixed(2);
      const clips = gltf.animations.map((a: any) => a.name);

      let obj: THREE.Object3D;
      let gh = h; // altura por geometria (bind pose)
      if (it.kind === 'actor') {
        const actor = new Actor(gltf, { scale: 1 }); // faceOffset 0 → orientação NATIVA
        gh = +geomHeight(actor.root).toFixed(2);
        actor.root.scale.setScalar(NORM_H / gh); // normaliza todos à mesma altura
        actor.setBase(it.anim || ['Idle', 'Walk']);
        if (it.weapon) attachWeapon(actor, it.weapon);
        obj = actor.wrapper;
        actors.push(actor);
      } else {
        obj = (await loadGLTF(it.url)).scene.clone();
      }
      obj.position.copy(at);
      scene.add(obj);

      const topY = it.kind === 'actor' ? NORM_H : h;
      const axes = new THREE.AxesHelper(1.2); axes.position.copy(at); scene.add(axes);
      // seta +Z (frente do mundo) nos pés de cada modelo — leitura de orientação
      refArrow(new THREE.Vector3(0, 0, 1), 0x33ff66, at.clone().setY(0.05), 1.6);
      scene.add(labelSprite(it.label, topY + 0.9).translateX(x));

      lines.push(`• <b>${it.label}</b> — geomH=${gh} setObjH=${h} w=${w} d=${d} | clips: ${clips.join(', ') || '(nenhum)'}`);
    } catch (e) {
      lines.push(`• <b>${it.label}</b> — <span style="color:#f77">FALHOU: ${it.url}</span>`);
    }
    hud.innerHTML = lines.join('<br>');
    x += SPACING;
  }
  // enquadra a fileira
  camera.position.set(0, 6, ITEMS.length * SPACING * 0.55 + 6);
  camera.lookAt(0, 1.5, 0);
}
build();

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  for (const a of actors) a.update(dt);
  renderer.render(scene, camera);
}
addEventListener('resize', resize);
resize();
loop();

// helpers p/ o preview. dbgCam(mode, focusIndex?) → foca um modelo específico
(window as any).dbgCam = (mode: string, idx?: number) => {
  const span = (ITEMS.length - 1) * SPACING;
  const fx = idx == null ? 0 : -span / 2 + idx * SPACING;
  const R = idx == null ? span * 0.6 + 6 : 5;
  if (mode === 'front') camera.position.set(fx, 1.6, R);        // +Z vem em direção à câmera
  else if (mode === 'back') camera.position.set(fx, 1.6, -R);
  else if (mode === 'top') camera.position.set(fx, R + 2, 0.001); // olha de cima: +Z p/ baixo da tela
  else if (mode === 'side') camera.position.set(fx + R, 1.6, 0);
  else camera.position.set(fx + R * 0.4, 3, R * 0.9);
  camera.lookAt(fx, mode === 'top' ? 0 : 1.1, 0);
};
(window as any).dbgHUD = (on: boolean) => { hud.style.display = on ? 'block' : 'none'; };
(window as any).dbgData = () => actors.length; // pronto quando > 0
(window as any).dbgCamera = camera;
(window as any).dbgActors = actors;
(window as any).dbgWeapon = (rx: number, ry: number, rz: number, s = 0.9) => {
  const b = actors[0]?.bone('FistR'); if (!b) return 'no bone';
  const w = b.children.find((c: any) => c.geometry || c.type === 'Group');
  if (!w) return 'no weapon';
  const inv = 1 / (actors[0].root.scale.x || 1);
  w.rotation.set(rx, ry, rz); w.scale.setScalar(inv * s);
  return `set ${rx.toFixed(2)},${ry.toFixed(2)},${rz.toFixed(2)}`;
};
(window as any).dbgLook = (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => {
  camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz);
};
