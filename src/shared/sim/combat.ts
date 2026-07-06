// Resolvedor de combate — valida e aplica casts. Roda no SERVIDOR quando online
// (o cliente só pede; range/cooldown/dano são decididos aqui) e no cliente em modo solo.
import { EnemySim, SimEnemy } from './enemies';
import {
  ABILITIES, abilityDamage, discSource, CombatStats,
  FIREBALL_SPEED, PUSH_RADIUS, PUSH_FORCE, CHAIN_RADIUS, CHAIN_MAX, ARROW_SPEED,
  PERK_QUAKE, PERK_PIERCE, PERK_TWIN,
} from '../defs/abilities';

export interface CasterView extends CombatStats {
  id: number;
  x: number;
  z: number;
}

// Fase 22/24: projétil balístico — viaja no sim e resolve por COLISÃO (não targetId).
// kind 'arrow' = single-target (flecha); kind 'bola' = explode com AoE no impacto (magia direcional).
interface Projectile {
  x: number; z: number;      // posição atual
  vx: number; vz: number;    // velocidade (u/s)
  pid: number;               // atirador
  charge: number;            // tensão do arco (0..1) — escala o dano
  dist: number; maxDist: number; // alcance percorrido / limite (miss)
  caster: CasterView;        // snapshot dos stats pro cálculo de dano
  kind: 'arrow' | 'bola' | 'gelo';  // flecha (single) / bola de fogo (AoE) / estilhaço de gelo (congela) — Fase 24/25
  level: number;             // nível de carga da magia (bola/gelo) — Fase 23/24/25
  hitIds?: Set<number>;      // Fase 45: inimigos já transpassados por esta flecha (perk Flecha Perfurante)
}

const QUAKE_RADIUS = 4.5;    // Fase 45: alcance da onda de choque do finalizador (perk Terremoto)
const TWIN_SPREAD = 0.22;    // Fase 45: meia-abertura do leque da Conjuração Gêmea (~12.6° por lado)

const RANGE_TOLERANCE = 1.3;  // folga para latência (posição do cliente ~100ms atrás)
const MIN_CAST_GAP = 0.85;    // GCD do servidor, um pouco menor que o do cliente
const MULT_CAP = 25;          // teto do multiplicador de fluência (+75% de dano no máximo) — Fase 19
const MELEE_ARC_COS = 0.35;   // arco frontal do golpe melee (~139°) — Fase 11
const MELEE_GAP = 0.36;       // ritmo de swing do melee — Fase 12; Fase 49: 0.30→0.36 (melee não domina grupo+single)
const ARROW_HIT_R = 0.9;      // raio de colisão da flecha com o corpo do inimigo (Fase 22)
const BOLA_BLAST = 3.2;       // raio base da explosão da Bola de Fogo (Fase 24) — escala com o nível
const SPELL_AIM_COS = 0.5;    // cone de mira da magia direcional (~120°) — Fase 24

