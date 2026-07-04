import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ============================================================ cel-shading (look Fable)
// rampa de luz suave: sombras ERGUIDAS (nunca preto) e bandas macias — estilo livro de contos
function makeToonRamp() {
  const steps = [0.5, 0.68, 0.84, 1.0]; // luminância das bandas
  const data = new Uint8Array(steps.length * 4);
  for (let i = 0; i < steps.length; i++) {
    const v = Math.round(steps[i] * 255);
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
export const toonRamp = makeToonRamp();
/** material cel-shaded — substitui Lambert nos objetos do mundo/personagens */
export function toonMaterial(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp, ...opts });
}

// ============================================================ renderer / scene
export const canvas = document.getElementById('game');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc4ec);
scene.fog = new THREE.Fog(0x8fc4ec, 55, 280);

export const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 900);

export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.7, 0.85);
composer.addPass(bloom);

// color grade estilo Fable: leve calor dourado, contraste/saturação suaves e vinheta
export const gradeUniforms = {
  tDiffuse: { value: null },
  uWarm: { value: 0.05 },       // calor sutil — o entardecer já é quente por si
  uSat: { value: 1.1 },         // realça as cores
  uContrast: { value: 1.05 },
  uVignette: { value: 0.26 },
};
const GradeShader = {
  uniforms: gradeUniforms,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tDiffuse;
    uniform float uWarm; uniform float uSat; uniform float uContrast; uniform float uVignette;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // saturação
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      // contraste em torno de 0.5
      c = (c - 0.5) * uContrast + 0.5;
      // calor dourado (sobe vermelho/verde, baixa azul de leve)
      c += vec3(uWarm, uWarm*0.6, -uWarm*0.5);
      // vinheta suave
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - smoothstep(0.5, 0.95, d) * uVignette;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};
export const gradePass = new ShaderPass(GradeShader);
composer.addPass(gradePass);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ============================================================ lights
// céu levemente mais quente + bounce verde-dourado do chão (sombras erguidas, look Fable)
export const hemi = new THREE.HemisphereLight(0xd6ecff, 0x6e8a4a, 1.05);
scene.add(hemi);

export const sun = new THREE.DirectionalLight(0xfff2d0, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0005;
scene.add(sun); scene.add(sun.target);

export const moon = new THREE.DirectionalLight(0x7a90d8, 0);
scene.add(moon); scene.add(moon.target);

// luz de preenchimento quente vinda de trás/lado — cria o "rim" dourado de Fable
export const rimLight = new THREE.DirectionalLight(0xffd9a0, 0.5);
rimLight.position.set(-40, 30, -60);
scene.add(rimLight); scene.add(rimLight.target);

// ============================================================ helpers
// matemática vive em shared/ (mesmo código no servidor); re-exportada para o cliente
import { clamp, lerp, smoothstep } from '../shared/math';
export * from '../shared/math';

// ============================================================ day / night cycle
export const SKY = {
  DAY_LEN: 300,          // seconds per full day
  dayT: 0.09,            // 0 = dawn, .25 = noon, .5 = dusk, .75 = midnight
  day: 1,                // day counter
  sunAlt: 1, nightF: 0,  // updated each frame
};

const cDay = new THREE.Color(0x8fc4ec), cDusk = new THREE.Color(0xe89a5a),
      cNight = new THREE.Color(0x0b1430), skyCol = new THREE.Color();
const sunWarm = new THREE.Color(0xffc078), sunWhite = new THREE.Color(0xfff4dc);

export function updateSky(dt, playerPos, dim = 0) {
  // dim = 0..1 — tempo fechado (chuva) escurece o céu e aproxima a névoa
  SKY.dayT += dt / SKY.DAY_LEN;
  if (SKY.dayT >= 1) { SKY.dayT -= 1; SKY.day++; }
  const ang = SKY.dayT * Math.PI * 2;
  const sunAlt = Math.sin(ang);
  SKY.sunAlt = sunAlt;
  SKY.nightF = smoothstep(0.02, 0.28, -sunAlt);

  const az = Math.cos(ang);
  sun.position.set(playerPos.x + az * 120, sunAlt * 140, playerPos.z + 50);
  sun.target.position.copy(playerPos);
  sun.intensity = 1.8 * clamp(sunAlt * 3, 0, 1);
  sun.color.lerpColors(sunWarm, sunWhite, clamp(sunAlt * 2.2, 0, 1));
  sun.castShadow = sunAlt > 0.03;

  moon.position.set(playerPos.x - az * 100, -sunAlt * 120, playerPos.z - 40);
  moon.target.position.copy(playerPos);
  moon.intensity = 0.45 * SKY.nightF;

  // rim quente segue o jogador — forte de dia (glow dourado), some à noite
  rimLight.position.set(playerPos.x - 50, 34, playerPos.z - 60);
  rimLight.target.position.copy(playerPos);
  rimLight.intensity = 0.55 * clamp(sunAlt * 2 + 0.2, 0, 1) * (1 - dim * 0.5);

  if (sunAlt > 0) skyCol.lerpColors(cDusk, cDay, smoothstep(0, 0.42, sunAlt));
  else skyCol.lerpColors(cDusk, cNight, smoothstep(0, 0.3, -sunAlt));
  if (dim > 0) skyCol.lerp(cStorm, dim * 0.55);
  scene.background.copy(skyCol);
  scene.fog.color.copy(skyCol);
  scene.fog.near = lerp(55, 30, SKY.nightF) * (1 - dim * 0.35);
  scene.fog.far = lerp(280, 160, SKY.nightF) * (1 - dim * 0.4);

  sun.intensity *= 1 - dim * 0.55;
  hemi.intensity = lerp(0.95, 0.22, SKY.nightF) * (1 - dim * 0.3);
}
const cStorm = new THREE.Color(0x5a6674);

export function skyHour() {
  // dayT 0 = 6h
  return (6 + SKY.dayT * 24) % 24;
}

// ============================================================ audio
let actx = null;
export function ensureAudio() {
  if (!actx) { try { actx = new AudioContext(); } catch (e) { return null; } }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
export function beep(freq, dur = 0.1, type = 'square', vol = 0.05, slide = 0) {
  const ac = ensureAudio(); if (!ac) return;
  try {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), ac.currentTime + dur);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  } catch (e) { /* ignore */ }
}
export function noiseBurst(dur = 0.3, vol = 0.08) {
  const ac = ensureAudio(); if (!ac) return;
  try {
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(); src.buffer = buf;
    const g = ac.createGain(); g.gain.value = vol;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  } catch (e) { /* ignore */ }
}

