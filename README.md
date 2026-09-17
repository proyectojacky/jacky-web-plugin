# @proyectojacky/jacky

Web pet plugin for Jacky: a framework-agnostic sprite engine plus an optional React wrapper, with `.jacky` skin support (Workshop refs, URLs, folders, and drag & drop).

**Live demo:** [jacky.club/plugin](https://jacky.club/plugin) — try speech, movement, states, and skin switching in the browser.

```bash
npm install @proyectojacky/jacky
```

## React / Next.js

```tsx
import { JackyPet } from "@proyectojacky/jacky/react";

export default function App() {
  return (
    <JackyPet
      speed={2.5}
      walkMode="random"
      draggable
      dialogues={["¡Hola!", "¿Qué estás programando?"]}
      chatMode="auto"
      skin="proyecto_jacky/samplecharacter3"
    />
  );
}
```

### Imperative handle

```tsx
import { JackyPet, useJackyPet } from "@proyectojacky/jacky/react";

function App() {
  const { ref, handle } = useJackyPet({ skin: "/sprites/Jacky" });
  return (
    <>
      <button onClick={() => handle?.say("¡Formulario enviado!")}>
        Submit
      </button>
      <button onClick={() => handle?.setAnimation("Dance", { duration: 3000 })}>
        Dance
      </button>
      <JackyPet ref={ref} />
    </>
  );
}
```

## Vanilla JS / Vue / Svelte / Astro / HTML

The root entry does **not** depend on React:

```js
import { initJacky } from "@proyectojacky/jacky";

const jacky = initJacky({
  speed: 3,
  walkMode: "follow_cursor",
  onClick: (pet) => pet.say("¡Me hiciste clic!"),
});

document.getElementById("submit")?.addEventListener("click", () => {
  jacky.say("¡Listo!");
  jacky.setAnimation("Dance", { duration: 3000 });
});
```

## Options (`JackyOptions` / `JackyPetProps`)

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `speed` | `number` | `2` | Pixels per frame at the skin's FPS. |
| `walkMode` | `'random' \| 'follow_cursor' \| 'stationary'` | `'random'` | Locomotion behavior. |
| `draggable` | `boolean` | `true` | Drag with the pointer. |
| `bounds` | `'viewport' \| HTMLElement \| string \| BoundsObject` | `'viewport'` | Movement limits. |
| `size` | `number` | `128` | Size in pixels. |
| `scale` | `number` | `1` | Visual scale. |
| `zIndex` | `number` | `9999` | Overlay z-index. |
| `initialPosition` | `{ x?, y? }` | `center` | Start position (`number \| 'random' \| 'center' \| 'bottom-right' \| 'bottom-left'`). |
| `dialogues` | `string[] \| DialogueDictionary` | Spanish phrases | Phrases by event (`greeting`, `idle`, `click`, `drag`, `petted`). |
| `chatMode` | `'auto' \| 'click_only' \| 'disabled'` | `'auto'` | When Jacky speaks. |
| `chatInterval` | `[minMs, maxMs]` | `[5000, 15000]` | Auto-chat range. |
| `bubbleDuration` | `number` | `4000` | Speech bubble duration (ms). |
| `skin` | `string \| SkinSourceConfig \| File \| Blob` | `/sprites/Jacky` | Skin source. |
| `allowDropSkin` | `boolean` | `true` | Drop `.jacky` files onto Jacky. |
| `skinPersistence` | `'none' \| 'visitor'` | `'none'` | Persist visitor overrides (IndexedDB). |
| `skinScope` | `string` | `'default'` | Namespace for visitor overrides. |
| `fps` | `number` | skin FPS | Override animation FPS. |
| `workshopApiBase` | `string` | `https://api.jacky.club` | API used to resolve `author/slug` refs. |
| `onClick` | `(pet, event) => void` | — | Click callback (default: `GETTING_PET` + petting). |
| `onStateChange` | `(newState, oldState) => void` | — | `PetState` changes. |
| `onSkinLoaded` | `(skinInfo) => void` | — | Fired when a skin is loaded. |
| `onError` | `(error) => void` | `console.error` | Network / skin errors. |

## Controller methods (`JackyController`)

Use the handle from `useJackyPet()` or the object returned by `initJacky()`.

### Speech bubbles — `say` / `setBubble`

Confirm a form submit, celebrate a download, or nudge the user toward a CTA.

```tsx
// After a successful form submit
handle?.say("¡Formulario enviado!", 3500);

// setBubble is an alias (same bubble UI)
handle?.setBubble("Guardando…", 2000);

// Pair speech with a short happy animation
handle?.say("Deploy listo ✨");
handle?.setState(PetState.HAPPY, { duration: 2800 });
```

### States & animations — `setState` / `setAnimation` / `rerollAnimation`

Mirror an AI agent: `TYPING` while waiting, `HAPPY` on success, `ERROR` on failure, `DANCE` for celebrations.

```tsx
import { PetState } from "@proyectojacky/jacky/react";

// Logical state — picks a random variant + fallbacks
handle?.setState(PetState.TYPING, { duration: 5000 });
handle?.setState(PetState.DANCE, {
  duration: 4000,
  onFinish: () => handle?.say("¡Fin del baile!"),
});

// Named animation / alias (folder name, enum, snake_case…)
handle?.setAnimation("Dance", { duration: 3000 });
handle?.setAnimation("Getting Pet", { duration: 2500 });
handle?.setAnimation("taking_notes", { duration: 4000 });

// New random variant of the current state
handle?.rerollAnimation();
```

Skins that only ship `Idle/` still support `DANCE`, `WALKING`, `TYPING`, and the rest via a fallback chain — missing animations degrade instead of throwing.

### Movement — `moveTo` / `setWalkMode`

Spotlight a button in an onboarding tour, or pause wandering while Jacky explains something.

```tsx
// Walk toward a UI target, then talk
const el = document.getElementById("cta");
const rect = el?.getBoundingClientRect();
if (rect) {
  await handle?.moveTo(rect.left, rect.top - 40, { speedOverride: 5 });
  handle?.say("¡Haz clic aquí!");
}

// Change locomotion live
handle?.setWalkMode("follow_cursor"); // chase the pointer
handle?.setWalkMode("stationary");    // stay put while explaining
handle?.setWalkMode("random");        // wander again
```

### Skins — `loadSkin` / `resetSkin` / `getSkinInfo`

Let visitors try Workshop skins, or persist a personal override with `skinPersistence="visitor"`.

```tsx
// Workshop ref (author/slug) — ephemeral preview for this tab
await handle?.loadSkin("proyecto_jacky/samplecharacter3");

// Stable .jacky URL
await handle?.loadSkin("https://cdn.example.com/skins/otter.jacky");

// Folder pack (character.json + jacky.manifest.json)
await handle?.loadSkin({ folder: "/sprites/Jacky" });

// Visitor override — survives refresh if skinPersistence="visitor"
await handle?.loadSkin(fileFromInput, { persist: true });

// Back to the site skin (clears visitor override)
await handle?.resetSkin();

const info = handle?.getSkinInfo();
// { name, source: "site"|"visitor"|"preview", animations, fps, … }
```

### Introspection — `getState` / `getAnimationName` / `getPosition`

Build a debug HUD, gate UI until `IDLE`, or sync analytics when Jacky reaches a target.

```tsx
const state = handle?.getState();                 // PetState.IDLE
const anim = handle?.getAnimationName();          // requested key
const resolved = handle?.getResolvedAnimationName(); // after fallbacks
const { x, y } = handle?.getPosition() ?? { x: 0, y: 0 };

if (handle?.getState() === PetState.WALKING) {
  console.log("Jacky is walking to", x, y);
}
```

### Live config & teardown — `updateConfig` / `destroy`

Tune speed/chat from a settings panel, then clean up when leaving an SPA route.

```tsx
handle?.updateConfig({
  speed: 4,
  walkMode: "follow_cursor",
  chatMode: "click_only",
  dialogues: {
    click: ["¡Hey!", "¿Necesitas ayuda?"],
    idle: ["…"],
  },
});

// Tear down when leaving a route / SPA view
useEffect(() => {
  return () => handle?.destroy();
}, [handle]);
```

### Compose several methods

Chain `say` + `setState` + `moveTo` + `setAnimation` for richer reactions.

```tsx
async function celebrateDownload(name: string) {
  handle?.say(`¡Descargaste ${name}!`);
  handle?.setState(PetState.HAPPY, { duration: 2800 });
  await handle?.moveTo(
    window.innerWidth / 2 - 64,
    window.innerHeight / 2 - 64,
    { speedOverride: 6 },
  );
  handle?.setAnimation("Dance", { duration: 3500 });
}
```

## Skins (`.jacky`)

| Layer | Who sees it | How it is installed |
| :--- | :--- | :--- |
| **Site skin (A)** | Every visitor | `skin="author/slug"` or a stable URL in your code |
| **Visitor override (B)** | That browser only | Drop / `loadSkin` with `skinPersistence="visitor"` |
| **Ephemeral preview (C)** | That tab only | Drop without persistence |

```tsx
<JackyPet skin={{ workshop: "proyecto_jacky/samplecharacter3", version: "latest" }} />
<JackyPet skin="https://cdn.mysite.com/jacky/my-skin.jacky" />
<JackyPet skin={{ folder: "/sprites/Jacky" }} />
```

**`.jacky` packages** are zip archives. A package `manifest.json` is converted to skin metadata at load time; a ready `character.json` inside the zip also works.

**Folder mode** needs, next to the pack: `character.json` (metadata) and `jacky.manifest.json` (PNG listing — browsers cannot list directories):

```json
{
  "name": "Jacky",
  "sprite_size": null,
  "fps": null,
  "sprite_facing": null,
  "animations": {
    "Idle": ["0_Bunny_Idle_000.png", "..."],
    "Walking": ["0_Bunny_Walking_000.png", "..."]
  }
}
```

Generate the manifest with:

```bash
pnpm --filter @proyectojacky/jacky gen:manifest -- ./path/to/pack
```

**Product rule:** what every visitor sees = layer A (Workshop ref / stable URL). Drops and `File`/`Blob` are layer B or C, never A.

### Pack requirement

Same as Workshop: at least `Idle` with ≥ 4 PNGs. Without idle, `loadSkin` rejects with `SkinLoadError` and the engine keeps the previous skin.

## Animation resolution

When you call `setState` / `setAnimation`, the engine:

1. Maps the logical `PetState` to animation variants (`STATE_ANIMATION_MAP`)
2. Picks one random variant per transition
3. If frames are missing, walks a fallback chain (`ANIMATION_FALLBACKS`) down to `idle`
4. If nothing resolves, keeps the previous frame

Tables (`DIR_TO_STATES`, `STATE_ANIMATION_MAP`, `ANIMATION_FALLBACKS`) and `PetState` are exported from the package for advanced use.

## Development

```bash
pnpm install
pnpm --filter @proyectojacky/jacky build      # dist ESM + CJS + d.ts
pnpm --filter @proyectojacky/jacky test      # vitest
pnpm --filter @proyectojacky/jacky typecheck # tsc --noEmit
```
