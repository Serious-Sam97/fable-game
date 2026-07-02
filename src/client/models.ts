import * as THREE from 'three';

// material helper — every model keeps its own materials so we can flash on hit
function matMaker(mats) {
  return (color, opts = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, ...opts });
    mats.push(m);
    return m;
  };
}
function shadows(g) { g.traverse(o => { if (o.isMesh) o.castShadow = true; }); }

// ============================================================ hero
export function makeHero() {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const skin = 0xd8a878;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 0.48), M(0x5a4028)); // leather vest
  torso.position.y = 1.3;
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.02, 0.52), M(0x2e2118));
  strap.position.set(0.18, 1.3, 0); strap.rotation.z = 0.35;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.52), M(0x2e2118));
  belt.position.y = 0.86;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.06), M(0xc8a24b));
  buckle.position.set(0, 0.86, 0.27);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), M(skin));
  head.position.y = 2.12;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.18, 0.56), M(0x3a2a12));
  hair.position.y = 2.44;
  const eyeGeo = new THREE.BoxGeometry(0.07, 0.07, 0.02);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.12, 2.16, 0.27);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.12, 2.16, 0.27);

  const shGeo = new THREE.BoxGeometry(0.36, 0.24, 0.46);
  const shL = new THREE.Mesh(shGeo, M(0x4a3520)); shL.position.set(-0.6, 1.76, 0);
  const shR = new THREE.Mesh(shGeo, M(0x4a3520)); shR.position.set(0.6, 1.76, 0);

  const armGeo = new THREE.BoxGeometry(0.24, 0.82, 0.24);
  armGeo.translate(0, -0.34, 0);
  const armL = new THREE.Mesh(armGeo, M(skin)); armL.position.set(-0.6, 1.68, 0);
  const armR = new THREE.Mesh(armGeo.clone(), M(skin)); armR.position.set(0.6, 1.68, 0);
  const gloveGeo = new THREE.BoxGeometry(0.27, 0.22, 0.27);
  const glL = new THREE.Mesh(gloveGeo, M(0x2e2118)); glL.position.y = -0.68; armL.add(glL);
  const glR = new THREE.Mesh(gloveGeo, M(0x2e2118)); glR.position.y = -0.68; armR.add(glR);

  const legGeo = new THREE.BoxGeometry(0.3, 0.82, 0.3);
  legGeo.translate(0, -0.38, 0);
  const legL = new THREE.Mesh(legGeo, M(0x3a3226)); legL.position.set(-0.22, 0.82, 0);
  const legR = new THREE.Mesh(legGeo.clone(), M(0x3a3226)); legR.position.set(0.22, 0.82, 0);
  const bootGeo = new THREE.BoxGeometry(0.32, 0.24, 0.4);
  const btL = new THREE.Mesh(bootGeo, M(0x241a10)); btL.position.set(0, -0.72, 0.04); legL.add(btL);
  const btR = new THREE.Mesh(bootGeo, M(0x241a10)); btR.position.set(0, -0.72, 0.04); legR.add(btR);

  // cape
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.25), new THREE.MeshLambertMaterial({ color: 0x6a1f14, side: THREE.DoubleSide }));
  cape.position.set(0, 1.72, -0.28);
  cape.geometry.translate(0, -0.62, 0);

  // suporte de arma — o jogo encaixa aqui o modelo da arma equipada
  const weaponMount = new THREE.Group();
  weaponMount.position.set(0, -0.72, 0.02);
  weaponMount.rotation.x = Math.PI;
  armR.add(weaponMount);

  // tatuagens arcanas de Vontade (brilham via bloom conforme a magia cresce)
  const tattooMat = new THREE.MeshLambertMaterial({ color: 0x16243e, emissive: 0x3a8aff, emissiveIntensity: 0 });
  const tattooMeshes = [];
  for (const [side, py] of [[-1, -0.15], [1, -0.15], [-1, -0.32], [1, -0.32]]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.055, 0.03), tattooMat);
    stripe.position.set(0, py, 0.14);
    stripe.visible = false;
    (side < 0 ? armL : armR).add(stripe);
    tattooMeshes.push(stripe);
  }
  const chestTattoo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.03), tattooMat);
  chestTattoo.position.set(0, 1.62, 0.26);
  chestTattoo.visible = false;
  g.add(chestTattoo);
  tattooMeshes.push(chestTattoo);

  // morality: halo & horns (hidden by default)
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 2.85;
  halo.visible = false;
  const horns = new THREE.Group();
  const hornGeo = new THREE.ConeGeometry(0.07, 0.3, 6);
  const hornMat = new THREE.MeshLambertMaterial({ color: 0x5a1010, emissive: 0x300505 });
  const h1 = new THREE.Mesh(hornGeo, hornMat); h1.position.set(-0.2, 2.5, 0); h1.rotation.z = 0.35;
  const h2 = new THREE.Mesh(hornGeo, hornMat); h2.position.set(0.2, 2.5, 0); h2.rotation.z = -0.35;
  horns.add(h1, h2);
  horns.visible = false;

  // suportes de armadura (cabeça/peito/pernas/botas) — o jogo pluga as peças aqui
  const armorMounts = {
    head: new THREE.Group(),
    chest: new THREE.Group(),
    legL: new THREE.Group(), legR: new THREE.Group(),
    bootL: new THREE.Group(), bootR: new THREE.Group(),
  };
  head.add(armorMounts.head);
  torso.add(armorMounts.chest);
  legL.add(armorMounts.legL); legR.add(armorMounts.legR);
  legL.add(armorMounts.bootL); legR.add(armorMounts.bootR);

  g.add(torso, strap, belt, buckle, head, hair, eyeL, eyeR, shL, shR, armL, armR, legL, legR, cape, halo, horns);
  shadows(g);
  return { group: g, armL, armR, legL, legR, cape, halo, horns, mats, weaponMount, torso, shL, shR, tattooMat, tattooMeshes, armorMounts };
}