// -------- gentle generative music (Fable-ish lute & pad) --------
export const music = { on: true, combat: 0 }; // combat: 0 explorar, 1 combate
const CHORDS = [
  [220.0, 261.63, 329.63],   // Am
  [174.61, 261.63, 349.23],  // F
  [196.0, 246.94, 392.0],    // G
  [164.81, 246.94, 329.63],  // Em
];
// acordes de combate — mais tensos (Dm, A, Bb, E) e tempo mais rápido
const CHORDS_COMBAT = [
  [146.83, 220.0, 293.66],   // Dm
  [220.0, 277.18, 329.63],   // A
  [233.08, 293.66, 349.23],  // Bb
  [164.81, 207.65, 246.94],  // E
];
const PENTA = [440, 523.25, 587.33, 659.25, 783.99, 880];
let chordI = 0, musicStarted = false;
/** define intensidade de combate (0..1) — o jogo chama conforme inimigos aggro */
export function setCombatMusic(v) { music.combat = v; }

function pad(freq, dur = 4.6, vol = 0.016) {
  const ac = ensureAudio(); if (!ac) return;
  try {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    o.detune.value = (Math.random() - 0.5) * 8;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.linearRampToValueAtTime(vol, ac.currentTime + 1.6);
    g.gain.linearRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  } catch (e) { /* ignore */ }
}
function pluck(freq, vol = 0.03) {
  const ac = ensureAudio(); if (!ac) return;
  try {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.7);
    o.connect(g).connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.7);
  } catch (e) { /* ignore */ }
}
function drum(vol = 0.05) {
  const ac = ensureAudio(); if (!ac) return;
  try {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(45, ac.currentTime + 0.18);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
    o.connect(g).connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.2);
  } catch (e) { /* ignore */ }
}
function musicTick() {
  const inCombat = music.combat > 0.5;
  if (music.on && document.visibilityState === 'visible') {
    const pool = inCombat ? CHORDS_COMBAT : CHORDS;
    const ch = pool[chordI % pool.length];
    chordI++;
    for (const f of ch) pad(f, inCombat ? 2.4 : 4.6, inCombat ? 0.02 : 0.016);
    pad(ch[0] / 2, inCombat ? 2.4 : 4.6, 0.02);
    if (inCombat) {
      // camada de tambor pulsante + arpejo tenso
      for (let b = 0; b < 4; b++) setTimeout(() => music.on && music.combat > 0.5 && drum(b % 2 ? 0.035 : 0.055), b * 550);
      if (Math.random() < 0.7) setTimeout(() => music.on && pluck(ch[Math.floor(Math.random() * ch.length)] * 2, 0.03), 300 + Math.random() * 600);
    } else {
      if (Math.random() < 0.55) setTimeout(() => music.on && pluck(PENTA[Math.floor(Math.random() * PENTA.length)]), 900 + Math.random() * 1500);
      if (Math.random() < 0.35) setTimeout(() => music.on && pluck(PENTA[Math.floor(Math.random() * PENTA.length)], 0.022), 3000 + Math.random() * 900);
    }
  }
  setTimeout(musicTick, inCombat ? 2300 : 4400); // tempo mais rápido no combate
}
export function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  ensureAudio();
  musicTick();
}
export function toggleMusic() {
  music.on = !music.on;
  return music.on;
}

