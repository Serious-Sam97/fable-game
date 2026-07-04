import * as THREE from 'three';

// ============================================================================
// Modelos orgânicos estilo Fable — cápsulas, esferas e juntas em vez de caixas.
// Todos os humanoides saem de makeHumanoid(); braços/pernas são GRUPOS com pivô
// no ombro/quadril (o jogo anima rotation.x deles).
// ============================================================================

function matMaker(mats) {
  return (color, opts = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, ...opts });
    mats.push(m);
    return m;
  };
}
function shadows(g) { g.traverse(o => { if (o.isMesh) o.castShadow = true; }); }

const basic = (color) => new THREE.MeshBasicMaterial({ color });

// ---------------------------------------------------------------- humanoid base
// proporções heroicas de Fable: ombros largos, tronco em V, mãos grandes
function makeHumanoid({
  skin = 0xd8a878,
  hair = 0x3a2a12,
  shirt = 0x5a4028,
  sleeves = null,        // null = braço de pele (herói fable é sem manga)
  pants = 0x3a3226,
  boots = 0x241a10,
  bulk = 1,              // largura de ombros/peito
  brow = true,
  jawWide = 1,
} = {}) {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const armC = sleeves ?? skin;

  // ---- pelve + tronco ----
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), M(pants));
  pelvis.geometry.scale(1.2, 0.75, 0.95);
  pelvis.position.y = 1.04;

  const torsoGeo = new THREE.CapsuleGeometry(0.3, 0.44, 6, 14);
  torsoGeo.scale(1.28 * bulk, 1, 0.85); // peito largo em V (baked — o jogo mexe no mesh.scale)
  const torso = new THREE.Mesh(torsoGeo, M(shirt));
  torso.position.y = 1.55;

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.36, 0.1, 14), M(0x2e2118));
  belt.geometry.scale(1.12, 1, 0.85);
  belt.position.y = 1.08;

  // ---- pescoço + cabeça ----
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.16, 10), M(skin));
  neck.position.y = 2.1;

  const head = new THREE.Group();
  head.position.y = 2.32;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.235, 16, 14), M(skin));
  skull.geometry.scale(0.92, 1.02, 0.96);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), M(skin));
  jaw.geometry.scale(1.0 * jawWide, 0.72, 0.92);
  jaw.position.set(0, -0.13, 0.04);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.1, 6), M(skin));
  nose.rotation.x = Math.PI / 2 - 0.25;
  nose.position.set(0, -0.03, 0.235);
  head.add(skull, jaw, nose);
  // olhos
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), basic(0xf2ede2));
    eye.geometry.scale(1, 0.85, 0.5);
    eye.position.set(s * 0.085, 0.02, 0.2);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), basic(0x241a10));
    pupil.position.set(s * 0.085, 0.02, 0.225);
    head.add(eye, pupil);
    if (brow) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.022, 0.03), M(hair));
      b.position.set(s * 0.085, 0.085, 0.205);
      b.rotation.z = s * -0.15;
      head.add(b);
    }
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.02), M(0x8a5a4a));
  mouth.position.set(0, -0.155, 0.185);
  head.add(mouth);
  // cabelo: calota alta (testa à mostra) + costeletas discretas
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), M(hair));
  hairCap.geometry.scale(0.94, 0.95, 0.98);
  hairCap.position.set(0, 0.055, -0.03);
  head.add(hairCap);
  for (const s of [-1, 1]) {
    const burn = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05), M(hair));
    burn.position.set(s * 0.2, 0.0, -0.02);
    head.add(burn);
  }

  // ---- ombros ----
  const shGeo = new THREE.SphereGeometry(0.15 * bulk, 12, 10);
  const shL = new THREE.Mesh(shGeo, M(armC)); shL.position.set(-0.45 * bulk, 1.93, 0);
  const shR = new THREE.Mesh(shGeo.clone(), M(armC)); shR.position.set(0.45 * bulk, 1.93, 0);

  // ---- braços (grupos com pivô no ombro) ----
  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.47 * bulk, 1.9, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.26, 4, 10), M(armC));
    upper.position.y = -0.2;
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), M(skin));
    elbow.position.y = -0.42;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.24, 4, 10), M(skin));
    fore.position.y = -0.6;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M(skin));
    hand.geometry.scale(0.9, 1.15, 0.9);
    hand.position.y = -0.84;
    arm.add(upper, elbow, fore, hand);
    return arm;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // ---- pernas (grupos com pivô no quadril) ----
  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.2, 1.0, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.3, 4, 10), M(pants));
    thigh.position.y = -0.22;
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), M(pants));
    knee.position.y = -0.45;
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.26, 4, 10), M(boots));
    calf.position.y = -0.64;
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 8), M(boots));
    foot.geometry.scale(1, 0.65, 1.55);
    foot.position.set(0, -0.9, 0.06);
    leg.add(thigh, knee, calf, foot);
    return leg;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  g.add(pelvis, torso, belt, neck, head, shL, shR, armL, armR, legL, legR);
  shadows(g);
  return { group: g, mats, M, head, torso, pelvis, belt, shL, shR, armL, armR, legL, legR, skin, hair };
}

