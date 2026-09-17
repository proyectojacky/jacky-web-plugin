// Smoke entry bundled to IIFE for the browser smoke test (vanilla path).
import { initJacky, PetState } from "../src/index";
import JSZip from "jszip";

const controller = initJacky({
  skin: "/sprites/Jacky",
  walkMode: "random",
  chatMode: "auto",
});

(window as unknown as { __jackyTest: unknown }).__jackyTest = {
  controller,
  PetState,
  JSZip,
};
