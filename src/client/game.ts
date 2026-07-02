import * as THREE from 'three';
import {
  canvas, scene, camera, composer, SKY, updateSky, skyHour,
  beep, noiseBurst, startMusic, toggleMusic, clamp, lerp, rnd,
} from './core';
import {
  WORLD_R, LAKE, terrainHeight, buildWorld, updateWorld,
  chests, MAP_FEATURES, BANDIT_CAMP, ORCHARD, DARK_FOREST,
} from './world';
import {
  makeHero, makeVillager, makeBandit, makeHobbe, makeBalverine,
  makeBeast, makeBeetle, makeChicken, makeTextSprite, makeWeaponModel, applyArmorTo,
} from './models';
import { ENEMY_DEFS, FACE_X_TYPES } from '../shared/defs/enemies';
import { ABILITIES, FIREBALL_SPEED, ARROW_SPEED } from '../shared/defs/abilities';
import { WEAPONS, ARMORS, rarityOf, rollDrop, sellPrice, itemDef } from '../shared/defs/items';
import { connectNet, net, sendMsg, drainEvents, drainChat } from './net';
import { EnemySim } from '../shared/sim/enemies';
import { CombatSim } from '../shared/sim/combat';

buildWorld();

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'fable_save_v1';

// ============================================================ player state
const heroModel = makeHero();
scene.add(heroModel.group);

const player = {
  pos: new THREE.Vector3(0, 0, 10),
  vy: 0, onGround: true, dead: false,
  level: 1, xp: 0,
  hp: 110, maxHp: 110, will: 60, maxWill: 60,
  gold: 25, renown: 0, morality: 0,
  potions: { hp: 2, will: 1 },
  kicks: 0, kills: 0, luckCharm: false,
  walkT: 0, swingT: 0, lastCombat: -99,
  mult: 0, multT: 0, slowT: 0,
  achKick: false,
  // disciplinas Fable — você vira o que você usa
  disc: { str: { lvl: 0, xp: 0 }, skl: { lvl: 0, xp: 0 }, wil: { lvl: 0, xp: 0 } },
  inventory: [],
  equipped: { wpn: 'espada_gasta', rar: 'comum' },
  armor: { head: null, chest: null, legs: null, boots: null },
  // fôlego para o rolamento (Shift) — armadura pesada cansa mais
  stam: 100, maxStam: 100,
  rollT: 0, rollDirX: 0, rollDirZ: 1, invulnT: 0,
  lastDirX: 0, lastDirZ: 1,
};
player.pos.y = terrainHeight(player.pos.x, player.pos.z);
const xpToNext = (lvl) => 90 + lvl * 60;
const maxHpFor = (lvl) => 110 + (lvl - 1) * 24;
const maxWillFor = (lvl) => 60 + (lvl - 1) * 12;

const TITLES = [[0, 'Camponês'], [10, 'Andarilho'], [25, 'Aventureiro'], [50, 'Mercenário'], [80, 'Herói'], [130, 'Lenda de Albion']];
function playerTitle() {
  let t = TITLES[0][1];
  for (const [r, name] of TITLES) if (player.renown >= r) t = name;
  return t;
}

function updateMoralityVisuals() {
  heroModel.halo.visible = player.morality >= 40;
  heroModel.horns.visible = player.morality <= -40;
}

// ============================================================ disciplinas & arma equipada
const discXpToNext = (lvl) => 60 + lvl * 55;
const DISC_LABEL = { str: '💪 Força', skl: '🎯 Habilidade', wil: '✨ Vontade' };

function recomputeMaxes() {
  player.maxHp = maxHpFor(player.level) + player.disc.str.lvl * 8;
  player.maxWill = maxWillFor(player.level) + player.disc.wil.lvl * 5;
  player.hp = Math.min(player.hp, player.maxHp);
  player.will = Math.min(player.will, player.maxWill);
}

function gainDiscXP(kind, amt) {
  const d = player.disc[kind];
  if (!d || d.lvl >= 50 || amt <= 0) return;
  d.xp += amt;
  while (d.xp >= discXpToNext(d.lvl)) {
    d.xp -= discXpToNext(d.lvl);
    d.lvl++;
    toast(`${DISC_LABEL[kind]} subiu para ${d.lvl}!`);
    beep(700 + d.lvl * 12, 0.18, 'sine', 0.06, 150);
    recomputeMaxes();
    updateHeroBody();
    saveGame();
  }
}

function equippedStats() {
  const w = WEAPONS[player.equipped.wpn] ?? WEAPONS.espada_gasta;
  const rar = rarityOf(player.equipped.rar);
  return { def: w, rar, dmg: w.mult * rar.mult, range: w.range, kind: w.kind, spellMult: w.spellBoost ?? 1 };
}
function totalDefense() {
  let d = 0;
  for (const it of Object.values(player.armor)) {
    if (it && ARMORS[it.arm]) d += ARMORS[it.arm].def * rarityOf(it.rar).mult;
  }
  return d;
}
function totalWeight() {
  let w = 0;
  for (const it of Object.values(player.armor)) {
    if (it && ARMORS[it.arm]) w += ARMORS[it.arm].weight;
  }
  return w;
}
const damageReduction = () => { const d = totalDefense(); return d / (d + 25); };
const rollCost = () => 30 + totalWeight() * 2.5;
const stamRegen = () => Math.max(6, 16 - totalWeight() * 1.2);
function combatStats() {
  const eq = equippedStats();
  return {
    lvl: player.level,
    str: player.disc.str.lvl, skl: player.disc.skl.lvl, wil: player.disc.wil.lvl,
    luck: player.luckCharm,
    wpnKind: eq.kind, wpnDmg: eq.dmg, wpnRange: eq.range, spellMult: eq.spellMult,
  };
}

// Fable: o corpo conta a história — Força incha os ombros, Vontade acende tatuagens
function updateHeroBody() {
  const str = player.disc.str.lvl, wil = player.disc.wil.lvl;
  const bulk = 1 + Math.min(str, 12) * 0.045;
  heroModel.shL.scale.setScalar(bulk);
  heroModel.shR.scale.setScalar(bulk);
  heroModel.torso.scale.x = 1 + Math.min(str, 12) * 0.025;
  const glow = wil >= 2;
  for (const t of heroModel.tattooMeshes) t.visible = glow;
  heroModel.tattooMat.emissiveIntensity = glow ? Math.min(2.2, 0.4 + wil * 0.18) : 0;
  heroModel.weaponMount.clear();
  heroModel.weaponMount.add(makeWeaponModel(player.equipped.wpn));
  applyArmorTo(heroModel, {
    head: player.armor.head?.arm, chest: player.armor.chest?.arm,
    legs: player.armor.legs?.arm, boots: player.armor.boots?.arm,
  });
  const eq = equippedStats();
  $('slot1Icon').textContent = eq.kind === 'bow' ? '🏹' : eq.def.icon;
}

// ============================================================ quests
const quests = {
  q1: { state: 'available', count: 0, goal: 8 },                       // beetles — Guildmaster
  q2: { state: 'locked', count: 0, goal: 5, leaderResolved: false },   // bandits — Whisper
  q3: { state: 'locked', count: 0, goal: 1 },                          // balverine — Guildmaster
};

// ============================================================ NPCs
const npcs = [];
function addNpc(name, model, x, z, opts = {}) {
  const y = terrainHeight(x, z);
  model.group.position.set(x, y, z);
  model.group.rotation.y = opts.rot ?? 0;
  scene.add(model.group);
  const plate = document.createElement('div');
  plate.className = 'plate';
  plate.innerHTML = `<div class="pname" style="color:#ffe07a">${name}</div>`;
  $('plates').appendChild(plate);
  const marker = makeTextSprite('!');
  marker.position.y = 3.1;
  marker.visible = false;
  model.group.add(marker);
  const npc = { name, model, pos: new THREE.Vector3(x, y, z), plate, marker, role: opts.role, wander: opts.wander, home: new THREE.Vector3(x, y, z), wTarget: null, wTimer: rnd(x, z) * 5, sayT: 4 + rnd(z, x) * 8 };
  npcs.push(npc);
  return npc;
}

const guildmaster = addNpc('Mestre da Guilda', makeVillager({ robe: 0x2a4a7a, beard: true, staff: true, hair: 0xd8d8d8 }), 3, -6, { rot: 2.6, role: 'guildmaster' });
const whisper = addNpc('Whisper', makeVillager({ robe: 0xc8a02a, skin: 0x7a5236, hair: 0x1a1a1a, staff: true }), -7, 4, { rot: 1.2, role: 'whisper' });
const barnum = addNpc('Barnum', makeVillager({ robe: 0x6a4a2e, hat: 'top' }), 9, 2, { rot: -0.9, role: 'vendor' });
addNpc('Aldeã Rosie', makeVillager({ robe: 0x8a3a5a, hair: 0xb87a3a }), -4, 10, { wander: true });
addNpc('Aldeão Tobias', makeVillager({ robe: 0x4a6a3a, hair: 0x5a3a1a }), 12, -4, { wander: true });

// ============================================================ chickens
const chickens = [];
for (let i = 0; i < 6; i++) {
  const x = -8 + rnd(i, 200) * 18, z = -10 + rnd(i, 201) * 20;
  const model = makeChicken();
  const y = terrainHeight(x, z);
  model.group.position.set(x, y, z);
  scene.add(model.group);
  chickens.push({
    model, pos: new THREE.Vector3(x, y, z), home: new THREE.Vector3(x, y, z),
    state: 'idle', vel: new THREE.Vector3(), spin: 0, wTimer: rnd(i, 202) * 3, walkT: 0,
  });
}

// ============================================================ enemies
const enemies = [];
const DEFS = ENEMY_DEFS;
// modelos 3D são responsabilidade do cliente; o servidor conhece só os números (shared/defs)
const MAKERS = {
  besouro: () => makeBeetle(),
  lobo: () => makeBeast({ color: 0x555a66, scale: 1.1, tail: true }),
  bandido: () => makeBandit(),
  arqueiro: () => makeBandit({ archer: true }),
  chefe: () => makeBandit({ leader: true }),
  hobbe: () => makeHobbe(),
  xama: () => makeHobbe({ shaman: true }),
  balverine: () => makeBalverine(),
};

// simulação local — autoritativa apenas OFFLINE; online o servidor é a verdade
const localSim = new EnemySim();
const enemyViews = new Map(); // id → view (modelo 3D + plate espelhando a sim)
const myPid = () => (net.connected ? net.id : 0);
// beasts olham por +X na malha; a sim guarda o ângulo puro e o cliente compensa
const FACE_X = new Set(FACE_X_TYPES);

