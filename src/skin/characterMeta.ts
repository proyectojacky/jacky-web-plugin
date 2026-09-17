// Parser for character.json / package manifest.json inside .jacky packs and
// folder skins.

export interface CharacterMeta {
  name: string;
  spriteSize: number;
  fps: number;
  spriteFacing: "left" | "right";
  /** Explicit state_map override from character.json (wins over auto-detect). */
  stateMap?: Record<string, string>;
}

export class SkinLoadError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "network"
      | "invalid_zip"
      | "missing_character_json"
      | "missing_idle"
      | "no_frames"
      | "aborted" = "network",
  ) {
    super(message);
    this.name = "SkinLoadError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStateMap(
  raw: unknown,
): Record<string, string> | undefined {
  if (!isRecord(raw)) return undefined;
  const map: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.length > 0) {
      map[key] = value;
    } else if (Array.isArray(value)) {
      // Schema allows string | string[]; web uses anim → dir (one dir).
      const first = value.find(
        (v): v is string => typeof v === "string" && v.length > 0,
      );
      if (first) map[key] = first;
    }
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

export function parseCharacterJson(
  raw: unknown,
  fallbackName: string,
): CharacterMeta {
  if (!isRecord(raw)) {
    throw new SkinLoadError(
      "character.json is not a JSON object",
      "missing_character_json",
    );
  }

  const fps = typeof raw.fps === "number" && raw.fps > 0 ? raw.fps : 16;
  const spriteSize =
    typeof raw.sprite_size === "number" && raw.sprite_size > 0
      ? raw.sprite_size
      : 128;

  let spriteFacing: "left" | "right" = "right";
  if (typeof raw.sprite_facing === "string") {
    const facing = raw.sprite_facing.toLowerCase();
    if (facing === "left" || facing === "right") {
      spriteFacing = facing;
    }
  }

  const stateMap = parseStateMap(raw.state_map);

  const name =
    typeof raw.name === "string" && raw.name.trim().length > 0
      ? raw.name.trim()
      : fallbackName;

  return { name, spriteSize, fps, spriteFacing, stateMap };
}

/**
 * Convert a .jacky package `manifest.json` into the flat character.json shape
 * used by the runtime.
 */
export function packageManifestToCharacterJson(
  manifest: unknown,
  fallbackName: string,
): Record<string, unknown> {
  if (!isRecord(manifest)) {
    throw new SkinLoadError(
      "manifest.json is not a JSON object",
      "missing_character_json",
    );
  }

  const pkgType = manifest.type;
  if (typeof pkgType === "string" && pkgType !== "skin") {
    throw new SkinLoadError(
      `.jacky package type is "${pkgType}", expected "skin"`,
      "no_frames",
    );
  }

  const skin = isRecord(manifest.skin) ? manifest.skin : {};
  const character: Record<string, unknown> = {
    name:
      typeof manifest.name === "string" && manifest.name.trim().length > 0
        ? manifest.name.trim()
        : fallbackName,
    // Desktop defaults when converting package manifests (fps=8, not 16).
    sprite_size:
      typeof skin.sprite_size === "number" && skin.sprite_size > 0
        ? skin.sprite_size
        : 128,
    fps: typeof skin.fps === "number" && skin.fps > 0 ? skin.fps : 8,
    sprite_facing:
      skin.sprite_facing === "left" || skin.sprite_facing === "right"
        ? skin.sprite_facing
        : "right",
  };

  if (typeof manifest.version === "string" && manifest.version.trim()) {
    character.version = manifest.version.trim();
  }
  if (typeof skin.type === "string" && skin.type.trim()) {
    character.type = skin.type.trim();
  }
  const stateMap = parseStateMap(skin.state_map);
  if (stateMap) character.state_map = stateMap;
  if (isRecord(skin.card)) character.card = skin.card;

  const hat = skin.hat ?? manifest.hat;
  if (hat !== undefined) character.hat = hat;

  return character;
}

/** Parse a package manifest.json into runtime CharacterMeta. */
export function parsePackageManifest(
  manifest: unknown,
  fallbackName: string,
): CharacterMeta {
  return parseCharacterJson(
    packageManifestToCharacterJson(manifest, fallbackName),
    fallbackName,
  );
}
