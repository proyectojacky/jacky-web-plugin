// StreamAvatars spritesheet support (port of the desktop's
// utils/streamavatars.py). A sheet is one PNG where each non-empty animation
// in data.txt occupies one row of fixed-size cells, in declaration order.
// character.json opts in with `"type": "streamavatars"` (or "spritesheet")
// plus `spritesheet` / `data_file` file names.

export interface SpritesheetRow {
  name: string;
  row: number;
  frames: number;
}

export interface SpritesheetInfo {
  frameWidth: number;
  frameHeight: number;
  rows: SpritesheetRow[];
}

/**
 * Jacky animation -> StreamAvatars animations in priority order. Used for
 * states the skin's own state_map leaves out; "idle" is the final fallback.
 */
export const DEFAULT_SA_STATE_MAP: Record<string, readonly string[]> = {
  idle: ["idle"],
  idle2: ["sit_loop", "sit", "stand", "idle"],
  idle_blink: ["idle"],
  walk: ["walk", "run", "idle"],
  run: ["run", "walk", "idle"],
  jump_loop: ["jump", "fall", "idle"],
  falling: ["fall", "jump", "idle"],
  drag: ["fall", "jump", "idle"],
  talk: ["wave", "yes", "cheerup", "talk", "idle"],
  happy: ["cheerup", "laugh", "dance", "wave", "yes", "idle"],
  happy2: ["laugh", "cheerup", "dance", "idle"],
  getting_pet: ["hug", "kiss", "shy", "cheerup", "idle"],
  getting_pet2: ["kiss", "hug", "shy", "idle"],
  getting_pet3: ["shy", "hug", "kiss", "idle"],
  peeking: ["shy", "wave", "idle"],
  hurt: ["damaged", "hurt", "angry", "cry", "fall", "idle"],
  dying: ["death", "cry", "fall", "sit", "idle"],
  sad: ["cry", "angry", "idle"],
  sad2: ["cry", "angry", "idle"],
  sad3: ["cry", "angry", "idle"],
  error: ["no", "angry", "cry", "idle"],
  dizzy: ["cry", "angry", "fall", "idle"],
  shooting: ["attack", "fart", "idle"],
  slashing: ["attack", "fart", "idle"],
  kick: ["attack", "fart", "idle"],
  eating: ["cheerup", "laugh", "kiss", "idle"],
  eating2: ["laugh", "cheerup", "idle"],
  eating3: ["cheerup", "idle"],
  dance: ["dance", "cheerup", "laugh", "wave", "idle"],
  dance2: ["cheerup", "dance", "laugh", "wave", "idle"],
  dance3: ["laugh", "dance", "cheerup", "idle"],
  dance4: ["fart", "dance", "idle"],
  rocking: ["dance", "cheerup", "idle"],
  sleeping: ["sleep", "sit_loop", "sit", "idle"],
  taking_notes: ["stand", "sit_loop", "sit", "idle"],
  taking_picture: ["stand", "wave", "idle"],
  confused: ["no", "shy", "idle"],
  thinking: ["cheerup", "stand", "sit_loop", "idle"],
  loading: ["sit_loop", "stand", "idle"],
  typing: ["sit_loop", "stand", "idle"],
  typing2: ["sit_loop", "stand", "idle"],
  alerting: ["yes", "wave", "jump", "angry", "idle"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse StreamAvatars data.txt / data.json. Returns null when unusable. */
export function parseStreamAvatarsData(raw: unknown): SpritesheetInfo | null {
  if (!isRecord(raw) || !isRecord(raw.avatar)) return null;
  const avatar = Object.values(raw.avatar)[0];
  if (!isRecord(avatar)) return null;

  const frameWidth = Number(avatar.width) > 0 ? Number(avatar.width) : 48;
  const frameHeight = Number(avatar.height) > 0 ? Number(avatar.height) : 48;
  const animationData = isRecord(avatar.animationData) ? avatar.animationData : {};

  const rows: SpritesheetRow[] = [];
  for (const [key, value] of Object.entries(animationData)) {
    if (!isRecord(value)) continue;
    const frames = Array.isArray(value.frameData) ? value.frameData.length : 0;
    if (frames === 0) continue; // empty animations take no row
    const customName = String(value.customName ?? "").trim();
    const name = customName || String(value.animationName ?? key).trim();
    rows.push({ name, row: rows.length, frames });
  }

  return rows.length > 0 ? { frameWidth, frameHeight, rows } : null;
}

/** Explicit state_map entries first, then DEFAULT_SA_STATE_MAP priorities. */
export function buildSpritesheetStateMap(
  available: Iterable<string>,
  explicit: Record<string, string> = {},
): Record<string, string> {
  const names = new Set(available);
  const map: Record<string, string> = {};
  for (const [state, anim] of Object.entries(explicit)) {
    if (names.has(anim)) map[state] = anim;
  }
  for (const [state, candidates] of Object.entries(DEFAULT_SA_STATE_MAP)) {
    if (state in map) continue;
    const match = candidates.find((c) => names.has(c));
    if (match) map[state] = match;
    else if (names.has("idle")) map[state] = "idle";
  }
  return map;
}

/**
 * Cut every row of the sheet into per-frame canvases. Canvases (not
 * re-encoded images) so a cross-origin sheet works without CORS on the PNG.
 */
export function sliceSpritesheet(
  sheet: CanvasImageSource,
  info: SpritesheetInfo,
): Map<string, HTMLCanvasElement[]> {
  const { frameWidth: w, frameHeight: h } = info;
  const result = new Map<string, HTMLCanvasElement[]>();
  for (const { name, row, frames } of info.rows) {
    const list: HTMLCanvasElement[] = [];
    for (let col = 0; col < frames; col++) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(sheet, col * w, row * h, w, h, 0, 0, w, h);
      list.push(canvas);
    }
    if (list.length > 0) result.set(name, list);
  }
  return result;
}