// ---------------------------------------------------------------- hero
export function makeHero() {
  const h = makeHumanoid({
    skin: 0xd8a878, hair: 0x4a3416, shirt: 0x5a4028, pants: 0x3a3226, boots: 0x241a10,
    bulk: 1.08, jawWide: 1.08,
  });
  const { group: g, mats, M } = h;

  // bandoleira atravessada no peito (marca do herói de Fable)
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 24, Math.PI * 1.1), M(0x2e2118));
  strap.position.set(0.02, 1.56, 0);
  strap.rotation.set(0.15, 0.25, 1.95);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.05), M(0xc8a24b));
  buckle.position.set(0, 1.08, 0.3);
  // abas de túnica de couro (frente/trás)
  const flapGeo = new THREE.CylinderGeometry(0.19, 0.26, 0.42, 10, 1, true, -Math.PI / 3, Math.PI / 1.5);
  const flapF = new THREE.Mesh(flapGeo, new THREE.MeshLambertMaterial({ color: 0x4a3520, side: THREE.DoubleSide }));
  mats.push(flapF.material);
  flapF.position.set(0, 0.82, 0.1);
  const flapB = flapF.clone();
  flapB.rotation.y = Math.PI;
  flapB.position.set(0, 0.82, -0.1);
  g.add(strap, buckle, flapF, flapB);

  // capa
  const capeGeo = new THREE.CylinderGeometry(0.34, 0.52, 1.35, 12, 1, true, Math.PI * 0.62, Math.PI * 0.76);
  const cape = new THREE.Mesh(capeGeo, new THREE.MeshLambertMaterial({ color: 0x6a1f14, side: THREE.DoubleSide }));
  mats.push(cape.material);
  cape.geometry.translate(0, -0.675, 0);
  cape.position.set(0, 1.95, -0.06);
  g.add(cape);

  // suporte de arma na mão direita — a orientação é definida por mountWeapon()
  const weaponMount = new THREE.Group();
  weaponMount.position.set(0, -0.86, 0.06);
  h.armR.add(weaponMount);

  // tatuagens arcanas de Vontade: anéis luminosos nos braços (bloom)
  const tattooMat = new THREE.MeshLambertMaterial({ color: 0x16243e, emissive: 0x3a8aff, emissiveIntensity: 0 });
  const tattooMeshes = [];
  for (const arm of [h.armL, h.armR]) {
    for (const y of [-0.16, -0.28, -0.58]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(y > -0.4 ? 0.115 : 0.098, 0.018, 6, 16), tattooMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      ring.visible = false;
      arm.add(ring);
      tattooMeshes.push(ring);
    }
  }
  const chestTattoo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 20, Math.PI), tattooMat);
  chestTattoo.position.set(0, 1.68, 0.27);
  chestTattoo.rotation.z = Math.PI;
  chestTattoo.visible = false;
  g.add(chestTattoo);
  tattooMeshes.push(chestTattoo);

  // moralidade: auréola e chifres
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 8, 24), basic(0xffe9a0));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 2.95;
  halo.visible = false;
  const horns = new THREE.Group();
  const hornMat = new THREE.MeshLambertMaterial({ color: 0x5a1010, emissive: 0x300505 });
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.28, 8), hornMat);
    horn.position.set(s * 0.16, 2.6, 0);
    horn.rotation.z = s * -0.4;
    horns.add(horn);
  }
  horns.visible = false;
  g.add(halo, horns);

  // suportes de armadura
  const armorMounts = {
    head: new THREE.Group(),
    chest: new THREE.Group(),
    legL: new THREE.Group(), legR: new THREE.Group(),
    bootL: new THREE.Group(), bootR: new THREE.Group(),
  };
  h.head.add(armorMounts.head);
  armorMounts.chest.position.copy(h.torso.position);
  g.add(armorMounts.chest);
  h.legL.add(armorMounts.legL); h.legR.add(armorMounts.legR);
  h.legL.add(armorMounts.bootL); h.legR.add(armorMounts.bootR);

  shadows(g);
  return {
    group: g, armL: h.armL, armR: h.armR, legL: h.legL, legR: h.legR,
    cape, halo, horns, mats, weaponMount,
    torso: h.torso, shL: h.shL, shR: h.shR,
    tattooMat, tattooMeshes, armorMounts,
  };
}

