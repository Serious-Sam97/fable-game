import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { toonRamp } from './core';

// ============================================================ carregamento de GLTF
const loader = new GLTFLoader();
const cache = new Map(); // url → Promise<gltf>

export function loadGLTF(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    }));
  }
  return cache.get(url);
}

// converte os materiais importados para cel-shading (mantém textura/cor), preservando skinning
function toonify(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const conv = (m) => {
      const t = new THREE.MeshToonMaterial({
        color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
        map: m.map || null,
        gradientMap: toonRamp,
        vertexColors: !!m.vertexColors,
        transparent: m.transparent,
        side: m.side,
      });
      t.name = m.name;
      return t;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}

// ============================================================ ator animado
// mapeia o nome das animações do pack para os estados do jogo (com aliases)
function pickClip(map, names) {
  for (const n of names) if (map[n]) return map[n];
  // tenta prefixo "Armature|Nome"
  for (const key of Object.keys(map)) {
    const base = key.split('|').pop();
    if (names.includes(base)) return map[key];
  }
  return null;
}

export class Actor {
  constructor(gltf, { scale = 1, yOffset = 0, faceOffset = 0 } = {}) {
    this.root = skeletonClone(gltf.scene);
    toonify(this.root);
    // normaliza altura/orientação num wrapper (o jogo move o wrapper)
    this.wrapper = new THREE.Group();
    this.root.scale.setScalar(scale);
    this.root.position.y = yOffset;
    this.root.rotation.y = faceOffset;
    this.wrapper.add(this.root);

    this.mixer = new THREE.AnimationMixer(this.root);
    this.byName = {};
    for (const clip of gltf.animations) this.byName[clip.name] = this.mixer.clipAction(clip);
    this.base = null;      // estado de locomoção em loop (idle/walk/run)
    this.oneShot = null;   // ação única sobreposta (ataque/rolar/hit)
    this.returnBase = null;

    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.oneShot) {
        this.oneShot = null;
        if (this.returnBase) this._fadeTo(this.returnBase, 0.15);
      }
    });
  }

  _fadeTo(action, fade) {
    if (!action || action === this.current) return;
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.fadeIn(fade);
    action.play();
    if (this.current) this.current.fadeOut(fade);
    this.current = action;
  }

  /** define a locomoção em loop; names = lista de aliases por prioridade */
  setBase(names, { fade = 0.2, speed = 1 } = {}) {
    const a = pickClip(this.byName, names);
    if (!a) return;
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.timeScale = speed;
    this.base = a;
    if (this.oneShot) return; // a ação única termina antes de voltar ao base
    if (a !== this.current) this._fadeTo(a, fade);
  }

  /** dispara uma ação única (não-loop); volta ao base ao terminar */
  trigger(names, { fade = 0.1, speed = 1 } = {}) {
    const a = pickClip(this.byName, names);
    if (!a) return;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = speed;
    this.returnBase = this.base;
    this.oneShot = a;
    this._fadeTo(a, fade);
  }

  bone(name) {
    let found = null;
    this.root.traverse((o) => { if (o.name === name) found = o; });
    return found;
  }

  /** altura do modelo (para calcular escala) */
  static height(gltf) {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    return box.max.y - box.min.y;
  }

  update(dt) { this.mixer.update(dt); }
}
