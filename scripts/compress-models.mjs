// Fase 49 — compressão Draco dos modelos (in-place, mesmo nome/extensão).
// Uso:
//   node scripts/compress-models.mjs                 # comprime todos os .gltf/.glb de public/models
//   node scripts/compress-models.mjs <arquivo...>    # comprime só os arquivos passados
//
// Aplica: dedup + prune (remove duplicatas/lixo) + resample (poda keyframes redundantes)
//       + weld (indexa, requisito do Draco) + draco (compressão de geometria).
// Nada de simplify/decimation (seria lossy na malha). Escala/animação preservadas.
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { dedup, prune, resample, weld, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { statSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(gltf|glb)$/i.test(e.name)) out.push(p);
  }
  return out;
}

const mb = (b) => (b / 1024 / 1024).toFixed(2);

const args = process.argv.slice(2);
const files = args.length ? args : walk('public/models');

let inTotal = 0, outTotal = 0, ok = 0, fail = 0, skipped = 0;
const failures = [];

for (const path of files) {
  const before = statSync(path).size;
  try {
    const doc = await io.read(path);
    await doc.transform(dedup(), prune(), resample(), weld(), draco());
    // GLB binário no MESMO caminho (mesmo nome/extensão). O GLTFLoader detecta
    // o formato pelos magic bytes, não pela extensão → carrega liso, 1 arquivo só.
    const glb = await io.writeBinary(doc);
    // Draco tem overhead fixo → em props minúsculos ele INCHA (ex.: wall.glb 8K→16K).
    // Só sobrescreve se ganhar >8%; senão mantém o original intacto.
    let after = before, saved = false;
    if (glb.byteLength < before * 0.92) { writeFileSync(path, glb); after = glb.byteLength; saved = true; }
    else skipped++;
    inTotal += before; outTotal += after; ok++;
    if (saved && before - after > 200 * 1024) // só loga os que economizaram >200KB
      console.log(`  ${path.replace('public/models/', '')}  ${mb(before)}→${mb(after)}MB`);
  } catch (err) {
    fail++; failures.push([path, err.message]);
    console.warn(`  FALHOU  ${path}: ${err.message}`);
  }
}

console.log(`\n=== ${ok} ok (${skipped} mantidos originais por não encolher), ${fail} falhas ===`);
console.log(`total ${mb(inTotal)}MB → ${mb(outTotal)}MB  (${(100 * (1 - outTotal / inTotal)).toFixed(0)}% menor)`);
if (failures.length) console.log('falhas:', failures.map(f => f[0]).join(', '));
