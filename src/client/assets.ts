import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { toonRamp } from './core';

// ============================================================ carregamento de GLTF
// Modelos comprimidos com Draco (Fase 49) → decoder servido localmente de /draco/.
// O GLTFLoader detecta a compressão pela extensão KHR_draco_mesh_compression;
// modelos não-Draco (props .glb sem compressão) carregam normalmente pelo mesmo loader.
const draco = new DRACOLoader().setDecoderPath('/draco/');
const loader = new GLTFLoader().setDRACOLoader(draco);
const cache = new Map(); // url → Promise<gltf>

export function loadGLTF(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    }));
  }
  return cache.get(url);
}

// ============================================================ props estáticos (Bloco B)
// carrega um GLB de cenário (sem esqueleto), aplica o cel-shading e mede o bounding box.
// devolve um TEMPLATE (Object3D) para clonar barato em N instâncias via placeProp (world.ts).
const propCache = new Map(); // url → Promise<template>
export function loadProp(url) {
  if (!propCache.has(url)) {
    propCache.set(url, loadGLTF(url).then((gltf) => {
      const tpl = gltf.scene.clone(true);
      toonify(tpl);
      tpl.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(tpl);
      tpl.userData.h = box.max.y - box.min.y;            // altura nativa
      tpl.userData.minY = box.min.y;                     // base (para assentar no chão)
      tpl.userData.r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5; // raio nativo
      return tpl;
    }));
  }
  return propCache.get(url);
}

// rim light por Fresnel (Fase 37): borda clara na silhueta (dot(normal,view)→0 nas quinas)
// injetada no material toon — deixa personagens/props legíveis contra QUALQUER fundo (o contorno
// escuro resolve fundo claro; o rim resolve fundo escuro, ex.: dentro da caverna). Sem geometria extra.
export const RIM = { color: new THREE.Color(0xffe9c8), power: 2.6, strength: 0.34 };
// cor do ambiente compartilhada (Fase 38) — UMA referência atualizada por frame propaga a todos
// os materiais (padrão do waterUniforms): metais/armaduras ganham um brilho tingido pelo céu.
export const envUniform = { value: new THREE.Color(0x9ec4e0) };
// força do rim + escurecimento noturno, compartilhados (atualizados por frame em game.ts).
// Bugfix: rim/sheen eram constantes → personagens ficavam "acesos" à noite; agora caem no escuro.
export const rimStrengthU = { value: RIM.strength };
export const nightDimU = { value: 1.0 }; // 1 de dia, <1 à noite → escurece os atores (clima dark)
function addRim(mat, metallic) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: RIM.color };
    shader.uniforms.uRimPower = { value: RIM.power };
    shader.uniforms.uRimStrength = rimStrengthU;        // compartilhado (cai à noite)
    shader.uniforms.uEnvColor = envUniform;             // compartilhado
    shader.uniforms.uNightDim = nightDimU;              // compartilhado
    shader.uniforms.uMetal = { value: metallic ? 1.0 : 0.0 };
    shader.fragmentShader = 'uniform vec3 uRimColor, uEnvColor; uniform float uRimPower, uRimStrength, uMetal, uNightDim;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        'outgoingLight *= uNightDim;\n' + // clima mais dark à noite (o toon ramp erguia demais os atores)
        '  float _fr = 1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);\n' +
        '  outgoingLight += pow(_fr, uRimPower) * uRimColor * uRimStrength;\n' +
        '  outgoingLight += uMetal * pow(_fr, 1.5) * uEnvColor * 0.55 * uNightDim;\n' + // env-sheen do metal
        '  #include <opaque_fragment>'
      );
    mat.userData.rimShader = shader;
  };
}

// converte os materiais importados para cel-shading (mantém textura/cor), preservando skinning
function toonify(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true; // atores recebem sombra do terreno/uns dos outros (Fase 31)
    const conv = (m) => {
      const t = new THREE.MeshToonMaterial({
        color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
        map: m.map || null,
        gradientMap: toonRamp,
        vertexColors: !!m.vertexColors,
        transparent: m.transparent,
        side: m.side,
        // preserva emissivos do pack (olhos brilhantes, ouro, runas)
        emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0x000000),
        emissiveMap: m.emissiveMap || null,
        emissiveIntensity: m.emissiveIntensity ?? 1,
      });
      t.name = m.name;
      // metal/armadura reflete o ambiente (Fase 38): detecta por NOME do material — os packs
      // exportam metalness=1 em tudo (grama/madeira inclusos), então metalness é inútil aqui.
      const metallic = /metal|armor|armour|sword|blade|iron|steel|helm|plate|shield|gold|silver|axe|hammer|spear|knight/i.test(m.name || '');
      addRim(t, metallic); // rim (Fase 37) + env-sheen de metal (Fase 38)
      return t;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}

