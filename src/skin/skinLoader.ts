// Skin loading pipeline (plan §2.3 / §2.4):
//   Mode 1: folder/CDN      -> { folder: "/sprites/Jacky" } (needs
//                              character.json + jacky.manifest.json there)
//   Mode 2: .jacky URL      -> "https://…/skin.jacky" (zip -> blob: URLs)
//   Mode 3: File/Blob drop  -> preview local (never persisted as site skin)
//   Mode 4: workshop ref    -> "author/slug" via workshop API (canonical way
//                              to share skins with every visitor)
//
// Always extracts to memory (blob: URLs / HTMLImageElement); the stable URL
// or workshop ref is what persists.

import JSZip from "jszip";
import { buildStateMap } from "../animation/dirToStates";
import {
  CharacterMeta,
  SkinLoadError,
  parseCharacterJson,
  parsePackageManifest,
} from "./characterMeta";
import {
  cacheGetZip,
  cachePutZip,
  computeSha256Hex,
  shaCacheKey,
  urlCacheKey,
  workshopCacheKey,
} from "./skinCache";
import {
  DEFAULT_WORKSHOP_API,
  downloadWorkshopZip,
  isWorkshopRef,
  resolveWorkshopSkin,
  splitWorkshopRef,
} from "./workshopApi";

export type SkinSourceConfig =
  | string // folder path | .jacky URL | workshop ref "author/slug"
  | { workshop: `${string}/${string}`; version?: "latest" | string }
  | { url: string; sha256?: string }
  | { folder: string }
  | File
  | Blob;

export { SkinLoadError };

export type SkinSourceKind = "site" | "visitor" | "preview";

export interface SkinMetadata {
  name: string;
  source: SkinSourceKind;
  spriteSize: number;
  fps: number;
  spriteFacing: "left" | "right";
  /** Available animation names (state_map keys), sorted. */
  animations: string[];
  frameCounts: Record<string, number>;
  totalFrames: number;
}

export interface LoadedSkin {
  meta: SkinMetadata;
  /** animName -> loaded frames (ordered). Mutated as background anims arrive. */
  frames: Map<string, HTMLImageElement[]>;
  /** animName -> sprite subdirectory inside the pack. */
  stateMap: Record<string, string>;
  /** Object URLs created for this skin (revoke on swap/destroy). */
  objectUrls: string[];
  /**
   * Resolves when every animation has finished loading (or was aborted).
   * Already-resolved when the pack returned fully loaded.
   */
  ready: Promise<void>;
  /** Cancel in-flight frame loads (call on destroy / skin swap). */
  abortLoading: () => void;
}

export interface LoadSkinOptions {
  /** Where the skin comes from (metadata only). */
  sourceKind: SkinSourceKind;
  /** Workshop API base for author/slug refs. */
  workshopApiBase?: string;
  /** Abort in-flight fetches/decodes (React remount, destroy, skin swap). */
  signal?: AbortSignal;
  /**
   * Called after each animation batch lands during progressive load
   * (folder/zip). Useful to refresh the engine's available-anim set.
   */
  onFramesUpdated?: (skin: LoadedSkin) => void;
}

// ── Source normalization ─────────────────────────────────────────────────────

type NormalizedSource =
  | { kind: "folder"; base: string }
  | { kind: "zip-url"; url: string; sha256?: string }
  | { kind: "workshop"; ref: string; version: string }
  | { kind: "zip-blob"; blob: Blob; name: string };

