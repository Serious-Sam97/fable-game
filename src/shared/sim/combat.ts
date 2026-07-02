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

export class CombatSim {
  private cds = new Map<number, Map<string, number>>();       // pid → ability → pronto em t
  private lastCast = new Map<number, number>();
  private mult = new Map<number, { n: number; last: number }>();
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

  cast(c: CasterView, key: string, targetId?: number): boolean {
    const ab = ABILITIES[key];
    if (!ab || key === 'cura') return false; // cura é local do cliente
    if ((this.lastCast.get(c.id) ?? -9) > this.t - MIN_CAST_GAP) return false;
    const pcds = this.cds.get(c.id) ?? new Map<string, number>();
    if ((pcds.get(key) ?? 0) > this.t) return false;

    const tgt = targetId !== undefined ? this.sim.enemies.get(targetId) : undefined;
    if (ab.needTarget) {
      if (!this.targetable(tgt)) return false;
      // golpe usa o alcance da arma equipada (arco ataca de longe)
      const range = key === 'golpe' ? c.wpnRange : ab.range;
      const d = Math.hypot(tgt.x - c.x, tgt.z - c.z);
      if (d > range * RANGE_TOLERANCE) return false;
    }

    // validado — cobra cooldown e executa
    pcds.set(key, this.t + ab.cd * 0.95);
    this.cds.set(c.id, pcds);
    this.lastCast.set(c.id, this.t);

    switch (key) {
      case 'golpe': {
        this.hit(c, 'golpe', tgt!.id);
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
        } });
        break;
      }
      case 'relampago': {
        this.sim.events.push({ t: 'bolt', ax: c.x, az: c.z, ay: 2, bx: tgt!.x, bz: tgt!.z, by: 1.2 });
        this.hit(c, 'relampago', tgt!.id);
        let last: SimEnemy = tgt!;
        let chained = 0;
        for (const e of this.sim.enemies.values()) {
          if (chained >= CHAIN_MAX) break;
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