// ============================================================ armor pieces
// aplica as peças visíveis nos suportes do herói — slots = { head?, chest?, legs?, boots? } (keys de ARMORS)
export function applyArmorTo(model, slots) {
  const m = model.armorMounts;
  for (const k of Object.keys(m)) m[k].clear();
  const mat = (iron) => new THREE.MeshLambertMaterial({ color: iron ? 0x9aa2ac : 0x7a5230 });
  const trim = () => new THREE.MeshLambertMaterial({ color: 0xc8a24b });
  if (slots.head) {
    const iron = slots.head.startsWith('ferro');
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), mat(iron));
    cap.position.y = 0.24;
    m.head.add(cap);
    if (iron) {
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.5), trim());
      crest.position.y = 0.42;
      m.head.add(crest);
    }
  }
  if (slots.chest) {
    const iron = slots.chest.startsWith('ferro');
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.97, 1.06, 0.56), mat(iron));
    m.chest.add(plate);
    if (iron) {
      const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.06), trim());
      emblem.position.set(0, 0.18, 0.29);
      m.chest.add(emblem);
    }
  }
  if (slots.legs) {
    const iron = slots.legs.startsWith('ferro');
    for (const mount of [m.legL, m.legR]) {
      const cuisse = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.52, 0.34), mat(iron));
      cuisse.position.y = -0.22;
      mount.add(cuisse);
    }
  }
  if (slots.boots) {
    const iron = slots.boots.startsWith('ferro');
    for (const mount of [m.bootL, m.bootR]) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.44), mat(iron));
      boot.position.set(0, -0.72, 0.05);
      mount.add(boot);
    }
  }
  model.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
}