function ensureEnemyView(s) {
  let v = enemyViews.get(s.id);
  if (v) return v;
  const def = DEFS[s.type];
  const model = MAKERS[s.type]();
  scene.add(model.group);
  const plate = document.createElement('div');
  plate.className = 'plate';
  plate.innerHTML = `<div class="pname" style="color:#ff6a6a">${def.name}</div><div class="phpbar"><div class="phpfill"></div></div>`;
  $('plates').appendChild(plate);
  v = {
    id: s.id, type: s.type, def, model,
    pos: new THREE.Vector3(s.x, terrainHeight(s.x, s.z), s.z),
    ry: s.ry, hp: s.hp, maxHp: s.maxHp,
    state: s.state, walkT: 0, swingT: 0, deadTimer: 0,
    isLeader: s.type === 'chefe',
    plate, plateFill: plate.querySelector('.phpfill'), plateName: plate.querySelector('.pname'),
  };
  enemyViews.set(s.id, v);
  return v;
}

function syncEnemies(dt) {
  const list = net.connected ? net.enemies : localSim.serialize();
  const seen = new Set();
  for (const s of list) {
    seen.add(s.id);
    const v = ensureEnemyView(s);
    if (net.connected) {
      // interpolação até o último snapshot do servidor
      const k = Math.min(1, dt * 12);
      v.pos.x += (s.x - v.pos.x) * k;
      v.pos.z += (s.z - v.pos.z) * k;
      let dr = s.ry - v.ry;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      v.ry += dr * Math.min(1, dt * 10);
    } else {
      v.pos.x = s.x; v.pos.z = s.z; v.ry = s.ry;
    }
    v.hp = s.hp; v.maxHp = s.maxHp;
    v.state = s.state;
    v.walkT = s.walkT;
    v.pos.y = terrainHeight(v.pos.x, v.pos.z) + (s.state === 'leap' ? Math.sin(Math.min(1, s.leapK) * Math.PI) * 4.5 : 0);
    v.model.group.position.copy(v.pos);
    v.model.group.rotation.y = v.ry - (FACE_X.has(v.type) ? Math.PI / 2 : 0);
    if (s.state === 'dead') {
      v.deadTimer += dt;
      v.model.group.rotation.z = Math.min(Math.PI / 2, v.deadTimer * 4);
    } else {
      v.deadTimer = 0;
      v.model.group.rotation.z = 0;
    }
    v.model.group.rotation.x = s.state === 'surrender' ? 0.5 : 0;
    if (s.state === 'surrender') v.plateName.style.color = '#ffe07a';
    const ls = Math.sin(v.walkT) * 0.6;
    if (v.model.legs) {
      for (let i = 0; i < v.model.legs.length; i++) v.model.legs[i].rotation.x = i % 2 ? ls : -ls;
    }
    if (v.model.armR) {
      if (v.swingT > 0) { v.swingT -= dt; v.model.armR.rotation.x = -2.2 * (v.swingT / 0.3); }
      else v.model.armR.rotation.x = ls * 0.5;
      if (v.model.armL) v.model.armL.rotation.x = -ls * 0.5;
    }
  }
  for (const [id, v] of enemyViews) {
    if (!seen.has(id)) {
      scene.remove(v.model.group);
      v.plate.remove();
      enemyViews.delete(id);
      if (target === v) setTarget(null);
    }
  }
  enemies.length = 0;
  for (const v of enemyViews.values()) enemies.push(v);
}

function processSimEvents() {
  const evs = net.connected ? drainEvents() : localSim.drainEvents();
  for (const ev of evs) {
    const v = 'id' in ev ? enemyViews.get(ev.id) : null;
    switch (ev.t) {
      case 'aggro':
        if (v) floatText(v.pos, '!', '#ff6a6a', 20);
        if (v && v.type === 'balverine') { noiseBurst(0.5, 0.09); beep(90, 0.7, 'sawtooth', 0.08, -30); }
        break;
      case 'eatk': {
        if (v) v.swingT = 0.3;
        // flecha visual dos atiradores — de quem atira até a vítima
        if (v && v.def.ranged) {
          const victim = ev.pid === myPid() ? player.pos : remoteHeroes.get(ev.pid)?.model.group.position;
          if (victim) arrowStreak(
            v.pos.clone().add(new THREE.Vector3(0, 1.8, 0)),
            victim.clone().add(new THREE.Vector3(0, 1.2, 0))
          );
        }
        if (ev.pid === myPid()) {
          damagePlayer(ev.dmg);
          if (!net.connected) combatLocal.notePlayerHit(0);
        }
        break;
      }
      case 'eheal': {
        const tv = enemyViews.get(ev.targetId);
        if (tv) floatText(tv.pos, '+' + ev.amount, '#6ee86e', 16);
        if (v && tv) {
          const geo = new THREE.BufferGeometry().setFromPoints([
            v.pos.clone().add(new THREE.Vector3(0, 1.5, 0)),
            tv.pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
          ]);
          const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x6ee86e, transparent: true, opacity: 0.9 }));
          addEffect(line, 0.35, (fx, k) => { fx.mesh.material.opacity = 0.9 * (1 - k); });
        }
        break;
      }
      case 'edmg': {
        // dano validado pela simulação — todos os clientes veem o número
        if (!v) break;
        const mine = ev.pid === myPid();
        if (ev.crit) floatText(v.pos, `💥 ${ev.amount}`, mine ? '#ff8a2a' : '#9ad0ff', 25);
        else floatText(v.pos, ev.amount, mine ? '#ffd24a' : '#9ad0ff', 18);
        for (const m of v.model.mats) m.emissive.setHex(0x661111);
        setTimeout(() => { for (const m of v.model.mats) m.emissive.setHex(0x000000); }, 120);
        if (mine) {
          player.lastCombat = time;
          player.mult = Math.min(99, player.mult + 1);
          player.multT = 5;
          const el = $('mult');
          el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
          // você vira o que você usa: cada golpe treina a disciplina correspondente
          const dk = ev.src === 'ranged' ? 'skl' : ev.src === 'magic' ? 'wil' : 'str';
          gainDiscXP(dk, Math.round(ev.amount * 0.6));
        }
        break;
      }
      case 'bolt': {
        const a = new THREE.Vector3(ev.ax, terrainHeight(ev.ax, ev.az) + ev.ay, ev.az);
        const b = new THREE.Vector3(ev.bx, terrainHeight(ev.bx, ev.bz) + ev.by, ev.bz);
        lightningBolt(a, b);
        break;
      }
      case 'boom': {
        const p = new THREE.Vector3(ev.x, terrainHeight(ev.x, ev.z) + 1, ev.z);
        explosion(p);
        beep(100, 0.15, 'sawtooth', 0.05);
        break;
      }
      case 'shock': {
        const p = new THREE.Vector3(ev.x, terrainHeight(ev.x, ev.z), ev.z);
        ringEffect(p, 0xbfe0ff, 9);
        break;
      }
      case 'eleap':
        if (v) floatText(v.pos, '🐺 SALTO!', '#ff8a5a', 16);
        break;
      case 'eland':
        if (v) { ringEffect(v.pos, 0x8a4a4a, 5); noiseBurst(0.2, 0.07); shake = 0.4; }
        if (ev.pid === myPid() && ev.dmg > 0) damagePlayer(ev.dmg);
        break;
      case 'edie':
        if (v) onEnemyDeath(v, ev.killerPid === myPid(), ev.killerPid);
        break;
    }
  }
}

function getLeader() { return enemies.find((e) => e.isLeader); }
function requestLeaderSurrender() {
  if (net.connected) sendMsg({ t: 'surrender' });
  else localSim.surrenderLeader();
}
function requestSpawnBalverine() {
  if (net.connected) sendMsg({ t: 'spawnBalverine' });
  else localSim.spawnBalverine();
  noiseBurst(0.6, 0.1);
  beep(70, 0.9, 'sawtooth', 0.09, -25);
  centerMsg('Um uivo ecoa pelas colinas…', 'O Balverine desperta na Floresta Sombria');
}

// selection ring
const selRing = new THREE.Mesh(
  new THREE.RingGeometry(0.9, 1.15, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd24a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
);
selRing.rotation.x = -Math.PI / 2;
selRing.visible = false;
scene.add(selRing);
let target = null;

// ============================================================ fx / floating text / orbs
const effects = [];
function addEffect(mesh, dur, update) {
  scene.add(mesh);
  effects.push({ mesh, t: 0, dur, update });
}
const dmgTexts = [];
function floatText(worldPos, text, color = '#fff', size = 17) {
  const el = document.createElement('div');
  el.className = 'dmg';
  el.style.color = color;
  el.style.fontSize = size + 'px';
  el.textContent = text;
  $('dmgs').appendChild(el);
  dmgTexts.push({ el, pos: worldPos.clone().add(new THREE.Vector3((Math.random() - 0.5), 2.2, (Math.random() - 0.5) * 0.5)), t: 0 });
}
function ringEffect(pos, color = 0x7fb0ff, maxR = 6) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.8, 32),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2;
  m.position.copy(pos).add(new THREE.Vector3(0, 0.15, 0));
  addEffect(m, 0.5, (fx, k) => { fx.mesh.scale.setScalar(1 + k * maxR); fx.mesh.material.opacity = 0.85 * (1 - k); });
}
function explosion(pos, color = 0xff7a1a) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  m.position.copy(pos);
  addEffect(m, 0.4, (fx, k) => { fx.mesh.scale.setScalar(1 + k * 4); fx.mesh.material.opacity = 0.9 * (1 - k); });
}
function arrowStreak(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xcaa46a, transparent: true, opacity: 1 }));
  addEffect(line, 0.18, (fx, k) => { fx.mesh.material.opacity = 1 - k; });
}

function lightningBolt(from, to) {
  const pts = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const p = from.clone().lerp(to, i / n);
    if (i > 0 && i < n) {
      p.x += (Math.random() - 0.5) * 1.2;
      p.y += (Math.random() - 0.5) * 1.2;
      p.z += (Math.random() - 0.5) * 1.2;
    }
    pts.push(p);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 1 }));
  addEffect(line, 0.25, (fx, k) => { fx.mesh.material.opacity = 1 - k; });
}

// experience orbs & coins (very Fable)
const orbs = [];
const orbGeoXp = new THREE.SphereGeometry(0.14, 8, 8);
const orbMatXp = new THREE.MeshBasicMaterial({ color: 0x9aff4a });
const coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12);
const coinMat = new THREE.MeshBasicMaterial({ color: 0xffd24a });
function dropOrbs(pos, xp, gold) {
  const n = clamp(Math.round(xp / 14), 2, 6);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(orbGeoXp, orbMatXp);
    m.position.copy(pos).add(new THREE.Vector3(0, 1, 0));
    scene.add(m);
    const a = Math.random() * Math.PI * 2;
    orbs.push({ mesh: m, kind: 'xp', value: xp / n, t: 0, vel: new THREE.Vector3(Math.cos(a) * 3, 4 + Math.random() * 2, Math.sin(a) * 3) });
  }
  if (gold > 0) {
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.position.copy(pos).add(new THREE.Vector3(0, 1, 0));
    scene.add(m);
    orbs.push({ mesh: m, kind: 'gold', value: gold, t: 0, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 2) });
  }
}
function updateOrbs(dt) {
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    o.t += dt;
    if (o.kind === 'gold') o.mesh.rotation.y += dt * 6;
    if (o.t < 0.45) {
      o.vel.y -= 12 * dt;
      o.mesh.position.addScaledVector(o.vel, dt);
      const gy = terrainHeight(o.mesh.position.x, o.mesh.position.z) + 0.2;
      if (o.mesh.position.y < gy) o.mesh.position.y = gy;
    } else {
      const dest = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
      const d = dest.sub(o.mesh.position);
      const dist = d.length();
      if (dist < 0.8) {
        if (o.kind === 'xp') { gainXP(Math.round(o.value)); beep(880 + Math.random() * 300, 0.08, 'sine', 0.03); }
        else { player.gold += o.value; floatText(player.pos, `+${o.value} 🪙`, '#ffd24a', 15); beep(1250, 0.09, 'sine', 0.04); }
        scene.remove(o.mesh);
        orbs.splice(i, 1);
        continue;
      }
      o.mesh.position.addScaledVector(d.normalize(), Math.min(dist, (6 + o.t * 14) * dt));
    }
  }
}

