// Maps pet states to animation state names (sprite prefixes).
// When a state maps to a list, one variant is chosen at random on each state
// transition so repeated visits to the same state look varied.

import { PetState } from "./petState";

export const STATE_ANIMATION_MAP: Readonly<
  Record<PetState, readonly string[]>
> = {
  [PetState.IDLE]: ["idle", "idle2"],
  [PetState.TALKING]: ["talk"],
  [PetState.WALKING]: ["walk"],
  [PetState.RUNNING]: ["run"],
  [PetState.HURT]: ["hurt"],
  [PetState.HAPPY]: ["happy", "happy2"],
  [PetState.FALLING]: ["falling"],
  [PetState.JUMPING]: ["jump_loop"],
  [PetState.ATTACKING]: ["shooting"],
  [PetState.EATING]: ["eating", "eating2", "eating3"],
  [PetState.DRAGGED]: ["drag"],
  [PetState.DYING]: ["dying"],
  [PetState.DANCE]: ["dance", "dance2", "dance3", "dance4"],
  [PetState.GETTING_PET]: ["getting_pet", "getting_pet2", "getting_pet3"],
  [PetState.PEEKING]: ["peeking"],
  [PetState.SLEEPING]: ["sleeping"],
  [PetState.TAKING_NOTES]: ["taking_notes"],
  [PetState.ERROR]: ["error"],
  [PetState.TAKING_PICTURE]: ["taking_picture"],
  [PetState.ROCKING]: ["rocking"],
  [PetState.CONFUSED]: ["confused"],
  [PetState.DIZZY]: ["dizzy"],
  [PetState.THINKING]: ["thinking"],
  [PetState.LOADING]: ["loading"],
  [PetState.TYPING]: ["typing", "typing2"],
  [PetState.ALERTING]: ["alerting"],
  [PetState.SAD]: ["sad", "sad2", "sad3"],
};

/** Variant list for a state; falls back to ["idle"] for unknown states. */
export function variantsForState(state: PetState): readonly string[] {
  return STATE_ANIMATION_MAP[state] ?? ["idle"];
}
