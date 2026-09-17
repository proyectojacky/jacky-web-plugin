// Movement behaviors (plan Fase 2): random walk, cursor chase, stationary.
// Simple 2D stepping with pacing/arrival semantics.

import type { WalkMode } from "./types";

export interface Vec2 {
  x: number;
  y: number;
}

export interface WalkStep {
  pos: Vec2;
  dist: number;
  arrived: boolean;
  /** 1 when the target is to the right, -1 when to the left. */
  dirX: 1 | -1;
}

/** Random destination inside the bounds (sprite must fit inside). */
export function pickRandomTarget(
  boundsW: number,
  boundsH: number,
  size: number,
): Vec2 {
  const maxX = Math.max(0, boundsW - size);
  const maxY = Math.max(0, boundsH - size);
  return {
    x: Math.floor(Math.random() * (maxX + 1)),
    y: Math.floor(Math.random() * (maxY + 1)),
  };
}

/**
 * Step `pos` toward `target` by `distance` px. Arrival snaps exactly onto the
 * target. `distance <= 0` means no movement this tick.
 */
export function stepToward(
  pos: Vec2,
  target: Vec2,
  distance: number,
): WalkStep {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= distance || dist === 0) {
    return { pos: { x: target.x, y: target.y }, dist: 0, arrived: true, dirX: dx < 0 ? -1 : 1 };
  }
  const stepX = (dx / dist) * distance;
  const stepY = (dy / dist) * distance;
  return {
    pos: { x: pos.x + stepX, y: pos.y + stepY },
    dist: dist - distance,
    arrived: false,
    dirX: dx < 0 ? -1 : 1,
  };
}

/** Clamp a position into bounds given the sprite size. */
export function clampToBounds(
  pos: Vec2,
  boundsW: number,
  boundsH: number,
  size: number,
): Vec2 {
  const maxX = Math.max(0, boundsW - size);
  const maxY = Math.max(0, boundsH - size);
  return {
    x: Math.min(Math.max(pos.x, 0), maxX),
    y: Math.min(Math.max(pos.y, 0), maxY),
  };
}

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Visible browser viewport for pet placement.
 *
 * Prefer `visualViewport` over `window.inner*` so spawn/walk stay inside the
 * area the user can actually see (mobile URL chrome, pinch-zoom, etc.).
 * Falls back to the layout viewport when Visual Viewport API is missing.
 */
export function getVisibleViewportRect(
  win: Pick<Window, "innerWidth" | "innerHeight" | "visualViewport"> = window,
): ViewportRect {
  const vv = win.visualViewport;
  if (vv && vv.width > 0 && vv.height > 0) {
    return {
      left: vv.offsetLeft,
      top: vv.offsetTop,
      width: vv.width,
      height: vv.height,
    };
  }
  return {
    left: 0,
    top: 0,
    width: win.innerWidth,
    height: win.innerHeight,
  };
}

/** Inset from the visible edge used by named initial positions. */
export const INITIAL_EDGE_MARGIN = 24;

export type InitialAxis =
  | number
  | "random"
  | "center"
  | "bottom-right"
  | "bottom-left";

/**
 * Resolve one axis of `initialPosition` into a local coordinate that fits
 * inside `[0, extent - size]` (caller may still clamp).
 */
export function resolveInitialAxis(
  axis: InitialAxis,
  extent: number,
  size: number,
  isX: boolean,
  edgeMargin: number = INITIAL_EDGE_MARGIN,
): number {
  if (typeof axis === "number") return axis;
  const max = Math.max(0, extent - size);
  if (axis === "random") {
    return Math.floor(Math.random() * (max + 1));
  }
  if (axis === "center") {
    return Math.floor(max / 2);
  }
  // Keep a margin when there is room; never start past the clamp edge.
  const margin = Math.min(edgeMargin, Math.floor(max / 2));
  if (isX) {
    return axis === "bottom-right" ? max - margin : margin;
  }
  return max - margin;
}

export interface IdleCadence {
  minMs: number;
  maxMs: number;
}

/** Random delay between automatic idle actions (default ~2.5–6.5s). */
export function nextIdleDelay(cadence: IdleCadence): number {
  return cadence.minMs + Math.random() * (cadence.maxMs - cadence.minMs);
}

/** Chance-gated "fidget" while stationary (rocking). */
export function shouldFidget(chance: number): boolean {
  return Math.random() < chance;
}

export const WALK_MODES: readonly WalkMode[] = [
  "random",
  "follow_cursor",
  "stationary",
];

export function normalizeWalkMode(mode: unknown): WalkMode {
  return WALK_MODES.includes(mode as WalkMode) ? (mode as WalkMode) : "random";
}
