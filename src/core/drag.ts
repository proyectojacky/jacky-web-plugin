// Pointer drag handling for the sprite element (plan drag.ts).
// Emits normalized start/move/end events; the engine decides what each
// means (DRAGGED state vs click, GETTING_PET reaction, dialogue...).

export interface DragCallbacks {
  canDrag: () => boolean;
  /** Raw pointer events for click bookkeeping (always fired on down). */
  onPointerEvent?: (event: PointerEvent) => void;
  onDragStart: (x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number, totalMovement: number) => void;
}

export interface DragHandle {
  detach: () => void;
}

const CLICK_SLOP_PX = 5;

export function attachDrag(el: HTMLElement, cb: DragCallbacks): DragHandle {
  let active = false;
  let pointerId: number | null = null;
  let lastX = 0;
  let lastY = 0;
  let totalMovement = 0;

  const onPointerDown = (event: PointerEvent) => {
    if (active) return;
    if (!cb.canDrag()) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    active = true;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    totalMovement = 0;
    cb.onPointerEvent?.(event);
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      // capture is best-effort
    }
    event.preventDefault();
    cb.onDragStart(event.clientX, event.clientY);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!active || event.pointerId !== pointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    totalMovement += Math.hypot(dx, dy);
    cb.onDragMove(event.clientX, event.clientY);
  };

  const finish = (event: PointerEvent) => {
    if (!active || event.pointerId !== pointerId) return;
    active = false;
    pointerId = null;
    try {
      el.releasePointerCapture(event.pointerId);
    } catch {
      // capture release is best-effort
    }
    cb.onDragEnd(event.clientX, event.clientY, totalMovement);
  };

  const onPointerUp = (event: PointerEvent) => finish(event);
  const onPointerCancel = (event: PointerEvent) => finish(event);

  const onClickCapture = (event: MouseEvent) => {
    // Clicks that follow a real drag should not fire a second click event.
    if (totalMovement > CLICK_SLOP_PX) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerCancel);
  el.addEventListener("click", onClickCapture, true);

  return {
    detach: () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("click", onClickCapture, true);
    },
  };
}

export { CLICK_SLOP_PX };