// menor distância do ponto (px,pz) ao segmento (ax,az)->(bx,bz) — evita tunneling da flecha rápida
function segDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export class CombatSim {
  private cds = new Map<number, Map<string, number>>();       // pid → ability → pronto em t
  private lastCast = new Map<number, number>();               // magias/arco (GCD)
  private lastMelee = new Map<number, number>();              // golpes melee (ritmo próprio) — Fase 12
  private mult = new Map<number, number>();  // pid → multiplicador de fluência (Fase 19: só zera ao apanhar)
  private combo = new Map<number, { n: number; last: number }>();
  private pending: Array<{ at: number; run: () => void }> = [];
  private projectiles: Projectile[] = [];   // flechas em voo (Fase 22)
  private t = 0;

  constructor(public sim: EnemySim) {}

  /** chamado quando um inimigo acerta o herói — zera o multiplicador dele (Fase 19: a ÚNICA forma de zerar) */
  notePlayerHit(pid: number) { this.mult.delete(pid); }

  /** Fase 38: limpa TODO o estado per-pid ao desconectar (sem leak, sem estado velho ressurgindo) */
  removePlayer(pid: number) {
    this.cds.delete(pid);
    this.lastCast.delete(pid);
    this.lastMelee.delete(pid);
    this.mult.delete(pid);
    this.combo.delete(pid);
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (this.projectiles[i].pid === pid) this.projectiles.splice(i, 1);
  }

  // Fase 19: multiplicador de fluência estilo Fable — sobe a cada acerto e NÃO decai com o tempo.
  // Só zera quando o herói apanha (notePlayerHit). Recompensa manter o combo limpo, encontro após encontro.
  private bumpMult(pid: number): number {
    const n = Math.min(MULT_CAP, (this.mult.get(pid) ?? 0) + 1);
    this.mult.set(pid, n);
    return n;
  }

  private targetable(e: SimEnemy | undefined): e is SimEnemy {
    return !!e && e.state !== 'dead' && e.state !== 'surrender' && e.state !== 'flee';
  }

  // Fase 28: status effects — CHOQUE (Raio interrompe) e MEDO (Empurrão faz fugir); rotulados no cliente via 'estat'
  private shock(e: SimEnemy, dur: number) {
    if (e.state === 'dead' || e.state === 'surrender') return;
    e.shockT = Math.max(e.shockT, dur);
    this.sim.events.push({ t: 'estat', id: e.id, kind: 'shock' });
  }
  private fear(e: SimEnemy, dur: number) {
    if (e.state === 'dead' || e.state === 'surrender') return;
    e.fearT = Math.max(e.fearT, dur);
    this.sim.events.push({ t: 'estat', id: e.id, kind: 'fear' });
  }

  // Fase 24: magia direcional — escolhe o inimigo mais alinhado à mira (cone frontal, dentro do alcance)
  private aimEnemy(cx: number, cz: number, dir: number, range: number, lagT = 0): SimEnemy | undefined {
    const fx = Math.sin(dir), fz = Math.cos(dir);
    let best: SimEnemy | undefined, bestScore = SPELL_AIM_COS;
    for (const e of this.sim.enemies.values()) {
      if (!this.targetable(e)) continue;
      const p = this.sim.posAt(e.id, lagT); // Fase 35: lag comp — onde o atacante viu o inimigo
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d > range * RANGE_TOLERANCE) continue;
      const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1; // alinhamento com a mira
      const score = dot - d * 0.02; // prefere alinhado e um pouco mais perto
      if (dot >= SPELL_AIM_COS && score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  private hit(c: CasterView, key: string, targetId: number, scale = 1) {
    const { dmg, crit } = abilityDamage(key, c, this.bumpMult(c.id));
    this.sim.applyDamage(targetId, Math.round(dmg * scale), c.id, discSource(key, c.wpnKind), crit);
  }

  cast(c: CasterView, key: string, targetId?: number, dir?: number, flourish?: boolean, charge?: number, level?: number, lagT = 0): boolean {
    const ab = ABILITIES[key];
    if (!ab || key === 'cura') return false; // cura é local do cliente
    // Fase 21: tensão do arco (0..1) — só o arco tensiona; escala dano e alcance do tiro
    const isBow = key === 'golpe' && c.wpnKind === 'bow';
    const chg = isBow ? Math.min(1, Math.max(0, charge ?? 0)) : 0;
    const bowDmg = 1 + chg * 1.0;      // tiro cheio bate 2×
    const bowRange = 1 + chg * 0.35;   // tensionar alcança mais longe
    // Fase 23: nível de carga da magia (1..3) — mais dano/área/efeito por nível (Fable Will)
    const lvl = Math.min(3, Math.max(1, Math.round(level ?? 1)));
    const lvlScale = 1 + (lvl - 1) * 0.6; // L1=1×, L2=1.6×, L3=2.2× no dano
    // Fase 12: golpe melee tem ritmo próprio (rápido), em lane separada do GCD das magias
    const isMeleeSwing = key === 'golpe' && c.wpnKind !== 'bow';
    const lastMap = isMeleeSwing ? this.lastMelee : this.lastCast;
    if ((lastMap.get(c.id) ?? -9) > this.t - (isMeleeSwing ? MELEE_GAP : MIN_CAST_GAP)) return false;
    const pcds = this.cds.get(c.id) ?? new Map<string, number>();
    if ((pcds.get(key) ?? 0) > this.t) return false;

    // Fase 11: golpe MELEE com facing → arco frontal (não precisa de alvo travado).
    // Fase 22: arco com facing → PROJÉTIL balístico (mira livre; resolve por colisão, sem targetId).
    // Só feitiços seguem single-target (precisam de targetId).
    const directionalMelee = key === 'golpe' && c.wpnKind !== 'bow' && dir !== undefined;
    const ballisticBow = isBow && dir !== undefined;
    // Fase 24/25: Bola/Relâmpago/Gelo miram por DIREÇÃO (não alvo travado) quando vem `dir`
    const directionalSpell = (key === 'bola' || key === 'relampago' || key === 'gelo') && dir !== undefined;
    const tgt = targetId !== undefined ? this.sim.enemies.get(targetId) : undefined;
    if (ab.needTarget && !directionalMelee && !ballisticBow && !directionalSpell) {
      if (!this.targetable(tgt)) return false;
      // golpe usa o alcance da arma equipada (arco ataca de longe; tensionar estende — Fase 21)
      const range = key === 'golpe' ? c.wpnRange * bowRange : ab.range;
      const tp = this.sim.posAt(tgt.id, lagT); // Fase 35: alcance checado onde o atacante VIU o alvo
      const d = Math.hypot(tp.x - c.x, tp.z - c.z);
      if (d > range * RANGE_TOLERANCE) return false;
    }

    // validado — cobra cooldown e executa
    pcds.set(key, this.t + ab.cd * 0.95);
    this.cds.set(c.id, pcds);
    lastMap.set(c.id, this.t);
    // Fase 36: anuncia a AÇÃO do herói (swing/tiro/cast) → os outros clientes animam o aliado em tempo
    const actKind = key === 'golpe' ? (isBow ? 'bow' : flourish ? 'flourish' : 'melee') : 'spell';
    this.sim.events.push({ t: 'eact', pid: c.id, a: actKind });

    switch (key) {
      case 'golpe': {
        if (ballisticBow) {
          // Fase 22: lança uma flecha balística — viaja pela dir e resolve por colisão no update()
          const speed = ARROW_SPEED * (1 + chg * 0.7); // tensão acelera a flecha
          this.projectiles.push({
            x: c.x, z: c.z,
            vx: Math.sin(dir!) * speed, vz: Math.cos(dir!) * speed,
            pid: c.id, charge: chg, dist: 0,
            maxDist: c.wpnRange * bowRange * 2.4, // voa bem além do alcance de mira; erra se não colidir
            caster: { ...c }, kind: 'arrow', level: 1,
          });
          break; // sem hit instantâneo — o dano sai na colisão
        }
        // combo POR SWING (não por alvo): 3 golpes em 2.5s — o 3º bate 30% mais forte e empurra
        let cb = this.combo.get(c.id);
        if (!cb || this.t - cb.last > 2.5) cb = { n: 0, last: 0 };
        cb.n++;
        cb.last = this.t;
        let scale = cb.n === 2 ? 1.1 : 1;
        const finisher = cb.n >= 3;
        if (finisher) { scale = 1.3; cb.n = 0; }
        this.combo.set(c.id, cb);
        if (directionalMelee) {
          // Fase 11: arco frontal — acerta TODOS os inimigos à frente, dentro do alcance
          const reach = c.wpnRange * RANGE_TOLERANCE * (flourish ? 1.2 : 1);
          const fx = Math.sin(dir!), fz = Math.cos(dir!);
          const swScale = flourish ? 2.4 : scale; // Fase 13: flourish carregado bate MUITO mais forte
          let first: SimEnemy | undefined;
          for (const e of this.sim.enemies.values()) {
            if (!this.targetable(e)) continue;
            const p = this.sim.posAt(e.id, lagT); // Fase 35: lag comp — o arco bate onde o atacante VIU o inimigo
            const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
            if (d > reach) continue;
            if ((d > 0.01 ? (dx * fx + dz * fz) / d : 1) < MELEE_ARC_COS) continue;
            const exec = e.stunT > 0 || e.frozenT > 0; // Fase 15/28: golpe num inimigo ATORDOADO ou CONGELADO = execução (estilhaça)
            this.hit(c, 'golpe', e.id, exec ? 4 : swScale);
            if (exec) this.sim.events.push({ t: 'eexec', id: e.id, pid: c.id });
            const kn = (flourish ? 12 : finisher ? 8 : 2.5) * (c.wpnKnock ?? 1); // Fase 14/16: empurrão direcional × força da arma (martelo empurra muito mais)
            if (flourish) this.sim.stun(e.id, 1.3); // derruba/atordoa
            this.sim.knock(e.id, (dx / (d || 1)) * kn, (dz / (d || 1)) * kn);
            if (!first) first = e;
          }
          if ((finisher || flourish) && first) this.sim.events.push({ t: 'ecombo', id: first.id, pid: c.id });
          // Fase 45 — perk Terremoto: o golpe climático (finalizador/flourish) abre uma ONDA DE CHOQUE
          // RADIAL (360°, não só o arco frontal): empurra pra fora + atordoa breve TODOS ao redor.
          // É controle de multidão — muda o moveset do finisher de "linha" pra "limpa-área".
          if ((finisher || flourish) && (c.perks & PERK_QUAKE)) {
            this.sim.events.push({ t: 'shock', x: c.x, z: c.z }); // anel/poeira (reusa VFX do Empurrão)
            for (const e of this.sim.enemies.values()) {
              if (!this.targetable(e)) continue;
              const p = this.sim.posAt(e.id, lagT);
              const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
              if (d > QUAKE_RADIUS) continue;
              const n = d || 1;
              this.sim.knock(e.id, (dx / n) * 6, (dz / n) * 6);
              this.sim.stun(e.id, 0.6); // atordoa breve → abre execução (Fase 15)
            }
          }
        } else {
          // arco (bow) / legado: single-target
          if (finisher) {
            this.sim.events.push({ t: 'ecombo', id: tgt!.id, pid: c.id });
            const d = Math.hypot(tgt!.x - c.x, tgt!.z - c.z) || 1;
            this.sim.knock(tgt!.id, ((tgt!.x - c.x) / d) * 8, ((tgt!.z - c.z) / d) * 8);
          }
          this.hit(c, 'golpe', tgt!.id, scale * bowDmg); // Fase 21: arco tensionado bate mais forte (bowDmg=1 se não-arco)
        }
        break;
      }
      case 'bola': {
        if (directionalSpell) {
          // Fase 24: Bola vira PROJÉTIL direcional — voa pela dir e EXPLODE (AoE) no impacto/fim do alcance
          // Fase 45 — perk Conjuração Gêmea: dispara um LEQUE de 3 bolas (dir e ±TWIN_SPREAD); cada uma explode
          const angs = (c.perks & PERK_TWIN) ? [dir! - TWIN_SPREAD, dir!, dir! + TWIN_SPREAD] : [dir!];
          for (const a of angs) {
            this.projectiles.push({
              x: c.x, z: c.z,
              vx: Math.sin(a) * FIREBALL_SPEED, vz: Math.cos(a) * FIREBALL_SPEED,
              pid: c.id, charge: 0, dist: 0, maxDist: ab.range,
              caster: { ...c }, kind: 'bola', level: lvl,
            });
          }
          break;
        }
        // legado (sem dir): dano agendado pelo tempo de voo até o alvo travado
        const id = tgt!.id;
        const delay = Math.hypot(tgt!.x - c.x, tgt!.z - c.z) / FIREBALL_SPEED;
        this.pending.push({ at: this.t + delay, run: () => {
          const e = this.sim.enemies.get(id);
          if (!this.targetable(e)) return;
          this.sim.events.push({ t: 'boom', x: e.x, z: e.z });
          this.hit(c, 'bola', id, lvlScale); // Fase 23: nível escala o impacto
          // queimadura: dano residual escalando com Vontade E com o nível de carga (Fase 23)
          if (e.state !== 'dead') {
            e.burnT = 3 + (lvl - 1);
            e.burnTick = 1;
            e.burnDmg = Math.max(2, Math.round((2 + c.wil * 0.4) * lvlScale));
            e.burnPid = c.id;
          }
        } });
        break;
      }
      case 'relampago': {
        // Fase 24: mira por DIREÇÃO — atinge o inimigo alinhado à mira (fallback: alvo travado legado)
        const primary = directionalSpell ? this.aimEnemy(c.x, c.z, dir!, ab.range, lagT) : tgt;
        if (!this.targetable(primary)) {
          // sem ninguém na mira → o raio arqueia no vazio (só visual, sem dano)
          const fx = Math.sin(dir ?? 0) * 10, fz = Math.cos(dir ?? 0) * 10;
          this.sim.events.push({ t: 'bolt', ax: c.x, az: c.z, ay: 2, bx: c.x + fx, bz: c.z + fz, by: 1.2 });
          break;
        }
        this.sim.events.push({ t: 'bolt', ax: c.x, az: c.z, ay: 2, bx: primary.x, bz: primary.z, by: 1.2 });
        this.hit(c, 'relampago', primary.id, lvlScale); // Fase 23: nível escala o dano
        this.shock(primary, 0.4 + (lvl - 1) * 0.2); // Fase 28: CHOQUE — interrompe (mais longo por nível)
        let last: SimEnemy = primary;
        let chained = 0;
        const maxChain = CHAIN_MAX + Math.round(c.chainBonus ?? 0) + (lvl - 1); // Tormenta + nível de carga (Fase 23)
        for (const e of this.sim.enemies.values()) {
          if (chained >= maxChain) break;
          if (e === primary || !this.targetable(e)) continue;
          if (Math.hypot(e.x - last.x, e.z - last.z) < CHAIN_RADIUS) {
            this.sim.events.push({ t: 'bolt', ax: last.x, az: last.z, ay: 1.2, bx: e.x, bz: e.z, by: 1.2 });
            this.hit(c, 'relampago', e.id, 0.6 * lvlScale);
            this.shock(e, 0.4 + (lvl - 1) * 0.2); // choque também nos encadeados
            last = e;
            chained++;
          }
        }
        break;
      }
      case 'gelo': {
        // Fase 25: Estilhaço de Gelo — projétil direcional que dá dano e CONGELA (chill) quem acerta
        this.projectiles.push({
          x: c.x, z: c.z,
          vx: Math.sin(dir ?? 0) * FIREBALL_SPEED, vz: Math.cos(dir ?? 0) * FIREBALL_SPEED,
          pid: c.id, charge: 0, dist: 0, maxDist: ab.range,
          caster: { ...c }, kind: 'gelo', level: lvl,
        });
        break;
      }
      case 'empurrao': {
        // Fase 23: nível escala raio, dano e força do empurrão
        const radius = PUSH_RADIUS * (1 + (lvl - 1) * 0.4);
        const force = PUSH_FORCE * (1 + (lvl - 1) * 0.35);
        this.sim.events.push({ t: 'shock', x: c.x, z: c.z });
        for (const e of this.sim.enemies.values()) {
          if (!this.targetable(e)) continue;
          const p = this.sim.posAt(e.id, lagT); // Fase 35: lag comp — pega quem o atacante VIU no raio
          const d = Math.hypot(p.x - c.x, p.z - c.z);
          if (d < radius) {
            this.hit(c, 'empurrao', e.id, lvlScale);
            const n = d || 1;
            this.sim.knock(e.id, ((p.x - c.x) / n) * force, ((p.z - c.z) / n) * force);
            if (lvl >= 2) this.fear(e, 1.5 + (lvl - 2) * 1.0); // Fase 28: empurrão carregado apavora → foge
          }
        }
        break;
      }
      case 'tempolento': {
        this.sim.castSlow();
        break;
      }
    }
    return true;
  }

  update(dt: number) {
    this.t += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].at <= this.t) {
        const p = this.pending[i];
        this.pending.splice(i, 1);
        p.run();
      }
    }
    // Fase 22/24: avança os projéteis em voo e resolve colisão por segmento (sem tunneling)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const ox = p.x, oz = p.z;
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.dist += Math.hypot(p.x - ox, p.z - oz);
      // detecta o primeiro inimigo tocado pela trajetória deste passo
      let target: SimEnemy | undefined;
      let best = ARROW_HIT_R;
      for (const e of this.sim.enemies.values()) {
        if (!this.targetable(e)) continue;
        const sd = segDist(ox, oz, p.x, p.z, e.x, e.z);
        if (sd < best) { best = sd; target = e; }
      }
      const ended = p.dist >= p.maxDist;
      if (p.kind === 'bola') {
        // Fase 24: explode ao encostar num inimigo OU no fim do alcance — dano em ÁREA no ponto de impacto
        if (target || ended) {
          const bx = target ? target.x : p.x, bz = target ? target.z : p.z;
          this.explodeBola(p, bx, bz);
          this.projectiles.splice(i, 1);
        }
      } else if (p.kind === 'gelo') {
        // Fase 25: estilhaço de gelo — single-target: dano + CONGELA (chill escala com o nível)
        if (target) {
          const lvlScale = 1 + (p.level - 1) * 0.6;
          const { dmg, crit } = abilityDamage('gelo', p.caster, this.bumpMult(p.pid));
          this.sim.applyDamage(target.id, Math.round(dmg * lvlScale), p.pid, 'magic', crit);
          const e = this.sim.enemies.get(target.id);
          if (e && e.state !== 'dead') {
            if (p.level >= 3) { // Fase 28: gelo CARREGADO congela TOTAL (parado + executável), senão só desacelera
              e.frozenT = Math.max(e.frozenT, 2.2);
              this.sim.events.push({ t: 'estat', id: e.id, kind: 'freeze' });
            } else {
              e.chillT = Math.max(e.chillT, 2.5 + (p.level - 1)); // 2.5/3.5s de lentidão
            }
          }
          this.sim.events.push({ t: 'frost', x: target.x, z: target.z });
          this.projectiles.splice(i, 1);
        } else if (ended) {
          this.projectiles.splice(i, 1); // errou
        }
      } else { // 'arrow'
        if (p.caster.perks & PERK_PIERCE) {
          // Fase 45 — perk Flecha Perfurante: TRANSPASSA. Acerta CADA inimigo novo tocado pelo segmento
          // deste passo (não só o mais próximo) e NÃO some no primeiro — segue voando até o fim do alcance.
          p.hitIds ??= new Set<number>();
          for (const e of this.sim.enemies.values()) {
            if (!this.targetable(e) || p.hitIds.has(e.id)) continue;
            if (segDist(ox, oz, p.x, p.z, e.x, e.z) < ARROW_HIT_R) {
              p.hitIds.add(e.id);
              const { dmg, crit } = abilityDamage('golpe', p.caster, this.bumpMult(p.pid));
              this.sim.applyDamage(e.id, Math.round(dmg * (1 + p.charge)), p.pid, 'ranged', crit);
            }
          }
          if (ended) this.projectiles.splice(i, 1);
        } else if (target) { // single-target padrão: acerta o primeiro e some
          const { dmg, crit } = abilityDamage('golpe', p.caster, this.bumpMult(p.pid));
          this.sim.applyDamage(target.id, Math.round(dmg * (1 + p.charge)), p.pid, 'ranged', crit);
          this.projectiles.splice(i, 1);
        } else if (ended) {
          this.projectiles.splice(i, 1); // errou — sumiu ao fim do alcance
        }
      }
    }
  }

  // Fase 24: explosão da Bola de Fogo — AoE + queimadura no raio, escalando com o nível de carga
  private explodeBola(p: Projectile, bx: number, bz: number) {
    const lvl = p.level;
    const lvlScale = 1 + (lvl - 1) * 0.6;
    const blast = BOLA_BLAST * (1 + (lvl - 1) * 0.35); // nível engrossa a explosão
    this.sim.events.push({ t: 'boom', x: bx, z: bz });
    for (const e of this.sim.enemies.values()) {
      if (!this.targetable(e)) continue;
      if (Math.hypot(e.x - bx, e.z - bz) > blast) continue;
      const { dmg, crit } = abilityDamage('bola', p.caster, this.bumpMult(p.pid));
      this.sim.applyDamage(e.id, Math.round(dmg * lvlScale), p.pid, 'magic', crit);
      if (e.state !== 'dead') { // queimadura (escala com Vontade e nível)
        e.burnT = 3 + (lvl - 1);
        e.burnTick = 1;
        e.burnDmg = Math.max(2, Math.round((2 + p.caster.wil * 0.4) * lvlScale));
        e.burnPid = p.pid;
      }
    }
  }
}