function normalizeSource(source: SkinSourceConfig): NormalizedSource {
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    const name =
      typeof File !== "undefined" && source instanceof File
        ? source.name
        : "skin.jacky";
    return { kind: "zip-blob", blob: source, name };
  }

  if (typeof source === "string") {
    const trimmed = source.trim();
    if (isWorkshopRef(trimmed)) {
      const parts = splitWorkshopRef(trimmed)!;
      return {
        kind: "workshop",
        ref: `${parts.author}/${parts.id}`,
        version: "latest",
      };
    }
    if (/^https?:\/\//i.test(trimmed) || /\.jacky$/i.test(trimmed)) {
      return { kind: "zip-url", url: trimmed };
    }
    // Anything else (absolute path like "/sprites/Jacky", relative path) is a
    // folder base.
    return { kind: "folder", base: trimmed };
  }

  if ("workshop" in source) {
    const parts = splitWorkshopRef(source.workshop);
    if (!parts) {
      throw new SkinLoadError(
        `Invalid workshop ref "${source.workshop}"`,
        "network",
      );
    }
    return {
      kind: "workshop",
      ref: `${parts.author}/${parts.id}`,
      version: source.version ?? "latest",
    };
  }
  if ("url" in source) {
    return { kind: "zip-url", url: source.url, sha256: source.sha256 };
  }
  if ("folder" in source) {
    return { kind: "folder", base: source.folder };
  }

  throw new SkinLoadError(
    `Unsupported skin source: ${JSON.stringify(source)}`,
    "no_frames",
  );
}

// ── Frame image helpers ──────────────────────────────────────────────────────

/** Anims needed to paint + walk/talk without waiting for the full pack (~817 PNGs). */
const BOOT_ANIMS: readonly string[] = [
  "idle",
  "idle2",
  "idle_blink",
  "walk",
  "talk",
  "drag",
];

const FRAME_CONCURRENCY = 8;

function loadImage(
  url: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }
    // Node unit tests have no DOM Image; treat as failed decode so
    // finalizeSkin can still enforce Idle requirements.
    if (typeof Image === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    img.decoding = "async";
    const finish = (value: HTMLImageElement | null) => {
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => {
      // Drop the src to cancel the network request (avoids hung sockets).
      img.onload = null;
      img.onerror = null;
      img.src = "";
      finish(null);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    img.onload = () => finish(img);
    img.onerror = () => finish(null); // skip broken frame
    img.src = url;
  });
}

function sortedNames(names: string[]): string[] {
  return [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new SkinLoadError("Skin load aborted", "aborted");
  }
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Math.min(Math.max(1, concurrency), Math.max(1, items.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < items.length) {
        throwIfAborted(signal);
        const index = next++;
        results[index] = await fn(items[index]!, index);
      }
    }),
  );
  return results;
}

async function loadUrlFrames(
  urls: string[],
  signal?: AbortSignal,
): Promise<HTMLImageElement[]> {
  const loaded = await mapPool(
    urls,
    FRAME_CONCURRENCY,
    (url) => loadImage(url, signal),
    signal,
  );
  return loaded.filter((img): img is HTMLImageElement => img !== null);
}

function refreshSkinMeta(skin: LoadedSkin): void {
  const frameCounts: Record<string, number> = {};
  let totalFrames = 0;
  for (const [animName, list] of skin.frames) {
    frameCounts[animName] = list.length;
    totalFrames += list.length;
  }
  skin.meta.frameCounts = frameCounts;
  skin.meta.totalFrames = totalFrames;
  skin.meta.animations = Object.keys(frameCounts).sort();
}

