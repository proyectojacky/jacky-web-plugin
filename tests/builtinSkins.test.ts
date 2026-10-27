import { describe, expect, it } from "vitest";
import {
  BUILTIN_SKINS,
  builtinSkinFolder,
  isBuiltinSkin,
  pickRandomBuiltinSkin,
} from "../src/skin/builtinSkins";
import {
  buildSpritesheetStateMap,
  parseStreamAvatarsData,
} from "../src/skin/spritesheet";
import { parseCharacterJson } from "../src/skin/characterMeta";

describe("built-in skins", () => {
  it("recognizes the five pets case-insensitively", () => {
    for (const name of ["jacky", "Bunny", " BEAR ", "duckie", "panda"]) {
      expect(isBuiltinSkin(name)).toBe(true);
    }
    expect(isBuiltinSkin("random")).toBe(false);
    expect(isBuiltinSkin("author/slug")).toBe(false);
  });

  it("maps names to hosted folders", () => {
    expect(builtinSkinFolder("bunny")).toBe("https://jacky.club/sprites/Bunny");
    expect(builtinSkinFolder("Jacky", "/sprites/")).toBe("/sprites/Jacky");
    expect(builtinSkinFolder("otter")).toBeNull();
  });

  it("random always lands on a built-in pet", () => {
    expect(pickRandomBuiltinSkin(() => 0)).toBe(BUILTIN_SKINS[0]);
    expect(pickRandomBuiltinSkin(() => 0.9999)).toBe(BUILTIN_SKINS[4]);
    expect(builtinSkinFolder("random", "/s")).toMatch(
      /^\/s\/(Jacky|Bunny|Bear|Duckie|Panda)$/,
    );
  });
});

describe("StreamAvatars spritesheets", () => {
  const frames = (n: number) => Array.from({ length: n }, () => ({}));
  const data = {
    avatar: {
      bear: {
        width: 48,
        height: 48,
        animationData: {
          idle: { animationName: "idle", customName: "", frameData: frames(6) },
          walk: { animationName: "walk", customName: "", frameData: frames(8) },
          dance: { animationName: "", customName: "", frameData: [] },
          custom1: { animationName: "custom1", customName: "fall", frameData: frames(4) },
        },
      },
    },
  };

  it("assigns rows to non-empty animations in order", () => {
    expect(parseStreamAvatarsData(data)).toEqual({
      frameWidth: 48,
      frameHeight: 48,
      rows: [
        { name: "idle", row: 0, frames: 6 },
        { name: "walk", row: 1, frames: 8 },
        { name: "fall", row: 2, frames: 4 },
      ],
    });
    expect(parseStreamAvatarsData({})).toBeNull();
  });

  it("fills unmapped states from priorities, explicit map wins", () => {
    const map = buildSpritesheetStateMap(["idle", "walk", "fall"], { talk: "walk" });
    expect(map.idle).toBe("idle");
    expect(map.run).toBe("walk");
    expect(map.drag).toBe("fall");
    expect(map.talk).toBe("walk");
    expect(map.sleeping).toBe("idle");
  });

  it("character.json opts in via type", () => {
    const meta = parseCharacterJson(
      { name: "Cute Bear", type: "streamavatars", spritesheet: "bear.png" },
      "x",
    );
    expect(meta.spritesheet).toEqual({ image: "bear.png", dataFile: "data.txt" });
    expect(parseCharacterJson({ name: "Ranger" }, "x").spritesheet).toBeUndefined();
  });
});
