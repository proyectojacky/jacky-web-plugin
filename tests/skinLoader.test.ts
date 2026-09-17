// Unit tests for the .jacky zip pipeline (node-safe paths).
// Image decoding requires a browser; here we assert the error paths and the
// state_map construction. Frame rendering is verified manually (plan §6).

import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { loadSkinFromSource, SkinLoadError } from "../src/skin/skinLoader";
import { isWorkshopRef, splitWorkshopRef } from "../src/skin/workshopApi";

async function makeJacky(files: Record<string, string | Uint8Array>) {
  const zip = new JSZip();
  for (const [path, data] of Object.entries(files)) {
    zip.file(path, data);
  }
  return zip.generateAsync({ type: "blob" });
}

const PNG_1PX = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 1,
]);

describe("loadSkinFromSource (zip)", () => {
  it("rejects zips without character.json or manifest.json", async () => {
    const blob = await makeJacky({ "Idle/a.png": PNG_1PX });
    await expect(
      loadSkinFromSource(blob, { sourceKind: "preview" }),
    ).rejects.toMatchObject({
      name: "SkinLoadError",
      code: "missing_character_json",
    });
  });

  it("rejects packs without an Idle animation (Workshop parity)", async () => {
    const blob = await makeJacky({
      "character.json": JSON.stringify({ name: "X", fps: 12 }),
      "Walking/a.png": PNG_1PX,
    });
    await expect(
      loadSkinFromSource(blob, { sourceKind: "site" }),
    ).rejects.toMatchObject({ code: "missing_idle" });
  });

  it("accepts a package manifest.json (no character.json) like desktop .jacky", async () => {
    const blob = await makeJacky({
      "manifest.json": JSON.stringify({
        type: "skin",
        name: "WorkshopSkin",
        skin: { fps: 10, sprite_size: 128, sprite_facing: "left" },
      }),
      "Idle/0.png": PNG_1PX,
      "Idle/1.png": PNG_1PX,
      "Idle/2.png": PNG_1PX,
      "Idle/3.png": PNG_1PX,
    });
    // Node has no Image — frames decode as empty → missing_idle after meta parse.
    // Assert we get past manifest conversion (not missing_character_json).
    const error = await loadSkinFromSource(blob, { sourceKind: "site" }).catch(
      (err) => err,
    );
    expect(error).toBeInstanceOf(SkinLoadError);
    expect((error as SkinLoadError).code).toBe("missing_idle");
    expect((error as SkinLoadError).message).toContain("WorkshopSkin");
  });

  it("rejects invalid zips with a clear error", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
      type: "application/octet-stream",
    });
    await expect(
      loadSkinFromSource(blob, { sourceKind: "preview" }),
    ).rejects.toMatchObject({ code: "invalid_zip" });
  });

  it("rejects a 3-frame idle pack (needs >= 4 PNGs)", async () => {
    const blob = await makeJacky({
      "character.json": JSON.stringify({ name: "Short", fps: 10 }),
      "Idle/0.png": PNG_1PX,
      "Idle/1.png": PNG_1PX,
      "Idle/2.png": PNG_1PX,
    });
    const error = await loadSkinFromSource(blob, {
      sourceKind: "site",
    }).catch((err) => err);
    expect(error).toBeInstanceOf(SkinLoadError);
    expect((error as SkinLoadError).message).toContain("Idle");
  });
});

describe("workshop ref detection", () => {
  it("accepts author/slug with hyphens and underscores", () => {
    expect(isWorkshopRef("author/slug")).toBe(true);
    expect(isWorkshopRef("proyecto_jacky/samplecharacter3")).toBe(true);
    expect(isWorkshopRef("my-author/my-skin")).toBe(true);
    expect(isWorkshopRef("Proyecto_Jacky/SampleCharacter3")).toBe(true);
  });

  it("rejects paths, URLs, and non-refs", () => {
    expect(isWorkshopRef("/sprites/Jacky")).toBe(false);
    expect(isWorkshopRef("https://cdn.example.com/a.jacky")).toBe(false);
    expect(isWorkshopRef("a/b/c")).toBe(false);
    expect(isWorkshopRef("solo")).toBe(false);
  });

  it("normalizes refs to lowercase", () => {
    expect(splitWorkshopRef("Proyecto_Jacky/SampleCharacter3")).toEqual({
      author: "proyecto_jacky",
      id: "samplecharacter3",
    });
  });

  it("routes underscore refs through the workshop loader (not folder)", async () => {
    const error = await loadSkinFromSource(
      "proyecto_jacky/samplecharacter3",
      { sourceKind: "site" },
    ).catch((err) => err);

    // Must not fall through to folder mode (character.json 404).
    expect(error).toBeInstanceOf(SkinLoadError);
    expect((error as SkinLoadError).code).not.toBe("missing_character_json");
    expect((error as SkinLoadError).message).not.toMatch(/Folder skin/);
    // In Node, Image decode yields 0 frames → missing_idle after workshop download.
    expect((error as SkinLoadError).code).toBe("missing_idle");
    expect((error as SkinLoadError).message).toContain("SampleCharacter3");
  });
});