const projectiles = [];

// ============================================================ combat
let time = 0;
let shake = 0;

// dano agora é 100% decidido pela simulação (CombatSim) — o cliente só renderiza
// os eventos 'edmg'/'boom'/'bolt'/'shock' que chegam dela (veja processSimEvents)

// chamado via evento 'edie' da simulação; `mine` = fui eu quem matou
function onEnemyDeath(e, mine, killerPid) {
  if (target === e) setTarget(null);
  beep(120, 0.3, 'triangle', 0.06, -60);
  if (e.isLeader) {
    quests.q2.leaderResolved = true;
    quests.q2.choice = quests.q2.choice || 'killed';
    checkQ2Done(); updateQuestUI(); saveGame();
  }
  if (mine) {
    player.kills++;
    const gold = e.def.gold[0] + Math.round(Math.random() * (e.def.gold[1] - e.def.gold[0]));
    dropOrbs(e.pos, e.def.xp, gold);
    if (e.def.renown) gainRenown(e.def.renown);
    const drop = rollDrop(e.type, e.def.lvl);
    if (drop) addItem(drop);
    questCredit(e);
  } else if (killerPid > 0 && player.pos.distanceTo(e.pos) < 30) {
    // caçada em grupo: aliado perto ganha metade do XP e crédito de missão
    const share = Math.round(e.def.xp * 0.5);
    gainXP(share);
    floatText(player.pos, `+${share} XP (grupo)`, '#b06ae8', 13);
    questCredit(e);
  }
}

function questCredit(e) {
  if (e.type === 'besouro' && quests.q1.state === 'active' && quests.q1.count < quests.q1.goal) {
    quests.q1.count++;
    floatText(e.pos, `Besouros: ${quests.q1.count}/${quests.q1.goal}`, '#8fd0ff', 13);
    if (quests.q1.count >= quests.q1.goal) { quests.q1.state = 'done'; centerMsg('Besouros no Pomar', 'Retorne ao Mestre da Guilda'); }
    updateQuestUI(); saveGame();
  }
  if (e.type === 'bandido' && quests.q2.state === 'active' && quests.q2.count < quests.q2.goal) {
    quests.q2.count++;
    floatText(e.pos, `Bandidos: ${quests.q2.count}/${quests.q2.goal}`, '#8fd0ff', 13);
    if (quests.q2.count >= quests.q2.goal) {
      const ldr = getLeader();
      if (ldr && ldr.state !== 'dead') {
        requestLeaderSurrender();
        centerMsg('O chefe dos bandidos se rende!', 'Aproxime-se e decida o destino dele');
      }
    }
    checkQ2Done(); updateQuestUI(); saveGame();
  }
  if (e.type === 'balverine' && quests.q3.state === 'active') {
    quests.q3.count = 1;
    quests.q3.state = 'done';
    centerMsg('O Balverine foi derrotado!', 'Retorne ao Mestre da Guilda');
    updateQuestUI(); saveGame();
  }
}
function checkQ2Done() {
  if (quests.q2.state === 'active' && quests.q2.count >= quests.q2.goal && quests.q2.leaderResolved) {
    quests.q2.state = 'done';
    centerMsg('O Acampamento dos Bandidos', 'Retorne a Whisper na vila');
  }
}

function damagePlayer(dmg, srcName = '') {
  if (player.dead) return;
  if (player.invulnT > 0) {
    floatText(player.pos, 'esquivou!', '#e8d05a', 15);
    return;
  }
  dmg = Math.max(1, Math.round(dmg * (1 - damageReduction())));
  player.hp -= dmg;
  player.mult = 0;
  player.lastCombat = time;
  floatText(player.pos, '-' + dmg, '#ff5a5a', 16);
  shake = Math.min(0.5, shake + dmg * 0.01);
  beep(200, 0.06, 'square', 0.04);
  if (player.hp <= 0) { player.hp = 0; playerDie(); }
}

function tryRoll() {
  if (player.dead || !started || player.rollT > 0 || !player.onGround) return;
  const cost = rollCost();
  if (player.stam < cost) { errorMsg('Sem fôlego!'); return; }
  player.stam -= cost;
  player.rollT = 0.35;
  player.invulnT = 0.45;
  player.rollDirX = player.lastDirX;
  player.rollDirZ = player.lastDirZ;
  player.lastCombat = time;
  noiseBurst(0.12, 0.04);
  beep(300, 0.12, 'sine', 0.04, -120);
}

function gainXP(amt) {
  player.xp += amt;
  while (player.xp >= xpToNext(player.level)) {
    player.xp -= xpToNext(player.level);
    player.level++;
    recomputeMaxes();
    player.hp = player.maxHp; player.will = player.maxWill;
    centerMsg(`Nível ${player.level}!`, 'Seu poder cresce…');
    ringEffect(player.pos, 0xffd24a, 5);
    beep(523, 0.15, 'sine', 0.07); setTimeout(() => beep(659, 0.15, 'sine', 0.07), 150);
    setTimeout(() => beep(784, 0.3, 'sine', 0.07), 300);
    saveGame();
  }
}
function gainRenown(amt) {
  const before = playerTitle();
  player.renown += amt;
  const after = playerTitle();
  if (after !== before) {
    toast(`🏅 Novo título: ${after}`);
    beep(660, 0.2, 'sine', 0.06); setTimeout(() => beep(880, 0.3, 'sine', 0.06), 200);
  }
}
function changeMorality(amt) {
  player.morality = clamp(player.morality + amt, -100, 100);
  if (amt > 0) floatText(player.pos, `+${amt} Bondade 😇`, '#ffe9a8', 14);
  else floatText(player.pos, `${amt} Maldade 😈`, '#ff8a8a', 14);
  updateMoralityVisuals();
}

// ============================================================ abilities
// dano/alcance/cooldown são decididos pelo CombatSim (servidor online, local solo);
// aqui ficam só a pré-validação de UI e os efeitos imediatos do próprio herói
const combatLocal = new CombatSim(localSim);
function castAbility(key, tgt) {
  if (net.connected) {
    sendMsg({ t: 'cast', key, targetId: tgt ? tgt.id : undefined });
  } else {
    combatLocal.cast(
      { id: 0, x: player.pos.x, z: player.pos.z, ...combatStats() },
      key, tgt ? tgt.id : undefined,
    );
  }
}

const abilities = [
  { ...ABILITIES.golpe, name: 'Golpe',
    use(t) {
      if (equippedStats().kind === 'bow') {
        // flecha é só visual — o dano chega via evento edmg
        const arrow = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.55, 4),
          new THREE.MeshBasicMaterial({ color: 0xd8c8a0 })
        );
        arrow.position.copy(player.pos).add(new THREE.Vector3(0, 1.8, 0));
        scene.add(arrow);
        projectiles.push({ mesh: arrow, target: t, speed: ARROW_SPEED, orient: true });
        beep(900, 0.08, 'triangle', 0.05, -300);
      } else {
        player.swingT = 0.35;
        beep(160, 0.08, 'square', 0.06);
      }
      castAbility('golpe', t);
    } },
  { ...ABILITIES.bola, name: 'Bola de Fogo',
    use(t) {
      // projétil é só visual — o dano chega via evento 'boom'/'edmg' da simulação
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
      m.position.copy(player.pos).add(new THREE.Vector3(0, 1.8, 0));
      scene.add(m);
      projectiles.push({ mesh: m, target: t, speed: FIREBALL_SPEED });
      beep(520, 0.18, 'sawtooth', 0.05, -260);
      castAbility('bola', t);
    } },
  { ...ABILITIES.relampago, name: 'Relâmpago',
    use(t) {
      beep(1400, 0.2, 'sawtooth', 0.05, -900);
      noiseBurst(0.15, 0.05);
      castAbility('relampago', t); // raios desenhados pelos eventos 'bolt'
    } },
  { ...ABILITIES.empurrao, name: 'Empurrão',
    use() {
      beep(90, 0.35, 'sawtooth', 0.08, -40);
      shake = 0.25;
      castAbility('empurrao', null); // anel desenhado pelo evento 'shock'
    } },
  { ...ABILITIES.tempolento, name: 'Tempo Lento',
    use() {
      player.slowT = 6; // overlay visual local
      castAbility('tempolento', null);
      beep(50, 1.2, 'sine', 0.09, 40);
      floatText(player.pos, '⏳ O tempo desacelera…', '#9ad0ff', 16);
    } },
  { ...ABILITIES.cura, name: 'Cura', // cura é 100% local (só afeta o próprio herói)
    use() {
      const amt = Math.round(30 + player.level * 7);
      player.hp = Math.min(player.maxHp, player.hp + amt);
      floatText(player.pos, '+' + amt, '#6fdc6f', 19);
      ringEffect(player.pos, 0x6fdc6f, 3);
      beep(700, 0.25, 'sine', 0.06, 200);
    } },
];
const cooldowns = [0, 0, 0, 0, 0, 0];
let gcd = 0;
const slotEls = [...document.querySelectorAll('.slot.ab')];