function attachProgressiveLoad(
  skin: LoadedSkin,
  loadRest: (signal: AbortSignal) => Promise<void>,
  options: LoadSkinOptions,
): LoadedSkin {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  skin.abortLoading = () => controller.abort();
  skin.ready = (async () => {
    try {
      await loadRest(controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      throw err;
    } finally {
      options.signal?.removeEventListener("abort", onExternalAbort);
    }
  })();

  // Don't leave an unhandled rejection if the consumer never awaits ready.
  void skin.ready.catch(() => {
    /* engine / caller may ignore background failures */
  });

  return skin;
}

function splitBootAndRest(
  stateMap: Record<string, string>,
): { boot: Array<[string, string]>; rest: Array<[string, string]> } {
  const boot: Array<[string, string]> = [];
  const rest: Array<[string, string]> = [];
  const bootSet = new Set(BOOT_ANIMS);
  // Preserve BOOT_ANIMS order so idle lands first.
  for (const name of BOOT_ANIMS) {
    const dir = stateMap[name];
    if (dir) boot.push([name, dir]);
  }
  for (const [name, dir] of Object.entries(stateMap)) {
    if (!bootSet.has(name)) rest.push([name, dir]);
  }
  return { boot, rest };
}

// ── Folder mode (character.json + jacky.manifest.json) ──────────────────────

interface FolderManifest {
  name?: unknown;
  sprite_size?: unknown;
  fps?: unknown;
  sprite_facing?: unknown;
  state_map?: unknown;
  animations?: unknown;
}

async function loadFolderSkin(
  base: string,
  options: LoadSkinOptions,
): Promise<LoadedSkin> {
  const signal = options.signal;
  const cleanBase = base.replace(/\/+$/, "");
  const join = (p: string) => `${cleanBase}/${encodeURI(p)}`;

  let metaRaw: unknown;
  try {
    throwIfAborted(signal);
    const res = await fetch(join("character.json"), { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    metaRaw = await res.json();
  } catch (err) {
    throwIfAborted(signal);
    throw new SkinLoadError(
      `Folder skin "${base}" needs a character.json (${String(err)})`,
      "missing_character_json",
    );
  }
  const character = parseCharacterJson(metaRaw, "Jacky");

  let manifest: FolderManifest;
  try {
    throwIfAborted(signal);
    const res = await fetch(join("jacky.manifest.json"), { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = (await res.json()) as FolderManifest;
  } catch (err) {
    throwIfAborted(signal);
    throw new SkinLoadError(
      `Folder skin "${base}" needs a jacky.manifest.json listing its PNGs ` +
        `(browsers cannot list directories) — ${String(err)}`,
      "no_frames",
    );
  }

  if (
    typeof manifest.name === "string" &&
    manifest.name.trim().length > 0
  ) {
    character.name = manifest.name.trim();
  }
  if (typeof manifest.sprite_size === "number" && manifest.sprite_size > 0) {
    character.spriteSize = manifest.sprite_size;
  }
  if (typeof manifest.fps === "number" && manifest.fps > 0) {
    character.fps = manifest.fps;
  }
  if (manifest.sprite_facing === "left" || manifest.sprite_facing === "right") {
    character.spriteFacing = manifest.sprite_facing;
  }
  if (
    !character.stateMap &&
    typeof manifest.state_map === "object" &&
    manifest.state_map !== null
  ) {
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(
      manifest.state_map as Record<string, unknown>,
    )) {
      if (typeof v === "string") map[k] = v;
    }
    if (Object.keys(map).length > 0) character.stateMap = map;
  }

  const animationsRaw =
    typeof manifest.animations === "object" && manifest.animations !== null
      ? (manifest.animations as Record<string, unknown>)
      : {};

  const dirNames = Object.keys(animationsRaw).filter((dir) =>
    Array.isArray(animationsRaw[dir]),
  );
  const stateMap = character.stateMap ?? buildStateMap(dirNames);
  const { boot, rest } = splitBootAndRest(stateMap);

  const frames = new Map<string, HTMLImageElement[]>();

  const filesFor = (dirName: string): string[] => {
    const filesRaw = animationsRaw[dirName];
    if (!Array.isArray(filesRaw)) return [];
    return sortedNames(
      filesRaw.filter((f): f is string => typeof f === "string"),
    );
  };

  const loadAnim = async (
    animName: string,
    dirName: string,
    loadSignal?: AbortSignal,
  ): Promise<void> => {
    const files = filesFor(dirName);
    if (files.length === 0) return;
    const urls = files.map((file) => join(`${dirName}/${file}`));
    const loaded = await loadUrlFrames(urls, loadSignal);
    if (loaded.length > 0) {
      frames.set(animName, loaded);
    }
  };

  // Phase 1: boot anims (idle first) so the pet can paint ASAP.
  for (const [animName, dirName] of boot) {
    await loadAnim(animName, dirName, signal);
  }
  throwIfAborted(signal);

  const skin = finalizeSkin(frames, stateMap, character, options.sourceKind);

  if (rest.length === 0) return skin;

  return attachProgressiveLoad(
    skin,
    async (bgSignal) => {
      for (const [animName, dirName] of rest) {
        throwIfAborted(bgSignal);
        await loadAnim(animName, dirName, bgSignal);
        refreshSkinMeta(skin);
        options.onFramesUpdated?.(skin);
      }
    },
    options,
  );
}

// ── Zip mode (.jacky file: File/Blob/URL/Workshop) ───────────────────────────

async function loadZipSkin(
  blob: Blob,
  options: LoadSkinOptions,
): Promise<LoadedSkin> {
  const signal = options.signal;
  throwIfAborted(signal);

  let zip: JSZip;
  try {
    // arrayBuffer() first: JSZip's Blob support is browser-only.
    const buffer = await blob.arrayBuffer();
    throwIfAborted(signal);
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    throwIfAborted(signal);
    throw new SkinLoadError(
      `Not a valid .jacky (zip) package: ${String(err)}`,
      "invalid_zip",
    );
  }

  const entries = Object.values(zip.files).filter((f) => !f.dir);

  // Prefer character.json (installed / folder-exported packs). Fall back to
  // package manifest.json and convert to the flat character shape.
  const characterEntry = entries
    .filter((e) => /(^|\/)character\.json$/i.test(e.name))
    .sort((a, b) => a.name.length - b.name.length)[0];
  const manifestEntry = entries
    .filter((e) => /(^|\/)manifest\.json$/i.test(e.name))
    .sort((a, b) => a.name.length - b.name.length)[0];

  let character: CharacterMeta;
  let rootPrefix: string;

  if (characterEntry) {
    rootPrefix = characterEntry.name.replace(/character\.json$/i, "");
    let metaRaw: unknown;
    try {
      metaRaw = JSON.parse(await characterEntry.async("string"));
    } catch (err) {
      throw new SkinLoadError(
        `character.json is not valid JSON: ${String(err)}`,
        "missing_character_json",
      );
    }
    character = parseCharacterJson(metaRaw, "Jacky");
  } else if (manifestEntry) {
    rootPrefix = manifestEntry.name.replace(/manifest\.json$/i, "");
    let metaRaw: unknown;
    try {
      metaRaw = JSON.parse(await manifestEntry.async("string"));
    } catch (err) {
      throw new SkinLoadError(
        `manifest.json is not valid JSON: ${String(err)}`,
        "missing_character_json",
      );
    }
    character = parsePackageManifest(metaRaw, "Jacky");
  } else {
    throw new SkinLoadError(
      "The .jacky package needs a character.json or manifest.json",
      "missing_character_json",
    );
  }

  // Group PNGs by their sprite subdirectory (relative to the pack root).
  const dirFiles = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.name.toLowerCase().endsWith(".png")) continue;
    const rel = entry.name.startsWith(rootPrefix)
      ? entry.name.slice(rootPrefix.length)
      : entry.name;
    const slash = rel.indexOf("/");
    if (slash <= 0) continue; // only sequence_dirs layouts are supported here
    const dirName = rel.slice(0, slash);
    const list = dirFiles.get(dirName) ?? [];
    list.push(rel.slice(slash + 1));
    dirFiles.set(dirName, list);
  }

  const stateMap = character.stateMap ?? buildStateMap(dirFiles.keys());
  const { boot, rest } = splitBootAndRest(stateMap);

  const frames = new Map<string, HTMLImageElement[]>();
  const objectUrls: string[] = [];

  const loadAnim = async (
    animName: string,
    dirName: string,
    loadSignal?: AbortSignal,
  ): Promise<void> => {
    const files = dirFiles.get(dirName);
    if (!files) return;
    const urls: string[] = [];
    for (const file of sortedNames(files)) {
      throwIfAborted(loadSignal);
      const path = `${rootPrefix}${dirName}/${file}`;
      try {
        const png = await zip.file(path)!.async("blob");
        const url = URL.createObjectURL(png);
        objectUrls.push(url);
        urls.push(url);
      } catch {
        // skip broken frame
      }
    }
    const loaded = await loadUrlFrames(urls, loadSignal);
    if (loaded.length > 0) {
      frames.set(animName, loaded);
    } else {
      for (const url of urls) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // noop
        }
        const idx = objectUrls.indexOf(url);
        if (idx >= 0) objectUrls.splice(idx, 1);
      }
    }
  };

  for (const [animName, dirName] of boot) {
    await loadAnim(animName, dirName, signal);
  }
  throwIfAborted(signal);

  const skin = finalizeSkin(
    frames,
    stateMap,
    character,
    options.sourceKind,
    objectUrls,
  );

  if (rest.length === 0) return skin;

  return attachProgressiveLoad(
    skin,
    async (bgSignal) => {
      for (const [animName, dirName] of rest) {
        throwIfAborted(bgSignal);
        await loadAnim(animName, dirName, bgSignal);
        refreshSkinMeta(skin);
        options.onFramesUpdated?.(skin);
      }
    },
    options,
  );
}

