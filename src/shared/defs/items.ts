// Armas e raridades — dados compartilhados. O herói vira o que ele usa:
// melee treina Força, arco treina Habilidade, magia treina Vontade.

export type WeaponKind = 'melee' | 'bow' | 'staff';

export interface WeaponDef {
  key: string;
  name: string;
  kind: WeaponKind;
  mult: number;        // multiplicador de dano base
  range: number;       // alcance do ataque básico
  icon: string;
  tier: number;        // 0 inicial … 3 topo
  spellBoost?: number; // cajados amplificam magia
  price?: number;      // se vendido pelo Barnum
}

export const WEAPONS: Record<string, WeaponDef> = {
  espada_gasta: { key: 'espada_gasta', name: 'Espada Gasta', kind: 'melee', mult: 1.0, range: 3.8, icon: '🗡️', tier: 0 },
  machado:      { key: 'machado', name: 'Machado de Lenhador', kind: 'melee', mult: 1.15, range: 3.6, icon: '🪓', tier: 1, price: 90 },
  espada_longa: { key: 'espada_longa', name: 'Espada Longa', kind: 'melee', mult: 1.25, range: 4.3, icon: '⚔️', tier: 2 },
  martelo:      { key: 'martelo', name: 'Martelo de Guerra', kind: 'melee', mult: 1.4, range: 3.4, icon: '🔨', tier: 3 },
  arco_cacador: { key: 'arco_cacador', name: 'Arco do Caçador', kind: 'bow', mult: 1.0, range: 26, icon: '🏹', tier: 1, price: 120 },
  arco_longo:   { key: 'arco_longo', name: 'Arco Longo', kind: 'bow', mult: 1.25, range: 30, icon: '🏹', tier: 3 },
  cajado_arcano:{ key: 'cajado_arcano', name: 'Cajado Arcano', kind: 'staff', mult: 0.85, range: 3.2, icon: '🪄', tier: 2, spellBoost: 1.18, price: 200 },
};

export interface Rarity {
  key: string;
  name: string;
  color: string;
  mult: number;   // multiplica o dano da arma
  weight: number; // peso base do sorteio
  sell: number;   // preço de venda base
}

export const RARITIES: Rarity[] = [
  { key: 'comum',    name: 'Comum',     color: '#c8c8c8', mult: 1.0,  weight: 58, sell: 15 },
  { key: 'incomum',  name: 'Incomum',   color: '#5ade5a', mult: 1.12, weight: 26, sell: 40 },
  { key: 'raro',     name: 'Raro',      color: '#5a9dee', mult: 1.25, weight: 11, sell: 90 },
  { key: 'epico',    name: 'Épico',     color: '#b06ae8', mult: 1.4,  weight: 4,  sell: 200 },
  { key: 'lendario', name: 'Lendário',  color: '#ff9a2a', mult: 1.6,  weight: 1,  sell: 500 },
];
export const rarityOf = (key: string) => RARITIES.find((r) => r.key === key) ?? RARITIES[0];

export interface ItemInstance { wpn: string; rar: string; }

// chance de drop de arma por tipo de inimigo (rolado por quem matou)
const DROP_CHANCE: Record<string, number> = {
  besouro: 0.07, lobo: 0.14, bandido: 0.2, hobbe: 0.18, chefe: 1, balverine: 1,
};

export function rollDrop(enemyType: string, enemyLvl: number): ItemInstance | null {
  if (Math.random() > (DROP_CHANCE[enemyType] ?? 0)) return null;
  // arsenal disponível pesa contra o tier vs nível do inimigo
  const pool = Object.values(WEAPONS).filter((w) => w.tier > 0 && w.tier <= Math.max(1, Math.ceil(enemyLvl / 3)));
  if (!pool.length) return null;
  const wpn = pool[Math.floor(Math.random() * pool.length)];
  // inimigos fortes puxam raridade pra cima (chefe/balverine nunca dropam comum)
  const minIdx = enemyLvl >= 6 ? 1 : 0;
  let total = 0;
  for (let i = minIdx; i < RARITIES.length; i++) total += RARITIES[i].weight + enemyLvl;
  let roll = Math.random() * total;
  for (let i = minIdx; i < RARITIES.length; i++) {
    roll -= RARITIES[i].weight + enemyLvl;
    if (roll <= 0) return { wpn: wpn.key, rar: RARITIES[i].key };
  }
  return { wpn: wpn.key, rar: 'comum' };
}

export function sellPrice(item: ItemInstance): number {
  const w = WEAPONS[item.wpn];
  return Math.round(rarityOf(item.rar).sell * (1 + (w?.tier ?? 0) * 0.5));
}
