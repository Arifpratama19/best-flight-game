// main.ts — hands the Skyline Archipelago flight game in to make.fun.
// Copies game/ and screenshots/ from this repository into the output
// directory and writes dossier.json with buildDossier from the kit library.
// Node 22, standard library only. Run from the repository root:
//   MAKEFUN_OUTPUT_DIR=/tmp/flight-out node main.ts
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

function copyTree(sourceDir: string, targetDir: string): void {
  if (!existsSync(sourceDir)) return;
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const from = join(sourceDir, entry.name);
    const to = join(targetDir, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) cpSync(from, to);
  }
}

function buildEntry(): void {
  // Remove only the CONTENTS of the output directory, never the directory
  // itself: in the grader /output is a mounted volume and deleting a mount
  // point fails with EBUSY ("Device or resource busy").
  if (existsSync(outputDir)) {
    for (const entry of readdirSync(outputDir)) {
      rmSync(join(outputDir, entry), { recursive: true, force: true });
    }
  }
  mkdirSync(outputDir, { recursive: true });
  copyTree(join(repoRoot, 'game'), join(outputDir, 'game'));
  copyTree(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));
  const dossier = buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 48 * 1024 * 1024,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
}

buildEntry();
