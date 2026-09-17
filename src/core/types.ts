// Shared engine types (kept separate so movement/drag/renderer can import
// without cycles).

export type WalkMode = "random" | "follow_cursor" | "stationary";
export type ChatMode = "auto" | "click_only" | "disabled";

export type DialogueEvent =
  | "greeting"
  | "idle"
  | "click"
  | "drag"
  | "petted"
  | "walk";

export type DialogueDictionary = Partial<
  Record<DialogueEvent, string | string[]>
>;

export interface BoundsObject {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BoundsConfig =
  | "viewport"
  | HTMLElement
  | string
  | BoundsObject;

export type InitialPositionAxis =
  | number
  | "random"
  | "center"
  | "bottom-right"
  | "bottom-left";

export interface InitialPosition {
  x?: InitialPositionAxis;
  y?: InitialPositionAxis;
}

export interface SetStateOptions {
  /** Auto-return to IDLE after this many ms. */
  duration?: number;
  onFinish?: () => void;
}

export interface SetAnimationOptions extends SetStateOptions {
  /** Kept for API parity; animations always loop on the web MVP. */
  loop?: boolean;
}

export interface MoveToOptions {
  speedOverride?: number;
}
