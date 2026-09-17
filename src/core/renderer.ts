// Canvas renderer: draws the current animation frame with pixel-art
// nearest-neighbour scaling and horizontal mirroring for facing.

import type { LoadedSkin } from "../skin/skinLoader";

export interface DrawArgs {
  /** Resolved animation name (after fallbacks). */
  animName: string;
  /** Frame index within the animation. */
  frameIndex: number;
  /** Mirror the sprite horizontally. */
  flip: boolean;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private skin: LoadedSkin | null = null;
  private dpr = 1;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "jacky-pet-canvas";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Jacky: canvas 2d context unavailable");
    }
    this.ctx = ctx;
    this.dpr = Math.min(window.devicePixelRatio || 1, 4);
  }

  setSkin(skin: LoadedSkin | null): void {
    this.skin = skin;
    if (skin) {
      const size = Math.max(16, Math.round(skin.meta.spriteSize * this.dpr));
      this.canvas.width = size;
      this.canvas.height = size;
    }
  }

  /** Highest-resolution available frame for the current animation. */
  private currentFrame(animName: string, frameIndex: number): HTMLImageElement | null {
    const skin = this.skin;
    if (!skin) return null;
    const frames = skin.frames.get(animName);
    if (!frames || frames.length === 0) return null;
    const idx = frames.length > 0 ? frameIndex % frames.length : 0;
    return frames[idx] ?? null;
  }

  draw(args: DrawArgs): void {
    const { animName, frameIndex, flip } = args;
    const frame = this.currentFrame(animName, frameIndex);
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.ctx.clearRect(0, 0, w, h);
    if (!frame) return;

    // Aspect-fit inside the canvas square.
    const natural = frame.naturalWidth || w;
    const naturalH = frame.naturalHeight || h;
    const scale = Math.min(w / natural, h / naturalH);
    const dw = natural * scale;
    const dh = naturalH * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    this.ctx.save();
    this.ctx.imageSmoothingEnabled = false;
    if (flip) {
      this.ctx.translate(w, 0);
      this.ctx.scale(-1, 1);
    }
    this.ctx.drawImage(frame, dx, dy, dw, dh);
    this.ctx.restore();
  }
}
