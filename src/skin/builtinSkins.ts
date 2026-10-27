// Built-in pets hosted by jacky.club, so embeds work without hosting sprite
// folders or depending on the Workshop. `skin="bunny"` loads the folder
// `${builtinSkinBase}/Bunny`; `skin="random"` picks one per page load.

export const BUILTIN_SKINS = ["jacky", "bunny", "bear", "duckie", "panda"] as const;

export type BuiltinSkinName = (typeof BUILTIN_SKINS)[number];

/** Where built-in pet folders live. The site itself passes "/sprites". */
export const DEFAULT_BUILTIN_SKIN_BASE = "https://jacky.club/sprites";

const FOLDERS: Record<BuiltinSkinName, string> = {
  jacky: "Jacky",
  bunny: "Bunny",
  bear: "Bear",
  duckie: "Duckie",
  panda: "Panda",
};

export function isBuiltinSkin(name: string): name is BuiltinSkinName {
  return (BUILTIN_SKINS as readonly string[]).includes(name.trim().toLowerCase());
}

export function isRandomSkin(name: string): boolean {
  return name.trim().toLowerCase() === "random";
}

export function pickRandomBuiltinSkin(
  random: () => number = Math.random,
): BuiltinSkinName {
  const index = Math.floor(random() * BUILTIN_SKINS.length);
  return BUILTIN_SKINS[Math.min(index, BUILTIN_SKINS.length - 1)]!;
}

/** Folder URL for a built-in pet name ("random" resolves to a random one). */
export function builtinSkinFolder(
  name: string,
  base: string = DEFAULT_BUILTIN_SKIN_BASE,
): string | null {
  const key = isRandomSkin(name) ? pickRandomBuiltinSkin() : name.trim().toLowerCase();
  if (!isBuiltinSkin(key)) return null;
  return `${base.replace(/\/+$/, "")}/${FOLDERS[key]}`;
}