// ============================================================ weapon models
export function makeWeaponModel(key) {
  const g = new THREE.Group();
  const M = (c, opts = {}) => new THREE.MeshLambertMaterial({ color: c, ...opts });
  const grip = () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), M(0x3a2a12));
    m.position.y = -0.08;
    return m;
  };
  switch (key) {
    case 'machado': {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.0, 6), M(0x5a4028));
      handle.position.y = -0.5;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.06), M(0x9aa0a8));
      head.position.set(0.14, -0.85, 0);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.07), M(0xd8dfe8));
      edge.position.set(0.33, -0.85, 0);
      g.add(handle, head, edge);
      break;
    }
    case 'martelo': {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.0, 6), M(0x4a3520));
      handle.position.y = -0.5;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.26), M(0x777d88));
      head.position.y = -0.92;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.28), M(0xc8a24b));
      band.position.y = -0.92;
      g.add(handle, head, band);
      break;
    }
    case 'espada_longa': {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.45, 0.03), M(0xe8eef8));
      blade.position.y = -0.95;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.09), M(0xc8a24b));
      guard.position.y = -0.22;
      g.add(blade, guard, grip());
      break;
    }
    case 'arco_cacador':
    case 'arco_longo': {
      const long = key === 'arco_longo';
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(long ? 0.62 : 0.5, 0.03, 6, 14, Math.PI * 1.05),
        M(long ? 0x7a5a30 : 0x5a4028)
      );
      arc.rotation.z = -Math.PI * 0.52;
      arc.position.y = -0.55;
      const stringGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.02, -0.55 + (long ? 0.62 : 0.5), 0),
        new THREE.Vector3(0.02, -0.55 - (long ? 0.62 : 0.5), 0),
      ]);
      const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xd8d0b8 }));
      g.add(arc, string, grip());
      break;
    }
    case 'cajado_arcano': {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 6), M(0x4a3560));
      rod.position.y = -0.65;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0x8ad0ff }));
      orb.position.y = -1.5;
      g.add(rod, orb);
      break;
    }
    default: { // espada_gasta
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 0.03), M(0xb8bcc2));
      blade.position.y = -0.78;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), M(0x8a6d2f));
      guard.position.y = -0.2;
      g.add(blade, guard, grip());
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ============================================================ villagers / NPCs
export function makeVillager({ robe = 0x2a4a7a, skin = 0xd8a878, hair = 0x888888, beard = false, hat = null, staff = false } = {}) {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.55), M(robe));
  body.position.y = 1.0;
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.65), M(robe));
  skirt.position.y = 0.28;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), M(skin));
  head.position.y = 2.05;
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.16, 0.54), M(hair));
  hairM.position.y = 2.35;
  g.add(body, skirt, head, hairM);
  if (beard) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.12), M(0xd8d8d8));
    b.position.set(0, 1.86, 0.26);
    g.add(b);
  }
  if (hat === 'top') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12), M(0x2a2118));
    brim.position.y = 2.42;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.5, 12), M(0x2a2118));
    top.position.y = 2.68;
    g.add(brim, top);
  } else if (hat === 'hood') {
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 8), M(robe));
    hood.position.y = 2.5;
    g.add(hood);
  }
  const armGeo = new THREE.BoxGeometry(0.22, 0.8, 0.22);
  armGeo.translate(0, -0.32, 0);
  const armL = new THREE.Mesh(armGeo, M(robe)); armL.position.set(-0.58, 1.6, 0);
  const armR = new THREE.Mesh(armGeo.clone(), M(robe)); armR.position.set(0.58, 1.6, 0);
  g.add(armL, armR);
  if (staff) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), M(0x5a4028));
    st.position.set(0, -0.4, 0.15);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0x7fd0ff }));
    orb.position.set(0, 0.75, 0.15);
    st.add(orb);
    armR.add(st);
  }
  shadows(g);
  return { group: g, armL, armR, mats };
}