// ── Validation + metadata ────────────────────────────────────────────────────

function finalizeSkin(
  frames: Map<string, HTMLImageElement[]>,
  stateMap: Record<string, string>,
  character: CharacterMeta,
  sourceKind: SkinSourceKind,
  objectUrls: string[] = [],
): LoadedSkin {
  // Workshop parity: an "Idle" animation with >= 4 frames is required.
  const idleFrames = frames.get("idle")?.length ?? 0;
  if (idleFrames < 4) {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    throw new SkinLoadError(
      `Skin "${character.name}" has no usable "Idle" animation ` +
        `(needs a folder mapped to "idle" with at least 4 PNGs; found ${idleFrames}).`,
      "missing_idle",
    );
  }

  const frameCounts: Record<string, number> = {};
  let totalFrames = 0;
  for (const [animName, list] of frames) {
    frameCounts[animName] = list.length;
    totalFrames += list.length;
  }

  const meta: SkinMetadata = {
    name: character.name,
    source: sourceKind,
    spriteSize: character.spriteSize,
    fps: character.fps,
    spriteFacing: character.spriteFacing,
    animations: Object.keys(frameCounts).sort(),
    frameCounts,
    totalFrames,
  };

  return {
    meta,
    frames,
    stateMap,
    objectUrls,
    ready: Promise.resolve(),
    abortLoading: () => {
      /* fully loaded */
    },
  };
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Load any SkinSourceConfig into a renderable skin. Throws SkinLoadError on
 * invalid packs (missing character.json, missing Idle, network failure...).
 *
 * Folder/zip packs return as soon as boot animations (idle/walk/…) are ready;
 * remaining animations keep loading in the background via `skin.ready`.
 */
export async function loadSkinFromSource(
  source: SkinSourceConfig,
  options: LoadSkinOptions,
): Promise<LoadedSkin> {
  const apiBase = options.workshopApiBase ?? DEFAULT_WORKSHOP_API;
  const normalized = normalizeSource(source);

  switch (normalized.kind) {
    case "folder":
      return loadFolderSkin(normalized.base, options);

    case "zip-blob":
      return loadZipSkin(normalized.blob, options);

    case "zip-url": {
      // Cache by sha256 when possible; plain URL key as fallback.
      let cached = await cacheGetZip(urlCacheKey(normalized.url));
      if (!cached && normalized.sha256) {
        cached = await cacheGetZip(shaCacheKey(normalized.sha256));
      }
      let blob: Blob;
      if (cached) {
        blob = cached;
      } else {
        throwIfAborted(options.signal);
        const res = await fetch(normalized.url, { signal: options.signal });
        if (!res.ok) {
          throw new SkinLoadError(
            `Failed to download .jacky (${res.status}): ${normalized.url}`,
            "network",
          );
        }
        blob = await res.blob();
        await cachePutZip(urlCacheKey(normalized.url), blob);
        const sha = await computeSha256Hex(blob);
        if (sha) await cachePutZip(shaCacheKey(sha), blob);
      }
      return loadZipSkin(blob, options);
    }

    case "workshop": {
      const parts = splitWorkshopRef(normalized.ref);
      if (!parts) {
        throw new SkinLoadError(
          `Invalid workshop ref "${normalized.ref}"`,
          "no_frames",
        );
      }
      const cacheKey = workshopCacheKey(
        parts.author,
        parts.id,
        normalized.version,
      );
      const cached = await cacheGetZip(cacheKey);
      if (cached) {
        return loadZipSkin(cached, options);
      }
      throwIfAborted(options.signal);
      const info = await resolveWorkshopSkin(normalized.ref, apiBase);
      const blob = await downloadWorkshopZip(info);
      await cachePutZip(cacheKey, blob);
      return loadZipSkin(blob, options);
    }
  }
}
