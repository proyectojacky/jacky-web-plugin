// Visitor-local skin override persistence (Layer B in the plan).
//
// IMPORTANT PRODUCT RULE: this store is per-browser (IndexedDB) and never
// affects what other visitors see. It only holds File/Blob drops or explicit
// `loadSkin()` calls when `skinPersistence="visitor"`. The site skin (Layer A)
// always comes from the `skin` prop (workshop ref / URL / folder).

const DB_NAME = "jacky-web-plugin";
const STORE_NAME = "skin-overrides";
const DB_VERSION = 1;

export interface VisitorOverride {
  zip: Blob;
  name: string;
  savedAt: number;
}

function storageKey(scope: string): string {
  let origin = "unknown";
  try {
    origin = location.origin;
  } catch {
    // non-browser env fallback
  }
  return `${origin}|${scope}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const req = fn(tx.objectStore(STORE_NAME));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveVisitorOverride(
  scope: string,
  zip: Blob,
  name: string,
): Promise<void> {
  try {
    const override: VisitorOverride = { zip, name, savedAt: Date.now() };
    await withStore("readwrite", (store) =>
      store.put(override, storageKey(scope)) as IDBRequest<IDBValidKey>,
    );
  } catch {
    // persistence is best-effort
  }
}

export async function loadVisitorOverride(
  scope: string,
): Promise<VisitorOverride | null> {
  try {
    const result = await withStore<VisitorOverride | undefined>(
      "readonly",
      (store) => store.get(storageKey(scope)) as IDBRequest<VisitorOverride | undefined>,
    );
    return result ?? null;
  } catch {
    return null;
  }
}

export async function clearVisitorOverride(scope: string): Promise<void> {
  try {
    await withStore("readwrite", (store) =>
      store.delete(storageKey(scope)) as IDBRequest<undefined>,
    );
  } catch {
    // persistence is best-effort
  }
}