// encaixa a arma na mão com a postura certa por tipo:
// melee em riste (à frente, levemente baixa), arco vertical, cajado com orbe erguido
export function mountWeapon(model, key) {
  const mount = model.weaponMount;
  mount.clear();
  mount.add(makeWeaponModel(key));
  if (key.startsWith('arco')) mount.rotation.set(-0.12, Math.PI / 2, 0);
  else if (key === 'cajado_arcano') mount.rotation.set(Math.PI, 0, 0);
  else mount.rotation.set(-Math.PI / 2 - 0.35, 0, 0);
}

// ---------------------------------------------------------------- armor pieces
export function applyArmorTo(model, slots) {
  const m = model.armorMounts;
  for (const k of Object.keys(m)) m[k].clear();
  const mat = (iron) => new THREE.MeshLambertMaterial({ color: iron ? 0x9aa2ac : 0x6a4a2a });
  const gold = () => new THREE.MeshLambertMaterial({ color: 0xc8a24b });

  if (slots.head) {
    const iron = slots.head.startsWith('ferro');
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.265, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(iron));
    dome.position.y = 0.04;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.028, 8, 20), mat(iron));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.045;
    m.head.add(dome, rim);
    if (iron) {
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.34), gold());
      crest.position.y = 0.24;
      m.head.add(crest);
    }
  }
  if (slots.chest) {
    const iron = slots.chest.startsWith('ferro');
    const shellGeo = new THREE.CapsuleGeometry(0.32, 0.44, 6, 14);
    shellGeo.scale(1.42, 1.02, 0.95);
    const shell = new THREE.Mesh(shellGeo, mat(iron));
    m.chest.add(shell);
    if (iron) {
      const emblem = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 16), gold());
      emblem.position.set(0, 0.12, 0.31);
      m.chest.add(emblem);
    }
  }
  if (slots.legs) {
    const iron = slots.legs.startsWith('ferro');
    for (const mount of [m.legL, m.legR]) {
      const cuisse = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.26, 4, 10), mat(iron));
      cuisse.position.y = -0.22;
      mount.add(cuisse);
    }
  }
  if (slots.boots) {
    const iron = slots.boots.startsWith('ferro');
    for (const mount of [m.bootL, m.bootR]) {
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.24, 4, 10), mat(iron));
      shin.position.y = -0.64;
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), mat(iron));
      foot.geometry.scale(1, 0.62, 1.5);
      foot.position.set(0, -0.9, 0.07);
      mount.add(shin, foot);
    }
  }
  model.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
}

