import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
export const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.7, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ============================================================ lights
export const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a7a3a, 0.9);
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

export function updateSky(dt, playerPos) {
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

  if (sunAlt > 0) skyCol.lerpColors(cDusk, cDay, smoothstep(0, 0.42, sunAlt));
  else skyCol.lerpColors(cDusk, cNight, smoothstep(0, 0.3, -sunAlt));
  scene.background.copy(skyCol);
  scene.fog.color.copy(skyCol);
  scene.fog.near = lerp(55, 30, SKY.nightF);
  scene.fog.far = lerp(280, 160, SKY.nightF);

  hemi.intensity = lerp(0.95, 0.22, SKY.nightF);
}

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
export const music = { on: true };
const CHORDS = [
  [220.0, 261.63, 329.63],   // Am
  [174.61, 261.63, 349.23],  // F
  [196.0, 246.94, 392.0],    // G
  [164.81, 246.94, 329.63],  // Em
];
const PENTA = [440, 523.25, 587.33, 659.25, 783.99, 880];
let chordI = 0, musicStarted = false;

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
function musicTick() {
  if (music.on && document.visibilityState === 'visible') {
    const ch = CHORDS[chordI % CHORDS.length];
    chordI++;
    for (const f of ch) pad(f);
    pad(ch[0] / 2, 4.6, 0.02);
    if (Math.random() < 0.55) setTimeout(() => music.on && pluck(PENTA[Math.floor(Math.random() * PENTA.length)]), 900 + Math.random() * 1500);
    if (Math.random() < 0.35) setTimeout(() => music.on && pluck(PENTA[Math.floor(Math.random() * PENTA.length)], 0.022), 3000 + Math.random() * 900);
  }
  setTimeout(musicTick, 4400);
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