function errorMsg(text) {
  floatText(player.pos, text, '#ff6a6a', 14);
  beep(140, 0.1, 'square', 0.04);
}
function tryAbility(i) {
  if (player.dead || !started) return;
  const ab = abilities[i];
  if (gcd > 0 || cooldowns[i] > 0) return;
  if (player.will < ab.cost) { errorMsg('Vontade insuficiente'); return; }
  if (ab.needTarget) {
    if (!target || target.state === 'dead' || target.state === 'surrender') { errorMsg('Você não tem um alvo'); return; }
    const d = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
    const range = i === 0 ? equippedStats().range : ab.range; // golpe usa o alcance da arma
    if (d > range) { errorMsg('Fora de alcance'); return; }
    heroModel.group.rotation.y = Math.atan2(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
  }
  player.will -= ab.cost;
  player.lastCombat = time;
  cooldowns[i] = ab.cd;
  gcd = 1.0;
  ab.use(target);
  slotEls[i].classList.add('flash');
  setTimeout(() => slotEls[i].classList.remove('flash'), 180);
}
slotEls.forEach((el) => el.addEventListener('click', () => tryAbility(+el.dataset.i)));

function usePotion(kind) {
  if (player.dead || !started) return;
  if (player.potions[kind] <= 0) { errorMsg('Sem poções!'); return; }
  player.potions[kind]--;
  if (kind === 'hp') {
    const amt = Math.round(player.maxHp * 0.6);
    player.hp = Math.min(player.maxHp, player.hp + amt);
    floatText(player.pos, '+' + amt, '#6fdc6f', 19);
  } else {
    const amt = Math.round(player.maxWill * 0.7);
    player.will = Math.min(player.maxWill, player.will + amt);
    floatText(player.pos, '+' + amt + ' vontade', '#7fb0ff', 17);
  }
  beep(500, 0.2, 'sine', 0.05, 150);
}
document.querySelectorAll('.slot.pot').forEach((el) => el.addEventListener('click', () => usePotion(el.dataset.p)));

// ============================================================ UI helpers
let msgTimer = null;
function centerMsg(main, sub = '') {
  $('mainMsg').textContent = main;
  $('subMsg').textContent = sub;
  $('centerMsg').style.opacity = 1;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { $('centerMsg').style.opacity = 0; }, 3200);
}
function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast panel';
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .8s'; el.style.opacity = 0; setTimeout(() => el.remove(), 900); }, 4200);
}

function setTarget(e) {
  target = e;
  const tf = $('targetFrame');
  if (!e) { tf.style.display = 'none'; selRing.visible = false; return; }
  tf.style.display = 'flex';
  $('tname').textContent = e.def.name;
  $('tlvl').textContent = e.def.lvl;
  $('tportrait').childNodes[0].textContent = e.def.icon;
  selRing.visible = true;
  selRing.scale.setScalar(e.type === 'balverine' ? 1.8 : e.type === 'besouro' ? 0.8 : 1.1);
}

function updateQuestUI() {
  const lines = [];
  if (quests.q1.state === 'active') lines.push(`<b>Besouros no Pomar</b><br>Besouros mortos: <span class="${quests.q1.count >= quests.q1.goal ? 'done' : ''}">${quests.q1.count}/${quests.q1.goal}</span>`);
  if (quests.q1.state === 'done') lines.push(`<b>Besouros no Pomar</b><br><span class="done">Retorne ao Mestre da Guilda</span>`);
  if (quests.q2.state === 'active') {
    let l = `<b>O Acampamento dos Bandidos</b><br>Bandidos: <span class="${quests.q2.count >= quests.q2.goal ? 'done' : ''}">${quests.q2.count}/${quests.q2.goal}</span>`;
    if (quests.q2.count >= quests.q2.goal && !quests.q2.leaderResolved) l += `<br>Decida o destino do chefe`;
    lines.push(l);
  }
  if (quests.q2.state === 'done') lines.push(`<b>O Acampamento dos Bandidos</b><br><span class="done">Retorne a Whisper</span>`);
  if (quests.q3.state === 'active') lines.push(`<b>A Fera da Floresta</b><br>Balverine: <span>${quests.q3.count}/1</span>`);
  if (quests.q3.state === 'done') lines.push(`<b>A Fera da Floresta</b><br><span class="done">Retorne ao Mestre da Guilda</span>`);
  $('questTracker').style.display = lines.length ? 'block' : 'none';
  $('questText').innerHTML = lines.join('<hr style="border-color:rgba(138,109,47,.3);margin:6px 0">');

  // quest markers
  guildmaster.marker.visible = quests.q1.state === 'available' || quests.q1.state === 'done' ||
    (quests.q2.state === 'completed' && (quests.q3.state === 'available' || quests.q3.state === 'locked')) || quests.q3.state === 'done';
  guildmaster.marker.material = makeTextSprite(quests.q1.state === 'done' || quests.q3.state === 'done' ? '?' : '!').material;
  whisper.marker.visible = (quests.q1.state === 'completed' && quests.q2.state !== 'completed' && quests.q2.state !== 'active') || quests.q2.state === 'done';
  whisper.marker.material = makeTextSprite(quests.q2.state === 'done' ? '?' : '!').material;
}

// ============================================================ dialogs
const dialog = $('dialog');
function showDialog(title, text, reward, buttons) {
  $('dTitle').textContent = title;
  $('dText').textContent = text;
  $('dReward').textContent = reward || '';
  const bc = $('dButtons');
  bc.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    if (b.cls) btn.className = b.cls;
    btn.onclick = () => { dialog.style.display = 'none'; b.cb && b.cb(); };
    bc.appendChild(btn);
  }
  dialog.style.display = 'block';
}
const closeBtn = { label: 'Fechar' };

function talkTo(npc) {
  if (npc.role === 'guildmaster') {
    if (quests.q1.state === 'available') {
      showDialog('Besouros no Pomar',
        'Bem-vindo, jovem herói! Besouros gigantes infestaram o pomar a leste. Uma primeira missão digna da Guilda: elimine 8 deles.',
        'Recompensa: 120 XP, 60 ouro, +6 renome',
        [{ label: 'Aceitar missão', cb: () => { quests.q1.state = 'active'; updateQuestUI(); centerMsg('Nova missão', 'Besouros no Pomar'); saveGame(); } }, closeBtn]);
    } else if (quests.q1.state === 'active') {
      showDialog('Mestre da Guilda', `Os besouros ainda rastejam pelo pomar… (${quests.q1.count}/${quests.q1.goal})`, '', [closeBtn]);
    } else if (quests.q1.state === 'done') {
      showDialog('Besouros no Pomar', 'Esplêndido! O pomar está a salvo. A Guilda reconhece o seu valor.', 'Recompensa: 120 XP, 60 ouro, +6 renome',
        [{ label: 'Completar missão', cb: () => {
          quests.q1.state = 'completed';
          gainXP(120); player.gold += 60; gainRenown(6); changeMorality(5);
          centerMsg('Missão completa!', '+120 XP, +60 ouro');
          beep(660, 0.15, 'sine', 0.06); setTimeout(() => beep(990, 0.25, 'sine', 0.06), 160);
          updateQuestUI(); saveGame();
        } }]);
    } else if (quests.q2.state === 'completed' && (quests.q3.state === 'locked' || quests.q3.state === 'available')) {
      showDialog('A Fera da Floresta',
        'Há relatos de um Balverine ancião rondando a Floresta Sombria ao sul. Poucos heróis sobrevivem a um balverine… mas você não é como os outros. Cace-o.',
        'Recompensa: 500 XP, 250 ouro, +25 renome',
        [{ label: 'Aceitar missão', cb: () => { quests.q3.state = 'active'; requestSpawnBalverine(); updateQuestUI(); saveGame(); } }, closeBtn]);
    } else if (quests.q3.state === 'active') {
      showDialog('Mestre da Guilda', 'O Balverine o aguarda na Floresta Sombria, ao sul. Vá à noite, se tiver coragem…', '', [closeBtn]);
    } else if (quests.q3.state === 'done') {
      showDialog('A Fera da Floresta', 'Pelos Antigos… você realmente o derrotou! Albion lembrará do seu nome, herói.', 'Recompensa: 500 XP, 250 ouro, +25 renome',
        [{ label: 'Completar missão', cb: () => {
          quests.q3.state = 'completed';
          gainXP(500); player.gold += 250; gainRenown(25); changeMorality(8);
          centerMsg('Herói de Pedravento!', 'Você completou todas as missões — por enquanto…');
          updateQuestUI(); saveGame();
        } }]);
    } else if (quests.q3.state === 'completed') {
      showDialog('Mestre da Guilda', 'Descanse, herói. Mas fique atento: Albion sempre precisa de heróis. (Sua vida está baixa? Você tem poções?)', '', [closeBtn]);
    } else {
      showDialog('Mestre da Guilda', 'Continue treinando, jovem. Grandes feitos o aguardam.', '', [closeBtn]);
    }
  } else if (npc.role === 'whisper') {
    if (quests.q1.state !== 'completed' && quests.q2.state === 'locked') {
      showDialog('Whisper', 'Ei, novato! Prove seu valor com o Mestre da Guilda primeiro, depois falamos de trabalho de verdade.', '', [closeBtn]);
    } else if (quests.q2.state === 'locked' || quests.q2.state === 'available') {
      showDialog('O Acampamento dos Bandidos',
        'Bandidos montaram acampamento a noroeste e andam saqueando viajantes. Derrote 5 deles — e cuidado com o chefe, o Rufião. O destino dele… será escolha sua.',
        'Recompensa: 250 XP, 120 ouro, +10 renome',
        [{ label: 'Aceitar missão', cb: () => { quests.q2.state = 'active'; updateQuestUI(); centerMsg('Nova missão', 'O Acampamento dos Bandidos'); saveGame(); } }, closeBtn]);
    } else if (quests.q2.state === 'active') {
      showDialog('Whisper', `Os bandidos ainda saqueiam a estrada… (${quests.q2.count}/${quests.q2.goal})`, '', [closeBtn]);
    } else if (quests.q2.state === 'done') {
      const extra = quests.q2.choice === 'spared' ? 'Você poupou o Rufião? Misericórdia é coisa rara em Albion…' :
                    'Então o Rufião está morto. Eficaz… e sombrio.';
      showDialog('O Acampamento dos Bandidos', `A estrada está segura! ${extra}`, 'Recompensa: 250 XP, 120 ouro, +10 renome',
        [{ label: 'Completar missão', cb: () => {
          quests.q2.state = 'completed';
          gainXP(250); player.gold += 120; gainRenown(10);
          centerMsg('Missão completa!', '+250 XP, +120 ouro');
          updateQuestUI(); saveGame();
        } }]);
    } else {
      showDialog('Whisper', 'Nada mal para um novato, hein? Até a próxima caçada.', '', [closeBtn]);
    }
  } else if (npc.role === 'vendor') {
    openShop();
  } else {
    const good = player.morality >= 40, evil = player.morality <= -40;
    const lines = good ? ['Que auréola magnífica!', 'Um verdadeiro herói entre nós!', 'Abençoado seja!'] :
                  evil ? ['P-por favor, não me machuque!', 'Esses chifres… socorro!', 'Fique longe de mim!'] :
                  ['Bom dia, viajante.', 'Dizem que há bandidos na estrada…', 'As galinhas andam nervosas hoje.'];
    showDialog(npc.name, lines[Math.floor(Math.random() * lines.length)], '', [closeBtn]);
  }
}

