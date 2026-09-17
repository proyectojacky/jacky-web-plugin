// Generates a `jacky.manifest.json` inside a sprite pack directory.
//
// Browsers cannot list directories, so folder-mode skins (plan §2.3 Mode 1)
// need an explicit file listing. The manifest maps each animation
// subdirectory to its PNG files, sorted lexicographically.
//
// Usage:
//   node generate-skin-manifest.mjs [sprites-dir]
//   (default: ../../../public/sprites/Jacky relative to this script)

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultDir = join(scriptDir, "../../../public/sprites/Jacky");
const target = process.argv[2] ?? defaultDir;

if (!existsSync(target)) {
  console.error(`Sprite directory not found: ${target}`);
  process.exit(1);
}

const entries = readdirSync(target, { withFileTypes: true });
const animations = {};
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const files = readdirSync(join(target, entry.name))
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort();
  if (files.length > 0) {
    animations[entry.name] = files;
  }
}

let name = "Jacky";
const characterPath = join(target, "character.json");
if (existsSync(characterPath)) {
  try {
    const character = JSON.parse(readFileSync(characterPath, "utf8"));
    if (typeof character?.name === "string" && character.name.trim()) {
      name = character.name.trim();
    }
  } catch {
    // keep default name
  }
}

const manifest = {
  name,
  sprite_size: null,
  fps: null,
  sprite_facing: null,
  animations,
};

// sprite_size/fps/sprite_facing stay null so character.json remains the
// single source of truth for pack metadata; the loader merges both.
const outPath = join(target, "jacky.manifest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath} (${Object.keys(animations).length} animations)`);