// ============================================================ bandit
export function makeBandit({ leader = false, archer = false } = {}) {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const skin = 0xc89868;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.5), M(leader ? 0x3a1a2e : 0x33302a));
  torso.position.y = 1.3;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), M(skin));
  head.position.y = 2.1;
  const bandana = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.56), M(leader ? 0xc8a24b : 0x8a1c1c));
  bandana.position.y = 2.36;
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.16, 0.1), M(0x1a1512));
  mask.position.set(0, 2.0, 0.24);
  const armGeo = new THREE.BoxGeometry(0.24, 0.82, 0.24);
  armGeo.translate(0, -0.34, 0);
  const armL = new THREE.Mesh(armGeo, M(skin)); armL.position.set(-0.6, 1.68, 0);
  const armR = new THREE.Mesh(armGeo.clone(), M(skin)); armR.position.set(0.6, 1.68, 0);
  const legGeo = new THREE.BoxGeometry(0.3, 0.82, 0.3);
  legGeo.translate(0, -0.38, 0);
  const legL = new THREE.Mesh(legGeo, M(0x241f18)); legL.position.set(-0.22, 0.82, 0);
  const legR = new THREE.Mesh(legGeo.clone(), M(0x241f18)); legR.position.set(0.22, 0.82, 0);
  if (archer) {
    // arco na mão + aljava nas costas
    const bow = makeWeaponModel('arco_cacador');
    bow.position.set(0, -0.72, 0.02);
    bow.rotation.x = Math.PI;
    armR.add(bow);
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 6), M(0x5a4028));
    quiver.position.set(-0.2, 1.6, -0.32);
    quiver.rotation.z = 0.3;
    g.add(quiver);
  } else {
    // crude blade
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.95, 0.04), M(0x9aa0a8));
    blade.position.set(0, -0.75, 0.15);
    blade.rotation.x = Math.PI * 0.9;
    armR.add(blade);
  }
  g.add(torso, head, bandana, mask, armL, armR, legL, legR);
  shadows(g);
  return { group: g, armL, armR, legL, legR, mats, legs: [legL, legR] };
}

// ============================================================ hobbe (goblin)
export function makeHobbe({ shaman = false } = {}) {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const skinC = 0x7a8a4a;

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.5), M(skinC));
  body.position.y = 0.75;
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.52), M(0x9aa86a));
  belly.position.y = 0.65;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.55), M(skinC));
  head.position.y = 1.35;
  const earGeo = new THREE.ConeGeometry(0.09, 0.35, 4);
  const earL = new THREE.Mesh(earGeo, M(skinC)); earL.position.set(-0.36, 1.5, 0); earL.rotation.z = 1.1;
  const earR = new THREE.Mesh(earGeo, M(skinC)); earR.position.set(0.36, 1.5, 0); earR.rotation.z = -1.1;
  const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd24a });
  const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.14, 1.4, 0.29);
  const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set(0.14, 1.4, 0.29);
  const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
  armGeo.translate(0, -0.24, 0);
  const armL = new THREE.Mesh(armGeo, M(skinC)); armL.position.set(-0.5, 1.0, 0);
  const armR = new THREE.Mesh(armGeo.clone(), M(skinC)); armR.position.set(0.5, 1.0, 0);
  const legGeo = new THREE.BoxGeometry(0.24, 0.42, 0.24);
  legGeo.translate(0, -0.18, 0);
  const legL = new THREE.Mesh(legGeo, M(0x4a3a20)); legL.position.set(-0.2, 0.42, 0);
  const legR = new THREE.Mesh(legGeo.clone(), M(0x4a3a20)); legR.position.set(0.2, 0.42, 0);
  if (shaman) {
    // cajado tosco com orbe verde + cocar de penas
    const staffRod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.1, 5), M(0x4a3a20));
    staffRod.position.set(0, -0.5, 0.1);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0x6ee86e }));
    orb.position.set(0, -1.05, 0.1);
    armR.add(staffRod, orb);
    for (let i = -1; i <= 1; i++) {
      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 4), M(i === 0 ? 0xd83a2a : 0xe8d05a));
      feather.position.set(i * 0.14, 1.75, -0.05);
      feather.rotation.x = -0.25;
      g.add(feather);
    }
  } else {
    const club = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.05, 0.7, 6), M(0x5a4028));
    club.position.set(0, -0.6, 0.1); club.rotation.x = Math.PI * 0.85;
    armR.add(club);
  }
  g.add(body, belly, head, earL, earR, eL, eR, armL, armR, legL, legR);
  shadows(g);
  return { group: g, armL, armR, legL, legR, mats, legs: [legL, legR] };
}

