// Resolvedor de combate — valida e aplica casts. Roda no SERVIDOR quando online
// (o cliente só pede; range/cooldown/dano são decididos aqui) e no cliente em modo solo.
import { EnemySim, SimEnemy } from './enemies';
import {
  ABILITIES, abilityDamage, discSource, CombatStats,
  FIREBALL_SPEED, PUSH_RADIUS, PUSH_FORCE, CHAIN_RADIUS, CHAIN_MAX,
} from '../defs/abilities';

export interface CasterView extends CombatStats {
  id: number;
  x: number;
  z: number;
}

const RANGE_TOLERANCE = 1.3;  // folga para latência (posição do cliente ~100ms atrás)
const MIN_CAST_GAP = 0.85;    // GCD do servidor, um pouco menor que o do cliente
const MULT_WINDOW = 5;        // segundos sem acertar → multiplicador zera
const MELEE_ARC_COS = 0.35;   // arco frontal do golpe melee (~139°) — Fase 11
const MELEE_GAP = 0.30;       // ritmo de swing do melee (rápido, desacoplado do GCD das magias) — Fase 12

export class CombatSim {
  private cds = new Map<number, Map<string, number>>();       // pid → ability → pronto em t
  private lastCast = new Map<number, number>();               // magias/arco (GCD)
  private lastMelee = new Map<number, number>();              // golpes melee (ritmo próprio) — Fase 12
  private mult = new Map<number, { n: number; last: number }>();
  private combo = new Map<number, { n: number; last: number }>();
  private pending: Array<{ at: number; run: () => void }> = [];
  private t = 0;

  constructor(public sim: EnemySim) {}

  /** chamado quando um inimigo acerta o herói — zera o multiplicador dele */
  notePlayerHit(pid: number) { this.mult.delete(pid); }

  private bumpMult(pid: number): number {
    let m = this.mult.get(pid);
    if (!m || this.t - m.last > MULT_WINDOW) m = { n: 0, last: this.t };
    m.n = Math.min(25, m.n + 1);
    m.last = this.t;
    this.mult.set(pid, m);
    return m.n;
  }

  private targetable(e: SimEnemy | undefined): e is SimEnemy {
    return !!e && e.state !== 'dead' && e.state !== 'surrender' && e.state !== 'flee';
  }

  private hit(c: CasterView, key: string, targetId: number, scale = 1) {
    const { dmg, crit } = abilityDamage(key, c, this.bumpMult(c.id));
    this.sim.applyDamage(targetId, Math.round(dmg * scale), c.id, discSource(key, c.wpnKind), crit);
  }

