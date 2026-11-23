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

// The scorer's own caps (reference/gate.json), in one place: the
// pre-flight check below and buildDossier both read these, so the two
// can never drift apart.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Everything is derived from import.meta.url, never process.cwd(), so the
// program produces byte-identical output from any working directory.
function tallyTree(dir) {
  const total = { files: 0, bytes: 0 };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = tallyTree(path);
      total.files += sub.files;
      total.bytes += sub.bytes;
    } else {
      total.files++;
      total.bytes += statSync(path).size;
    }
  }
  return total;
}

// Refuse the hand-in with a clear error instead of writing a partial
// /output: a half-written output is worse than no output at all.
function refuse(message) {
  console.error(`main.ts: ${message} — nothing handed in`);
  process.exitCode = 1;
  return false;
}

// Pre-flight: refuse an entry the scorer would refuse, before copying
// anything. Returns the game tree's size on success, null on refusal.
function preflight(gameDir) {
  if (!existsSync(gameDir)) {
    console.error(`main.ts: ${gameDir} is missing — nothing to hand in`);
    process.exitCode = 1;
    return null;
  }
  const src = tallyTree(gameDir);
  if (src.files > CAPS.game_max_files) {
    return refuse(`game/ has ${src.files} files, over the ${CAPS.game_max_files} cap`) ? src : null;
  }
  if (src.bytes > CAPS.game_max_bytes) {
    return refuse(`game/ is ${src.bytes} bytes, over the ${CAPS.game_max_bytes} cap`) ? src : null;
  }
  return src;
}

function main() {
  const gameDir = join(here, 'game');
  if (!preflight(gameDir)) return;
  mkdirSync(out, { recursive: true });
  cpSync(gameDir, join(out, 'game'), { recursive: true });
  const game = tallyTree(join(out, 'game'));
  let shots = { files: 0, bytes: 0 };
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(join(here, 'screenshots'))) {
    cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
    shots = tallyTree(join(out, 'screenshots'));
  }

  // Only text_max_bytes shapes the bytes; the other caps refuse an
  // entry the scorer would refuse (the pre-flight check already did).
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, CAPS),
  );
  console.log(`CALA LUNA handed in to ${out}: ${game.files} game files (${game.bytes} bytes), ${shots.files} screenshots (${shots.bytes} bytes), dossier.json written`);
}

main();
