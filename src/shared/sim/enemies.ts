// Simulação de inimigos — roda no SERVIDOR quando online (mundo compartilhado)
// e no cliente como fallback solo. Sem Three.js, sem DOM: só números e eventos.
import { ENEMY_DEFS } from '../defs/enemies';
import { rnd } from '../math';
import { BANDIT_CAMP, ORCHARD, DARK_FOREST } from '../terrain';

export interface SimPlayerView {
  id: number;
  x: number;
  z: number;
  dead: boolean;
}

export type SimEvent =
  | { t: 'aggro'; id: number }
  | { t: 'eatk'; id: number; pid: number; dmg: number }
  | { t: 'edmg'; id: number; amount: number; pid: number }              // dano aplicado (todos veem)
  | { t: 'edie'; id: number; killerPid: number }
  | { t: 'eleap'; id: number }
  | { t: 'eland'; id: number; pid: number; dmg: number }
  // efeitos visuais de magia — emitidos pelo CombatSim, renderizados por todos os clientes
  | { t: 'bolt'; ax: number; az: number; ay: number; bx: number; bz: number; by: number }
  | { t: 'boom'; x: number; z: number }
  | { t: 'shock'; x: number; z: number };

export type EnemyState = 'idle' | 'chase' | 'attack' | 'return' | 'dead' | 'leap' | 'surrender' | 'flee';

export interface SimEnemy {
  id: number;
  type: string;
  x: number; z: number;
  ry: number;           // ângulo "para onde olha" (atan2(dx, dz)); offset de modelo é do cliente
  hp: number; maxHp: number;
  state: EnemyState;
  walkT: number;
  homeX: number; homeZ: number;
  wanderX: number; wanderZ: number; wanderTimer: number;
  attackTimer: number; deadTimer: number;
  knockX: number; knockZ: number;
  leapCd: number; leapT: number;
  leapFromX: number; leapFromZ: number; leapToX: number; leapToZ: number;
  targetPid: number | null;
  isLeader: boolean;
}

/** snapshot enxuto enviado aos clientes (e usado pelo view local no modo solo) */
export interface EnemySnap {
  id: number; type: string;
  x: number; z: number; ry: number;
  hp: number; maxHp: number;
  state: EnemyState; walkT: number; leapK: number;
}

const NOCTURNAL = new Set(['lobo', 'hobbe', 'balverine']);

export class EnemySim {
  enemies = new Map<number, SimEnemy>();
  events: SimEvent[] = [];
  slowT = 0; // Tempo Lento: mágica de qualquer herói desacelera o mundo todo (co-op friendly)
  private nextId = 1;

