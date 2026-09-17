import { describe, expect, it } from "vitest";
import {
  parseCharacterJson,
  parsePackageManifest,
  packageManifestToCharacterJson,
  SkinLoadError,
} from "../src/skin/characterMeta";

describe("parseCharacterJson", () => {
  it("parses a desktop-format character.json", () => {
    const meta = parseCharacterJson(
      {
        name: "Forest Ranger 1",
        sprite_size: 128,
        fps: 10,
        sprite_facing: "right",
      },
      "fallback",
    );
    expect(meta).toEqual({
      name: "Forest Ranger 1",
      spriteSize: 128,
      fps: 10,
      spriteFacing: "right",
      stateMap: undefined,
    });
  });

  it("applies defaults for missing fields (desktop parity)", () => {
    const meta = parseCharacterJson({}, "Jacky");
    expect(meta.spriteSize).toBe(128);
    expect(meta.fps).toBe(16);
    expect(meta.spriteFacing).toBe("right");
    expect(meta.name).toBe("Jacky");
  });

  it("rejects invalid sprite_facing values", () => {
    const meta = parseCharacterJson({ sprite_facing: "up" }, "Jacky");
    expect(meta.spriteFacing).toBe("right");
  });

  it("accepts left-facing packs (Jacky default)", () => {
    const meta = parseCharacterJson({ sprite_facing: "LEFT" }, "Jacky");
    expect(meta.spriteFacing).toBe("left");
  });

  it("keeps an explicit state_map override", () => {
    const meta = parseCharacterJson(
      { state_map: { idle: "Idle", walk: "Caminar" } },
      "Jacky",
    );
    expect(meta.stateMap).toEqual({ idle: "Idle", walk: "Caminar" });
  });

  it("throws SkinLoadError for non-object payloads", () => {
    expect(() => parseCharacterJson("nope", "x")).toThrow(SkinLoadError);
    expect(() => parseCharacterJson([1, 2], "x")).toThrow(SkinLoadError);
  });
});

describe("packageManifestToCharacterJson (desktop parity)", () => {
  it("flattens skin.* fields like workshop_install.manifest_to_character_json", () => {
    const raw = packageManifestToCharacterJson(
      {
        type: "skin",
        name: "TestSkin1",
        version: "1.2.3",
        skin: {
          sprite_size: 128,
          fps: 15,
          sprite_facing: "right",
          hat: { Idle: [{ frame: 0, x: 100 }] },
        },
      },
      "fallback",
    );
    expect(raw).toMatchObject({
      name: "TestSkin1",
      version: "1.2.3",
      sprite_size: 128,
      fps: 15,
      sprite_facing: "right",
    });
    expect(raw.hat).toEqual({ Idle: [{ frame: 0, x: 100 }] });
  });

  it("uses desktop manifest defaults (fps=8) when skin fields are missing", () => {
    const meta = parsePackageManifest(
      { type: "skin", name: "Bare", skin: {} },
      "fallback",
    );
    expect(meta.name).toBe("Bare");
    expect(meta.fps).toBe(8);
    expect(meta.spriteSize).toBe(128);
    expect(meta.spriteFacing).toBe("right");
  });

  it("accepts root-level hat (desktop parity)", () => {
    const raw = packageManifestToCharacterJson(
      {
        type: "skin",
        name: "TestSkin2",
        skin: { sprite_size: 256 },
        hat: { Dance: [{ frame: 0, x: 50 }] },
      },
      "fallback",
    );
    expect(raw.sprite_size).toBe(256);
    expect(raw.hat).toEqual({ Dance: [{ frame: 0, x: 50 }] });
  });

  it("rejects non-skin package types", () => {
    expect(() =>
      parsePackageManifest(
        { type: "routine", name: "Nope", routine: { entry: "x.json" } },
        "x",
      ),
    ).toThrow(/expected "skin"/);
  });
});
