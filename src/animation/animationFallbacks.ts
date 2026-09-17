// Fallback chains for animations that may not exist in all sprite packs.
// When the primary animation name (from STATE_ANIMATION_MAP) is not
// available, try these alternatives in order. "idle" is always the implicit
// last resort (handled in resolveAnimation), so it does not need to appear
// here for every entry, but it is included where a meaningful intermediate
// exists.

export const ANIMATION_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  "idle2": ["idle"],
  "walk": ["idle"],
  "run": ["walk", "idle"],
  "kick": ["idle"],
  "shooting": ["slashing", "kick"],
  "happy": ["kick"],
  "eating": ["happy"],
  "eating2": ["eating"],
  "eating3": ["eating"],
  "dance": ["happy"],
  "dance2": ["dance"],
  "dance3": ["dance"],
  "dance4": ["dance"],
  "getting_pet": ["happy"],
  "peeking": ["idle"],
  "sleeping": ["idle"],
  "hurt": ["idle"],
  "jump_loop": ["falling", "hurt"],
  "idle_blink": ["idle"],
  "talk": ["idle_blink"],
  "taking_notes": ["talk", "idle"],
  "error": ["hurt", "idle"],
  "taking_picture": ["idle"],
  "rocking": ["happy", "kick", "idle"],
  "confused": ["idle_blink", "idle"],
  "dizzy": ["hurt", "idle"],
  "thinking": ["idle_blink", "idle"],
  "loading": ["idle_blink", "idle"],
  "typing": ["talk", "idle"],
  "alerting": ["talk", "idle"],
  "getting_pet2": ["getting_pet"],
  "getting_pet3": ["getting_pet"],
  "happy2": ["happy"],
  "typing2": ["typing"],
  "drag": ["hurt", "idle"],
  "falling": ["hurt", "idle"],
  "sad": ["idle"],
  "sad2": ["sad"],
  "sad3": ["sad"],
  "dying": ["hurt", "idle"],
};
