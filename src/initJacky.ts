// Vanilla JS / Vue / Svelte / Astro entry point (plan §1).
// Creates the engine immediately and returns the controller.

import { JackyEngine } from "./core/JackyEngine";
import type { JackyController, JackyOptions } from "./core/JackyEngine";

export function initJacky(options: JackyOptions = {}): JackyController {
  return new JackyEngine(options);
}
