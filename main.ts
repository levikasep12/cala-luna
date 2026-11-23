// CALA LUNA — the entry's hand-in program (Node 22, standard library only).
// Copies game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json with the kit's make.fun library, which the sealed
// scorer re-checks byte for byte. Outside the grader, MAKEFUN_OUTPUT_DIR
// stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Everything is derived from import.meta.url, never process.cwd(), so the
// program produces byte-identical output from any working directory.
function countTree(dir) {
  let files = 0, bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countTree(path);
      files += sub.files; bytes += sub.bytes;
    } else {
      files++;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

function main() {
  const gameDir = join(here, 'game');
  if (!existsSync(gameDir)) {
    console.error(`main.ts: ${gameDir} is missing — nothing to hand in`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(out, { recursive: true });
  cpSync(gameDir, join(out, 'game'), { recursive: true });
  const game = countTree(join(out, 'game'));
  let shots = { files: 0, bytes: 0 };
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(join(here, 'screenshots'))) {
    cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
    shots = countTree(join(out, 'screenshots'));
  }

  // The scorer's own caps (reference/gate.json): only text_max_bytes shapes
  // the bytes; the others refuse an entry the scorer would refuse.
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, {
      text_max_bytes: 163840,
      screenshots: { max: 4, max_bytes: 262144 },
      game_max_files: 993,
      game_max_bytes: 50331648,
      game_path_max_bytes: 1000,
    }),
  );
  console.log(`CALA LUNA handed in to ${out}: ${game.files} game files (${game.bytes} bytes), ${shots.files} screenshots (${shots.bytes} bytes), dossier.json written`);
}

main();