// ---------------------------------------------------------------- villagers / NPCs
export function makeVillager({ robe = 0x2a4a7a, skin = 0xd8a878, hair = 0x888888, beard = false, hat = null, staff = false } = {}) {
  const h = makeHumanoid({ skin, hair, shirt: robe, sleeves: robe, pants: robe, boots: 0x2e2118, bulk: 0.92 });
  const { group: g, mats, M } = h;

  // túnica longa (lathe) por cima das pernas
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector2(0.34 + t * 0.2, 1.06 - t * 0.98));
  }
  const skirt = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), new THREE.MeshLambertMaterial({ color: robe, side: THREE.DoubleSide }));
  mats.push(skirt.material);
  g.add(skirt);

  if (beard) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), M(0xd8d8d8));
    b.geometry.scale(1.05, 1.1, 0.75);
    b.position.set(0, -0.17, 0.1);
    h.head.add(b);
  }
  if (hat === 'top') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 16), M(0x2a2118));
    brim.position.y = 0.16;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.42, 16), M(0x2a2118));
    top.position.y = 0.38;
    h.head.add(brim, top);
  } else if (hat === 'hood') {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), M(robe));
    hood.position.y = 0.05;
    h.head.add(hood);
  }
  if (staff) {
    // cajado plantado no chão, orbe na altura da cabeça
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.9, 8), M(0x5a4028));
    st.position.set(0, -0.84, 0.14);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), basic(0x7fd0ff));
    orb.position.set(0, 0.14, 0.14);
    h.armR.add(st, orb);
    h.armR.rotation.x = -0.25;
  }
  shadows(g);
  return { group: g, armL: h.armL, armR: h.armR, mats };
}

// ---------------------------------------------------------------- bandit
export function makeBandit({ leader = false, archer = false } = {}) {
  const h = makeHumanoid({
    skin: 0xc89868, hair: 0x2a1f12,
    shirt: leader ? 0x3a1a2e : 0x33302a, sleeves: 0x33302a,
    pants: 0x241f18, boots: 0x1a140e, bulk: 1.0,
  });
  const { group: g, mats, M } = h;
  // bandana
  const band = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), M(leader ? 0xc8a24b : 0x8a1c1c));
  band.position.y = 0.04;
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), M(leader ? 0xc8a24b : 0x8a1c1c));
  knot.position.set(0, 0, -0.24);
  h.head.add(band, knot);
  // máscara cobrindo a boca
  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.35), M(0x1a1512));
  mask.geometry.scale(1.05, 1, 1);
  mask.position.set(0, -0.06, 0.04);
  h.head.add(mask);

  if (archer) {
    const bow = makeWeaponModel('arco_cacador');
    bow.position.set(0, -0.86, 0.06);
    bow.rotation.set(-0.12, Math.PI / 2, 0);
    h.armR.add(bow);
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.55, 10), M(0x5a4028));
    quiver.position.set(-0.18, 1.62, -0.3);
    quiver.rotation.z = 0.3;
    g.add(quiver);
  } else {
    // lâmina em riste, como o herói
    const bladeG = new THREE.Group();
    bladeG.position.set(0, -0.84, 0.05);
    bladeG.rotation.x = -Math.PI / 2 - 0.35;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.035), M(0x9aa0a8));
    blade.position.y = -0.5;
    bladeG.add(blade);
    h.armR.add(bladeG);
  }
  shadows(g);
  return { group: g, armL: h.armL, armR: h.armR, legL: h.legL, legR: h.legR, mats, legs: [h.legL, h.legR] };
}