function openShop() {
  const buy = (cost, cb) => () => {
    if (player.gold < cost) { errorMsg('Ouro insuficiente'); openShop(); return; }
    player.gold -= cost;
    cb();
    beep(1250, 0.09, 'sine', 0.05);
    openShop();
  };
  const buttons = [
    { label: '🧪 Poção de Vida — 50 🪙', cb: buy(50, () => { player.potions.hp++; toast('Comprou: Poção de Vida'); }) },
    { label: '🔮 Poção de Vontade — 60 🪙', cb: buy(60, () => { player.potions.will++; toast('Comprou: Poção de Vontade'); }) },
  ];
  for (const wk of ['machado', 'arco_cacador', 'cajado_arcano']) {
    const w = WEAPONS[wk];
    buttons.push({ label: `${w.icon} ${w.name} — ${w.price} 🪙`, cb: buy(w.price, () => addItem({ wpn: wk, rar: 'comum' })) });
  }
  for (const ak of ['couro_colete', 'ferro_peitoral']) {
    const a = ARMORS[ak];
    buttons.push({ label: `${a.icon} ${a.name} — ${a.price} 🪙`, cb: buy(a.price, () => addItem({ arm: ak, rar: 'comum' })) });
  }
  if (!player.luckCharm) buttons.push({ label: '🍀 Amuleto da Sorte — 300 🪙 (+8% dano)', cb: buy(300, () => { player.luckCharm = true; toast('Comprou: Amuleto da Sorte (+8% dano)'); saveGame(); }) });
  buttons.push(closeBtn);
  showDialog('Barnum, o Mercador',
    `"Uma pechincha fabulosa, amigo! Palavra de Barnum." — Você tem ${player.gold} 🪙`,
    '', buttons);
}

function confrontLeader() {
  showDialog('O Rufião se rende',
    '"Espere! Eu me rendo! Éramos apenas famintos… Poupe-me e juro que deixamos as colinas para sempre!"',
    'Uma escolha o define, herói.',
    [
      { label: '😇 Poupar', cls: 'good', cb: () => {
        changeMorality(20);
        quests.q2.leaderResolved = true; quests.q2.choice = 'spared';
        toast('Você poupou o Rufião');
        if (net.connected) sendMsg({ t: 'leaderResolve', spare: true });
        else localSim.resolveLeader(true, 0);
        checkQ2Done(); updateQuestUI(); saveGame();
      } },
      { label: '😈 Executar', cls: 'evil', cb: () => {
        changeMorality(-20);
        quests.q2.choice = 'executed';
        player.gold += 50;
        toast('+50 🪙 dos bolsos do Rufião');
        if (net.connected) sendMsg({ t: 'leaderResolve', spare: false });
        else localSim.resolveLeader(false, 0);
        saveGame();
      } },
    ]);
}

// ============================================================ inventory
function addItem(item) {
  const d = itemDef(item), rar = rarityOf(item.rar);
  if (!d) return;
  if (player.inventory.length >= 12) {
    const gold = sellPrice(item);
    player.gold += gold;
    toast(`🎒 Inventário cheio — ${d.name} vendida (+${gold} 🪙)`);
    return;
  }
  player.inventory.push(item);
  toast(`🎁 Saque: ${d.icon} ${d.name} (${rar.name})`);
  beep(980, 0.12, 'sine', 0.05); setTimeout(() => beep(1240, 0.16, 'sine', 0.05), 110);
  saveGame();
}

const SLOT_LABEL = { head: 'Cabeça', chest: 'Peito', legs: 'Pernas', boots: 'Botas' };

function itemStatsText(item) {
  const rar = rarityOf(item.rar);
  if (item.wpn) {
    const w = WEAPONS[item.wpn];
    const kindTxt = w.kind === 'bow' ? 'treina Habilidade' : w.kind === 'staff' ? 'treina Vontade' : 'treina Força';
    const boost = w.spellBoost ? ` · magia +${Math.round((w.spellBoost - 1) * 100)}%` : '';
    return `dano ×${(w.mult * rar.mult).toFixed(2)} · alcance ${w.range}${boost} · ${kindTxt}`;
  }
  const a = ARMORS[item.arm];
  return `${SLOT_LABEL[a.slot]} · defesa ${(a.def * rar.mult).toFixed(1)} · ${a.weight === 0 ? 'leve (rolamento barato)' : 'pesada (rolamento cansa)'}`;
}

function equipItem(item, idx) {
  if (item.wpn) {
    const old = player.equipped;
    player.equipped = item;
    player.inventory.splice(idx, 1);
    player.inventory.push(old);
  } else {
    const slot = ARMORS[item.arm].slot;
    const old = player.armor[slot];
    player.armor[slot] = item;
    player.inventory.splice(idx, 1);
    if (old) player.inventory.push(old);
  }
  updateHeroBody();
  renderInventory();
  saveGame();
  beep(600, 0.1, 'sine', 0.05);
}

function invRow(item, isEquipped, idx) {
  const d = itemDef(item);
  if (!d) return document.createElement('div');
  const rar = rarityOf(item.rar);
  const row = document.createElement('div');
  row.className = 'invRow';
  row.innerHTML = `<span class="iicon">${d.icon}</span><div class="iinfo">
    <div class="iname" style="color:${rar.color}">${d.name} <small>(${rar.name})</small></div>
    <div class="istats">${itemStatsText(item)}</div></div>`;
  if (isEquipped) {
    const tag = document.createElement('span');
    tag.className = 'equipped';
    tag.textContent = 'equipada';
    row.appendChild(tag);
  } else {
    const bE = document.createElement('button');
    bE.textContent = 'Equipar';
    bE.onclick = () => equipItem(item, idx);
    const bS = document.createElement('button');
    bS.textContent = `Vender ${sellPrice(item)}🪙`;
    bS.onclick = () => {
      player.gold += sellPrice(item);
      player.inventory.splice(idx, 1);
      renderInventory();
      saveGame();
      beep(1250, 0.09, 'sine', 0.05);
    };
    row.appendChild(bE);
    row.appendChild(bS);
  }
  return row;
}
function renderInventory() {
  const list = $('invList');
  list.innerHTML = '';
  list.appendChild(invRow(player.equipped, true, -1));
  for (const slotItem of Object.values(player.armor)) {
    if (slotItem) list.appendChild(invRow(slotItem, true, -1));
  }
  player.inventory.forEach((it, i) => list.appendChild(invRow(it, false, i)));
  if (!player.inventory.length) {
    const empty = document.createElement('div');
    empty.className = 'istats';
    empty.style.cssText = 'padding:8px 4px;color:#a89468;font-family:Arial;font-size:12px';
    empty.textContent = 'Mochila vazia — derrote inimigos para saquear armas e armaduras.';
    list.appendChild(empty);
  }
}
function toggleInventory() {
  const p = $('invPanel');
  if (p.style.display === 'block') p.style.display = 'none';
  else { renderInventory(); p.style.display = 'block'; }
}

// ============================================================ character panel
function updateCharPanel() {
  $('cTitle').textContent = playerTitle() + (player.morality <= -40 ? ' Temível' : player.morality >= 40 ? ' Bondoso' : '');
  $('cLvl').textContent = player.level;
  $('cXp').textContent = `${Math.floor(player.xp)} / ${xpToNext(player.level)}`;
  $('cGold').textContent = player.gold;
  $('cRenown').textContent = player.renown;
  $('cKicks').textContent = player.kicks;
  $('cKills').textContent = player.kills;
  $('cDef').textContent = `${totalDefense().toFixed(0)} (${Math.round(damageReduction() * 100)}% redução)`;
  $('cWeight').textContent = totalWeight() === 0 ? 'leve' : `${totalWeight()} (rolamento custa ${Math.round(rollCost())})`;
  $('dStrLvl').textContent = player.disc.str.lvl;
  $('dSklLvl').textContent = player.disc.skl.lvl;
  $('dWilLvl').textContent = player.disc.wil.lvl;
  $('dStrFill').style.transform = `scaleX(${player.disc.str.xp / discXpToNext(player.disc.str.lvl)})`;
  $('dSklFill').style.transform = `scaleX(${player.disc.skl.xp / discXpToNext(player.disc.skl.lvl)})`;
  $('dWilFill').style.transform = `scaleX(${player.disc.wil.xp / discXpToNext(player.disc.wil.lvl)})`;
  $('moralMarker').style.left = `${50 + player.morality / 2}%`;
}
function toggleCharPanel() {
  const p = $('charPanel');
  if (p.style.display === 'block') p.style.display = 'none';
  else { updateCharPanel(); p.style.display = 'block'; }
}

// ============================================================ interactions
function nearestInteract() {
  let best = null;
  const consider = (dist, max, label, cb) => {
    if (dist < max && (!best || dist < best.dist)) best = { dist, label, cb };
  };
  for (const c of chickens) {
    if (c.state === 'fly') continue;
    consider(c.pos.distanceTo(player.pos), 2.6, 'Chutar a galinha 🐔', () => kickChicken(c));
  }
  for (const ch of chests) {
    if (ch.opened) continue;
    consider(ch.pos.distanceTo(player.pos), 3.2, 'Abrir o baú', () => openChest(ch));
  }
  for (const n of npcs) {
    consider(n.pos.distanceTo(player.pos), 5.5, `Falar com ${n.name}`, () => talkTo(n));
  }
  const ldr = getLeader();
  if (ldr && ldr.state === 'surrender') {
    consider(ldr.pos.distanceTo(player.pos), 5, 'Decidir o destino do Rufião', confrontLeader);
  }
  return best;
}

function kickChicken(c) {
  const dir = c.pos.clone().sub(player.pos).setY(0).normalize();
  if (dir.lengthSq() < 0.01) dir.set(Math.sin(heroModel.group.rotation.y), 0, Math.cos(heroModel.group.rotation.y));
  c.state = 'fly';
  c.vel.copy(dir.multiplyScalar(10 + Math.random() * 4));
  c.vel.y = 8 + Math.random() * 3;
  c.spin = 12 + Math.random() * 8;
  player.kicks++;
  player.swingT = 0.3;
  changeMorality(-1);
  beep(300, 0.12, 'square', 0.06, 250);
  setTimeout(() => beep(1500, 0.15, 'sawtooth', 0.05, -600), 80);
  floatText(c.pos, '🐔!!', '#fff', 18);
  if (player.kicks >= 10 && !player.achKick) {
    player.achKick = true;
    toast('🏅 Título ganho: Chuta-Galinhas');
    gainRenown(5);
  }
  saveGame();
}

function openChest(ch) {
  ch.opened = true;
  beep(180, 0.35, 'sawtooth', 0.04, -70);
  const parts = [];
  if (ch.loot.gold) { player.gold += ch.loot.gold; parts.push(`${ch.loot.gold} 🪙`); }
  if (ch.loot.hpPot) { player.potions.hp += ch.loot.hpPot; parts.push('Poção de Vida'); }
  if (ch.loot.willPot) { player.potions.will += ch.loot.willPot; parts.push('Poção de Vontade'); }
  toast(`Baú aberto: ${parts.join(', ')}`);
  ringEffect(ch.pos, 0xffd24a, 3);
  beep(1050, 0.12, 'sine', 0.05); setTimeout(() => beep(1350, 0.18, 'sine', 0.05), 120);
}

// ============================================================ input
const keys = {};
let camYaw = 0.6, camPitch = 0.36, camDist = 11;