  cast(c: CasterView, key: string, targetId?: number, dir?: number, flourish?: boolean): boolean {
    const ab = ABILITIES[key];
    if (!ab || key === 'cura') return false; // cura é local do cliente
    // Fase 12: golpe melee tem ritmo próprio (rápido), em lane separada do GCD das magias
    const isMeleeSwing = key === 'golpe' && c.wpnKind !== 'bow';
    const lastMap = isMeleeSwing ? this.lastMelee : this.lastCast;
    if ((lastMap.get(c.id) ?? -9) > this.t - (isMeleeSwing ? MELEE_GAP : MIN_CAST_GAP)) return false;
    const pcds = this.cds.get(c.id) ?? new Map<string, number>();
    if ((pcds.get(key) ?? 0) > this.t) return false;

    // Fase 11: golpe MELEE com facing → arco frontal (não precisa de alvo travado).
    // Arco (bow) e feitiços seguem single-target (precisam de targetId).
    const directionalMelee = key === 'golpe' && c.wpnKind !== 'bow' && dir !== undefined;
    const tgt = targetId !== undefined ? this.sim.enemies.get(targetId) : undefined;
    if (ab.needTarget && !directionalMelee) {
      if (!this.targetable(tgt)) return false;
      // golpe usa o alcance da arma equipada (arco ataca de longe)
      const range = key === 'golpe' ? c.wpnRange : ab.range;
      const d = Math.hypot(tgt.x - c.x, tgt.z - c.z);
      if (d > range * RANGE_TOLERANCE) return false;
    }

    // validado — cobra cooldown e executa
    pcds.set(key, this.t + ab.cd * 0.95);
    this.cds.set(c.id, pcds);
    lastMap.set(c.id, this.t);

    switch (key) {
      case 'golpe': {
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
            const dx = e.x - c.x, dz = e.z - c.z, d = Math.hypot(dx, dz);
            if (d > reach) continue;
            if ((d > 0.01 ? (dx * fx + dz * fz) / d : 1) < MELEE_ARC_COS) continue;
            const exec = e.stunT > 0; // Fase 15: golpe num inimigo ATORDOADO = execução (dano massivo)
            this.hit(c, 'golpe', e.id, exec ? 4 : swScale);
            if (exec) this.sim.events.push({ t: 'eexec', id: e.id, pid: c.id });
            const kn = (flourish ? 12 : finisher ? 8 : 2.5) * (c.wpnKnock ?? 1); // Fase 14/16: empurrão direcional × força da arma (martelo empurra muito mais)
            if (flourish) this.sim.stun(e.id, 1.3); // derruba/atordoa
            this.sim.knock(e.id, (dx / (d || 1)) * kn, (dz / (d || 1)) * kn);
            if (!first) first = e;
          }
          if ((finisher || flourish) && first) this.sim.events.push({ t: 'ecombo', id: first.id, pid: c.id });
        } else {
          // arco (bow) / legado: single-target
          if (finisher) {
            this.sim.events.push({ t: 'ecombo', id: tgt!.id, pid: c.id });
            const d = Math.hypot(tgt!.x - c.x, tgt!.z - c.z) || 1;
            this.sim.knock(tgt!.id, ((tgt!.x - c.x) / d) * 8, ((tgt!.z - c.z) / d) * 8);
          }
          this.hit(c, 'golpe', tgt!.id, scale);
        }
        break;
      }
      case 'bola': {
        // dano agendado pelo tempo de voo do projétil
        const id = tgt!.id;
        const delay = Math.hypot(tgt!.x - c.x, tgt!.z - c.z) / FIREBALL_SPEED;
        this.pending.push({ at: this.t + delay, run: () => {
          const e = this.sim.enemies.get(id);
          if (!this.targetable(e)) return;
          this.sim.events.push({ t: 'boom', x: e.x, z: e.z });
          this.hit(c, 'bola', id);
          // queimadura: 3s de dano residual escalando com Vontade
          if (e.state !== 'dead') {
            e.burnT = 3;
            e.burnTick = 1;
            e.burnDmg = Math.max(2, Math.round(2 + c.wil * 0.4));
            e.burnPid = c.id;
          }
        } });
        break;
      }
      case 'relampago': {
        this.sim.events.push({ t: 'bolt', ax: c.x, az: c.z, ay: 2, bx: tgt!.x, bz: tgt!.z, by: 1.2 });
        this.hit(c, 'relampago', tgt!.id);
        let last: SimEnemy = tgt!;
        let chained = 0;
        const maxChain = CHAIN_MAX + Math.round(c.chainBonus ?? 0); // talento Tormenta
        for (const e of this.sim.enemies.values()) {
          if (chained >= maxChain) break;
          if (e === tgt || !this.targetable(e)) continue;
          if (Math.hypot(e.x - last.x, e.z - last.z) < CHAIN_RADIUS) {
            this.sim.events.push({ t: 'bolt', ax: last.x, az: last.z, ay: 1.2, bx: e.x, bz: e.z, by: 1.2 });
            this.hit(c, 'relampago', e.id, 0.6);
            last = e;
            chained++;
          }
        }
        break;
      }
      case 'empurrao': {
        this.sim.events.push({ t: 'shock', x: c.x, z: c.z });
        for (const e of this.sim.enemies.values()) {
          if (!this.targetable(e)) continue;
          const d = Math.hypot(e.x - c.x, e.z - c.z);
          if (d < PUSH_RADIUS) {
            this.hit(c, 'empurrao', e.id);
            const n = d || 1;
            this.sim.knock(e.id, ((e.x - c.x) / n) * PUSH_FORCE, ((e.z - c.z) / n) * PUSH_FORCE);
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
  }
}
