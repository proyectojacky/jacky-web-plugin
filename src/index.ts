// @proyectojacky/jacky — core entry (framework-agnostic).
//
// React apps: import the wrapper from "@proyectojacky/jacky/react".
// The root stays React-free so Vanilla/Vue/Svelte/Astro users never
// pull React in.

export { JackyEngine } from "./core/JackyEngine";
export type {
  JackyOptions,
  JackyController,
} from "./core/JackyEngine";
export {
  PetState,
  LOCOMOTION_STATES,
  petStateFromAlias,
  PET_STATES,
} from "./animation/petState";
export { DIR_TO_STATES, buildStateMap } from "./animation/dirToStates";
export {
  STATE_ANIMATION_MAP,
  variantsForState,
} from "./animation/stateAnimationMap";
export { ANIMATION_FALLBACKS } from "./animation/animationFallbacks";
export {
  pickVariant,
  resolveAnimation,
  chooseVariantForState,
} from "./animation/resolveAnimation";
export { loadSkinFromSource } from "./skin/skinLoader";
export { SkinLoadError } from "./skin/characterMeta";
export type {
  SkinSourceConfig,
  SkinMetadata,
  LoadedSkin,
  SkinSourceKind,
  LoadSkinOptions,
} from "./skin/skinLoader";
export { parseCharacterJson, parsePackageManifest, packageManifestToCharacterJson } from "./skin/characterMeta";
export type { CharacterMeta } from "./skin/characterMeta";
export {
  DEFAULT_WORKSHOP_API,
  isWorkshopRef,
  resolveWorkshopSkin,
} from "./skin/workshopApi";
export type { WorkshopSkinInfo } from "./skin/workshopApi";
export { initJacky } from "./initJacky";
export type {
  WalkMode,
  ChatMode,
  BoundsConfig,
  BoundsObject,
  InitialPosition,
  SetStateOptions,
  SetAnimationOptions,
  MoveToOptions,
  DialogueDictionary,
  DialogueEvent,
} from "./core/types";