// ---------------------------------------------------------------- hobbe
export function makeHobbe({ shaman = false } = {}) {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const skinC = 0x7a8a4a;

  // corpo atarracado com barrigão
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), M(0x9aa86a));
  belly.geometry.scale(1, 0.95, 0.9);
  belly.position.y = 0.72;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), M(skinC));
  chest.geometry.scale(1.15, 0.8, 0.9);
  chest.position.y = 1.05;
  // cabeçona
  const head = new THREE.Group();
  head.position.y = 1.5;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), M(skinC));
  skull.geometry.scale(1, 0.9, 0.95);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), M(skinC));
  snout.geometry.scale(1.1, 0.7, 1);
  snout.position.set(0, -0.08, 0.26);
  head.add(skull, snout);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 6), M(skinC));
    ear.position.set(s * 0.32, 0.14, 0);
    ear.rotation.z = s * 1.15;
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), basic(0xffd24a));
    eye.position.set(s * 0.13, 0.04, 0.27);
    head.add(eye);
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 5), basic(0xe8e0c8));
    tooth.position.set(s * 0.08, -0.16, 0.28);
    head.add(tooth);
  }
  // braços/pernas curtos
  function limb(r1, len, c) {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(r1, len, 4, 8), M(c));
    return l;
  }
  const armL = new THREE.Group(); armL.position.set(-0.45, 1.1, 0);
  const aL = limb(0.09, 0.35, skinC); aL.position.y = -0.24; armL.add(aL);
  const armR = new THREE.Group(); armR.position.set(0.45, 1.1, 0);
  const aR = limb(0.09, 0.35, skinC); aR.position.y = -0.24; armR.add(aR);
  const legL = new THREE.Group(); legL.position.set(-0.2, 0.42, 0);
  const lL = limb(0.1, 0.2, 0x4a3a20); lL.position.y = -0.18; legL.add(lL);
  const legR = new THREE.Group(); legR.position.set(0.2, 0.42, 0);
  const lR = limb(0.1, 0.2, 0x4a3a20); lR.position.y = -0.18; legR.add(lR);

  if (shaman) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.1, 8), M(0x4a3a20));
    rod.position.set(0, -0.55, 0.12);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), basic(0x6ee86e));
    orb.position.set(0, 0.02, 0.12);
    armR.add(rod, orb);
    for (let i = -1; i <= 1; i++) {
      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.34, 6), M(i === 0 ? 0xd83a2a : 0xe8d05a));
      feather.position.set(i * 0.13, 0.34, -0.05);
      feather.rotation.x = -0.25;
      head.add(feather);
    }
  } else {
    const club = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.045, 0.65, 8), M(0x5a4028));
    club.position.set(0, -0.62, 0.1);
    club.rotation.x = Math.PI * 0.9;
    armR.add(club);
  }
  g.add(belly, chest, head, armL, armR, legL, legR);
  shadows(g);
  return { group: g, armL, armR, legL, legR, mats, legs: [legL, legR] };
}

// ---------------------------------------------------------------- balverine
export function makeBalverine() {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const fur = 0x2a2530;

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.9, 6, 12), M(fur));
  body.geometry.scale(1.15, 1, 0.85);
  body.position.y = 1.85;
  body.rotation.x = 0.35;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), M(0x3d3648));
  chest.geometry.scale(1.1, 0.9, 0.8);
  chest.position.set(0, 2.05, 0.3);

  const head = new THREE.Group();
  head.position.set(0, 2.65, 0.42);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), M(fur));
  skull.geometry.scale(0.95, 0.9, 1);
  const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 8), M(0x1a1720));
  muzzle.rotation.x = Math.PI / 2 - 0.1;
  muzzle.position.set(0, -0.06, 0.32);
  head.add(skull, muzzle);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 6), M(fur));
    ear.position.set(s * 0.18, 0.3, -0.05);
    ear.rotation.z = s * 0.3;
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), basic(0xff2a1a));
    eye.position.set(s * 0.13, 0.06, 0.24);
    head.add(eye);
  }

  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.62, 2.25, 0.15);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.55, 4, 10), M(fur));
    upper.position.y = -0.35;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 10), M(fur));
    fore.position.y = -0.95;
    arm.add(upper, fore);
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5), basic(0xd8d8c8));
      claw.position.set(i * 0.07, -1.32, 0.06);
      claw.rotation.x = 2.7;
      arm.add(claw);
    }
    arm.rotation.x = 0.5;
    return arm;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);

  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.32, 1.15, -0.1);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.4, 4, 10), M(fur));
    thigh.position.y = -0.3;
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), M(fur));
    foot.geometry.scale(1, 0.6, 1.5);
    foot.position.set(0, -0.62, 0.1);
    leg.add(thigh, foot);
    return leg;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.7, 4, 8), M(fur));
  tail.position.set(0, 1.5, -0.62);
  tail.rotation.x = 1.1;

  g.add(body, chest, head, armL, armR, legL, legR, tail);
  g.scale.setScalar(1.35);
  shadows(g);
  return { group: g, armL, armR, legL, legR, mats, legs: [legL, legR] };
}

