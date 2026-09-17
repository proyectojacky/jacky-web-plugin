// Zero-CSS-leak styles (plan §2.2): injected once, all classes prefixed with
// `jacky-pet-*` so the host site needs no Tailwind / CSS loaders.

const STYLE_ID = "jacky-pet-styles";

const CSS = `
.jacky-pet-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.jacky-pet-sprite {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.jacky-pet-sprite.jacky-pet-dragging {
  cursor: grabbing;
}

.jacky-pet-canvas {
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.jacky-pet-bubble {
  position: absolute;
  max-width: 280px;
  padding: 10px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: #2d2a26;
  border: 1px solid rgba(45, 42, 38, 0.08);
  box-shadow: 0 10px 30px -12px rgba(45, 42, 38, 0.35);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
  text-align: center;
  overflow-wrap: break-word;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  animation: jacky-pet-bounce-in 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-origin: bottom center;
}

.jacky-pet-bubble.jacky-pet-bubble-below {
  transform-origin: top center;
  animation-name: jacky-pet-bounce-in-below;
}

.jacky-pet-bubble-tail {
  position: absolute;
  top: 100%;
  left: 50%;
  width: 12px;
  height: 12px;
  transform: translateX(-50%) translateY(-6px) rotate(45deg);
  background: rgba(255, 255, 255, 0.92);
  border-right: 1px solid rgba(45, 42, 38, 0.08);
  border-bottom: 1px solid rgba(45, 42, 38, 0.08);
}

.jacky-pet-bubble.jacky-pet-bubble-below .jacky-pet-bubble-tail {
  top: auto;
  bottom: 100%;
  transform: translateX(-50%) translateY(6px) rotate(225deg);
}

@keyframes jacky-pet-bounce-in {
  0% {
    opacity: 0;
    transform: translateY(8px) scale(0.9);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes jacky-pet-bounce-in-below {
  0% {
    opacity: 0;
    transform: translateY(-8px) scale(0.9);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .jacky-pet-bubble {
    animation: none;
  }
}
`;

export function injectDefaultStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
