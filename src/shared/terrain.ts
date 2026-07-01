// Geometria do mundo compartilhada — mesmo terreno no cliente e no servidor.
import { vnoise, smoothstep, clamp } from './math';

export const WORLD_R = 190;
export const LAKE = { x: 70, z: -90, r: 26, waterY: -2.4 };
export const BANDIT_CAMP = { x: -70, z: -60 };
export const ORCHARD = { x: 55, z: 25 };
export const DARK_FOREST = { x: -15, z: 95 };

export function terrainHeight(x: number, z: number): number {
  let h = (vnoise(x * 0.015, z * 0.015) - 0.5) * 18
        + (vnoise(x * 0.05 + 7.3, z * 0.05 + 7.3) - 0.5) * 4
        + (vnoise(x * 0.14 + 21, z * 0.14 + 21) - 0.5) * 1.2;
  // flatten the village
  const dV = Math.hypot(x, z);
  const tV = smoothstep(14, 46, dV);
  h *= 0.1 + 0.9 * tV;
  // lake bowl
  const dL = Math.hypot(x - LAKE.x, z - LAKE.z);
  h -= 9 * smoothstep(LAKE.r + 8, LAKE.r - 14, dL);
  return h;
}

// dirt paths (village → orchard / bandit camp / lake / dark forest)
const PATHS = [
  [[0, 0], [28, 10], [55, 25]],
  [[0, 0], [-30, -25], [-70, -60]],
  [[0, 0], [25, -40], [58, -75]],
  [[0, 0], [-8, 45], [-15, 95]],
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
