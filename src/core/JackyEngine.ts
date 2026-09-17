// JackyEngine — framework-agnostic pet runtime (plan §2.1).
//
// Owns: DOM overlay (container + canvas + bubble), requestAnimationFrame
// loop, PetState machine, movement behaviors, pointer drag/click, dialogue
// scheduling and skin loading.
// Zero dependencies on React or any UI library.

import {
  PetState,
  LOCOMOTION_STATES,
  petStateFromAlias,
} from "../animation/petState";
import {
  chooseVariantForState,
  resolveAnimation,
} from "../animation/resolveAnimation";
import { SpeechBubble } from "../bubble/SpeechBubble";
import { injectDefaultStyles } from "../styles/defaultStyles";
import {
  loadSkinFromSource,
  LoadedSkin,
  SkinMetadata,
  SkinSourceConfig,
  SkinSourceKind,
} from "../skin/skinLoader";
import { SkinLoadError } from "../skin/characterMeta";
import {
  clearVisitorOverride,
  loadVisitorOverride,
  saveVisitorOverride,
} from "../skin/skinPersistence";
import { DEFAULT_WORKSHOP_API } from "../skin/workshopApi";
import { attachDrag, DragHandle, CLICK_SLOP_PX } from "./drag";
import {
  clampToBounds,
  getVisibleViewportRect,
  nextIdleDelay,
  pickRandomTarget,
  resolveInitialAxis,
  shouldFidget,
  stepToward,
} from "./movement";
import type { Vec2 } from "./movement";
import { Renderer } from "./renderer";
import {
  BoundsConfig,
  BoundsObject,
  ChatMode,
  DialogueDictionary,
  DialogueEvent,
  InitialPosition,
  MoveToOptions,
  SetAnimationOptions,
  SetStateOptions,
  WalkMode,
} from "./types";

export type {
  WalkMode,
  ChatMode,
  BoundsConfig,
  InitialPosition,
  SetStateOptions,
  SetAnimationOptions,
  MoveToOptions,
  DialogueDictionary,
  DialogueEvent,
} from "./types";
export type {
  SkinSourceConfig,
  SkinMetadata,
} from "../skin/skinLoader";
export { PetState, CLICK_SLOP_PX };

// ── Options ──────────────────────────────────────────────────────────────────

export interface JackyOptions {
  /** Sprite displacement speed, in px per animation frame @ skin FPS. */
  speed?: number;
  walkMode?: WalkMode;
  draggable?: boolean;
  bounds?: BoundsConfig;
  /** Displayed size in px before `scale`. */
  size?: number;
  scale?: number;
  zIndex?: number;
  initialPosition?: InitialPosition;
  dialogues?: string[] | DialogueDictionary;
  chatMode?: ChatMode;
  chatInterval?: [number, number];
  bubbleDuration?: number;
  /** Skin: folder path, .jacky URL, workshop ref, or File/Blob. */
  skin?: SkinSourceConfig;
  allowDropSkin?: boolean;
  skinPersistence?: "none" | "visitor";
  skinScope?: string;
  /** Overrides skin FPS when provided. */
  fps?: number;
  workshopApiBase?: string;
  onClick?: (pet: JackyController, event: MouseEvent) => void;
  onStateChange?: (newState: PetState, oldState: PetState) => void;
  onSkinLoaded?: (skinInfo: SkinMetadata) => void;
  onError?: (error: unknown) => void;
}