// contorno estilo toon por inverted-hull: clona cada malha (compartilhando esqueleto/geometria)
// com material preto em BackSide, empurrado ao longo da normal — acompanha a animação.
// Base MeshLambert (não MeshBasic!): traz os chunks de normal nativamente, então `objectNormal`
// existe na injeção (inclusive skinado) — o MeshBasic não os declara e o shader não compilava.
// Truque p/ ficar plano/preto: cor preta zera a difusa; emissivo dá a cor constante (imune à luz).
const OUTLINE_MAT = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: 0x14110c, side: THREE.BackSide });
OUTLINE_MAT.onBeforeCompile = (shader) => {
  shader.uniforms.uOutline = { value: 1 };
  shader.vertexShader = 'uniform float uOutline;\n' + shader.vertexShader.replace(
    '#include <project_vertex>',
    'transformed += objectNormal * uOutline;\n#include <project_vertex>'
  );
  OUTLINE_MAT.userData.shader = shader;
};
function addOutline(root, thickness) {
  const pairs = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    const mat = OUTLINE_MAT.clone();
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uOutline = { value: thickness };
      shader.vertexShader = 'uniform float uOutline;\n' + shader.vertexShader.replace(
        '#include <project_vertex>',
        'transformed += objectNormal * uOutline;\n#include <project_vertex>'
      );
    };
    let outline;
    if (o.isSkinnedMesh) { outline = new THREE.SkinnedMesh(o.geometry, mat); outline.bind(o.skeleton, o.bindMatrix); }
    else outline = new THREE.Mesh(o.geometry, mat);
    outline.userData.isOutline = true;
    outline.castShadow = outline.receiveShadow = false;
    outline.frustumCulled = o.frustumCulled;
    outline.position.copy(o.position); outline.quaternion.copy(o.quaternion); outline.scale.copy(o.scale);
    pairs.push([o.parent, outline]);
  });
  for (const [parent, outline] of pairs) parent.add(outline);
}

