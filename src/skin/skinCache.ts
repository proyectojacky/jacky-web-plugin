// Client-side cache for .jacky zip artifacts.
//
// Key policy:
//   - immutable artifacts:   `jacky-skin:sha256:<hex>`
//   - workshop refs:         `jacky-skin:workshop:<author>/<id>@<version>`
//   - plain URLs (fallback): `jacky-skin:url:<normalized url>`
//
// Store: Cache API (preferred). Immutable by sha256; `latest` refs revalidate
// via metadata when available (caller decides) and reuse the cached zip
// otherwise. LRU eviction by total size with a per-origin budget.

const CACHE_NAME = "jacky-skin-cache-v1";
const INDEX_KEY = "jacky-skin:index";
const DEFAULT_BUDGET_BYTES = 80 * 1024 * 1024; // ~80 MB per origin

export interface CacheIndexEntry {
  key: string;
  size: number;
  at: number;
}

function hasCacheApi(): boolean {
  return typeof caches !== "undefined";
}

/** SHA-256 hex digest of a blob (null when crypto.subtle is unavailable). */
export async function computeSha256Hex(blob: Blob): Promise<string | null> {
  try {
    if (
      typeof crypto === "undefined" ||
      typeof crypto.subtle === "undefined" ||
      typeof crypto.subtle.digest !== "function"
    ) {
      return null;
    }
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

async function readIndex(): Promise<CacheIndexEntry[]> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(INDEX_KEY);
    if (!res) return [];
    const entries = (await res.json()) as CacheIndexEntry[] | undefined;
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

async function writeIndex(entries: CacheIndexEntry[]): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      INDEX_KEY,
      new Response(JSON.stringify(entries), {
        headers: { "content-type": "application/json" },
      }),
    );
  } catch {
    // index failures are non-fatal
  }
}

export async function cacheGetZip(key: string): Promise<Blob | null> {
  if (!hasCacheApi()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(key);
    if (!res) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function cachePutZip(
  key: string,
  blob: Blob,
  budgetBytes: number = DEFAULT_BUDGET_BYTES,
): Promise<void> {
  if (!hasCacheApi()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      key,
      new Response(blob, { headers: { "content-type": "application/octet-stream" } }),
    );

    const index = (await readIndex()).filter((e) => e.key !== key);
    index.push({ key, size: blob.size, at: Date.now() });

    // LRU eviction by last-used timestamp while over budget.
    let total = index.reduce((sum, e) => sum + e.size, 0);
    const sorted = [...index].sort((a, b) => a.at - b.at); // oldest first
    let cursor = 0;
    while (total > budgetBytes && cursor < sorted.length) {
      const victim = sorted[cursor]!;
      if (victim.key === key) {
        // Never evict the entry we just wrote.
        cursor += 1;
        continue;
      }
      await cache.delete(victim.key);
      total -= victim.size;
      cursor += 1;
    }
    await writeIndex(sorted.slice(cursor));
  } catch {
    // cache failures are non-fatal
  }
}

export function shaCacheKey(sha256Hex: string): string {
  return `jacky-skin:sha256:${sha256Hex}`;
}

export function workshopCacheKey(
  author: string,
  id: string,
  version: string = "latest",
): string {
  return `jacky-skin:workshop:${author}/${id}@${version}`;
}

export function urlCacheKey(url: string): string {
  let normalized = url;
  try {
    const parsed = new URL(url, typeof location !== "undefined" ? location.href : undefined);
    parsed.hash = "";
    normalized = parsed.toString();
  } catch {
    // keep raw string for non-URL inputs
  }
  return `jacky-skin:url:${normalized}`;
}