export interface JackyController {
  say(text: string, durationMs?: number): void;
  setState(state: PetState, options?: SetStateOptions): void;
  setAnimation(name: PetState | string, options?: SetAnimationOptions): void;
  rerollAnimation(): void;
  setBubble(text: string, durationMs?: number): void;
  moveTo(x: number, y: number, options?: MoveToOptions): Promise<void>;
  setWalkMode(mode: WalkMode): void;
  loadSkin(
    source: string | SkinSourceConfig | File | Blob,
    options?: { persist?: boolean },
  ): Promise<void>;
  resetSkin(): Promise<void>;
  getSkinInfo(): SkinMetadata | null;
  getState(): PetState;
  getAnimationName(): string;
  getResolvedAnimationName(): string;
  getPosition(): { x: number; y: number };
  /** Live-config patch (speed, walkMode, dialogues, chatMode...). */
  updateConfig(patch: JackyOptions): void;
  destroy(): void;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_SPEED = 2;
const DEFAULT_SIZE = 128;
const DEFAULT_SCALE = 1;
const DEFAULT_Z_INDEX = 9999;
const DEFAULT_BUBBLE_MS = 4000;
const DEFAULT_FPS = 16;
const DEFAULT_CHAT_INTERVAL: [number, number] = [5000, 15000];
const IDLE_CADENCE = { minMs: 2500, maxMs: 6500 };
const ROCKING_CHANCE = 0.18;
const ARRIVAL_TALK_CHANCE = 0.15;
const CURSOR_DEADZONE_RATIO = 0.5;

const DEFAULT_DIALOGUES: DialogueDictionary = {
  greeting: ["¡Hola! Soy Jacky 🐰", "¡Hola mundo!"],
  idle: [
    "¿Tomaste agua? 💧",
    "¿Qué estás programando hoy?",
    "Psst… aquí estoy si me necesitas",
  ],
  click: ["¡Me hiciste clic! ✨", "¡Eso, eso!"],
  drag: ["¡Woooah! 🌀", "¡Volar es divertido!"],
  petted: ["¡Caricias! 🥰", "Eso me hace muy feliz"],
  walk: [],
};

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class JackyEngine implements JackyController {
  // DOM
  private container: HTMLDivElement;
  private spriteEl: HTMLDivElement;
  private renderer: Renderer;
  private bubble: SpeechBubble;
  private dragHandle: DragHandle | null = null;
  private dropListeners: Array<[string, EventListener]> = [];

  // Skin
  private skin: LoadedSkin | null = null;
  private available: ReadonlySet<string> = new Set(["idle"]);
  private workshopApiBase: string;
  private configuredSkin: SkinSourceConfig;

  // State machine
  private petState: PetState = PetState.IDLE;
  private previousState: PetState = PetState.IDLE;
  private direction: 1 | -1 = 1;
  private resolvedAnim: string | null = null;
  private forcedAnim: string | null = null;
  private forcedUntil = 0;
  private resolvedPlaying = "idle";
  private frameIndex = 0;
  private frameAcc = 0;
  private finishForState: { state: PetState; cb: () => void } | null = null;

  // Position (local to bounds)
  private x = 0;
  private y = 0;
  private target: Vec2 | null = null;
  private moveToResolve: (() => void) | null = null;
  private moveSpeedOverride: number | null = null;
  private dragOffset: Vec2 = { x: 0, y: 0 };
  private cursor: { x: number; y: number } | null = null;
  private lastPointerEvent: PointerEvent | null = null;

  // Config
  private speed: number;
  private size: number;
  private scale: number;
  private zIndex: number;
  private walkMode: WalkMode;
  private draggable: boolean;
  private boundsCfg: BoundsConfig;
  private chatMode: ChatMode;
  private chatInterval: [number, number];
  private bubbleDuration: number;
  private dialogues: string[] | DialogueDictionary;
  private initialPosition: InitialPosition;
  private skinPersistence: "none" | "visitor";
  private skinScope: string;
  private allowDropSkinFlag: boolean;
  private fpsOverride: number | undefined;

  // Callbacks
  private onClickCb?: (pet: JackyController, event: MouseEvent) => void;
  private onStateChangeCb?: (newState: PetState, oldState: PetState) => void;
  private onSkinLoadedCb?: (skinInfo: SkinMetadata) => void;
  private onErrorCb?: (error: unknown) => void;

  // Runtime
  private rafId: number | null = null;
  private lastFrameAt = 0;
  private idleTimer: number | null = null;
  private chatTimer: number | null = null;
  private stateTimer: number | null = null;
  private destroyed = false;
  private skinLoadAbort: AbortController | null = null;

  constructor(options: JackyOptions = {}) {
    injectDefaultStyles();

    this.speed = options.speed ?? DEFAULT_SPEED;
    this.size = options.size ?? DEFAULT_SIZE;
    this.scale = options.scale ?? DEFAULT_SCALE;
    this.zIndex = options.zIndex ?? DEFAULT_Z_INDEX;
    this.walkMode = options.walkMode ?? "random";
    this.draggable = options.draggable ?? true;
    this.boundsCfg = options.bounds ?? "viewport";
    this.chatMode = options.chatMode ?? "auto";
    this.chatInterval = options.chatInterval ?? DEFAULT_CHAT_INTERVAL;
    this.bubbleDuration = options.bubbleDuration ?? DEFAULT_BUBBLE_MS;
    this.dialogues = options.dialogues ?? DEFAULT_DIALOGUES;
    this.initialPosition = options.initialPosition ?? {};
    this.skinPersistence = options.skinPersistence ?? "none";
    this.skinScope = options.skinScope ?? "default";
    this.allowDropSkinFlag = options.allowDropSkin ?? true;
    this.fpsOverride = options.fps;
    this.workshopApiBase = options.workshopApiBase ?? DEFAULT_WORKSHOP_API;
    this.configuredSkin = options.skin ?? "/sprites/Jacky";

    this.onClickCb = options.onClick;
    this.onStateChangeCb = options.onStateChange;
    this.onSkinLoadedCb = options.onSkinLoaded;
    this.onErrorCb = options.onError;

    // ── DOM ──
    this.container = document.createElement("div");
    this.container.className = "jacky-pet-overlay";
    this.container.style.zIndex = String(this.zIndex);

    this.spriteEl = document.createElement("div");
    this.spriteEl.className = "jacky-pet-sprite";
    this.applySpriteSize();

    this.renderer = new Renderer();
    this.spriteEl.appendChild(this.renderer.canvas);

    this.bubble = new SpeechBubble();

    this.container.appendChild(this.spriteEl);
    this.container.appendChild(this.bubble.el);
    document.body.appendChild(this.container);

    this.applyInitialPosition();
    // Seed bubble pose so the first say() can place itself before paint.
    this.bubble.updateAnchor(this.bubbleAnchor(), this.viewportSize());
    this.attachDomHandlers();

    void this.start();
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  private async start(): Promise<void> {
    this.scheduleIdle();
    this.scheduleChat();
    this.lastFrameAt = performance.now();
    this.loop(this.lastFrameAt);

    // Restore visitor override first (Layer B over Layer A).
    if (this.skinPersistence === "visitor") {
      try {
        const override = await loadVisitorOverride(this.skinScope);
        if (override) {
          const skin = await this.loadSkinFromSourceTracked(override.zip, {
            sourceKind: "visitor",
          });
          if (skin && !this.destroyed) this.applySkin(skin);
        }
      } catch (err) {
        this.reportError(err);
      }
    }

    if (!this.skin) {
      try {
        await this.loadSkin(this.configuredSkin);
      } catch (err) {
        this.reportError(err);
      }
    }

    if (this.chatMode !== "disabled") {
      window.setTimeout(() => {
        if (!this.destroyed) this.say(this.pickDialogue("greeting"));
      }, 800);
    }
  }

  private applyInitialPosition(): void {
    const rect = this.getRect();
    const display = this.displaySize();
    const x = resolveInitialAxis(
      this.initialPosition.x ?? "center",
      rect.width,
      display,
      true,
    );
    const y = resolveInitialAxis(
      this.initialPosition.y ?? "center",
      rect.height,
      display,
      false,
    );
    const clamped = clampToBounds({ x, y }, rect.width, rect.height, display);
    this.x = clamped.x;
    this.y = clamped.y;
    this.positionSprite();
  }

  // ── DOM handlers ──────────────────────────────────────────────────────────

  private attachDomHandlers(): void {
    this.dragHandle = attachDrag(this.spriteEl, {
      canDrag: () => this.draggable && !this.destroyed,
      onPointerEvent: (event) => {
        this.lastPointerEvent = event;
      },
      onDragStart: (px, py) => this.onDragStart(px, py),
      onDragMove: (px, py) => this.onDragMove(px, py),
      onDragEnd: (px, py, total) => this.onDragEnd(px, py, total),
    });

    if (this.walkMode === "follow_cursor") {
      window.addEventListener("pointermove", this.onWindowPointerMove);
    }

    window.addEventListener("resize", this.onResize);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", this.onResize);
      vv.addEventListener("scroll", this.onResize);
    }

    if (this.allowDropSkinFlag) {
      const onDragOver = (event: DragEvent) => event.preventDefault();
      const onDrop = (event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const file = event.dataTransfer?.files?.[0];
        if (file && /\.(jacky|zip)$/i.test(file.name)) {
          void this.loadSkin(file, { persist: true }).catch((err) =>
            this.reportError(err),
          );
        }
      };
      this.spriteEl.addEventListener("dragover", onDragOver);
      this.spriteEl.addEventListener("drop", onDrop);
      this.dropListeners = [
        ["dragover", onDragOver as EventListener],
        ["drop", onDrop as EventListener],
      ];
    }
  }

  private onWindowPointerMove = (event: PointerEvent): void => {
    this.cursor = { x: event.clientX, y: event.clientY };
  };

  private onResize = (): void => {
    this.clampPositions();
    this.positionSprite();
    this.updateBubbleAnchor();
  };

  // ── Bounds helpers ────────────────────────────────────────────────────────

  private getRect(): Rect {
    const cfg = this.boundsCfg;
    if (cfg === "viewport") {
      return getVisibleViewportRect();
    }
    if (typeof cfg === "string") {
      const el = document.querySelector<HTMLElement>(cfg);
      if (el) return this.rectOf(el);
    } else if (cfg instanceof HTMLElement) {
      return this.rectOf(cfg);
    } else if (cfg && typeof cfg === "object") {
      const b = cfg as BoundsObject;
      return { left: b.x, top: b.y, width: b.width, height: b.height };
    }
    return getVisibleViewportRect();
  }

  private rectOf(el: HTMLElement): Rect {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  private displaySize(): number {
    return Math.max(16, Math.round(this.size * this.scale));
  }

  private applySpriteSize(): void {
    const d = this.displaySize();
    this.spriteEl.style.width = `${d}px`;
    this.spriteEl.style.height = `${d}px`;
  }

  private toLocal(viewport: { x: number; y: number }): Vec2 {
    const rect = this.getRect();
    return { x: viewport.x - rect.left, y: viewport.y - rect.top };
  }

  private bubbleAnchor(): { x: number; y: number; size: number } {
    const rect = this.getRect();
    return {
      x: rect.left + this.x,
      y: rect.top + this.y,
      size: this.displaySize(),
    };
  }

  private viewportSize(): { width: number; height: number } {
    // Overlay coords: right/bottom edges of the active bounds rect.
    const rect = this.getRect();
    return {
      width: rect.left + rect.width,
      height: rect.top + rect.height,
    };
  }

  private updateBubbleAnchor(): void {
    this.bubble.updateAnchor(this.bubbleAnchor(), this.viewportSize());
  }

  private clampPositions(): void {
    const rect = this.getRect();
    const clamped = clampToBounds(
      { x: this.x, y: this.y },
      rect.width,
      rect.height,
      this.displaySize(),
    );
    this.x = clamped.x;
    this.y = clamped.y;
    if (this.target) {
      this.target = clampToBounds(
        this.target,
        rect.width,
        rect.height,
        this.displaySize(),
      );
    }
  }

  private positionSprite(): void {
    const rect = this.getRect();
    this.spriteEl.style.transform = `translate3d(${rect.left + this.x}px, ${
      rect.top + this.y
    }px, 0)`;
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  private loop = (now: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(Math.max(now - this.lastFrameAt, 0), 250);
    this.lastFrameAt = now;

    const dragging = this.petState === PetState.DRAGGED;
    if (!dragging) this.updateMovement(dt);

    // Advance animation frame at skin fps.
    this.frameAcc += dt;
    const interval = 1000 / Math.max(1, this.currentFps());
    while (this.frameAcc >= interval) {
      this.frameAcc -= interval;
      this.frameIndex += 1;
    }

    // Resolve animation for the current state / forced override.
    let requested: string;
    if (this.forcedAnim !== null) {
      if (now >= this.forcedUntil) {
        this.forcedAnim = null;
        this.forcedUntil = 0;
        const finish = this.finishForState;
        this.finishForState = null;
        finish?.cb();
        requested = this.getAnimationName();
      } else {
        requested = this.forcedAnim;
      }
    } else {
      requested = this.getAnimationName();
    }

    const resolved = resolveAnimation(
      requested,
      this.available,
      this.resolvedPlaying,
    );
    if (resolved !== this.resolvedPlaying) {
      this.resolvedPlaying = resolved;
      this.frameIndex = 0;
    }

    this.renderer.draw({
      animName: this.resolvedPlaying,
      frameIndex: this.frameIndex,
      flip: this.shouldFlip(),
    });

    this.rafId = requestAnimationFrame(this.loop);
  };

  private currentFps(): number {
    return this.fpsOverride ?? this.skin?.meta.fps ?? DEFAULT_FPS;
  }

  private shouldFlip(): boolean {
    const raw = this.skin?.meta.spriteFacing ?? "right";
    // Mirror when the runtime direction opposes the raw sprite facing.
    if (raw === "right") return this.direction === -1;
    return this.direction === 1;
  }

  // ── Movement ──────────────────────────────────────────────────────────────

  private updateMovement(dt: number): void {
    const rect = this.getRect();
    const display = this.displaySize();

    if (this.walkMode === "follow_cursor" && this.cursor) {
      const localCursor = this.toLocal(this.cursor);
      const center = { x: this.x + display / 2, y: this.y + display / 2 };
      const dist = Math.hypot(
        localCursor.x - center.x,
        localCursor.y - center.y,
      );
      const deadzone = display * CURSOR_DEADZONE_RATIO;
      if (dist > deadzone) {
        this.target = clampToBounds(
          { x: localCursor.x - display / 2, y: localCursor.y - display / 2 },
          rect.width,
          rect.height,
          display,
        );
        if (this.petState !== PetState.WALKING) {
          this.setState(PetState.WALKING);
        }
      } else if (this.petState === PetState.WALKING) {
        this.target = null;
        this.setState(PetState.IDLE);
      }
    }

    if (this.petState === PetState.WALKING && this.target) {
      const pxPerSecond =
        (this.moveSpeedOverride ?? this.speed) * this.currentFps();
      const step = stepToward(
        { x: this.x, y: this.y },
        this.target,
        (pxPerSecond * dt) / 1000,
      );
      this.x = step.pos.x;
      this.y = step.pos.y;
      this.direction = step.dirX;

      if (step.arrived) {
        this.target = null;
        this.moveSpeedOverride = null;
        const resolver = this.moveToResolve;
        this.moveToResolve = null;
        this.setState(PetState.IDLE);
        this.scheduleIdle();
        // Occasional arrival chatter (usePetEngine parity, 15%).
        if (shouldFidget(ARRIVAL_TALK_CHANCE)) {
          this.say(this.pickDialogue("idle"));
        }
        resolver?.();
      }
    }

    this.positionSprite();
    if (this.bubble.isShown()) this.updateBubbleAnchor();
  }

  // ── Idle scheduling ───────────────────────────────────────────────────────

  private scheduleIdle(): void {
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      if (this.destroyed || this.petState !== PetState.IDLE) return;
      if (this.walkMode === "stationary") {
        if (shouldFidget(ROCKING_CHANCE)) {
          this.setState(PetState.ROCKING, {
            duration: 4000 + Math.random() * 2500,
          });
          if (Math.random() < 0.3) this.say(this.pickDialogue("idle"));
        }
        this.scheduleIdle();
      } else if (this.walkMode === "random") {
        const rect = this.getRect();
        this.target = clampToBounds(
          pickRandomTarget(rect.width, rect.height, this.displaySize()),
          rect.width,
          rect.height,
          this.displaySize(),
        );
        this.setState(PetState.WALKING);
      }
      // follow_cursor is loop-driven; nothing to schedule.
    }, nextIdleDelay(IDLE_CADENCE));
  }

  private cancelIdle(): void {
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  // ── Chat scheduling ───────────────────────────────────────────────────────

  private scheduleChat(): void {
    if (this.chatTimer !== null) window.clearTimeout(this.chatTimer);
    if (this.chatMode !== "auto") return;
    const [min, max] = this.chatInterval;
    const delay = min + Math.random() * Math.max(0, max - min);
    this.chatTimer = window.setTimeout(() => {
      this.chatTimer = null;
      if (this.destroyed) return;
      if (
        this.chatMode === "auto" &&
        this.petState !== PetState.DRAGGED &&
        this.petState !== PetState.TALKING
      ) {
        this.say(this.pickDialogue("idle"));
      }
      this.scheduleChat();
    }, delay);
  }

  // ── Dialogues ─────────────────────────────────────────────────────────────

  private pickDialogue(event: DialogueEvent): string {
    let pool: string[];
    if (Array.isArray(this.dialogues)) {
      pool = this.dialogues;
    } else {
      const entry = this.dialogues[event];
      if (typeof entry === "string") pool = [entry];
      else if (Array.isArray(entry) && entry.length > 0) pool = entry;
      else pool = DEFAULT_DIALOGUES[event]
        ? [...(DEFAULT_DIALOGUES[event] as string[])]
        : [...(DEFAULT_DIALOGUES.idle as string[])];
    }
    if (pool.length === 0) {
      pool = [...(DEFAULT_DIALOGUES.idle as string[])];
    }
    if (pool.length === 0) pool = ["¡Hola!"];
    return pool[Math.floor(Math.random() * pool.length)]!;
  }

  // ── Drag / click ──────────────────────────────────────────────────────────

  private onDragStart(px: number, py: number): void {
    if (this.petState === PetState.DRAGGED) return;
    this.cancelIdle();
    this.target = null;
    this.moveSpeedOverride = null;
    this.moveToResolve?.();
    this.moveToResolve = null;
    this.setState(PetState.DRAGGED);
    this.spriteEl.classList.add("jacky-pet-dragging");
    const local = this.toLocal({ x: px, y: py });
    this.dragOffset = { x: local.x - this.x, y: local.y - this.y };
    this.say(this.pickDialogue("drag"));
  }

  private onDragMove(px: number, py: number): void {
    if (this.petState !== PetState.DRAGGED) return;
    const rect = this.getRect();
    const local = this.toLocal({ x: px, y: py });
    const clamped = clampToBounds(
      { x: local.x - this.dragOffset.x, y: local.y - this.dragOffset.y },
      rect.width,
      rect.height,
      this.displaySize(),
    );
    this.x = clamped.x;
    this.y = clamped.y;
    this.positionSprite();
    this.updateBubbleAnchor();
  }

  private onDragEnd(_px: number, _py: number, totalMovement: number): void {
    if (this.petState !== PetState.DRAGGED) return;
    this.spriteEl.classList.remove("jacky-pet-dragging");
    if (totalMovement < CLICK_SLOP_PX) {
      // Click → custom handler or default pet reaction (GETTING_PET + fallbacks).
      if (this.onClickCb) {
        this.onClickCb(this, this.lastPointerEvent as unknown as MouseEvent);
      } else {
        this.setState(PetState.GETTING_PET, { duration: 3200 });
        this.say(this.pickDialogue("petted"));
      }
    } else {
      this.setState(PetState.IDLE);
    }
  }

  // ── Skin application ──────────────────────────────────────────────────────

  private onSkinFramesUpdated = (skin: LoadedSkin): void => {
    if (this.destroyed || this.skin !== skin) return;
    this.available = new Set(skin.frames.keys());
  };

  private async loadSkinFromSourceTracked(
    source: string | SkinSourceConfig | File | Blob,
    options: { sourceKind: SkinSourceKind },
  ): Promise<LoadedSkin | null> {
    this.skinLoadAbort?.abort();
    this.skin?.abortLoading();
    const controller = new AbortController();
    this.skinLoadAbort = controller;
    try {
      return await loadSkinFromSource(source as SkinSourceConfig, {
        sourceKind: options.sourceKind,
        workshopApiBase: this.workshopApiBase,
        signal: controller.signal,
        onFramesUpdated: this.onSkinFramesUpdated,
      });
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err instanceof SkinLoadError && err.code === "aborted")
      ) {
        return null;
      }
      throw err;
    }
  }