// ---------------------------------------------------------------- beasts (lobo/javali)
export function makeBeast({ color = 0x7a5230, scale = 1, tail = false } = {}) {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);

  const bodyGeo = new THREE.CapsuleGeometry(0.42, 0.8, 6, 12);
  bodyGeo.rotateZ(Math.PI / 2);
  bodyGeo.scale(1, 0.95, 0.85);
  const body = new THREE.Mesh(bodyGeo, M(color));
  body.position.y = 0.78;

  const head = new THREE.Group();
  head.position.set(0.85, 1.0, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), M(color));
  skull.geometry.scale(1.1, 0.95, 0.9);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 8), M(0x3a2c1a));
  snout.rotation.z = -Math.PI / 2;
  snout.position.set(0.32, -0.05, 0);
  head.add(skull, snout);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), basic(0x1a1208));
    eye.position.set(0.16, 0.08, s * 0.14);
    head.add(eye);
    if (tail) {
      // orelhas de lobo
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), M(color));
      ear.position.set(-0.05, 0.26, s * 0.12);
      head.add(ear);
    } else {
      // presas de javali
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 5), basic(0xe8e0c8));
      tusk.position.set(0.3, -0.14, s * 0.1);
      tusk.rotation.x = s * 0.4;
      tusk.rotation.z = 0.6;
      head.add(tusk);
    }
  }

  const legs = [];
  for (const [lx, lz] of [[-0.5, -0.22], [-0.5, 0.22], [0.5, -0.22], [0.5, 0.22]]) {
    const leg = new THREE.Group();
    leg.position.set(lx, 0.62, lz);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.34, 4, 8), M(color));
    limb.position.y = -0.28;
    leg.add(limb);
    legs.push(leg);
    g.add(leg);
  }
  g.add(body, head);
  if (tail) {
    const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.45, 4, 8), M(color));
    t.position.set(-0.85, 1.05, 0);
    t.rotation.z = -0.9;
    g.add(t);
  }
  g.scale.setScalar(scale);
  shadows(g);
  return { group: g, legs, mats };
}

// ---------------------------------------------------------------- beetle
export function makeBeetle({ bomb = false } = {}) {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), M(bomb ? 0x8a2418 : 0x25304a));
  shell.geometry.scale(1.25, 0.62, 1);
  shell.position.y = 0.32;
  const ridge = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), M(bomb ? 0x6a1810 : 0x1a2438));
  ridge.geometry.scale(1.3, 0.5, 0.6);
  ridge.position.y = 0.42;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), M(0x161e30));
  head.position.set(0.5, 0.25, 0);
  const hornM = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.32, 6), M(0x161e30));
  hornM.position.set(0.68, 0.42, 0);
  hornM.rotation.z = -1.0;
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const leg = new THREE.Group();
    leg.position.set(-0.3 + (i % 3) * 0.3, 0.24, i < 3 ? 0.3 : -0.3);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.2, 3, 6), M(0x161e30));
    limb.position.y = -0.1;
    limb.rotation.x = i < 3 ? 0.5 : -0.5;
    leg.add(limb);
    legs.push(leg);
    g.add(leg);
  }
  g.add(shell, ridge, head, hornM);
  if (bomb) {
    const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), basic(0xffb02a));
    fuse.position.set(-0.35, 0.58, 0);
    g.add(fuse);
  }
  shadows(g);
  return { group: g, legs, mats };
}

