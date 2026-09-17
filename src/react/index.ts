// React wrapper entry: <JackyPet /> + useJackyPet hook.

export { JackyPet } from "./JackyPet";
export type { JackyPetHandle, JackyPetProps } from "./JackyPet";
export { useJackyPet } from "./useJackyPet";
export { PetState, LOCOMOTION_STATES, petStateFromAlias } from "../animation/petState";
export { initJacky } from "../initJacky";
export type { JackyOptions, JackyController } from "../core/JackyEngine";
export type {
  SkinSourceConfig,
  SkinMetadata,
  LoadedSkin,
} from "../skin/skinLoader";
export type {
  WalkMode,
  ChatMode,
  DialogueDictionary,
  DialogueEvent,
} from "../core/types";