// -------- paisagem sonora ambiente (pássaros, grilos, ondas, vento) --------
export const ambient = { night: 0, nearSea: 0 };
export function setAmbient(nightF, nearSea) { ambient.night = nightF; ambient.nearSea = nearSea; }

function birdChirp() {
  const ac = ensureAudio(); if (!ac) return;
  try {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    const f = 2200 + Math.random() * 1400;
    o.frequency.setValueAtTime(f, ac.currentTime);
    o.frequency.linearRampToValueAtTime(f + 500, ac.currentTime + 0.06);
    o.frequency.linearRampToValueAtTime(f - 300, ac.currentTime + 0.12);
    g.gain.setValueAtTime(0.018, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.14);
    o.connect(g).connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.15);
    // trinado curto (2-3 notas)
    if (Math.random() < 0.6) setTimeout(birdChirp2, 90 + Math.random() * 80);
  } catch (e) { /* ignore */ }
}
function birdChirp2() {
  const ac = ensureAudio(); if (!ac) return;
  try {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = 2600 + Math.random() * 1200;
    g.gain.setValueAtTime(0.014, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
    o.connect(g).connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.1);
  } catch (e) { /* ignore */ }
}
function cricket() {
  const ac = ensureAudio(); if (!ac) return;
  try {
    for (let k = 0; k < 3; k++) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'square'; o.frequency.value = 4600;
      const t0 = ac.currentTime + k * 0.05;
      g.gain.setValueAtTime(0.006, t0);
      g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.03);
      o.connect(g).connect(ac.destination);
      o.start(t0); o.stop(t0 + 0.03);
    }
  } catch (e) { /* ignore */ }
}
function seaWave() {
  const ac = ensureAudio(); if (!ac) return;
  try {
    const len = Math.floor(ac.sampleRate * 1.8);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.sin((i / len) * Math.PI); // sobe e desce como uma onda
      d[i] = (Math.random() * 2 - 1) * env * env;
    }
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = ac.createGain(); g.gain.value = 0.05 * ambient.nearSea;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  } catch (e) { /* ignore */ }
}
let ambientStarted = false;
function ambientTick() {
  if (music.on && document.visibilityState === 'visible') {
    const day = 1 - ambient.night;
    if (Math.random() < day * 0.7) birdChirp();       // pássaros de dia
    if (Math.random() < ambient.night * 0.8) cricket(); // grilos à noite
    if (ambient.nearSea > 0.3 && Math.random() < 0.6) seaWave(); // ondas na costa
  }
  setTimeout(ambientTick, 700 + Math.random() * 900);
}
export function startAmbient() {
  if (ambientStarted) return;
  ambientStarted = true;
  ambientTick();
}

// passos — variam pela superfície (grama abafada, areia áspera, madeira do píer)
let lastStep = 0;
export function footstep(surface, moving) {
  if (!moving) return;
  const now = performance.now ? Date.now() : 0;
  const ac = ensureAudio(); if (!ac) return;
  if (ac.currentTime - lastStep < 0.32) return;
  lastStep = ac.currentTime;
  try {
    const len = Math.floor(ac.sampleRate * 0.09);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = surface === 'wood' ? 1400 : surface === 'sand' ? 900 : 550; // grama mais abafada
    const g = ac.createGain(); g.gain.value = surface === 'wood' ? 0.05 : 0.03;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  } catch (e) { /* ignore */ }
}
