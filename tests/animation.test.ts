import { describe, expect, it } from "vitest";
import { ANIMATION_FALLBACKS } from "../src/animation/animationFallbacks";
import { buildStateMap, DIR_TO_STATES } from "../src/animation/dirToStates";
import { LOCOMOTION_STATES, PetState, petStateFromAlias } from "../src/animation/petState";
import { resolveAnimation } from "../src/animation/resolveAnimation";
import { variantsForState } from "../src/animation/stateAnimationMap";

describe("DIR_TO_STATES", () => {
  it("registers known sprite folders (desktop character.py parity)", () => {
    const map = buildStateMap(["Idle", "Happy", "Dance4", "Idle Blinking"]);
    expect(map).toEqual({
      idle: "Idle",
      happy: "Happy",
      dance4: "Dance4",
      idle_blink: "Idle Blinking",
    });
  });

  it("ignores unknown folders", () => {
    const map = buildStateMap(["Unused", "Whatever"]);
    expect(map).toEqual({});
  });

  it("keeps folder names case-sensitive", () => {
    const map = buildStateMap(["idle"]);
    expect(map).toEqual({});
    expect(DIR_TO_STATES["Idle"]).toEqual(["idle"]);
  });
});

describe("resolveAnimation (desktop BFS parity)", () => {
  it("returns the requested animation when available", () => {
    expect(resolveAnimation("dance4", new Set(["dance4"]))).toBe("dance4");
  });

  it("falls back through the chain for a minimal Idle-only skin", () => {
    // DANCE -> variant dance4 -> dance -> happy -> kick -> idle
    expect(resolveAnimation("dance4", new Set(["idle"]))).toBe("idle");
    expect(resolveAnimation("walk", new Set(["idle"]))).toBe("idle");
    expect(resolveAnimation("typing", new Set(["idle"]))).toBe("idle");
    expect(resolveAnimation("shooting", new Set(["idle"]))).toBe("idle");
  });

  it("uses the first available fallback when a mid-chain anim exists", () => {
    expect(resolveAnimation("run", new Set(["idle", "walk"]))).toBe("walk");
    expect(resolveAnimation("dance4", new Set(["dance", "idle"]))).toBe("dance");
    expect(resolveAnimation("talk", new Set(["idle", "idle_blink"]))).toBe(
      "idle_blink",
    );
  });

  it("falls back to explicit idle last resort", () => {
    expect(resolveAnimation("dizzy", new Set(["idle"]))).toBe("idle");
  });

  it("never throws: keeps the current animation when nothing matches", () => {
    expect(resolveAnimation("dizzy", new Set(["walking"]), "walking")).toBe(
      "walking",
    );
    expect(resolveAnimation("dizzy", new Set([]))).toBe("idle");
  });
});

describe("STATE_ANIMATION_MAP variants", () => {
  it("exposes variant lists matching desktop pet.py", () => {
    expect(variantsForState(PetState.IDLE)).toEqual(["idle", "idle2"]);
    expect(variantsForState(PetState.DANCE)).toEqual([
      "dance",
      "dance2",
      "dance3",
      "dance4",
    ]);
    expect(variantsForState(PetState.EATING)).toEqual([
      "eating",
      "eating2",
      "eating3",
    ]);
    expect(variantsForState(PetState.SAD)).toEqual(["sad", "sad2", "sad3"]);
  });

  it("falls back to idle for unknown states", () => {
    expect(variantsForState("NOT_A_STATE" as never)).toEqual(["idle"]);
  });
});

describe("fallback table completeness", () => {
  it("covers every state variant (desktop invariant)", () => {
    for (const state of Object.values(PetState)) {
      for (const variant of variantsForState(state)) {
        if (variant === "idle") continue;
        expect(
          ANIMATION_FALLBACKS[variant],
          `missing fallback for ${variant}`,
        ).toBeDefined();
      }
    }
  });

  it("covers LOCOMOTION_STATES membership", () => {
    expect(LOCOMOTION_STATES.has(PetState.WALKING)).toBe(true);
    expect(LOCOMOTION_STATES.has(PetState.DRAGGED)).toBe(true);
    expect(LOCOMOTION_STATES.has(PetState.IDLE)).toBe(false);
  });
});

describe("petStateFromAlias", () => {
  it("normalizes case-insensitive and folder-style names", () => {
    expect(petStateFromAlias("Dance")).toBe(PetState.DANCE);
    expect(petStateFromAlias("dance")).toBe(PetState.DANCE);
    expect(petStateFromAlias("Getting Pet")).toBe(PetState.GETTING_PET);
    expect(petStateFromAlias("taking_notes")).toBe(PetState.TAKING_NOTES);
    expect(petStateFromAlias(PetState.DANCE)).toBe(PetState.DANCE);
  });

  it("returns null for raw animation keys", () => {
    expect(petStateFromAlias("dance4")).toBeNull();
    expect(petStateFromAlias("idle_blink")).toBeNull();
    expect(petStateFromAlias("nope")).toBeNull();
  });
});

describe("buildStateMap + resolver integration", () => {
  it("rich pack with Dance4 plays dance4 directly; dance2 falls back to dance", () => {
    const dirs = ["Idle", "Dance", "Dance4"];
    const map = buildStateMap(dirs);
    const available = new Set(Object.keys(map));
    expect(resolveAnimation("dance4", available)).toBe("dance4");
    expect(resolveAnimation("dance2", available)).toBe("dance");
  });

  it("pack without Dance still resolves DANCE to happy chain", () => {
    const map = buildStateMap(["Idle", "Kicking"]);
    const available = new Set(Object.keys(map));
    expect(resolveAnimation("dance4", available)).toBe("kick");
    expect(resolveAnimation("dance", available)).toBe("kick");
  });
});