// ============================================================ sombra de contato (Fase 31)
// mancha macia sob os pés que "assenta" o ator no chão — funciona mesmo com o sol baixo
// (quando a sombra projetada cai longe dos pés). Textura e geometria compartilhadas.
let _contactTex = null;
function contactTex() {
  if (_contactTex) return _contactTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  rg.addColorStop(0, 'rgba(0,0,0,0.55)'); rg.addColorStop(0.55, 'rgba(0,0,0,0.28)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  _contactTex = new THREE.CanvasTexture(cv);
  return _contactTex;
}
const _contactGeo = new THREE.PlaneGeometry(1, 1); _contactGeo.rotateX(-Math.PI / 2); // deitada, normal +Y

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
  // faceOffset padrão 0: os packs (Quaternius chars/animals, RPG monsters) encaram +Z
  // nativamente — e o jogo aponta o +Z do grupo para o movimento. Qualquer π aqui = moonwalk.
  constructor(gltf, { scale = 1, yOffset = null, faceOffset = 0, outline = 0.02 } = {}) {
    this.root = skeletonClone(gltf.scene);
    toonify(this.root);
    // contorno toon com espessura ~constante no mundo (compensa a escala do modelo)
    if (outline > 0) addOutline(this.root, outline / (scale || 1));
    // normaliza altura/orientação num wrapper (o jogo move o wrapper)
    this.wrapper = new THREE.Group();
    this.root.scale.setScalar(scale);
    // assenta os pés no chão: yOffset auto = -min.y da geometria (bind pose) * escala
    this.root.position.y = yOffset != null ? yOffset : -Actor.groundY(gltf) * scale;
    this.root.rotation.y = faceOffset;
    this.wrapper.add(this.root);

    // sombra de contato nos pés — dimensionada pela pegada do modelo
    const gb = Actor._geomBox(gltf);
    const foot = Math.max(gb.max.x - gb.min.x, gb.max.z - gb.min.z) * scale;
    const cs = new THREE.Mesh(_contactGeo, new THREE.MeshBasicMaterial({
      map: contactTex(), transparent: true, depthWrite: false, opacity: 0.9,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    cs.scale.setScalar(Math.max(0.6, foot * 1.6));
    cs.position.y = 0.03;
    cs.renderOrder = 1;
    cs.matrixAutoUpdate = false; cs.updateMatrix();
    this.wrapper.add(cs);
    this.contactShadow = cs;

    this.mixer = new THREE.AnimationMixer(this.root);
    this.byName = {};
    this.clips = {};       // clips crus (p/ derivar versões aditivas — Fase 42)
    for (const clip of gltf.animations) { this.byName[clip.name] = this.mixer.clipAction(clip); this.clips[clip.name] = clip; }
    this.base = null;      // estado de locomoção em loop (idle/walk/run)
    this.oneShot = null;   // ação única sobreposta full-body (rolar/morrer)
    this.returnBase = null;
    this._addActions = {}; // cache de ações ADITIVAS (upper-body: ataque enquanto anda)
    this._addSet = new Set();
    this._warned = new Set(); // avisa 1× por conjunto de aliases sem correspondência

    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.oneShot) {
        this.oneShot = null;
        if (this.returnBase) this._fadeTo(this.returnBase, 0.15);
      } else if (this._addSet.has(e.action)) {
        e.action.stop(); // camada aditiva termina no frame ~neutro → parar não dá pop
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

  // avisa 1× quando nenhum alias bate — mostra os clips disponíveis (evita T-pose silenciosa)
  _missing(names) {
    const key = names.join('|');
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(`[Actor] sem clip para [${key}]. Disponíveis: ${Object.keys(this.byName).join(', ')}`);
  }

  /** define a locomoção em loop; names = lista de aliases por prioridade */
  setBase(names, { fade = 0.2, speed = 1 } = {}) {
    const a = pickClip(this.byName, names);
    if (!a) { this._missing(names); return; }
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.timeScale = speed;
    this.base = a;
    if (this.oneShot) return; // a ação única termina antes de voltar ao base
    if (a !== this.current) this._fadeTo(a, fade);
  }

  /** dispara uma ação única (não-loop); volta ao base ao terminar */
  trigger(names, { fade = 0.1, speed = 1 } = {}) {
    const a = pickClip(this.byName, names);
    if (!a) { this._missing(names); return; }
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = speed;
    this.returnBase = this.base;
    this.oneShot = a;
    this._fadeTo(a, fade);
  }

  /** dispara uma ação ADITIVA sobreposta (Fase 42): soma o delta do clip (relativo ao frame 0)
   *  por cima da locomoção — os braços atacam/miram enquanto as pernas continuam andando. Não
   *  toca no base nem no oneShot, então setBase segue livre (andar não para pra golpear). */
  triggerUpper(names, { fade = 0.1, speed = 1 } = {}) {
    const clip = pickClip(this.clips, names);
    if (!clip) { this._missing(names); return; }
    let a = this._addActions[clip.name];
    if (!a) {
      const add = clip.clone();
      THREE.AnimationUtils.makeClipAdditive(add); // aditivo relativo ao frame 0 do próprio clip
      a = this.mixer.clipAction(add, undefined, THREE.AdditiveAnimationBlendMode);
      a.setLoop(THREE.LoopOnce, 1);
      this._addActions[clip.name] = a;
      this._addSet.add(a);
    }
    a.stop();
    a.timeScale = speed;
    a.reset();
    a.setEffectiveWeight(1);
    a.fadeIn(fade);
    a.play();
  }

  bone(name) {
    let found = null;
    this.root.traverse((o) => { if (o.name === name) found = o; });
    return found;
  }

  /** bounding box da GEOMETRIA em bind pose (determinístico, independe da pose do
   *  esqueleto no instante do load). setFromObject media o esqueleto posado e dava
   *  alturas caóticas (mesmo rig variando 1.1–2.3) → escala absurda. */
  static _geomBox(gltf) {
    const box = new THREE.Box3(), tmp = new THREE.Box3();
    gltf.scene.updateWorldMatrix(true, true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      box.union(tmp);
    });
    return box;
  }

  /** altura real do modelo (para calcular escala) */
  static height(gltf) {
    const b = Actor._geomBox(gltf);
    return b.max.y - b.min.y;
  }

  /** y mínimo da geometria (base/pés) — para assentar no chão */
  static groundY(gltf) {
    return Actor._geomBox(gltf).min.y;
  }

  update(dt) { this.mixer.update(dt); }
}
