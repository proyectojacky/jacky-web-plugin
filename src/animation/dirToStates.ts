// Maps standard sprite subdirectory names to internal animation state name(s).
// Directory names are case-sensitive and must match Workshop validation.

export const DIR_TO_STATES: Readonly<Record<string, readonly string[]>> = {
  // existing sprite directories
  "Idle": ["idle"],
  "Idle2": ["idle2"],
  "Idle Blinking": ["idle_blink"],
  "Talk": ["talk"],
  "Walking": ["walk"],
  "Running": ["run"],
  "Hurt": ["hurt"],
  "Drag": ["drag"],
  "Kicking": ["kick"],
  "Happy": ["happy"],
  "Happy2": ["happy2"],
  "Dying": ["dying"],
  "Falling Down": ["falling"],
  "Jump Loop": ["jump_loop"],
  "Shooting": ["shooting"],
  "Slashing": ["slashing"],
  // new animation directories (ready for future sprite packs)
  "Eating": ["eating"],
  "Eating2": ["eating2"],
  "Eating3": ["eating3"],
  "Dance": ["dance"],
  "Dance2": ["dance2"],
  "Dance3": ["dance3"],
  "Dance4": ["dance4"],
  "Getting Pet": ["getting_pet"],
  "Getting Pet2": ["getting_pet2"],
  "Getting Pet3": ["getting_pet3"],
  "Peeking": ["peeking"],
  "Sleeping": ["sleeping"],
  "Taking Notes": ["taking_notes"],
  "Error": ["error"],
  "Taking Picture": ["taking_picture"],
  "Rocking": ["rocking"],
  "Confused": ["confused"],
  "Dizzy": ["dizzy"],
  "Thinking": ["thinking"],
  "Loading": ["loading"],
  "Typing": ["typing"],
  "Typing2": ["typing2"],
  "Alerting": ["alerting"],
  "Sad": ["sad"],
  "Sad2": ["sad2"],
  "Sad3": ["sad3"],
};

/**
 * Scans the pack's subdirectory names and returns { animName: dirName }
 * via DIR_TO_STATES. If the pack's character.json carries an explicit
 * `state_map`, that override wins (handled by the caller).
 */
export function buildStateMap(dirNames: Iterable<string>): Record<string, string> {
  const stateMap: Record<string, string> = {};
  const subdirs = new Set(dirNames);
  for (const [dirName, states] of Object.entries(DIR_TO_STATES)) {
    if (subdirs.has(dirName)) {
      for (const state of states) {
        stateMap[state] = dirName;
      }
    }
  }
  return stateMap;
}
