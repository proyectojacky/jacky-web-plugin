// Browser smoke test: bundles the core entry to IIFE with tsup, serves the
// workspace statically, loads the page in headless Chromium (puppeteer) and
// verifies mount, first painted frame, dialogue and DANCE resolution on the
// full skin.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import http from "node:http";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const workspaceRoot = resolve(packageDir, "../..");
const outDir = join(packageDir, "dist-smoke");

// ── 1. Bundle ────────────────────────────────────────────────────────────────
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const tsup = spawnSync(
  "pnpm",
  [
    "exec",
    "tsup",
    "src/smoke-entry.ts",
    "--format",
    "iife",
    "--global-name",
    "JackySmoke",
    "--out-dir",
    "dist-smoke",
    "--no-sourcemap",
    "--no-dts",
    "--clean",
  ],
  { cwd: packageDir, stdio: "inherit", shell: true },
);
if (tsup.status !== 0) {
  console.error("[smoke] bundle failed");
  process.exit(1);
}

// ── 2. Static server (rooted at the workspace: /sprites + bundle) ────────────
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
  let rel = urlPath.replace(/^\/+/, "");
  // Next serves /public/* at the site root; mirror that here.
  if (rel.startsWith("sprites/")) rel = `public/${rel}`;
  const filePath = join(workspaceRoot, rel);
  if (!filePath.startsWith(workspaceRoot)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const body = readFileSync(filePath);
    res.writeHead(200, {
      "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
    console.warn(`[smoke] 404 for ${urlPath}`);
  }
});

await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const { port } = server.address();

// ── 3. Page ──────────────────────────────────────────────────────────────────
const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"><title>jacky smoke</title>
    <link rel="icon" href="data:,">
  </head>
  <body>
    <h1>Jacky smoke</h1>
    <script src="./smoke-entry.global.js"></script>
  </body>
</html>`;
writeFileSync(join(outDir, "index.html"), html, "utf8");

const pageUrl = `http://127.0.0.1:${port}/packages/jacky/dist-smoke/index.html`;

// ── 4. Puppeteer checks ──────────────────────────────────────────────────────
const pageErrors = [];
let failed = false;
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("favicon")) return; // noise in bare smoke page
    pageErrors.push(text);
  });

  await page.goto(pageUrl, { waitUntil: "networkidle2" });

  await page.waitForSelector(".jacky-pet-overlay", { timeout: 10000 });
  await page.waitForSelector(".jacky-pet-sprite", { timeout: 10000 });
  await page.waitForSelector(".jacky-pet-canvas", { timeout: 10000 });
  console.log("[smoke] ✓ overlay DOM mounted");

  // First painted frame (any non-transparent pixel in the canvas).
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector(".jacky-pet-canvas");
      if (!canvas) return false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      const { width, height } = canvas;
      const grid = ctx.getImageData(0, 0, width, height).data;
      for (let i = 3; i < grid.length; i += 4 * 37) {
        if (grid[i] > 0) return true;
      }
      return false;
    },
    { timeout: 20000, polling: 250 },
  );
  console.log("[smoke] ✓ first sprite frame painted");

  // Dialogue via say().
  await page.evaluate(() => {
    window.__jackyTest.controller.say("¡Humo test!");
  });
  await page.waitForFunction(
    () => {
      const bubble = document.querySelector(".jacky-pet-bubble");
      return (
        bubble &&
        bubble.style.display !== "none" &&
        bubble.textContent?.includes("¡Humo test!")
      );
    },
    { timeout: 5000, polling: 100 },
  );
  console.log("[smoke] ✓ say() shows the speech bubble");

  // DANCE on the full skin resolves to a dance* variant (no fallback).
  const danceResolved = await page.evaluate(async () => {
    const { controller, PetState } = window.__jackyTest;
    controller.setState(PetState.DANCE);
    await new Promise((r) => setTimeout(r, 400));
    return controller.getResolvedAnimationName();
  });
  if (!/^dance\d?$/.test(danceResolved)) {
    console.error(`[smoke] ✗ DANCE resolved to "${danceResolved}"`);
    failed = true;
  } else {
    console.log(`[smoke] ✓ DANCE resolved to "${danceResolved}"`);
  }

  // Click on the sprite → GETTING_PET reaction.
  const sprite = await page.$(".jacky-pet-sprite");
  const box = await sprite.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(
    () => window.__jackyTest.controller.getState() === "GETTING_PET",
    { timeout: 5000, polling: 100 },
  );
  console.log("[smoke] ✓ click → GETTING_PET");

  // Drag: down, move, up → DRAGGED during, IDLE after, position changed.
  const before = await page.evaluate(() =>
    window.__jackyTest.controller.getPosition(),
  );
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForFunction(
    () => window.__jackyTest.controller.getState() === "DRAGGED",
    { timeout: 3000, polling: 50 },
  );
  await page.mouse.move(box.x + box.width / 2 - 120, box.y - 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    () => window.__jackyTest.controller.getState() === "IDLE",
    { timeout: 3000, polling: 50 },
  );
  const afterDrag = await page.evaluate(() =>
    window.__jackyTest.controller.getPosition(),
  );
  const dragDelta = Math.hypot(
    afterDrag.x - before.x,
    afterDrag.y - before.y,
  );
  if (dragDelta < 60) {
    console.error(`[smoke] ✗ drag moved only ${dragDelta.toFixed(0)}px`);
    failed = true;
  } else {
    console.log(
      `[smoke] ✓ drag moved ${dragDelta.toFixed(0)}px and ended in IDLE`,
    );
  }

  // Minimal skin (only Idle): DANCE must fall back to "idle" (BFS), no throw.
  const TINY_PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const minimalResult = await page.evaluate(async (base64) => {
    const { controller, PetState, JSZip } = window.__jackyTest;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    // Build a minimal .jacky zip in-browser with JSZip (bundled in the IIFE).
    const zip = new JSZip();
    zip.file("character.json", JSON.stringify({ name: "Minima", fps: 12 }));
    for (const name of ["0.png", "1.png", "2.png", "3.png"]) {
      zip.file(`Idle/${name}`, bytes);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    try {
      await controller.loadSkin(blob);
    } catch (err) {
      return { error: String(err) };
    }
    controller.setState(PetState.DANCE);
    await new Promise((r) => setTimeout(r, 300));
    const resolved = controller.getResolvedAnimationName();
    const info = controller.getSkinInfo();
    return { resolved, name: info?.name, source: info?.source };
  }, TINY_PNG_BASE64);
  if (
    minimalResult.error ||
    minimalResult.resolved !== "idle" ||
    minimalResult.name !== "Minima" ||
    minimalResult.source !== "preview"
  ) {
    console.error(`[smoke] ✗ minimal skin: ${JSON.stringify(minimalResult)}`);
    failed = true;
  } else {
    console.log(
      `[smoke] ✓ minimal Idle-only skin: DANCE → "${minimalResult.resolved}" (${minimalResult.source})`,
    );
  }

} catch (err) {
  console.error("[smoke] ✗ FAILED:", err);
  failed = true;
} finally {
  if (pageErrors.length > 0) {
    console.error("[smoke] ✗ page errors:", pageErrors);
    failed = true;
  }
  await browser.close();
  server.close();
  console.log(failed ? "[smoke] ✗ SMOKE FAILED" : "[smoke] ✓ SMOKE PASSED");
  process.exit(failed ? 1 : 0);
}