addEventListener('keydown', (ev) => {
  if (!started) return;
  if (chatOpen) return; // digitando no chat — o input trata as teclas
  if (ev.code === 'Enter') { openChat(); return; }
  if (ev.code === 'Tab') {
    ev.preventDefault();
    let best = null, bd = 45;
    for (const e of enemies) {
      if (e.state === 'dead' || e.state === 'surrender') continue;
      const d = e.pos.distanceTo(player.pos);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { setTarget(best); beep(880, 0.05, 'sine', 0.03); }
    return;
  }
  if (ev.code === 'Escape') { setTarget(null); dialog.style.display = 'none'; $('charPanel').style.display = 'none'; $('invPanel').style.display = 'none'; return; }
  if (ev.code === 'KeyF') { const it = nearestInteract(); if (it) it.cb(); return; }
  if (ev.code === 'KeyC') { toggleCharPanel(); return; }
  if (ev.code === 'KeyI') { toggleInventory(); return; }
  if (ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') { tryRoll(); return; }
  if (ev.code === 'KeyM') { toast(toggleMusic() ? '🎵 Música ligada' : '🔇 Música desligada'); return; }
  if (ev.code.startsWith('Digit')) {
    const n = +ev.code.slice(5);
    if (n >= 1 && n <= 6) tryAbility(n - 1);
    if (n === 7) usePotion('hp');
    if (n === 8) usePotion('will');
    return;
  }
  keys[ev.code] = true;
});
addEventListener('keyup', (ev) => { keys[ev.code] = false; });

let dragging = false, dragMoved = 0, lastMX = 0, lastMY = 0;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  dragging = true; dragMoved = 0; lastMX = e.clientX; lastMY = e.clientY;
});
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  lastMX = e.clientX; lastMY = e.clientY;
  camYaw -= dx * 0.005;
  camPitch = clamp(camPitch + dy * 0.005, 0.06, 1.35);
});
addEventListener('mouseup', (e) => {
  if (dragging && dragMoved < 6 && e.button === 0 && e.target === canvas && started) doClick(e);
  dragging = false;
});
canvas.addEventListener('wheel', (e) => {
  camDist = clamp(camDist + e.deltaY * 0.01, 4, 28);
}, { passive: true });

const raycaster = new THREE.Raycaster();
function doClick(e) {
  const mouse = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  // NPCs first
  for (const n of npcs) {
    if (raycaster.intersectObject(n.model.group, true).length) {
      if (player.pos.distanceTo(n.pos) < 7) talkTo(n);
      else errorMsg('Aproxime-se para conversar');
      return;
    }
  }
  const ldr = getLeader();
  if (ldr && ldr.state === 'surrender' && raycaster.intersectObject(ldr.model.group, true).length) {
    if (player.pos.distanceTo(ldr.pos) < 6) confrontLeader();
    return;
  }
  let best = null, bestD = Infinity;
  for (const en of enemies) {
    if (en.state === 'dead' || en.state === 'surrender') continue;
    const hit = raycaster.intersectObject(en.model.group, true);
    if (hit.length && hit[0].distance < bestD) { bestD = hit[0].distance; best = en; }
  }
  if (best) { setTarget(best); beep(880, 0.05, 'sine', 0.03); }
}

// ============================================================ death
function playerDie() {
  player.dead = true;
  $('deathOverlay').style.display = 'flex';
  beep(80, 0.8, 'sawtooth', 0.08, -30);
  setTimeout(() => {
    player.pos.set(0, terrainHeight(0, 10), 10);
    player.hp = player.maxHp; player.will = player.maxWill;
    player.dead = false; player.mult = 0;
    // a simulação vê o herói morto (flag dead) e os inimigos voltam pra casa sozinhos
    $('deathOverlay').style.display = 'none';
  }, 3500);
}

// ============================================================ save / load
function buildSaveData() {
  return {
    level: player.level, xp: player.xp, gold: player.gold,
    morality: player.morality, renown: player.renown,
    potions: player.potions, kicks: player.kicks, kills: player.kills,
    luckCharm: player.luckCharm, achKick: player.achKick,
    hp: player.hp, will: player.will,
    pos: [player.pos.x, player.pos.z],
    dayT: SKY.dayT, day: SKY.day,
    q1: { state: quests.q1.state, count: quests.q1.count },
    q2: { state: quests.q2.state, count: quests.q2.count, leaderResolved: quests.q2.leaderResolved, choice: quests.q2.choice },
    q3: { state: quests.q3.state, count: quests.q3.count },
    disc: player.disc, inventory: player.inventory, equipped: player.equipped, armor: player.armor,
  };
}
function saveGame() {
  if (!started) return;
  const data = buildSaveData();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* full/blocked */ }
  if (net.connected) sendMsg({ t: 'save', data }); // persistência no servidor (SQLite)
}
function loadGame() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { /* corrupt */ }
  if (!data) return false;
  applySaveData(data);
  return true;
}
function applySaveData(data) {
  player.level = data.level; player.xp = data.xp; player.gold = data.gold;
  player.morality = data.morality; player.renown = data.renown;
  player.potions = data.potions; player.kicks = data.kicks; player.kills = data.kills || 0;
  player.luckCharm = !!data.luckCharm; player.achKick = !!data.achKick;
  player.disc = data.disc ?? { str: { lvl: 0, xp: 0 }, skl: { lvl: 0, xp: 0 }, wil: { lvl: 0, xp: 0 } };
  player.inventory = data.inventory ?? [];
  player.equipped = data.equipped && WEAPONS[data.equipped.wpn] ? data.equipped : { wpn: 'espada_gasta', rar: 'comum' };
  player.armor = data.armor ?? { head: null, chest: null, legs: null, boots: null };
  player.maxHp = maxHpFor(player.level) + player.disc.str.lvl * 8;
  player.maxWill = maxWillFor(player.level) + player.disc.wil.lvl * 5;
  player.hp = clamp(data.hp ?? player.maxHp, 1, player.maxHp);
  player.will = clamp(data.will ?? player.maxWill, 0, player.maxWill);
  player.pos.set(data.pos[0], 0, data.pos[1]);
  player.pos.y = terrainHeight(player.pos.x, player.pos.z);
  SKY.dayT = data.dayT ?? 0.09; SKY.day = data.day ?? 1;
  Object.assign(quests.q1, data.q1);
  Object.assign(quests.q2, data.q2);
  Object.assign(quests.q3, data.q3);
  if (!net.connected && (quests.q2.state === 'completed' || quests.q2.choice)) localSim.removeLeader();
  if (quests.q3.state === 'active') requestSpawnBalverine();
  updateMoralityVisuals();
  updateHeroBody();
  updateQuestUI();
}