// ============================================================ balverine (boss)
export function makeBalverine() {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const fur = 0x2a2530;

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.7), M(fur));
  body.position.y = 1.7; body.rotation.x = 0.3;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.5), M(0x3d3648));
  chest.position.set(0, 1.9, 0.25); chest.rotation.x = 0.3;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.6), M(fur));
  head.position.set(0, 2.55, 0.3);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.4), M(0x1a1720));
  snout.position.set(0, 2.45, 0.72);
  const earGeo = new THREE.ConeGeometry(0.12, 0.4, 4);
  const earL = new THREE.Mesh(earGeo, M(fur)); earL.position.set(-0.24, 2.95, 0.25);
  const earR = new THREE.Mesh(earGeo, M(fur)); earR.position.set(0.24, 2.95, 0.25);
  const eyeGeo = new THREE.SphereGeometry(0.07, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.16, 2.62, 0.62);
  const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set(0.16, 2.62, 0.62);

  const armGeo = new THREE.BoxGeometry(0.3, 1.5, 0.3);
  armGeo.translate(0, -0.65, 0);
  const armL = new THREE.Mesh(armGeo, M(fur)); armL.position.set(-0.72, 2.2, 0.15); armL.rotation.x = 0.5;
  const armR = new THREE.Mesh(armGeo.clone(), M(fur)); armR.position.set(0.72, 2.2, 0.15); armR.rotation.x = 0.5;
  const clawGeo = new THREE.ConeGeometry(0.05, 0.25, 4);
  for (const arm of [armL, armR]) {
    for (let i = -1; i <= 1; i++) {
      const c = new THREE.Mesh(clawGeo, new THREE.MeshLambertMaterial({ color: 0xd8d8c8 }));
      c.position.set(i * 0.09, -1.4, 0.08); c.rotation.x = 2.6;
      arm.add(c);
    }
  }
  const legGeo = new THREE.BoxGeometry(0.36, 1.0, 0.36);
  legGeo.translate(0, -0.45, 0);
  const legL = new THREE.Mesh(legGeo, M(fur)); legL.position.set(-0.32, 1.05, -0.1);
  const legR = new THREE.Mesh(legGeo.clone(), M(fur)); legR.position.set(0.32, 1.05, -0.1);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.9), M(fur));
  tail.position.set(0, 1.35, -0.6); tail.rotation.x = -0.5;
  g.add(body, chest, head, snout, earL, earR, eL, eR, armL, armR, legL, legR, tail);
  g.scale.setScalar(1.35);
  shadows(g);
  return { group: g, armL, armR, legL, legR, mats, legs: [legL, legR] };
}

// ============================================================ beasts
export function makeBeast({ color = 0x7a5230, scale = 1, tail = false } = {}) {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.8), M(color));
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), M(color));
  head.position.set(0.95, 1.0, 0);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.35), M(0x3a2c1a));
  snout.position.set(1.35, 0.9, 0);
  const legGeo = new THREE.BoxGeometry(0.22, 0.6, 0.22);
  legGeo.translate(0, -0.3, 0);
  const legs = [];
  for (const [lx, lz] of [[-0.55, -0.25], [-0.55, 0.25], [0.55, -0.25], [0.55, 0.25]]) {
    const leg = new THREE.Mesh(legGeo.clone(), M(color));
    leg.position.set(lx, 0.6, lz);
    legs.push(leg); g.add(leg);
  }
  g.add(body, head, snout);
  if (tail) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.15), M(color));
    t.position.set(-0.95, 1.0, 0); t.rotation.z = 0.5;
    g.add(t);
  }
  g.scale.setScalar(scale);
  shadows(g);
  return { group: g, legs, mats };
}

// ============================================================ beetle
export function makeBeetle({ bomb = false } = {}) {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), M(bomb ? 0x8a2418 : 0x25304a));
  shell.scale.set(1.25, 0.62, 1);
  shell.position.y = 0.32;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M(0x161e30));
  head.position.set(0.5, 0.25, 0);
  const hornM = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 4), M(0x161e30));
  hornM.position.set(0.72, 0.42, 0); hornM.rotation.z = -1.0;
  const legGeo = new THREE.BoxGeometry(0.05, 0.25, 0.05);
  legGeo.translate(0, -0.1, 0);
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const leg = new THREE.Mesh(legGeo.clone(), M(0x161e30));
    leg.position.set(-0.3 + (i % 3) * 0.3, 0.22, i < 3 ? 0.32 : -0.32);
    leg.rotation.x = i < 3 ? 0.5 : -0.5;
    legs.push(leg); g.add(leg);
  }
  g.add(shell, head, hornM);
  if (bomb) {
    // pavio brilhante — aviso do que está por vir
    const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffb02a }));
    fuse.position.set(-0.35, 0.55, 0);
    g.add(fuse);
  }
  shadows(g);
  return { group: g, legs, mats };
}