  private applySkin(skin: LoadedSkin): void {
    const previous = this.skin;
    if (previous && previous !== skin) {
      previous.abortLoading();
    }
    this.skin = skin;
    this.available = new Set(skin.frames.keys());
    this.resolvedAnim = null;
    this.frameIndex = 0;
    this.renderer.setSkin(skin);
    if (previous && previous !== skin) {
      for (const url of previous.objectUrls) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // noop
        }
      }
    }
    this.onSkinLoadedCb?.(skin.meta);
    void skin.ready.then(() => {
      if (this.destroyed || this.skin !== skin) return;
      this.available = new Set(skin.frames.keys());
    });
  }

  // ── Public controller API ─────────────────────────────────────────────────

  say(text: string, durationMs: number = this.bubbleDuration): void {
    // Cache the current head pose before show() so the bubble never paints at (0,0).
    this.bubble.updateAnchor(this.bubbleAnchor(), this.viewportSize());
    this.bubble.show(text, durationMs, () => {
      if (!this.destroyed && this.petState === PetState.TALKING) {
        this.setState(PetState.IDLE);
      }
    });
    // Re-measure after text layout (width may change vs previous bubble).
    this.updateBubbleAnchor();
    // Freeze into TALKING only when standing still; keep walking while talking.
    if (
      this.petState === PetState.IDLE ||
      this.petState === PetState.ROCKING
    ) {
      this.setState(PetState.TALKING);
    }
  }

  setBubble(text: string, durationMs?: number): void {
    this.say(text, durationMs);
  }

  setState(state: PetState, options?: SetStateOptions): void {
    if (state === this.petState && !options?.duration) return;
    const old = this.petState;
    this.previousState = old;
    this.petState = state;
    this.resolvedAnim = null;
    this.forcedAnim = null;
    this.forcedUntil = 0;
    this.frameIndex = 0;

    // Pose/idle states must not keep a nav target or residual walk velocity.
    if (!LOCOMOTION_STATES.has(state)) {
      this.target = null;
      this.moveToResolve?.();
      this.moveToResolve = null;
    }

    if (state !== PetState.IDLE) this.cancelIdle();
    if (state === PetState.IDLE) this.scheduleIdle();

    if (options?.duration && options.duration > 0) {
      if (this.stateTimer !== null) window.clearTimeout(this.stateTimer);
      const targetState = state;
      this.stateTimer = window.setTimeout(() => {
        this.stateTimer = null;
        if (this.destroyed) return;
        if (this.petState === targetState) {
          this.setState(PetState.IDLE);
          options.onFinish?.();
        }
      }, options.duration);
    }

    this.onStateChangeCb?.(state, old);
  }

  setAnimation(name: PetState | string, options?: SetAnimationOptions): void {
    const asState = petStateFromAlias(String(name));
    if (asState) {
      this.setState(asState, options);
      return;
    }
    // Raw animation key (e.g. "dance4", "idle_blink"): force it over the
    // state-derived animation until duration elapses (or indefinitely).
    this.forcedAnim = String(name);
    this.forcedUntil = options?.duration
      ? performance.now() + options.duration
      : Number.POSITIVE_INFINITY;
    this.resolvedAnim = null;
    this.frameIndex = 0;
    if (options?.onFinish) {
      this.finishForState = { state: this.petState, cb: options.onFinish };
    }
  }

  rerollAnimation(): void {
    this.resolvedAnim = null;
  }

  moveTo(x: number, y: number, options?: MoveToOptions): Promise<void> {
    const rect = this.getRect();
    const local = this.toLocal({ x, y });
    this.target = clampToBounds(
      local,
      rect.width,
      rect.height,
      this.displaySize(),
    );
    this.moveSpeedOverride = options?.speedOverride ?? null;
    if (
      this.petState !== PetState.WALKING &&
      this.petState !== PetState.DRAGGED
    ) {
      this.setState(PetState.WALKING);
    }
    return new Promise<void>((resolve) => {
      this.moveToResolve = resolve;
    });
  }

  setWalkMode(mode: WalkMode): void {
    const next = WALK_MODE_SET.has(mode) ? mode : "random";
    if (next === this.walkMode) return;
    const wasFollow = this.walkMode === "follow_cursor";
    this.walkMode = next;
    if (next === "follow_cursor") {
      window.addEventListener("pointermove", this.onWindowPointerMove);
    } else if (wasFollow) {
      window.removeEventListener("pointermove", this.onWindowPointerMove);
    }
    if (next === "stationary") {
      this.target = null;
      if (this.petState === PetState.WALKING) this.setState(PetState.IDLE);
    }
    this.scheduleIdle();
  }

  async loadSkin(
    source: string | SkinSourceConfig | File | Blob,
    options?: { persist?: boolean },
  ): Promise<void> {
    const blobLike =
      typeof Blob !== "undefined" && source instanceof Blob ? source : null;
    const persist =
      options?.persist === true &&
      this.skinPersistence === "visitor" &&
      blobLike !== null;
    if (persist && blobLike) {
      const name =
        typeof File !== "undefined" && blobLike instanceof File
          ? blobLike.name
          : "skin.jacky";
      await saveVisitorOverride(this.skinScope, blobLike, name);
    }
    const kind: SkinSourceKind = blobLike
      ? persist
        ? "visitor"
        : "preview"
      : "site";
    const skin = await this.loadSkinFromSourceTracked(source, {
      sourceKind: kind,
    });
    if (skin && !this.destroyed) this.applySkin(skin);
  }

  async resetSkin(): Promise<void> {
    await clearVisitorOverride(this.skinScope);
    if (!this.destroyed) {
      await this.loadSkin(this.configuredSkin);
    }
  }

  getSkinInfo(): SkinMetadata | null {
    return this.skin ? { ...this.skin.meta } : null;
  }

  getState(): PetState {
    return this.petState;
  }

  getAnimationName(): string {
    if (this.resolvedAnim === null) {
      this.resolvedAnim = chooseVariantForState(this.petState).requested;
    }
    return this.resolvedAnim;
  }

  getResolvedAnimationName(): string {
    return this.resolvedPlaying;
  }

  getPosition(): { x: number; y: number } {
    const rect = this.getRect();
    return { x: rect.left + this.x, y: rect.top + this.y };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.skinLoadAbort?.abort();
    this.skinLoadAbort = null;
    this.skin?.abortLoading();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.cancelIdle();
    if (this.chatTimer !== null) window.clearTimeout(this.chatTimer);
    if (this.stateTimer !== null) window.clearTimeout(this.stateTimer);
    this.dragHandle?.detach();
    for (const [type, listener] of this.dropListeners) {
      this.spriteEl.removeEventListener(type, listener);
    }
    window.removeEventListener("pointermove", this.onWindowPointerMove);
    window.removeEventListener("resize", this.onResize);
    const vv = window.visualViewport;
    if (vv) {
      vv.removeEventListener("resize", this.onResize);
      vv.removeEventListener("scroll", this.onResize);
    }
    this.bubble.destroy();
    this.container.remove();
    if (this.skin) {
      for (const url of this.skin.objectUrls) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // noop
        }
      }
    }
  }

  // ── Config patch surface (React wrapper) ──────────────────────────────────

  updateConfig(patch: JackyOptions): void {
    if (patch.speed !== undefined) this.speed = patch.speed;
    if (patch.walkMode !== undefined) this.setWalkMode(patch.walkMode);
    if (patch.draggable !== undefined) this.draggable = patch.draggable;
    if (patch.dialogues !== undefined) this.dialogues = patch.dialogues;
    if (patch.chatMode !== undefined && patch.chatMode !== this.chatMode) {
      this.chatMode = patch.chatMode;
      this.scheduleChat();
    }
    if (patch.chatInterval !== undefined) {
      this.chatInterval = patch.chatInterval;
      this.scheduleChat();
    }
    if (patch.bubbleDuration !== undefined) {
      this.bubbleDuration = patch.bubbleDuration;
    }
    if (patch.zIndex !== undefined && patch.zIndex !== this.zIndex) {
      this.zIndex = patch.zIndex;
      this.container.style.zIndex = String(this.zIndex);
    }
    if (patch.size !== undefined && patch.size !== this.size) {
      this.size = patch.size;
      this.applySpriteSize();
      this.clampPositions();
      this.positionSprite();
    }
    if (patch.scale !== undefined && patch.scale !== this.scale) {
      this.scale = patch.scale;
      this.applySpriteSize();
      this.clampPositions();
      this.positionSprite();
    }
    if (patch.fps !== undefined) this.fpsOverride = patch.fps;
    if (patch.skin !== undefined && patch.skin !== this.configuredSkin) {
      this.configuredSkin = patch.skin;
      void this.loadSkin(patch.skin).catch((err) => this.reportError(err));
    }
    if (patch.allowDropSkin !== undefined) {
      this.allowDropSkinFlag = patch.allowDropSkin;
    }
    if (patch.onClick !== undefined) this.onClickCb = patch.onClick;
    if (patch.onStateChange !== undefined) {
      this.onStateChangeCb = patch.onStateChange;
    }
    if (patch.onSkinLoaded !== undefined) {
      this.onSkinLoadedCb = patch.onSkinLoaded;
    }
    if (patch.onError !== undefined) this.onErrorCb = patch.onError;
  }

  private reportError(err: unknown): void {
    if (this.onErrorCb) {
      this.onErrorCb(err);
    } else {
      console.error("[jacky]", err);
    }
  }
}

const WALK_MODE_SET: ReadonlySet<WalkMode> = new Set([
  "random",
  "follow_cursor",
  "stationary",
]);