// ============================================================ title screen
let started = false;
let freshStart = false;
{
  $('heroName').value = localStorage.getItem('fable_hero_name') || '';
  // "Continuar" fica sempre ativo: carrega o save local se houver e,
  // online, o personagem deste nome vem do servidor de qualquer forma
  $('btnContinue').disabled = false;
  $('btnNew').onclick = () => {
    localStorage.removeItem(SAVE_KEY);
    freshStart = true; // descarta também o personagem deste nome no servidor
    startGame(false);
  };
  $('btnContinue').onclick = () => startGame(true);
}
function heroNameFromInput() {
  const v = $('heroName').value.replace(/[<>&"']/g, '').trim().slice(0, 16);
  return v || 'Galo-' + Math.floor(100 + Math.random() * 900);
}
function startGame(fromSave) {
  NET_NAME = heroNameFromInput();
  localStorage.setItem('fable_hero_name', NET_NAME);
  document.querySelector('#playerFrame .uf-name').textContent = NET_NAME;
  document.querySelector('#charPanel h2').textContent = NET_NAME;
  if (fromSave) loadGame();
  started = true;
  startMusic();
  connectNet(
    () => {
      const cs = combatStats();
      return {
        x: player.pos.x, z: player.pos.z, ry: heroModel.group.rotation.y,
        name: NET_NAME, lvl: player.level,
        moving: !!player.moving && !player.dead, dead: player.dead,
        halo: heroModel.halo.visible, horns: heroModel.horns.visible,
        luck: player.luckCharm,
        str: cs.str, skl: cs.skl, wil: cs.wil,
        wpn: player.equipped.wpn,
        wpnKind: cs.wpnKind, wpnDmg: cs.wpnDmg, wpnRange: cs.wpnRange, spellMult: cs.spellMult,
        aHead: player.armor.head?.arm ?? '', aChest: player.armor.chest?.arm ?? '',
        aLegs: player.armor.legs?.arm ?? '', aBoots: player.armor.boots?.arm ?? '',
      };
    },
    {
      login: () => {
        const fresh = freshStart;
        freshStart = false; // só o primeiro login descarta; reconexões preservam
        return { name: NET_NAME, fresh };
      },
      onLogin: (data) => {
        if (data) {
          applySaveData(data);
          toast('🌐 Personagem carregado do servidor');
        } else {
          saveGame(); // registra o personagem novo no servidor
        }
      },
      onConnect: (id) => toast(`🌐 Albion online — você é ${NET_NAME} (#${id})`),
    }
  );
  const ts = $('titleScreen');
  ts.style.opacity = 0;
  setTimeout(() => { ts.style.display = 'none'; }, 1200);
  updateQuestUI();
  updateMoralityVisuals();
  centerMsg('Colinas de Pedravento', fromSave ? 'Bem-vindo de volta, herói' : 'Fale com o Mestre da Guilda para começar sua lenda');
  saveTimer = 15;
}

// ============================================================ minimap
const mm = $('minimap').getContext('2d');
function drawMinimap() {
  const S = 170, C = S / 2, scale = 0.62;
  mm.clearRect(0, 0, S, S);
  mm.save();
  mm.beginPath(); mm.arc(C, C, C - 2, 0, Math.PI * 2); mm.clip();
  mm.fillStyle = '#2a3a1c'; mm.fillRect(0, 0, S, S);
  const px = player.pos.x, pz = player.pos.z;
  const toMap = (x, z) => [C + (x - px) * scale, C + (z - pz) * scale];
  // static features
  for (const f of MAP_FEATURES) {
    const [x, y] = toMap(f.x, f.z);
    mm.fillStyle = f.color;
    mm.beginPath(); mm.arc(x, y, f.r * scale * 1.6, 0, Math.PI * 2); mm.fill();
  }
  // chests
  mm.fillStyle = '#ffd24a';
  for (const ch of chests) {
    if (ch.opened) continue;
    const [x, y] = toMap(ch.pos.x, ch.pos.z);
    mm.fillRect(x - 2, y - 2, 4, 4);
  }
  // enemies
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    const [x, y] = toMap(e.pos.x, e.pos.z);
    mm.fillStyle = e.state === 'surrender' ? '#ffe07a' : '#e84a4a';
    mm.beginPath(); mm.arc(x, y, e.type === 'balverine' ? 4 : 2.2, 0, Math.PI * 2); mm.fill();
  }
  // npcs
  mm.fillStyle = '#ffe07a';
  for (const n of npcs) {
    const [x, y] = toMap(n.pos.x, n.pos.z);
    mm.beginPath(); mm.arc(x, y, 2.4, 0, Math.PI * 2); mm.fill();
  }
  // chickens
  mm.fillStyle = '#fff';
  for (const c of chickens) {
    const [x, y] = toMap(c.pos.x, c.pos.z);
    mm.fillRect(x - 1, y - 1, 2, 2);
  }
  // outros heróis online
  mm.fillStyle = '#7fd0ff';
  for (const [, r] of remoteHeroes) {
    const [x, y] = toMap(r.x, r.z);
    mm.beginPath(); mm.arc(x, y, 3, 0, Math.PI * 2); mm.fill();
  }
  // player arrow
  const fy = heroModel.group.rotation.y;
  mm.save();
  mm.translate(C, C);
  mm.rotate(Math.atan2(Math.sin(fy), -Math.cos(fy)));
  mm.fillStyle = '#fff';
  mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(-4, 5); mm.closePath(); mm.fill();
  mm.restore();
  mm.restore();
  // N marker
  mm.fillStyle = '#ffd24a';
  mm.font = 'bold 11px Georgia';
  mm.textAlign = 'center';
  mm.fillText('N', C, 12);
}

// ============================================================ hints
let hintT = 30;
function guildmasterHints(dt) {
  hintT -= dt;
  if (hintT <= 0) {
    hintT = 50;
    if (player.hp < player.maxHp * 0.3) toast('Mestre da Guilda: “Sua vida está baixa. Você tem poções?”');
    else if (SKY.nightF > 0.6 && Math.random() < 0.5) toast('Mestre da Guilda: “A noite é perigosa em Albion…”');
  }
}

// IA dos inimigos vive em shared/sim/enemies.ts (servidor online, localSim offline)

// ============================================================ chicken AI
function updateChicken(c, dt) {
  if (c.state === 'fly') {
    c.vel.y -= 22 * dt;
    c.pos.addScaledVector(c.vel, dt);
    c.model.group.rotation.x += c.spin * dt;
    const gy = terrainHeight(c.pos.x, c.pos.z);
    if (c.pos.y <= gy) {
      c.pos.y = gy;
      c.state = 'idle';
      c.model.group.rotation.x = 0;
      c.vel.set(0, 0, 0);
      floatText(c.pos, 'có có!', '#fff', 12);
    }
  } else {
    const dP = c.pos.distanceTo(player.pos);
    if (dP < 2.2) {
      const away = c.pos.clone().sub(player.pos).setY(0).normalize();
      c.pos.addScaledVector(away, 3.2 * dt);
      c.model.group.rotation.y = Math.atan2(away.x, away.z);
      c.walkT += dt * 14;
    } else {
      c.wTimer -= dt;
      if (c.wTimer <= 0) {
        c.wTimer = 2 + Math.random() * 4;
        const a = Math.random() * Math.PI * 2;
        c.wTarget = c.home.clone().add(new THREE.Vector3(Math.cos(a) * 5, 0, Math.sin(a) * 5));
      }
      if (c.wTarget) {
        const d = c.wTarget.clone().sub(c.pos).setY(0);
        if (d.length() > 0.4) {
          d.normalize();
          c.pos.addScaledVector(d, 1.4 * dt);
          c.model.group.rotation.y = Math.atan2(d.x, d.z);
          c.walkT += dt * 8;
        }
      }
    }
    c.pos.y = terrainHeight(c.pos.x, c.pos.z);
    const ls = Math.sin(c.walkT) * 0.5;
    c.model.legs[0].rotation.x = ls; c.model.legs[1].rotation.x = -ls;
  }
  c.model.group.position.copy(c.pos);
}

// ============================================================ NPC ambient
function updateNpc(n, dt) {
  if (n.wander) {
    const evil = player.morality <= -40;
    const dP = n.pos.distanceTo(player.pos);
    if (evil && dP < 7) {
      const away = n.pos.clone().sub(player.pos).setY(0).normalize();
      n.pos.addScaledVector(away, 3 * dt);
      n.model.group.rotation.y = Math.atan2(away.x, away.z);
    } else {
      n.wTimer -= dt;
      if (n.wTimer <= 0) {
        n.wTimer = 4 + Math.random() * 6;
        const a = Math.random() * Math.PI * 2;
        n.wTarget = n.home.clone().add(new THREE.Vector3(Math.cos(a) * 7, 0, Math.sin(a) * 7));
      }
      if (n.wTarget) {
        const d = n.wTarget.clone().sub(n.pos).setY(0);
        if (d.length() > 0.5) {
          d.normalize();
          n.pos.addScaledVector(d, 1.5 * dt);
          n.model.group.rotation.y = Math.atan2(d.x, d.z);
        }
      }
    }
    n.pos.y = terrainHeight(n.pos.x, n.pos.z);
    n.model.group.position.copy(n.pos);
    // ambient chatter
    n.sayT -= dt;
    if (n.sayT <= 0 && dP < 9) {
      n.sayT = 14 + Math.random() * 14;
      const good = player.morality >= 40;
      const lines = evil ? ['Socorro!', 'É um monstro!'] : good ? ['Um herói!', 'Que auréola!'] : ['Bom dia!', 'Belo dia, não?'];
      floatText(n.pos, lines[Math.floor(Math.random() * lines.length)], '#ffe07a', 13);
    } else if (n.sayT <= 0) {
      n.sayT = 10;
    }
  }
}

// ============================================================ multiplayer
let NET_NAME = 'Galo'; // definido na tela de título
const remoteHeroes = new Map();

function ensureRemoteHero(id) {
  let r = remoteHeroes.get(id);
  if (r) return r;
  const model = makeHero();
  scene.add(model.group);
  const plate = document.createElement('div');
  plate.className = 'plate';
  plate.innerHTML = `<div class="pname" style="color:#7fd0ff"></div>`;
  $('plates').appendChild(plate);
  r = { model, plate, nameEl: plate.querySelector('.pname'), x: 0, z: 0, ry: 0, walkT: 0, init: false, wpnKey: null };
  remoteHeroes.set(id, r);
  return r;
}

function updateRemoteHeroes(dt) {
  for (const [id, s] of net.remotes) {
    const r = ensureRemoteHero(id);
    if (!r.init) { r.x = s.x; r.z = s.z; r.ry = s.ry; r.init = true; }
    // interpolação simples até o último estado recebido
    const k = Math.min(1, dt * 10);
    r.x += (s.x - r.x) * k;
    r.z += (s.z - r.z) * k;
    let dr = s.ry - r.ry;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    r.ry += dr * k;
    const y = terrainHeight(r.x, r.z);
    r.model.group.position.set(r.x, y, r.z);
    r.model.group.rotation.y = r.ry;
    r.model.halo.visible = !!s.halo;
    r.model.horns.visible = !!s.horns;
    // arma e físico dos outros heróis também aparecem
    if (r.wpnKey !== s.wpn) {
      r.wpnKey = s.wpn;
      r.model.weaponMount.clear();
      r.model.weaponMount.add(makeWeaponModel(s.wpn));
    }
    const armorSig = `${s.aHead}|${s.aChest}|${s.aLegs}|${s.aBoots}`;
    if (r.armorSig !== armorSig) {
      r.armorSig = armorSig;
      applyArmorTo(r.model, { head: s.aHead || undefined, chest: s.aChest || undefined, legs: s.aLegs || undefined, boots: s.aBoots || undefined });
    }
    const bulk = 1 + Math.min(s.str ?? 0, 12) * 0.045;
    r.model.shL.scale.setScalar(bulk);
    r.model.shR.scale.setScalar(bulk);
    const glow = (s.wil ?? 0) >= 2;
    for (const tm of r.model.tattooMeshes) tm.visible = glow;
    r.model.tattooMat.emissiveIntensity = glow ? Math.min(2.2, 0.4 + (s.wil ?? 0) * 0.18) : 0;
    if (s.moving) r.walkT += dt * 9; else r.walkT *= 0.8;
    const sw = Math.sin(r.walkT) * 0.65;
    r.model.legL.rotation.x = sw;
    r.model.legR.rotation.x = -sw;
    r.model.armL.rotation.x = -sw * 0.7;
    r.model.armR.rotation.x = sw * 0.7;
    r.nameEl.textContent = `${s.name} [${s.lvl}]`;
  }
  // remove quem saiu
  for (const [id, r] of remoteHeroes) {
    if (!net.remotes.has(id)) {
      scene.remove(r.model.group);
      r.plate.remove();
      remoteHeroes.delete(id);
    }
  }
}

// ============================================================ chat
const chatLog = $('chatLog');
const chatWrap = $('chatWrap');
const chatInput = $('chatInput');
let chatOpen = false;

function addChatLine(name, text, system = false) {
  const el = document.createElement('div');
  el.className = 'cmsg';
  const nameSpan = document.createElement('span');
  nameSpan.className = system ? 'csys' : 'cname';
  nameSpan.textContent = system ? `${name}: ${text}` : `[${name}] `;
  el.appendChild(nameSpan);
  if (!system) el.appendChild(document.createTextNode(text));
  chatLog.appendChild(el);
  while (chatLog.children.length > 8) chatLog.firstChild.remove();
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 1300); }, 14000);
}
function openChat() {
  chatOpen = true;
  chatWrap.style.display = 'block';
  setTimeout(() => chatInput.focus(), 0);
}
function closeChat() {
  chatOpen = false;
  chatInput.value = '';
  chatWrap.style.display = 'none';
  chatInput.blur();
}
chatInput.addEventListener('keydown', (ev) => {
  ev.stopPropagation();
  if (ev.code === 'Enter') {
    const text = chatInput.value.trim();
    if (text) {
      if (net.connected) sendMsg({ t: 'chat', text });
      else addChatLine(NET_NAME, text); // eco local no modo solo
    }
    closeChat();
  } else if (ev.code === 'Escape') {
    closeChat();
  }
});

// ============================================================ main loop
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
let saveTimer = 15;