// ============================================================ stone troll (mini-boss)
export function makeTroll() {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const stone = 0x7d8288, moss = 0x5a7a3a;

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.0, 1.2), M(stone));
  body.position.y = 2.0; body.rotation.x = 0.25;
  const mossPatch = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.25), M(moss));
  mossPatch.position.y = 2.9; mossPatch.rotation.x = 0.25;
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), M(stone));
  head.position.set(0, 3.3, 0.5);
  const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb02a });
  const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.2, 3.35, 0.95);
  const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set(0.2, 3.35, 0.95);
  const shGeo = new THREE.DodecahedronGeometry(0.6, 0);
  const shL = new THREE.Mesh(shGeo, M(stone)); shL.position.set(-1.15, 2.9, 0);
  const shR = new THREE.Mesh(shGeo, M(stone)); shR.position.set(1.15, 2.9, 0);
  const armGeo = new THREE.BoxGeometry(0.5, 2.0, 0.5);
  armGeo.translate(0, -0.85, 0);
  const armL = new THREE.Mesh(armGeo, M(stone)); armL.position.set(-1.15, 2.8, 0.1); armL.rotation.x = 0.4;
  const armR = new THREE.Mesh(armGeo.clone(), M(stone)); armR.position.set(1.15, 2.8, 0.1); armR.rotation.x = 0.4;
  const fistGeo = new THREE.DodecahedronGeometry(0.42, 0);
  const fL = new THREE.Mesh(fistGeo, M(stone)); fL.position.y = -1.9; armL.add(fL);
  const fR = new THREE.Mesh(fistGeo, M(stone)); fR.position.y = -1.9; armR.add(fR);
  const legGeo = new THREE.BoxGeometry(0.6, 1.1, 0.6);
  legGeo.translate(0, -0.5, 0);
  const legL = new THREE.Mesh(legGeo, M(stone)); legL.position.set(-0.5, 1.1, -0.1);
  const legR = new THREE.Mesh(legGeo.clone(), M(stone)); legR.position.set(0.5, 1.1, -0.1);
  g.add(body, mossPatch, head, eL, eR, shL, shR, armL, armR, legL, legR);
  shadows(g);
  return { group: g, armL, armR, legL, legR, mats, legs: [legL, legR] };
}

// ============================================================ chicken
export function makeChicken() {
  const g = new THREE.Group();
  const mats = [];
  const M = matMaker(mats);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.55), M(0xf0ead8));
  body.position.y = 0.42;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), M(0xf0ead8));
  head.position.set(0, 0.78, 0.28);
  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.16), M(0xd83a2a));
  comb.position.set(0, 0.94, 0.28);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), M(0xe8a02a));
  beak.position.set(0, 0.76, 0.44); beak.rotation.x = Math.PI / 2;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.14), M(0xd8d0b8));
  tail.position.set(0, 0.58, -0.3); tail.rotation.x = -0.5;
  const legGeo = new THREE.BoxGeometry(0.04, 0.24, 0.04);
  legGeo.translate(0, -0.1, 0);
  const legL = new THREE.Mesh(legGeo, M(0xe8a02a)); legL.position.set(-0.09, 0.24, 0);
  const legR = new THREE.Mesh(legGeo.clone(), M(0xe8a02a)); legR.position.set(0.09, 0.24, 0);
  g.add(body, head, comb, beak, tail, legL, legR);
  shadows(g);
  return { group: g, legs: [legL, legR], mats };
}

// ============================================================ text sprite (quest markers)
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
