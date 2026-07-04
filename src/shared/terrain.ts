// Geometria do mundo compartilhada — mesmo terreno no cliente e no servidor.
import { vnoise, smoothstep, clamp } from './math';

export const WORLD_R = 320;

export interface WaterBody { x: number; z: number; r: number; waterY: number; depth: number; shore: number; }
/** corpos d'água — o lago das colinas e o oceano da costa leste */
export const LAKE: WaterBody = { x: 70, z: -90, r: 26, waterY: -2.4, depth: 9, shore: 14 };
export const SEA: WaterBody = { x: 460, z: 0, r: 220, waterY: -2.4, depth: 12, shore: 70 };
export const WATERS: WaterBody[] = [LAKE, SEA];

export const BANDIT_CAMP = { x: -70, z: -60 };
export const ORCHARD = { x: 55, z: 25 };
export const DARK_FOREST = { x: -15, z: 95 };
export const PORT = { x: 222, z: 40 };            // Porto Bruma, na costa leste
export const CRAB_BEACH = { x: 232, z: 90 };      // praia dos caranguejos
export const CAVE = { x: -140, z: 190, entX: -18, entZ: 118 }; // Caverna dos Hobbes + boca da caverna
export const RITUAL = { x: 60, z: 150 };          // Pedras do Ritual — clímax do arco principal
export const GATES = [
  { x: -14, z: -20 },                             // Portal Cullis da vila
  { x: 208, z: 28 },                              // Portal Cullis do porto
];

export function terrainHeight(x: number, z: number): number {
  let h = (vnoise(x * 0.015, z * 0.015) - 0.5) * 18
        + (vnoise(x * 0.05 + 7.3, z * 0.05 + 7.3) - 0.5) * 4
        + (vnoise(x * 0.14 + 21, z * 0.14 + 21) - 0.5) * 1.2;
  // flatten the village
  const dV = Math.hypot(x, z);
  const tV = smoothstep(14, 46, dV);
  h *= 0.1 + 0.9 * tV;
  // flatten do porto
  const dP = Math.hypot(x - PORT.x, z - PORT.z);
  h *= 0.25 + 0.75 * smoothstep(10, 34, dP);
  // bacias d'água (lago + oceano)
  for (const w of WATERS) {
    const d = Math.hypot(x - w.x, z - w.z);
    h -= w.depth * smoothstep(w.r + w.shore * 0.6, w.r - w.shore, d);
  }
  return h;
}

// dirt paths (vila → pomar / acampamento / lago / floresta sombria / porto)
const PATHS = [
  [[0, 0], [28, 10], [55, 25]],
  [[0, 0], [-30, -25], [-70, -60]],
  [[0, 0], [25, -40], [58, -75]],
  [[0, 0], [-8, 45], [-15, 95]],
  [[0, 0], [70, 5], [140, 18], [200, 32], [222, 40]],
];
function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
export function distToPath(x: number, z: number): number {
  let d = 1e9;
  for (const p of PATHS)
    for (let i = 0; i < p.length - 1; i++)
      d = Math.min(d, distToSeg(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
  return d;
}
