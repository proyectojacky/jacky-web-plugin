// Self-contained speech bubble: positions itself above Jacky's head and
// flips below when there is no room above (plan Fase 3).
//
// Layout uses left/top in px (no transform) so the CSS bounce-in animation can
// safely animate transform without fighting the centering math.

export interface BubbleAnchor {
  /** Sprite top-left in viewport/overlay coordinates. */
  x: number;
  y: number;
  /** Displayed sprite size in px. */
  size: number;
}

export interface BubbleViewport {
  width: number;
  height: number;
}

const MARGIN = 12;

export class SpeechBubble {
  readonly el: HTMLDivElement;
  private hideTimer: number | null = null;
  private visible = false;
  private lastAnchor: BubbleAnchor | null = null;
  private lastViewport: BubbleViewport | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "jacky-pet-bubble";
    this.el.style.display = "none";
    this.el.style.visibility = "hidden";
    this.el.setAttribute("role", "status");
    const tail = document.createElement("div");
    tail.className = "jacky-pet-bubble-tail";
    this.el.appendChild(tail);
    const text = document.createElement("span");
    text.className = "jacky-pet-bubble-text";
    this.el.appendChild(text);
  }

  private get textNode(): HTMLSpanElement {
    return this.el.querySelector(".jacky-pet-bubble-text")!;
  }

  show(
    text: string,
    durationMs: number,
    onHidden?: () => void,
  ): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.textNode.textContent = text;

    // Lay out off-screen / hidden first so we never flash at (0,0).
    this.el.style.visibility = "hidden";
    this.el.style.display = "block";
    this.visible = true;

    if (this.lastAnchor && this.lastViewport) {
      this.positionAt(this.lastAnchor, this.lastViewport);
    }

    this.el.style.visibility = "visible";

    // Restart bounce-in only after the bubble is already at the right spot.
    this.el.style.animation = "none";
    void this.el.offsetWidth;
    this.el.style.animation = "";

    if (durationMs > 0) {
      this.hideTimer = window.setTimeout(() => {
        this.hideTimer = null;
        this.visible = false;
        this.el.style.display = "none";
        this.el.style.visibility = "hidden";
        onHidden?.();
      }, durationMs);
    }
  }

  hide(): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.el.style.display = "none";
    this.el.style.visibility = "hidden";
    this.visible = false;
  }

  isShown(): boolean {
    return this.visible;
  }

  /** Update position for the current anchor (called while visible, and to cache pose). */
  updateAnchor(anchor: BubbleAnchor, viewport: BubbleViewport): void {
    this.lastAnchor = anchor;
    this.lastViewport = viewport;
    if (!this.visible) return;
    this.positionAt(anchor, viewport);
  }

  private positionAt(anchor: BubbleAnchor, viewport: BubbleViewport): void {
    const centerX = anchor.x + anchor.size / 2;
    const headTop = anchor.y;

    // Measure after text is set; ignore bounce transform for size.
    const width = this.el.offsetWidth;
    const height = this.el.offsetHeight;
    const halfW = width / 2;

    const minCenter = MARGIN + halfW;
    const maxCenter = Math.max(minCenter, viewport.width - MARGIN - halfW);
    const clampedCenter = Math.min(Math.max(centerX, minCenter), maxCenter);

    const aboveSpace = headTop - MARGIN;
    const below = aboveSpace < height;

    // Pixel left/top — transform stays free for the entrance animation.
    const left = clampedCenter - halfW;
    if (below) {
      this.el.classList.add("jacky-pet-bubble-below");
      this.el.style.left = `${left}px`;
      this.el.style.top = `${headTop + anchor.size + MARGIN}px`;
    } else {
      this.el.classList.remove("jacky-pet-bubble-below");
      this.el.style.left = `${left}px`;
      this.el.style.top = `${headTop - MARGIN - height}px`;
    }
    // Intentionally leave `transform` alone — the entrance animation owns it.
  }

  destroy(): void {
    this.hide();
    this.el.remove();
  }
}