// ---------------------------------------------------------------- crab
export function makeCrab() {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const shellC = 0xc85a30;

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), M(shellC));
  body.scale.set(1.35, 0.55, 1);
  body.position.y = 0.35;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), M(0xe8b88a));
  belly.scale.set(1.3, 0.4, 0.95);
  belly.position.y = 0.28;
  // olhos em hastes
  for (const sx of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 5), M(shellC));
    stalk.position.set(sx * 0.18, 0.72, 0.32);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    eye.position.set(sx * 0.18, 0.88, 0.34);
    g.add(stalk, eye);
  }
  // garras
  for (const sx of [-1, 1]) {
    const armSeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 3, 6), M(shellC));
    armSeg.rotation.z = sx * 1.2;
    armSeg.position.set(sx * 0.72, 0.38, 0.3);
    const claw = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M(0xd86a3a));
    claw.scale.set(1.3, 0.8, 1);
    claw.position.set(sx * 0.98, 0.42, 0.42);
    const pincer = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 5), M(0xe8b88a));
    pincer.rotation.x = Math.PI / 2;
    pincer.position.set(sx * 0.98, 0.46, 0.66);
    g.add(armSeg, claw, pincer);
  }
  // pernas
  const legGeo = new THREE.CapsuleGeometry(0.035, 0.3, 3, 5);
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const sx = i < 3 ? -1 : 1;
    const leg = new THREE.Mesh(legGeo, M(shellC));
    leg.position.set(sx * 0.55, 0.25, -0.25 + (i % 3) * 0.28);
    leg.rotation.z = sx * 1.1;
    legs.push(leg);
    g.add(leg);
  }
  g.add(body, belly);
  shadows(g);
  return { group: g, legs, mats };
}

// ---------------------------------------------------------------- stone troll
export function makeTroll() {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const stone = 0x7d8288, moss = 0x5a7a3a;

  const body = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 12), M(stone));
  body.geometry.scale(1.05, 1.15, 0.9);
  body.position.y = 2.1;
  const mossPatch = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), M(moss));
  mossPatch.geometry.scale(1.2, 0.5, 1);
  mossPatch.position.y = 3.05;
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52, 0), M(stone));
  head.position.set(0, 3.4, 0.45);
  const eyeMat = basic(0xffb02a);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
    eye.position.set(s * 0.2, 3.45, 0.9);
    g.add(eye);
  }
  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 1.1, 2.85, 0.05);
    const sh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), M(stone));
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.9, 4, 10), M(stone));
    upper.position.y = -0.75;
    const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), M(stone));
    fist.position.y = -1.45;
    arm.add(sh, upper, fist);
    arm.rotation.x = 0.35;
    return arm;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);
  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.5, 1.2, -0.05);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 4, 10), M(stone));
    limb.position.y = -0.55;
    leg.add(limb);
    return leg;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  g.add(body, mossPatch, head, armL, armR, legL, legR);
  shadows(g);
  return { group: g, armL, armR, legL, legR, mats, legs: [legL, legR] };
}