function animate() {
  requestAnimationFrame(animate);
  tick();
}
// keep simulating while the tab is hidden (rAF pauses there)
setInterval(() => { if (document.hidden) tick(); }, 50);

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  // ---------- player movement ----------
  if (started && !player.dead && dialog.style.display !== 'block') {
    const fw = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const st = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let mx = fx * fw + rx * st, mz = fz * fw + rz * st;
    const ml = Math.hypot(mx, mz);
    if (player.rollT > 0) {
      // rolamento: dash rápido com i-frames e cambalhota
      player.rollT -= dt;
      const nx = player.pos.x + player.rollDirX * 17 * dt;
      const nz = player.pos.z + player.rollDirZ * 17 * dt;
      if (terrainHeight(nx, nz) > LAKE.waterY - 0.35 && Math.hypot(nx, nz) < WORLD_R) {
        player.pos.x = nx; player.pos.z = nz;
      }
      heroModel.group.rotation.y = Math.atan2(player.rollDirX, player.rollDirZ);
      heroModel.group.rotation.x = (1 - player.rollT / 0.35) * Math.PI * 2;
      if (player.rollT <= 0) heroModel.group.rotation.x = 0;
    } else if (ml > 0) {
      mx /= ml; mz /= ml;
      player.lastDirX = mx; player.lastDirZ = mz;
      const speed = 9;
      const nx = player.pos.x + mx * speed * dt;
      const nz = player.pos.z + mz * speed * dt;
      // block deep water & world edge
      if (terrainHeight(nx, nz) > LAKE.waterY - 0.35 && Math.hypot(nx, nz) < WORLD_R) {
        player.pos.x = nx; player.pos.z = nz;
      }
      heroModel.group.rotation.y = Math.atan2(mx, mz);
      player.walkT += dt * 9;
    } else {
      player.walkT *= 0.8;
    }
    player.moving = ml > 0 || player.rollT > 0;
    const groundY = terrainHeight(player.pos.x, player.pos.z);
    if (keys.Space && player.onGround) { player.vy = 8.5; player.onGround = false; }
    if (!player.onGround) {
      player.vy -= 24 * dt;
      player.pos.y += player.vy * dt;
      if (player.pos.y <= groundY) { player.pos.y = groundY; player.onGround = true; player.vy = 0; }
    } else {
      player.pos.y = groundY;
    }
  }
  heroModel.group.position.copy(player.pos);

  // hero animation
  const swing = Math.sin(player.walkT) * 0.65;
  heroModel.legL.rotation.x = swing;
  heroModel.legR.rotation.x = -swing;
  heroModel.armL.rotation.x = -swing * 0.7;
  if (player.swingT > 0) {
    player.swingT -= dt;
    heroModel.armR.rotation.x = -2.4 * (player.swingT / 0.35);
  } else {
    heroModel.armR.rotation.x = swing * 0.7;
  }
  heroModel.cape.rotation.x = 0.15 + Math.abs(swing) * 0.35 + Math.sin(time * 2) * 0.05;
  if (heroModel.halo.visible) heroModel.halo.rotation.z = time * 1.5;

  // ---------- timers / regen ----------
  if (started && !player.dead) {
    player.will = Math.min(player.maxWill, player.will + 4 * dt);
    player.stam = Math.min(player.maxStam, player.stam + stamRegen() * dt);
    if (time - player.lastCombat > 5) player.hp = Math.min(player.maxHp, player.hp + 3 * dt);
  }
  if (player.invulnT > 0) player.invulnT -= dt;
  gcd = Math.max(0, gcd - dt);
  for (let i = 0; i < cooldowns.length; i++) cooldowns[i] = Math.max(0, cooldowns[i] - dt);
  if (player.multT > 0) { player.multT -= dt; if (player.multT <= 0) player.mult = 0; }
  if (player.slowT > 0) player.slowT -= dt;
  $('slowfx').style.opacity = player.slowT > 0 ? 1 : 0;

  // ---------- world / entities ----------
  if (net.connected && net.serverDayT !== null) SKY.dayT = net.serverDayT; // hora do mundo é do servidor
  updateSky(started ? dt : dt * 0.3, player.pos);
  updateWorld(time, dt, player.pos);
  if (started) {
    if (!net.connected) {
      localSim.update(dt, [{ id: 0, x: player.pos.x, z: player.pos.z, dead: player.dead }], SKY.nightF);
      combatLocal.update(dt);
    }
    syncEnemies(dt);
    processSimEvents();
    for (const c of drainChat()) addChatLine(c.name, c.text, c.pid === 0);
    for (const c of chickens) updateChicken(c, dt);
    for (const n of npcs) updateNpc(n, dt);
    guildmasterHints(dt);
    updateOrbs(dt);
    updateRemoteHeroes(dt);
  }

  // ---------- projectiles (visuais — dano e explosão vêm da simulação) ----------
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const dest = tmpV.copy(p.target.pos).add(new THREE.Vector3(0, 1, 0));
    const dir = dest.sub(p.mesh.position);
    const d = dir.length();
    if (d < 0.6 || p.target.state === 'dead') {
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    } else {
      dir.normalize();
      p.mesh.position.addScaledVector(dir, Math.min(d, p.speed * dt));
      if (p.orient) p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }
  }

  // ---------- effects ----------
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.t += dt;
    const k = fx.t / fx.dur;
    if (k >= 1) { scene.remove(fx.mesh); effects.splice(i, 1); }
    else fx.update(fx, k);
  }

  // ---------- selection ring ----------
  if (target && target.state !== 'dead' && target.state !== 'surrender') {
    selRing.position.set(target.pos.x, target.pos.y + 0.08, target.pos.z);
  } else if (target) {
    setTarget(null);
  }

  // ---------- camera ----------
  let lookPos = player.pos;
  if (!started) {
    camYaw += dt * 0.05;
    camDist = 16;
    camPitch = 0.3;
  }
  const cx = Math.sin(camYaw) * Math.cos(camPitch) * camDist;
  const cy = Math.sin(camPitch) * camDist;
  const cz = Math.cos(camYaw) * Math.cos(camPitch) * camDist;
  camera.position.set(lookPos.x + cx, lookPos.y + 1.6 + cy, lookPos.z + cz);
  const camGround = terrainHeight(camera.position.x, camera.position.z) + 0.5;
  if (camera.position.y < camGround) camera.position.y = camGround;
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.4);
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }
  camera.lookAt(lookPos.x, lookPos.y + 2, lookPos.z);

  // ---------- HUD ----------
  if (started) {
    $('php').style.transform = `scaleX(${Math.max(0, player.hp / player.maxHp)})`;
    $('pwill').style.transform = `scaleX(${player.will / player.maxWill})`;
    $('pstam').style.transform = `scaleX(${player.stam / player.maxStam})`;
    $('phpTxt').textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    $('pwillTxt').textContent = `${Math.floor(player.will)} / ${player.maxWill}`;
    $('plvl').textContent = player.level;
    $('ptitle').textContent = playerTitle();
    $('xpfill').style.width = `${(player.xp / xpToNext(player.level)) * 100}%`;
    $('goldTxt').textContent = player.gold;
    $('cntHp').textContent = player.potions.hp;
    $('cntWill').textContent = player.potions.will;
    if (target) {
      $('thp').style.transform = `scaleX(${Math.max(0, target.hp / target.maxHp)})`;
      $('thpTxt').textContent = `${Math.max(0, Math.ceil(target.hp))} / ${target.maxHp}`;
    }
    for (let i = 0; i < slotEls.length; i++) {
      const cdEl = slotEls[i].querySelector('.cd');
      const rem = Math.max(cooldowns[i], gcd);
      if (rem > 0.05) {
        cdEl.style.display = 'flex';
        cdEl.textContent = rem > 1 ? Math.ceil(rem) : '';
      } else cdEl.style.display = 'none';
    }
    const multEl = $('mult');
    if (player.mult > 1) { multEl.style.display = 'block'; multEl.textContent = 'x' + player.mult; }
    else multEl.style.display = 'none';

    // clock
    const h = Math.floor(skyHour());
    $('clock').textContent = `${SKY.nightF > 0.5 ? '🌙' : '☀️'} Dia ${SKY.day} — ${String(h).padStart(2, '0')}h`;

    // interact prompt
    const it = nearestInteract();
    if (it && dialog.style.display !== 'block') {
      $('interact').style.display = 'block';
      $('interactTxt').textContent = it.label;
    } else $('interact').style.display = 'none';

    drawMinimap();
  }

  // ---------- nameplates ----------
  for (const e of enemies) {
    if (e.state === 'dead' || !e.model.group.visible) { e.plate.style.display = 'none'; continue; }
    tmpV.set(e.pos.x, e.pos.y + e.def.plateH, e.pos.z);
    const dCam = tmpV.distanceTo(camera.position);
    tmpV.project(camera);
    if (tmpV.z > 1 || dCam > 70) { e.plate.style.display = 'none'; continue; }
    e.plate.style.display = '';
    e.plate.style.left = `${(tmpV.x * 0.5 + 0.5) * innerWidth}px`;
    e.plate.style.top = `${(-tmpV.y * 0.5 + 0.5) * innerHeight}px`;
    e.plateFill.style.transform = `scaleX(${Math.max(0, e.hp / e.maxHp)})`;
  }
  for (const n of npcs) {
    tmpV.set(n.pos.x, n.pos.y + 3.0, n.pos.z);
    const dCam = tmpV.distanceTo(camera.position);
    tmpV.project(camera);
    if (tmpV.z > 1 || dCam > 40) { n.plate.style.display = 'none'; continue; }
    n.plate.style.display = '';
    n.plate.style.left = `${(tmpV.x * 0.5 + 0.5) * innerWidth}px`;
    n.plate.style.top = `${(-tmpV.y * 0.5 + 0.5) * innerHeight}px`;
  }
  for (const [, r] of remoteHeroes) {
    const p = r.model.group.position;
    tmpV.set(p.x, p.y + 3.0, p.z);
    const dCam = tmpV.distanceTo(camera.position);
    tmpV.project(camera);
    if (tmpV.z > 1 || dCam > 90) { r.plate.style.display = 'none'; continue; }
    r.plate.style.display = '';
    r.plate.style.left = `${(tmpV.x * 0.5 + 0.5) * innerWidth}px`;
    r.plate.style.top = `${(-tmpV.y * 0.5 + 0.5) * innerHeight}px`;
  }

  // ---------- floating text ----------
  for (let i = dmgTexts.length - 1; i >= 0; i--) {
    const d = dmgTexts[i];
    d.t += dt;
    if (d.t > 1.15) { d.el.remove(); dmgTexts.splice(i, 1); continue; }
    tmpV.copy(d.pos);
    tmpV.y += d.t * 1.6;
    tmpV.project(camera);
    d.el.style.left = `${(tmpV.x * 0.5 + 0.5) * innerWidth}px`;
    d.el.style.top = `${(-tmpV.y * 0.5 + 0.5) * innerHeight}px`;
    d.el.style.opacity = d.t < 0.7 ? 1 : (1.15 - d.t) / 0.45;
  }

  // ---------- autosave ----------
  if (started) {
    saveTimer -= dt;
    if (saveTimer <= 0) { saveTimer = 20; saveGame(); }
  }

  composer.render();
}

addEventListener('beforeunload', saveGame);

// debug / experimental hooks
window.FABLE = {
  player, quests, enemies, npcs, chickens, SKY, net, remoteHeroes, localSim, combatLocal,
  gainDiscXP, addItem, updateHeroBody,
  giveGold: (n) => { player.gold += n; },
  setDayT: (t) => { SKY.dayT = t; },
  setMorality: (m) => { player.morality = m; updateMoralityVisuals(); },
  save: saveGame, load: loadGame,
  startGame,
};

updateHeroBody(); // arma inicial na mão + visual das disciplinas
animate();
