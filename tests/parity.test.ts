// Parity test: keeps the TS animation tables in lockstep with the desktop
// Python source (jacky/core/pet.py + jacky/core/character.py).
// Skipped automatically when the desktop repo is not available.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ANIMATION_FALLBACKS } from "../src/animation/animationFallbacks";
import { buildStateMap, DIR_TO_STATES } from "../src/animation/dirToStates";
import { STATE_ANIMATION_MAP } from "../src/animation/stateAnimationMap";

const DESKTOP_ROOT = process.env.JACKY_DESKTOP_ROOT ?? "D:/Aplicaciones/jacky";
const PET_PY_PATH = resolve(DESKTOP_ROOT, "core/pet.py");
const CHARACTER_PY_PATH = resolve(DESKTOP_ROOT, "core/character.py");

const petPy = existsSync(PET_PY_PATH) ? readFileSync(PET_PY_PATH, "utf8") : "";
const characterPy = existsSync(CHARACTER_PY_PATH)
  ? readFileSync(CHARACTER_PY_PATH, "utf8")
  : "";
const hasDesktop = petPy !== "" && characterPy !== "";

if (!hasDesktop) {
  beforeAll(() => {
    console.warn(
      `[parity] Desktop sources not found (${PET_PY_PATH}); set JACKY_DESKTOP_ROOT.`,
    );
  });
}

/**
 * Extract `key: [a, b]` entries from the python dict that follows `marker`.
 * Supports both "quoted" keys and PetState.ENUM keys.
 */
function extractDictEntries(
  src: string,
  marker: string,
): Array<[string, string[]]> {
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error(`marker ${marker} not found`);
  const open = src.indexOf("{", idx);
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const block = src.slice(open, end);
  const entries: Array<[string, string[]]> = [];
  const re = /(?:"([^"]+)"|PetState\.([A-Z_]+)):\s*\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const key = m[1] ?? m[2]!;
    const values = m[3]!
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    entries.push([key, values]);
  }
  return entries;
}

describe.skipIf(!hasDesktop)("python ↔ typescript table parity", () => {
  it("DIR_TO_STATES matches core/character.py 1:1", () => {
    const pyEntries = extractDictEntries(characterPy, "DIR_TO_STATES: dict");
    expect(pyEntries.length).toBe(Object.keys(DIR_TO_STATES).length);
    for (const [dir, states] of pyEntries) {
      expect([...(DIR_TO_STATES[dir] ?? [])]).toEqual(states);
    }
  });

  it("STATE_ANIMATION_MAP matches core/pet.py 1:1", () => {
    const pyEntries = extractDictEntries(petPy, "STATE_ANIMATION_MAP: dict");
    expect(pyEntries.length).toBe(Object.keys(STATE_ANIMATION_MAP).length);
    for (const [state, variants] of pyEntries) {
      const tsVariants =
        STATE_ANIMATION_MAP[state as keyof typeof STATE_ANIMATION_MAP];
      expect([...(tsVariants ?? [])]).toEqual(variants);
    }
  });

  it("ANIMATION_FALLBACKS matches core/pet.py 1:1", () => {
    const pyEntries = extractDictEntries(petPy, "ANIMATION_FALLBACKS: dict");
    expect(pyEntries.length).toBe(Object.keys(ANIMATION_FALLBACKS).length);
    for (const [anim, chain] of pyEntries) {
      expect([...(ANIMATION_FALLBACKS[anim] ?? [])]).toEqual(chain);
    }
  });

  it("buildStateMap mirrors _build_state_map on the real pack dirs", () => {
    const dirNames = Object.keys(DIR_TO_STATES);
    const map = buildStateMap(dirNames);
    for (const [dir, states] of Object.entries(DIR_TO_STATES)) {
      for (const state of states) {
        expect(map[state]).toBe(dir);
      }
    }
  });
});
