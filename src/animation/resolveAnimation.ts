// Animation variant picking and fallback resolution for missing frames.

import { ANIMATION_FALLBACKS } from "./animationFallbacks";
import { PetState } from "./petState";
import { variantsForState } from "./stateAnimationMap";

/** Pick a random variant from a list. */
export function pickVariant(variants: readonly string[]): string {
  if (variants.length === 0) return "idle";
  return variants[Math.floor(Math.random() * variants.length)]!;
}

/**
 * Resolve an animation name against the skin's available animations.
 *
 *  1. If requested exists, play it.
 *  2. BFS over ANIMATION_FALLBACKS until an available candidate is found.
 *  3. Explicit last resort: "idle".
 *  4. Otherwise return the currently playing animation (never throw).
 */
export function resolveAnimation(
  requested: string,
  available: ReadonlySet<string>,
  currentPlaying?: string,
): string {
  if (available.has(requested)) return requested;

  const visited = new Set<string>([requested]);
  const queue: string[] = [...(ANIMATION_FALLBACKS[requested] ?? [])];
  while (queue.length > 0) {
    const candidate = queue.shift()!;
    if (available.has(candidate)) return candidate;
    if (!visited.has(candidate)) {
      visited.add(candidate);
      queue.push(...(ANIMATION_FALLBACKS[candidate] ?? []));
    }
  }

  if (available.has("idle")) return "idle"; // explicit last resort
  return currentPlaying ?? "idle"; // no throw — keep whatever is on screen
}

/**
 * Choose the animation variant for a logical PetState and cache it until the
 * state changes or `rerollAnimation()` is called.
 *
 * Note: if the picked variant is missing from the skin, we do NOT re-pick a
 * different variant first — the requested variant goes through the fallback
 * chain.
 */
export function chooseVariantForState(
  state: PetState,
): { requested: string; variants: readonly string[] } {
  const variants = variantsForState(state);
  return { requested: pickVariant(variants), variants };
}
