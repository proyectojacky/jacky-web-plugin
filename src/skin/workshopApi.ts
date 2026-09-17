// Workshop resolution: `author/slug` -> public item metadata + stable
// download URL. Standalone (no cookies / CSRF needed for public metadata + downloads).

export const DEFAULT_WORKSHOP_API = "https://api.jacky.club";

/**
 * Default site skin for embeds that omit `skin`.
 * Workshop ref so third-party sites work without hosting sprite folders.
 */
export const DEFAULT_SITE_SKIN = "proyecto_jacky/samplecharacter3";

export interface WorkshopSkinInfo {
  id: string;
  name: string;
  downloadUrl: string | null;
  updatedAt: string | null;
  artifactSha256: string | null;
  spriteSize: number | null;
  fps: number | null;
  facing: "left" | "right" | null;
}

/** `author/slug` — letters, digits, hyphens, underscores; exactly two segments. */
const WORKSHOP_REF_RE =
  /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/i;

export function isWorkshopRef(ref: string): boolean {
  return WORKSHOP_REF_RE.test(ref.trim());
}

export function splitWorkshopRef(ref: string): { author: string; id: string } | null {
  if (!isWorkshopRef(ref)) return null;
  const [author, id] = ref.trim().toLowerCase().split("/");
  return { author: author!, id: id! };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.jacky.v1+json" },
  });
  if (!res.ok) {
    throw new Error(
      `Workshop item request failed (${res.status}) for ${url}`,
    );
  }
  return res.json();
}

/** Resolve a workshop ref to metadata + a stable download URL. */
export async function resolveWorkshopSkin(
  ref: string,
  apiBase: string = DEFAULT_WORKSHOP_API,
): Promise<WorkshopSkinInfo> {
  const parts = splitWorkshopRef(ref);
  if (!parts) {
    throw new Error(`Invalid workshop ref: "${ref}"`);
  }
  const { author, id } = parts;
  const base = apiBase.replace(/\/+$/, "");

  let raw: unknown;
  try {
    raw = await fetchJson(`${base}/workshop/items/${author}/${id}`);
  } catch (err) {
    throw new Error(`Could not resolve workshop skin "${ref}": ${String(err)}`);
  }

  const item = (raw ?? {}) as Record<string, unknown>;
  // Always build the download endpoint from apiBase — item.downloadUrl may
  // point at a different host (e.g. production workshop_base_url) while the
  // embed is talking to a local API.
  const downloadUrl = `${base}/workshop/items/${author}/${id}/download`;

  const facingRaw = item.facing;
  return {
    id,
    name: typeof item.name === "string" ? item.name : id,
    downloadUrl,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null,
    artifactSha256:
      typeof item.artifactSha256 === "string" ? item.artifactSha256 : null,
    spriteSize: typeof item.spriteSize === "number" ? item.spriteSize : null,
    fps: typeof item.fps === "number" ? item.fps : null,
    facing:
      facingRaw === "left" || facingRaw === "right" ? facingRaw : null,
  };
}

/**
 * Download the .jacky zip bytes for a resolved workshop item.
 *
 * Uses `?redirect=false` to obtain a short-lived GCS signed URL as JSON, then
 * fetches the bytes. Following a 302 redirect cross-origin is more brittle with CORS.
 */
export async function downloadWorkshopZip(
  info: WorkshopSkinInfo,
): Promise<Blob> {
  if (!info.downloadUrl) {
    throw new Error(
      `Workshop item "${info.id}" has no download URL`,
    );
  }

  const separator = info.downloadUrl.includes("?") ? "&" : "?";
  const metaRes = await fetch(`${info.downloadUrl}${separator}redirect=false`, {
    headers: { Accept: "application/json" },
  });
  if (!metaRes.ok) {
    throw new Error(
      `Workshop download metadata failed (${metaRes.status}) for ${info.downloadUrl}`,
    );
  }
  const meta = (await metaRes.json()) as { url?: unknown };
  const signedUrl = typeof meta.url === "string" ? meta.url : null;
  if (!signedUrl) {
    throw new Error(
      `Workshop download for "${info.id}" returned no signed URL`,
    );
  }

  const res = await fetch(signedUrl);
  if (!res.ok) {
    throw new Error(
      `Workshop download failed (${res.status}) for signed artifact`,
    );
  }
  return res.blob();
}