  constructor() {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.spawn('besouro', ORCHARD.x + Math.cos(a) * (5 + rnd(i, 210) * 12), ORCHARD.z + Math.sin(a) * (5 + rnd(i, 211) * 12));
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      this.spawn('lobo', 95 + Math.cos(a) * (6 + rnd(i, 212) * 12), 55 + Math.sin(a) * (6 + rnd(i, 213) * 12));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.spawn('bandido', BANDIT_CAMP.x + Math.cos(a) * (5 + rnd(i, 214) * 10), BANDIT_CAMP.z + Math.sin(a) * (5 + rnd(i, 215) * 10));
    }
    this.spawn('chefe', BANDIT_CAMP.x, BANDIT_CAMP.z + 3, true);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.spawn('hobbe', DARK_FOREST.x + Math.cos(a) * (6 + rnd(i, 216) * 12), DARK_FOREST.z - 15 + Math.sin(a) * (6 + rnd(i, 217) * 10));
    }
  }

  spawn(type: string, x: number, z: number, isLeader = false): SimEnemy {
    const def = ENEMY_DEFS[type];
    const e: SimEnemy = {
      id: this.nextId++, type,
      x, z, ry: 0,
      hp: def.hp, maxHp: def.hp,
      state: 'idle', walkT: 0,
      homeX: x, homeZ: z,
      wanderX: x, wanderZ: z, wanderTimer: rnd(x, z) * 4,
      attackTimer: 0, deadTimer: 0,
      knockX: 0, knockZ: 0,
      leapCd: 0, leapT: 0,
      leapFromX: 0, leapFromZ: 0, leapToX: 0, leapToZ: 0,
      targetPid: null, isLeader,
    };
    this.enemies.set(e.id, e);
    return e;
  }

  spawnBalverine() {
    for (const e of this.enemies.values()) if (e.type === 'balverine' && e.state !== 'dead') return;
    this.spawn('balverine', DARK_FOREST.x, DARK_FOREST.z + 12);
  }

  getLeader(): SimEnemy | undefined {
    for (const e of this.enemies.values()) if (e.isLeader) return e;
    return undefined;
  }

  applyDamage(id: number, dmg: number, attackerPid: number) {
    const e = this.enemies.get(id);
    if (!e || e.state === 'dead' || e.state === 'surrender' || e.state === 'flee') return;
    e.hp -= dmg;
    this.events.push({ t: 'edmg', id: e.id, amount: dmg, pid: attackerPid });
    if (e.state === 'idle' || e.state === 'return') {
      e.state = 'chase';
      e.targetPid = attackerPid;
      this.events.push({ t: 'aggro', id: e.id });
    }
    if (e.hp <= 0) this.die(e, attackerPid);
  }

  private die(e: SimEnemy, killerPid: number) {
    e.state = 'dead';
    e.hp = 0;
    e.deadTimer = 0;
    e.targetPid = null;
    this.events.push({ t: 'edie', id: e.id, killerPid });
  }

  knock(id: number, kx: number, kz: number) {
    const e = this.enemies.get(id);
    if (!e || e.state === 'dead' || e.state === 'surrender') return;
    e.knockX += kx;
    e.knockZ += kz;
  }

  castSlow() { this.slowT = 6; }

  surrenderLeader() {
    const l = this.getLeader();
    if (l && l.state !== 'dead') {
      l.state = 'surrender';
      l.targetPid = null;
    }
  }

  resolveLeader(spare: boolean, pid: number) {
    const l = this.getLeader();
    if (!l || l.state === 'dead') return;
    if (spare) l.state = 'flee';
    else this.die(l, pid);
  }

  removeLeader() {
    const l = this.getLeader();
    if (l) this.enemies.delete(l.id);
  }

  drainEvents(): SimEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  serialize(): EnemySnap[] {
    const out: EnemySnap[] = [];
    for (const e of this.enemies.values()) {
      out.push({
        id: e.id, type: e.type,
        x: e.x, z: e.z, ry: e.ry,
        hp: e.hp, maxHp: e.maxHp,
        state: e.state, walkT: e.walkT,
        leapK: e.state === 'leap' ? Math.min(1, e.leapT) : 0,
      });
    }
    return out;
  }

  update(dt: number, players: SimPlayerView[], nightF: number) {
    if (this.slowT > 0) this.slowT -= dt;
    const eDt = dt * (this.slowT > 0 ? 0.35 : 1);
    const toRemove: number[] = [];

    for (const e of this.enemies.values()) {
      const def = ENEMY_DEFS[e.type];

      if (e.state === 'dead') {
        e.deadTimer += dt;
        if (def.respawn && e.deadTimer > def.respawn) {
          e.state = 'idle';
          e.hp = e.maxHp;
          e.x = e.homeX; e.z = e.homeZ;
          e.knockX = e.knockZ = 0;
        }
        continue;
      }
      if (e.state === 'surrender') {
        // ajoelhado, encara o herói vivo mais próximo
        const near = this.nearest(players, e.x, e.z);
        if (near) e.ry = Math.atan2(near.x - e.x, near.z - e.z);
        continue;
      }
      if (e.state === 'flee') {
        const near = this.nearest(players, e.x, e.z);
        if (!near) { toRemove.push(e.id); continue; }
        const dx = e.x - near.x, dz = e.z - near.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d > 80) { toRemove.push(e.id); continue; }
        e.x += (dx / d) * 7 * dt;
        e.z += (dz / d) * 7 * dt;
        e.ry = Math.atan2(dx, dz);
        e.walkT += dt * 12;
        continue;
      }

      // knockback
      if (Math.abs(e.knockX) + Math.abs(e.knockZ) > 0.05) {
        e.x += e.knockX * eDt;
        e.z += e.knockZ * eDt;
        const decay = Math.max(0, 1 - 5 * eDt);
        e.knockX *= decay; e.knockZ *= decay;
      }

      const dHome = Math.hypot(e.homeX - e.x, e.homeZ - e.z);
      const aggroR = def.aggro * (nightF > 0.5 && NOCTURNAL.has(e.type) ? 1.5 : 1);
      let tgt = e.targetPid !== null ? players.find((p) => p.id === e.targetPid && !p.dead) : undefined;

      if (e.state === 'leap') {
        e.leapT += eDt / 0.7;
        const k = Math.min(1, e.leapT);
        e.x = e.leapFromX + (e.leapToX - e.leapFromX) * k;
        e.z = e.leapFromZ + (e.leapToZ - e.leapFromZ) * k;
        if (k >= 1) {
          e.state = 'chase';
          // dano de impacto em quem estiver perto do pouso
          let hit: SimPlayerView | null = null;
          for (const p of players) {
            if (!p.dead && Math.hypot(p.x - e.x, p.z - e.z) < 3.5) { hit = p; break; }
          }
          const dmg = hit ? Math.round(def.dmg[0] + Math.random() * (def.dmg[1] - def.dmg[0])) : 0;
          this.events.push({ t: 'eland', id: e.id, pid: hit ? hit.id : -1, dmg });
        }
        continue;
      }

      if (e.state === 'idle') {
        const near = this.nearest(players, e.x, e.z);
        if (near && Math.hypot(near.x - e.x, near.z - e.z) < aggroR) {
          e.state = 'chase';
          e.targetPid = near.id;
          this.events.push({ t: 'aggro', id: e.id });
        } else {
          e.wanderTimer -= dt;
          if (e.wanderTimer <= 0) {
            e.wanderTimer = 3 + Math.random() * 5;
            const a = Math.random() * Math.PI * 2, r = Math.random() * 9;
            e.wanderX = e.homeX + Math.cos(a) * r;
            e.wanderZ = e.homeZ + Math.sin(a) * r;
          }
          this.moveToward(e, e.wanderX, e.wanderZ, def.speed * 0.35, eDt);
        }
      } else if (e.state === 'chase' || e.state === 'attack') {
        if (!tgt || dHome > 55) {
          e.state = 'return';
          e.targetPid = null;
          e.hp = e.maxHp;
          continue;
        }
        const dPlayer = Math.hypot(tgt.x - e.x, tgt.z - e.z);
        if (e.type === 'balverine' && dPlayer > 6 && dPlayer < 16 && e.leapCd <= 0) {
          e.state = 'leap';
          e.leapT = 0; e.leapCd = 7;
          e.leapFromX = e.x; e.leapFromZ = e.z;
          e.leapToX = tgt.x; e.leapToZ = tgt.z;
          this.events.push({ t: 'eleap', id: e.id });
        } else if (dPlayer > def.atkR) {
          e.state = 'chase';
          this.moveToward(e, tgt.x, tgt.z, def.speed, eDt);
        } else {
          e.state = 'attack';
          e.ry = Math.atan2(tgt.x - e.x, tgt.z - e.z);
          e.attackTimer -= eDt;
          if (e.attackTimer <= 0) {
            e.attackTimer = def.atkCd;
            const dmg = Math.round(def.dmg[0] + Math.random() * (def.dmg[1] - def.dmg[0]));
            this.events.push({ t: 'eatk', id: e.id, pid: tgt.id, dmg });
          }
        }
      } else if (e.state === 'return') {
        if (dHome < 1.5) { e.state = 'idle'; e.hp = e.maxHp; }
        else this.moveToward(e, e.homeX, e.homeZ, def.speed, eDt);
      }
      e.leapCd = Math.max(0, e.leapCd - dt);
    }

    for (const id of toRemove) this.enemies.delete(id);
  }

  private moveToward(e: SimEnemy, tx: number, tz: number, speed: number, dt: number) {
    const dx = tx - e.x, dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) return;
    e.x += (dx / d) * speed * dt;
    e.z += (dz / d) * speed * dt;
    e.ry = Math.atan2(dx, dz);
    e.walkT += dt * speed * 2.2;
  }

  private nearest(players: SimPlayerView[], x: number, z: number): SimPlayerView | null {
    let best: SimPlayerView | null = null, bd = Infinity;
    for (const p of players) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}
