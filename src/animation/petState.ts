// Pet logical states and locomotion set used by the web engine.

export enum PetState {
  IDLE = "IDLE",
  TALKING = "TALKING",
  WALKING = "WALKING",
  RUNNING = "RUNNING",
  HURT = "HURT",
  HAPPY = "HAPPY",
  FALLING = "FALLING",
  JUMPING = "JUMPING",
  ATTACKING = "ATTACKING",
  EATING = "EATING",
  DRAGGED = "DRAGGED",
  DYING = "DYING",
  DANCE = "DANCE",
  GETTING_PET = "GETTING_PET",
  PEEKING = "PEEKING",
  SLEEPING = "SLEEPING",
  TAKING_NOTES = "TAKING_NOTES",
  ERROR = "ERROR",
  TAKING_PICTURE = "TAKING_PICTURE",
  ROCKING = "ROCKING",
  CONFUSED = "CONFUSED",
  DIZZY = "DIZZY",
  THINKING = "THINKING",
  LOADING = "LOADING",
  TYPING = "TYPING",
  ALERTING = "ALERTING",
  SAD = "SAD",
}

// States where the pet's position may change (walk, gravity, drag...).
// Pose/idle states must not keep a nav target or residual walk velocity.
export const LOCOMOTION_STATES: ReadonlySet<PetState> = new Set([
  PetState.FALLING,
  PetState.DRAGGED,
  PetState.JUMPING,
  PetState.DIZZY,
  PetState.WALKING,
  PetState.RUNNING,
]);

/** All valid PetState values, for alias normalization. */
export const PET_STATES: readonly PetState[] = Object.values(PetState);

/**
 * Normalize a user-facing animation/estado name to a PetState when possible.
 *
 * Accepts:
 *   - PetState enum values directly ("DANCE", "GETTING_PET")
 *   - Enum names case-insensitively ("dance", "Getting Pet")
 *   - Folder-style names ("Dance" -> DANCE, "Taking Notes" -> TAKING_NOTES)
 *   - snake_case ("taking_notes" -> TAKING_NOTES)
 *
 * Returns null when the name does not correspond to a logical state (e.g.
 * raw animation keys like "idle_blink" or "dance4").
 */
export function petStateFromAlias(name: string): PetState | null {
  const upper = name.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const candidate = upper as PetState;
  if ((PET_STATES as readonly string[]).includes(candidate)) {
    return candidate;
  }
  return null;
}