// ---------------------------------------------------------------- chicken
export function makeChicken() {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), M(0xf0ead8));
  body.geometry.scale(0.9, 0.85, 1.15);
  body.position.y = 0.42;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), M(0xf0ead8));
  head.position.set(0, 0.74, 0.24);
  const comb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), M(0xd83a2a));
  comb.geometry.scale(0.5, 1, 1.2);
  comb.position.set(0, 0.87, 0.24);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), M(0xe8a02a));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.73, 0.38);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), M(0xd8d0b8));
  tail.geometry.scale(0.7, 1.1, 0.8);
  tail.position.set(0, 0.55, -0.26);
  tail.rotation.x = -0.5;
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.09, 0.26, 0);
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), M(0xe8a02a));
    limb.position.y = -0.1;
    leg.add(limb);
    legs.push(leg);
    g.add(leg);
  }
  g.add(body, head, comb, beak, tail);
  shadows(g);
  return { group: g, legs, mats };
}

// ---------------------------------------------------------------- weapon models
export function makeWeaponModel(key) {
  const g = new THREE.Group();
  const M = (c, opts = {}) => new THREE.MeshLambertMaterial({ color: c, ...opts });
  const grip = () => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.2, 8), M(0x3a2a12));
    m.position.y = -0.08;
    return m;
  };
  switch (key) {
    case 'machado': {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.0, 8), M(0x5a4028));
      handle.position.y = -0.5;
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 12, 1, false, 0, Math.PI), M(0x9aa0a8));
      head.rotation.x = Math.PI / 2;
      head.rotation.z = -Math.PI / 2;
      head.position.set(0.16, -0.85, 0);
      g.add(handle, head);
      break;
    }
    case 'martelo': {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.0, 8), M(0x4a3520));
      handle.position.y = -0.5;
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.44, 12), M(0x777d88));
      head.rotation.z = Math.PI / 2;
      head.position.y = -0.92;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.025, 6, 16), M(0xc8a24b));
      band.rotation.y = Math.PI / 2;
      band.position.y = -0.92;
      g.add(handle, head, band);
      break;
    }
    case 'espada_longa': {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.085, 1.45, 0.028), M(0xe8eef8));
      blade.position.y = -0.95;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.043, 0.14, 4), M(0xe8eef8));
      tip.rotation.x = Math.PI;
      tip.rotation.y = Math.PI / 4;
      tip.position.y = -1.74;
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8), M(0xc8a24b));
      guard.rotation.z = Math.PI / 2;
      guard.position.y = -0.22;
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), M(0xc8a24b));
      pommel.position.y = 0.04;
      g.add(blade, tip, guard, pommel, grip());
      break;
    }
    case 'arco_cacador':
    case 'arco_longo': {
      const long = key === 'arco_longo';
      const r = long ? 0.62 : 0.5;
      // o ventre do arco (empunhadura) fica na ORIGEM — a mão segura aqui
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.028, 8, 18, Math.PI * 1.05), M(long ? 0x7a5a30 : 0x5a4028));
      arc.rotation.z = -Math.PI * 0.52;
      arc.position.x = -r;
      const stringGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1.03 * r, r * 0.99, 0),
        new THREE.Vector3(-1.03 * r, -r * 0.99, 0),
      ]);
      const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xd8d0b8 }));
      g.add(arc, string, grip());
      break;
    }
    case 'cajado_arcano': {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.6, 8), M(0x4a3560));
      rod.position.y = -0.65;
      const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 6, 16), M(0x4a3560));
      cradle.position.y = -1.48;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), basic(0x8ad0ff));
      orb.position.y = -1.48;
      g.add(rod, cradle, orb);
      break;
    }
    default: { // espada_gasta
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 1.15, 0.026), M(0xb8bcc2));
      blade.position.y = -0.78;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.12, 4), M(0xb8bcc2));
      tip.rotation.x = Math.PI;
      tip.rotation.y = Math.PI / 4;
      tip.position.y = -1.4;
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.28, 8), M(0x8a6d2f));
      guard.rotation.z = Math.PI / 2;
      guard.position.y = -0.2;
      g.add(blade, tip, guard, grip());
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------- text sprite
export function makeTextSprite(text, color = '#ffd24a') {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 96px Georgia';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fillText(text, 32, 68);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(0.7, 1.4, 1);
  return sp;
}
