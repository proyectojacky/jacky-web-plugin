import { describe, expect, it } from "vitest";
import {
  clampToBounds,
  getVisibleViewportRect,
  pickRandomTarget,
  resolveInitialAxis,
} from "../src/core/movement";

describe("getVisibleViewportRect", () => {
  it("prefers visualViewport when available", () => {
    const rect = getVisibleViewportRect({
      innerWidth: 800,
      innerHeight: 900,
      visualViewport: {
        offsetLeft: 0,
        offsetTop: 40,
        width: 800,
        height: 650,
      } as VisualViewport,
    });
    expect(rect).toEqual({ left: 0, top: 40, width: 800, height: 650 });
  });

  it("falls back to layout viewport when visualViewport is missing", () => {
    const rect = getVisibleViewportRect({
      innerWidth: 1280,
      innerHeight: 720,
      visualViewport: null,
    });
    expect(rect).toEqual({ left: 0, top: 0, width: 1280, height: 720 });
  });
});

describe("resolveInitialAxis", () => {
  it("places center in the middle of the visible area", () => {
    const size = 128;
    const extent = 800;
    const x = resolveInitialAxis("center", extent, size, true);
    expect(x).toBe(Math.floor((extent - size) / 2));
  });

  it("keeps bottom-right inside the visible clamp edge", () => {
    const size = 128;
    // Mobile-ish: visual height smaller than layout height.
    const extent = 650;
    const y = resolveInitialAxis("bottom-right", extent, size, false);
    const clamped = clampToBounds(
      { x: 0, y },
      800,
      extent,
      size,
    );
    expect(y).toBe(clamped.y);
    expect(y + size).toBeLessThanOrEqual(extent);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  it("never returns a negative bottom-right when the sprite is larger than the extent", () => {
    const y = resolveInitialAxis("bottom-right", 100, 128, false);
    expect(y).toBe(0);
  });

  it("places bottom-left on the left margin for x", () => {
    const x = resolveInitialAxis("bottom-left", 800, 128, true);
    expect(x).toBe(24);
  });
});

describe("pickRandomTarget", () => {
  it("stays within visible bounds", () => {
    for (let i = 0; i < 40; i++) {
      const t = pickRandomTarget(800, 650, 128);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + 128).toBeLessThanOrEqual(800);
      expect(t.y + 128).toBeLessThanOrEqual(650);
    }
  });
});
