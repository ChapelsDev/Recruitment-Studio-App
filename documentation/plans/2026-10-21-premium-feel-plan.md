# The premium feel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Recruitment Studio a premium feel on PC and phone — sober spring motion every day and illustrative building-site moments in the waits and wins, haptic ticks, a dark mode, install on any platform, and the new «Balão a entrar» icon.

**Architecture:** Four small classic-script modules carry the logic and are unit-tested in Node — `js/appearance.js` (theme and settings, loaded in `<head>` so no flash), `js/haptics.js` (Android vibration, iPhone switch overlays), `js/install.js` (platform, guides, address), and `js/ui-motion.js` (Preact components and hooks for count-ups, loaders, the crane, the celebration and gliding indicators). `assets/app.css` moves every colour to tokens with a dark set and gains the motion tokens. `js/app.js` wires them into the screens. A new `tools/build-icons.mjs` renders the SVG icon into every PNG and the `.ico`.

**Tech Stack:** Preact + htm (UMD, classic scripts), CSS custom properties, View Transitions (with fallback), Vibration API, `<input type=checkbox switch>` (iOS), Node `node:test`, Edge headless via CDP (`tools/test-browser.mjs`).

**Spec:** `documentation/specs/2026-10-21-recruitment-studio-premium-feel-design.md` (mockups the owner chose from: `.superpowers/brainstorm/2575-1792591023/content/estilo-animacoes.html` — option C; `icone-v3.html` — option 2).

## Global Constraints

- Offline, from `file://` and as a PWA; classic scripts only (no ES modules), no CDN, no new libraries; Preact + htm as today.
- Interface in Portuguese; code and comments in English.
- Tests first for every behaviour: `node --test "tests/unit/*.test.cjs"` and `node tools/test-browser.mjs` (pages `run.html`, `run-recipes.html`, `run-ui.html`, `run-mobile.html`).
- No commits: the owner makes the commits. Each task ends with its ledger line instead.
- Never the recruiter's face, photo or voice.
- Motion animates only transform, opacity, clip-path and stroke-dashoffset; everyday motion lasts about 0.12–0.35 s, can be interrupted, and never blocks a tap.
- `prefers-reduced-motion: reduce` → the same changes as cross-fades, without flights, bounces or count-ups.
- The ad and the video never change colour: posters, thumbnails, the video stage and every export look the same in both themes.
- Text contrast at least WCAG AA (4.5:1; 3:1 for bold ≥ 18.66 px or ≥ 24 px) in both themes.
- Vibration: short ticks on taps of real actions; distinct «ready» / «error» patterns on Android; on iPhone only on taps; never on typing; a «Vibração» switch (on by default).
- The published copy lives at `https://<machine>.tailfc994f.ts.net` (Tailscale); the `.exe` runs from `file://`, has no address of its own and is never treated as an installed app.

## Review Focus

1. A dark-mode user opening the app (from `file://`, the PWA or a reload) sees no flash of the light theme — Task 1 test `appearance: the theme is on <html> before the app's first paint`.
2. A tap on iPhone, with the invisible switch over a control, runs that control's action exactly once, and keyboard / screen-reader use is unchanged — Task 8 test `haptics: an iPhone tap runs the action once and the switches are hidden from assistive tech`.
3. Fast repeated choices (tabs, segments, sections tapped quickly, or a theme changed mid-animation) end with the indicator under the last choice and a consistent screen — Task 4 test `motion: quick choices leave the pill under the last one`.
4. Dark mode keeps every text readable, including hints, placeholders, disabled labels and orange-on-dark — Task 2 test `theme: every text on home, gallery, editor and export reads at AA in both themes`.
5. The `.exe` window (`file://`, display-mode standalone) never shows «installed» or the welcome, and an address typed for the phone must be `https://` — Task 11 tests `install: platform says file for the .exe window` and `install: only an https address is kept`.

---

## File structure

| File | Responsibility |
|---|---|
| `js/appearance.js` (new) | Settings `{ theme, haptics }` in `localStorage['rs-appearance']`; resolves and applies `html[data-theme]`, `html[data-motion]`, `meta[name=theme-color]`; notifies subscribers. Loaded in `<head>`. |
| `js/haptics.js` (new) | Mode detection, patterns, Android delegation, iPhone switch overlays. |
| `js/install.js` (new) | Platform detection, guide steps (Portuguese), app address, welcome rule. |
| `js/ui-motion.js` (new) | `RS.ui`: `CountUp`, `CotaLoader`, `BrickLoader`, `CraneProgress`, `Celebration`, `useDelayed`, `useLeaving`, `glide`/`autoGlide`. |
| `assets/brand/icon.svg`, `icon-small.svg`, `icon-maskable.svg` (new) | The «Balão a entrar» masters. |
| `tools/build-icons.mjs` (new) | Renders the SVG masters into `assets/icons/*.png` (the `.ico` is packed by `build-launcher.mjs`). |
| `tools/build-screenshots.mjs` (new) | Captures the manifest's install screenshots into `assets/screenshots/`. |
| `assets/app.css` | Tokens (light + dark), motion tokens, all new component styles. |
| `js/app.js` | Wiring: menu «Aparência», opening, loaders, export moment, install sheet, welcome, shared element. |
| `index.html`, `manifest.webmanifest`, `sw.js` | Head script order, icons, theme colours, manifest fields, cached files. |
| `tools/build-launcher.mjs` | Packs `app.ico` from the rendered PNGs (no more drawing) and compiles the `.exe`. |
| `tests/unit/appearance.test.cjs`, `haptics.test.cjs`, `install.test.cjs`, `assets.test.cjs` (new) | Pure logic, manifest, icons, CSS keyframes. |
| `tests/browser/ui-feel.case.js` (new, last case of `run-ui.html`), `ui-mobile.case.js` | Interface behaviour on PC and phone. |
| `tests/browser/helpers.js` | `H.contrastIssues(root)`, `H.settleAnimations()`, `H.visitScreens(list)`. |

Every new script is added to `index.html`, `tests/browser/run-ui.html`, `run-mobile.html` and `sw.js` (`tools/build-web.mjs` rebuilds the published list by itself).

---

### Task 1: Appearance core — settings, theme on `<html>` before paint

**Files:** Create `js/appearance.js`, `tests/unit/appearance.test.cjs`, `tests/browser/ui-feel.case.js`. Modify `index.html` (load `js/appearance.js` in `<head>` before `assets/app.css`), `run-ui.html`, `run-mobile.html` (same place; right after it `<script>window.__themeAtHead = document.documentElement.dataset.theme</script>`), `sw.js`.

**Interfaces — Produces** `RS.appearance`:
- `KEY = 'rs-appearance'`, `DEFAULTS = { theme: 'auto', haptics: true }`, `THEME_COLOR = { light: '#ffffff', dark: '#0f1114' }`
- `load(storage = localStorage) → { theme: 'auto'|'light'|'dark', haptics: boolean }` (junk or missing → `DEFAULTS`; storage that throws → `DEFAULTS`)
- `save(settings, storage = localStorage) → void` (never throws)
- `resolve(theme, prefersDark: boolean) → 'light'|'dark'`
- `apply(doc = document, win = window) → 'light'|'dark'` — sets `data-theme`, `data-motion` (`'reduce'|'full'` from `prefers-reduced-motion`) on `<html>` and the `theme-color` meta content
- `get() → settings`, `set(patch) → settings` (save + apply + notify), `subscribe(fn) → unsubscribe`
- On load it calls `apply()` once and follows `prefers-color-scheme` / `prefers-reduced-motion` changes while `theme === 'auto'`.

- [ ] **Step 1: failing tests**

```js
// tests/unit/appearance.test.cjs
test('appearance: auto follows the device, a choice wins', () => {
  assert.equal(A.resolve('auto', true), 'dark'); assert.equal(A.resolve('auto', false), 'light');
  assert.equal(A.resolve('light', true), 'light'); assert.equal(A.resolve('dark', false), 'dark');
});
test('appearance: junk settings fall back to automatic with vibration on', () => {
  assert.deepEqual(A.load(mem({ 'rs-appearance': '{"theme":"neon","haptics":"x"}' })), { theme: 'auto', haptics: true });
  assert.deepEqual(A.load({ getItem() { throw new Error('blocked'); } }), { theme: 'auto', haptics: true });
});
test('appearance: saved settings come back', () => {
  const s = mem({}); A.save({ theme: 'dark', haptics: false }, s);
  assert.deepEqual(A.load(s), { theme: 'dark', haptics: false });
});
```
```js
// tests/browser/ui-feel.case.js (first cases)
test('appearance: the theme is on <html> before the app\'s first paint', () => {
  assert(['light', 'dark'].includes(window.__themeAtHead), `no theme at <head>: ${window.__themeAtHead}`);
});
test('appearance: choosing «Escuro» sets the theme, the bar colour and keeps it', async () => {
  RS.appearance.set({ theme: 'dark' });
  assertEqual(document.documentElement.dataset.theme, 'dark');
  assertEqual(document.querySelector('meta[name="theme-color"]').content, '#0f1114');
  assertEqual(JSON.parse(localStorage.getItem('rs-appearance')).theme, 'dark');
  RS.appearance.set({ theme: 'auto' });
});
```

- [ ] **Step 2:** `node --test "tests/unit/*.test.cjs"` → FAIL (`RS.appearance` undefined); `node tools/test-browser.mjs run-ui.html` → the two new cases FAIL.
- [ ] **Step 3:** implement `js/appearance.js` (pure functions above; `apply` reads `win.matchMedia`); add the script tags; `ui-feel.case.js` is the last case of `run-ui.html`.
- [ ] **Step 4:** both commands → PASS.

---

### Task 2: The dark palette — every colour from tokens

**Files:** Modify `assets/app.css` (all colours → tokens; `:root` = light, `[data-theme="dark"]` = dark), `tests/browser/helpers.js` (`contrastIssues`, `settleAnimations`, `visitScreens`), `tests/browser/ui-feel.case.js`, `.superpowers/receitas-video/ui-shot.mjs` (a `theme` argument).

**Interfaces — Produces** CSS tokens used by every later task: `--chrome` (app background), `--paper` (panels, cards), `--raised`, `--ink`, `--ink-2`, `--muted`, `--line`, `--line-2`, `--signal`, `--signal-ink`, `--signal-soft`, `--danger`, `--overlay`, `--shadow-pop`, `--field`, `--focus`. Dark values (asphalt and concrete, orange signal, warm white): `--chrome #0f1114; --paper #171a1f; --raised #1f232a; --ink #f2eee8; --ink-2 #d6d2cb; --muted #9b9fa8; --line #2a2e35; --line-2 #363b44; --signal #ff6a1a; --signal-ink #ff9d5c; --signal-soft #341d10; --danger #ff7a6b; --shadow-pop 0 18px 50px rgba(0,0,0,.55)`. Light values stay today's. The dark preview areas (`.workspace` stage, `.ws-bar`) and every poster, thumbnail and canvas keep their own colours in both themes.
`H.contrastIssues(root) → Array<{ text, ratio, need, selector }>` — every visible element with its own text node (skipping `canvas`, `.poster-wrap`, `.motion-card`, thumbnails, `[disabled]` and `aria-hidden` subtrees), its colour against the first opaque background up its ancestors; need 3 for bold ≥ 18.66 px or ≥ 24 px, else 4.5. `H.settleAnimations()` resolves when `document.getAnimations()` are finished (max 1.5 s). `H.visitScreens(list)` drives the app to each named screen through its interface and yields the name.

- [ ] **Step 1: failing tests**

```js
test('theme: every text on home, gallery, editor and export reads at AA in both themes', async () => {
  for (const theme of ['light', 'dark']) {
    RS.appearance.set({ theme }); await H.settleAnimations();
    for await (const screen of H.visitScreens(['home', 'gallery', 'editor:Texto', 'editor:Estilo', 'editor:Vídeo', 'export'])) {
      const bad = H.contrastIssues(document.body);
      assert(!bad.length, `${theme} ${screen}: ${bad.slice(0, 5).map((b) => `«${b.text}» ${b.ratio.toFixed(2)} < ${b.need}`).join('; ')}`);
    }
  }
  RS.appearance.set({ theme: 'auto' });
});
test('theme: the ad looks the same in both themes', async () => {
  // the editor's poster canvas: same pixels (toDataURL) in light and in dark
});
```

- [ ] **Step 2:** `node tools/test-browser.mjs run-ui.html` → FAIL (dark has no tokens yet).
- [ ] **Step 3:** move every colour in `app.css` to the tokens above (new tokens only where a role is missing), add the `[data-theme="dark"]` block, `color-scheme` per theme (form controls and scrollbars follow).
- [ ] **Step 4:** run-ui → PASS; screenshots light/dark × desktop/phone checked by eye.

---

### Task 3: «Aparência» — the menu and an animated theme change

**Files:** Modify `js/app.js` (component `AppearanceMenu` in the home top bar and the editor top bar), `assets/app.css`, `tests/browser/ui-feel.case.js`, `tests/browser/ui-mobile.case.js`.

**Interfaces — Consumes** `RS.appearance` (Task 1). **Produces** `.appearance-btn` (icon button, `aria-label="Aparência"`, `aria-expanded`) → popover `.appearance-pop` with a radiogroup `aria-label="Tema"` («Automático», «Claro», «Escuro») and a switch «Vibração» (`#f-haptics`). A theme change runs inside a View Transition whose new view grows as a circle from the button (420 ms, `--ease-out`; centre in `--reveal-x`/`--reveal-y` on `<html>`); with reduced motion or without View Transitions it changes at once.

- [ ] **Step 1: failing tests** — `appearance: the menu changes the theme and remembers vibration` (click «Escuro» → `data-theme=dark`, «Escuro» `aria-checked`; untick «Vibração» → `RS.appearance.get().haptics === false`); `appearance: the theme change grows from the button` (record `document.startViewTransition` calls; `--reveal-x/--reveal-y` equal the button's centre); `mobile: the appearance menu fits the phone` (popover inside the screen at 360 px).
- [ ] **Step 2:** run-ui, run-mobile → FAIL. **Step 3:** implement. **Step 4:** PASS; screenshots by eye.

---

### Task 4: Motion foundation — springs, press, gliding pills, count-ups, calm mode

**Files:** Create `js/ui-motion.js`, `tests/unit/assets.test.cjs` (keyframes rule). Modify `assets/app.css` (motion tokens, press and hover), `js/app.js` (use `RS.ui`), script lists, `tests/browser/ui-feel.case.js`.

**Interfaces — Produces** `RS.ui` (in `js/ui-motion.js`, built on `window.htmPreact`) and CSS:
- Tokens: `--ease-spring: linear(0, .21 6%, .58 14%, .94 25%, 1.06 33%, 1.08 39%, 1.03 52%, .99 66%, 1)` (fallback `cubic-bezier(.34, 1.4, .64, 1)` under `@supports not (transition-timing-function: linear(0, 1))`), `--dur-press: 120ms`, `--dur-fast: 160ms`, `--dur-normal: 260ms`, `--dur-slow: 420ms`.
- Press: `.btn, .icon-btn, .chip, .tchip, .seg button, .rail button, .motion-card, .tpl-card, .proj-open, .add-row, .eye, .palette` scale to `.97` on `:active` and spring back; cards lift 2 px on hover (`@media (hover: hover)`).
- `html[data-motion="reduce"]` (Task 1): transforms and count-ups off, transitions become opacity cross-fades.
- `glide(container, selector = '[aria-checked="true"],[aria-selected="true"],.on') → cleanup` — one `.glide-pill` per container that moves (transform + width) under the selected child; `autoGlide(root = document) → cleanup` attaches it to every `.seg`, `.mode-switch`, `.kind-switch`, `.video-tabs`, `.rail`, `.texts-locales` now and later (one MutationObserver), called once from `app.js` at start.
- `CountUp({ value: number|string, duration = 600, format = String })` — counts from the previous value; non-numbers render as written; reduced motion renders the value at once.
- `useDelayed(flag: boolean, ms = 300) → boolean` — true only once `flag` has been true for `ms`.
- Rule pinned by `tests/unit/assets.test.cjs`: every `@keyframes` whose name starts `feel-` animates only `transform`, `opacity`, `clip-path`, `stroke-dashoffset`.

- [ ] **Step 1: failing tests** — `motion: a choice slides the pill to it` (theme segment «Claro»→«Escuro»: `.glide-pill` rect ends over «Escuro» after `H.settleAnimations()`, its transform changed through a transition); `motion: quick choices leave the pill under the last one` (5 clicks in 50 ms on the «Vídeo» tabs → pill under the last tab, the last tab's panel shown); `motion: «Automática · N s» counts up` (change the length → an intermediate value seen, then the final one); `motion: calm mode shows the value at once and keeps no flights` (`data-motion=reduce` → final value immediately; `.glide-pill` `transition-property` has no `transform`); unit `assets: feel- keyframes animate only cheap properties`.
- [ ] **Step 2:** FAIL. **Step 3:** implement; use `CountUp` for «Automática · N s», the export percentages and the counters. **Step 4:** PASS (whole `run-ui.html` and `run-mobile.html`).

---

### Task 5: Things that open and close — menus, dialogs, sheets, toasts, lists, panels

**Files:** Modify `assets/app.css`, `js/app.js` (popover origins, leaving states), `js/ui-motion.js` (`useLeaving`), `tests/browser/ui-feel.case.js`, `ui-mobile.case.js`.

**Interfaces — Consumes** Task 4 tokens. **Produces** `useLeaving(open: boolean, ms = 200) → { mounted: boolean, leaving: boolean }` and the behaviour: popovers (`.menu`, `.ip-pop`, `.appearance-pop`, the colour picker) scale from their trigger (`transform-origin` from the trigger's rect); dialogs grow from the centre; on the phone sheets rise with `--ease-spring`; toasts arrive and leave with a spring and stack; list rows (`ListEditor`, `VtList`) grow in and collapse out; a panel's contents arrive in a 30 ms cascade; the save dot pulses once on «Guardado».

- [ ] **Step 1: failing tests** — `motion: a menu grows from its button` (the language menu's computed `transform-origin` is the «+» chip's side); `motion: a removed row leaves before it goes` (click a `.vt-remove` on an added row → `.leaving` on it, gone after 250 ms); `motion: a toast leaves with its own animation` (`.toast.leave` before removal); `mobile: a sheet rises from the bottom with a spring` (`.modal.export` animation name `feel-sheet-in`).
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.

---

### Task 6: The card that becomes the editor — and goes back

**Files:** Modify `js/app.js` (`markPoster`, navigation in `App`), `assets/app.css`, `tests/browser/ui-feel.case.js`.

**Interfaces — Consumes** `transition()` and `markPoster()` (exist: View Transitions with fallback; the template and ad cards already name their thumbnail `poster` one way). **Produces** the way back: leaving the editor names the matching ad card's thumbnail `poster` before the new view, so the poster shrinks back into it; the other cards fade and scale slightly (0.96) while the editor's top bar and panel arrive with `--ease-spring`.

- [ ] **Step 1: failing tests** — `motion: opening an ad grows its card into the editor` (record `document.startViewTransition`; open an ad: its card's thumbnail had `view-transition-name: poster` when the transition started); `motion: leaving the editor shrinks the poster back into its card` (back on «Anúncios», that ad's card thumbnail carries the name in the new view); `motion: a double click opens one editor` (two clicks 30 ms apart → one editor, no page error).
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.

---

### Task 7: Loaders and the empty home — sober short waits, bricks for long ones

**Files:** Modify `js/ui-motion.js` (`CotaLoader`, `BrickLoader`), `js/app.js` (stage busy, library, images loading, top progress, empty home), `assets/app.css`, `tests/browser/ui-feel.case.js`, `ui-mobile.case.js`.

**Interfaces — Consumes** `useDelayed` (Task 4). **Produces** `CotaLoader({ label })` (a dimension line that draws, measures and retracts — `.cota-loader`) and `BrickLoader({ label })` (bricks laid one by one with a small bounce — `.brick-loader`). Policy: nothing under 300 ms; `CotaLoader` for short waits (top progress, panel loads, the library grid); `BrickLoader` for waits expected over a second («A preparar a fotografia…», «A carregar as imagens…», the library's first load). Empty home (no ads yet): a small building-site drawing (the crane hook holding the «Novo anúncio» card), `.empty-site`, with the existing call to action. Buttons keep today's `Spinner`.

- [ ] **Step 1: failing tests** — `loaders: a quick wait shows nothing` (a 150 ms `App.run` → no `.cota-loader`); `loaders: preparing a photo lays bricks` (`RS.assets.importFile` slowed to 1.2 s → `.stage-busy .brick-loader` with «A preparar a fotografia…»); `loaders: calm mode keeps the words and drops the bounce`; `home: no ads yet shows the building site and the button` (fresh profile in `run-mobile.html`: `.empty-site` and «Novo anúncio»).
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS; screenshots light/dark by eye.

---

### Task 8: Haptics — Android ticks and patterns, iPhone switches

**Files:** Create `js/haptics.js`, `tests/unit/haptics.test.cjs`. Modify `js/app.js` (`RS.haptics.install()` at start), script lists, `assets/app.css` (`.haptic-switch`), `tests/browser/ui-feel.case.js`, `ui-mobile.case.js`.

**Interfaces — Consumes** `RS.appearance.get().haptics` (Task 1). **Produces** `RS.haptics`:
- `mode(ua: string, env: { vibrate: boolean, maxTouchPoints: number }) → 'android'|'ios'|'none'` (iPhone/iPad — incl. iPadOS that reports Macintosh with touch — on iOS ≥ 17.4 → `'ios'`; else a working `vibrate` → `'android'`; else `'none'`)
- `PATTERNS = { tick: 8, success: [12, 60, 18], error: [30, 50, 30] }`
- `tick()`, `success()`, `error()` — nothing when vibration is off or mode is `'none'`; on `'ios'` success/error do nothing (taps tick through the switches)
- `TICK_SELECTOR = '.btn, .icon-btn, .chip-main, .tchip, .seg button, .rail button, .video-tabs [role="tab"], .motion-card, .tpl-card, .proj-open, .lengths button, .eye, .add-row, .palette, .vt-remove, .vt-restore'`
- `install(root = document, opts = {}) → uninstall` — `'android'`: one delegated `click` listener ticks for elements matching `TICK_SELECTOR` (never for typing); `'ios'`: each matching element gets `<label class="haptic-switch" aria-hidden="true"><input type="checkbox" switch tabindex="-1"></label>` covering it (added and kept by a MutationObserver), the input's own click is stopped so the control's click runs once; the app's `.switch input` checkboxes get the `switch` attribute. `opts.mode` overrides detection (tests).

- [ ] **Step 1: failing tests** — unit `haptics: Android vibrates, iPhone ticks on taps, PC is quiet` (UA table → modes; iPadOS «Macintosh» + 5 touch points → `'ios'`; iOS 17.3 → `'none'`) and `haptics: patterns`; browser `haptics: a tap on a real action ticks once and typing never does` (record `navigator.vibrate`, `install({ mode: 'android' })`, click «Exportar» → `[8]`; type in a field → nothing; «Vibração» off → nothing); `haptics: an iPhone tap runs the action once and the switches are hidden from assistive tech` (`install({ mode: 'ios' })`; click the overlay label of a `.tchip` → its action ran once; every `.haptic-switch` is `aria-hidden` with a `tabindex=-1` input; the Tab order of the page equals the order before install); `mobile: the iPhone switches sit over the floating bar's buttons`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.

---

### Task 9: Exporting — the crane, the count and «PRONTO»

**Files:** Modify `js/ui-motion.js` (`CraneProgress`, `Celebration`), `js/app.js` (`ExportDialog`), `assets/app.css`, `tests/browser/ui-feel.case.js`, and `ui-video.case.js` / `ui-minor.case.js` where they read the old busy label.

**Interfaces — Consumes** `CountUp` (Task 4), `RS.haptics.success()/error()` (Task 8). **Produces** `CraneProgress({ progress: number|null /* 0..1; null = steps only */, label: string })` — the crane hoists the file while a girder bar fills, with a count-up percentage (`.crane`); `Celebration({ title = 'PRONTO', detail, onDone, duration = 1400 })` — the load sways and settles, the stamp lands, a few bricks bounce, `onDone` after `duration` (`.celebration`). In `ExportDialog`: while busy the preview area shows `CraneProgress` (video: the real percentage from `onProgress`; images: «Imagem 2 de 3»); on success `Celebration` with the file's name, `RS.haptics.success()`, then today's toast and close; on failure `RS.haptics.error()` and today's message. «Cancelar» works at any moment.

- [ ] **Step 1: failing tests** — `export: the crane shows the video's progress` (`.crane` with a count rising past 0 % before the file arrives); `export: «PRONTO» before the dialog closes, then the toast` (`.celebration` «PRONTO», `RS.haptics.success` called once, the dialog closes after it); `export: cancelling stops the crane and celebrates nothing`; `export: a failed export vibrates the error once`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS (whole `run-ui.html`; the MP4 tests stay green).

---

### Task 10: The new icon «Balão a entrar» in every size

**Files:** Create `assets/brand/icon.svg` (master, 512), `assets/brand/icon-small.svg` (16–48 px: bigger dots, less crop), `assets/brand/icon-maskable.svg` (bubble and dots inside the 80 % safe circle), `tools/build-icons.mjs`, icon cases in `tests/unit/assets.test.cjs`. Modify `tools/build-launcher.mjs` (packs `app.ico` from the rendered PNGs and compiles the `.exe`; no drawing), `index.html` (SVG favicon from `icon-small.svg`, PNG 32/64, `apple-touch-icon` 180), `manifest.webmanifest` (192, 512, maskable 512), `LEIA-ME.md` (tools list).

**Interfaces — Produces** `assets/icons/icon-{16,24,32,48,64,128,180,192,256,512}.png`, `assets/icons/maskable-512.png`, `assets/app.ico`. Design (owner's choice, `icone-v3.html` option 2): orange gradient `#ff8a3a` → `#dc4a00` (light from the top left), a big white speech bubble entering from the top-left corner, tilted about 10°, cut by the edges, three black `#111317` typing dots, the tail pointing bottom-right; rounded square `rx = 114/512` (platform masks apply on top). `tools/build-icons.mjs` opens each SVG in Edge headless with a transparent background and captures it at each size (≤ 48 px from `icon-small.svg`).

- [ ] **Step 1: failing tests** — `assets: every icon exists at its size` (PNG IHDR: each size matches; `maskable-512.png` 512×512); `assets: the manifest lists 192, 512 and a maskable icon that exist`; `assets: the page links an SVG favicon, a 180 px Apple icon and the manifest`.
- [ ] **Step 2:** `node --test "tests/unit/*.test.cjs"` → FAIL. **Step 3:** draw the SVGs, write the tool, run `node tools/build-icons.mjs` then `node tools/build-launcher.mjs`. **Step 4:** PASS; a contact sheet of every size on light and dark, a phone home-screen mock and a browser tab, checked by eye.

---

### Task 11: Install anywhere — guides, the phone QR, the welcome

**Files:** Create `js/install.js`, `tests/unit/install.test.cjs`, `tools/build-screenshots.mjs`, `assets/screenshots/phone.png` (1080×1920), `assets/screenshots/wide.png` (1920×1080). Modify `js/app.js` (`InstallButton` → `InstallSheet`, `Welcome`), `assets/app.css`, `manifest.webmanifest` (`id`, `description`, `screenshots`), `index.html` (`theme-color` meta for light and for dark with `media`), script lists, `tests/browser/ui-feel.case.js`, `ui-mobile.case.js`.

**Interfaces — Consumes** `RS.engine.drawQR` (exists), `Celebration` (Task 9), `RS.haptics.success()` (Task 8). **Produces** `RS.install`:
- `platform(ua, env: { standalone: boolean, protocol: string, maxTouchPoints: number, prompt: boolean }) → 'file'|'installed'|'ios-inapp'|'android-inapp'|'ios-safari'|'ios-other'|'mac-safari'|'android'|'desktop-chromium'|'firefox-android'|'samsung'|'firefox-desktop'|'other'` — `protocol === 'file:'` first (the `.exe` window is `'file'`, never `'installed'`); Instagram/Facebook in-app (`Instagram`, `FBAN`, `FBAV`) before the browsers.
- `STEPS[platform] → Array<{ icon: string, text: string }>` — Portuguese steps, e.g. `ios-safari`: «Toque em Partilhar (o quadrado com a seta)», «Escolha «Adicionar ao ecrã principal»», «Toque em «Adicionar»»; `mac-safari`: «No menu Ficheiro, escolha «Adicionar à Dock»»; in-app: «Abra este link no Safari» / «… no Chrome» (menu ⋯ → «Abrir no navegador»); `firefox-android`: menu ⋮ → «Instalar»; `samsung`: menu → «Adicionar página a» → «Ecrã principal».
- `detect() → platform` (from `navigator`/`location`; tests replace it)
- `appAddress(loc = location, storage = localStorage) → string|null` (https: the folder of `index.html`; `file:`: `storage['rs-app-url']`)
- `checkAddress(text) → { ok: true, url } | { ok: false, error }` (`https://` with a host containing a dot; normalised to end with `/`, `index.html` dropped)
- `rememberAddress(url, storage)`, `shouldWelcome({ standalone, protocol, storage }) → boolean` (true once per device: the first standalone https opening; key `rs-welcomed`)
UI: home button «Instalar» («Instalar no telemóvel» on `file:` and on an installed desktop) → `InstallSheet`: one tap where the browser offers it; otherwise the animated guide for the platform (small looping drawings of the browser bar and the button to tap); on PC a QR of `appAddress()` with «Aponte a câmara do telemóvel. O telemóvel precisa do Tailscale ligado.»; on `file:` without an address, a field «Endereço da app» (placeholder `https://….ts.net`) checked with `checkAddress`. `appinstalled` or `shouldWelcome` → `Welcome` (the icon entering, `Celebration` «BEM-VINDO», `RS.haptics.success()`).

- [ ] **Step 1: failing tests** — unit `install: platform says file for the .exe window` (`'file:'` + standalone → `'file'`); `install: every browser gets its own steps` (UA table: Instagram in-app on iPhone and on Android, iOS Safari, Chrome iOS, Mac Safari, Android Chrome with prompt, Edge desktop, Firefox Android, Samsung Internet; every platform except `installed` has non-empty `STEPS`); `install: only an https address is kept` (`http://100.64.0.1:8080` → error; `https://x.tailfc994f.ts.net/index.html` → `https://x.tailfc994f.ts.net/`); `install: the welcome shows once`. Browser (`run-ui.html` runs on `file:`): `install: on the .exe the button offers the phone and asks for the address once` (type `https://x.tailfc994f.ts.net` → a QR with `data-link` of that address and the Tailscale note; reopen → no question); `install: a browser that can install installs in one tap` (fake `beforeinstallprompt` with a recorded `prompt()`, `RS.install.detect` forced to `'desktop-chromium'` → one tap calls `prompt`); `mobile: the iPhone guide fits the phone` (`'ios-safari'`: the three steps inside 360 px).
- [ ] **Step 2:** FAIL. **Step 3:** implement; run `node tools/build-screenshots.mjs`. **Step 4:** PASS; the sheet per platform by eye.

---

### Task 12: Opening — the icon enters, the dots type, the wordmark arrives

**Files:** Modify `index.html` (boot splash `#boot`: inline SVG of the new icon, CSS-only animation painted before scripts, both themes; in `run-ui.html`'s head record `window.__bootHasIcon`), `js/app.js` (`Intro` → `Opening`: at most 2.6 s, skip on click or key, once per session with `sessionStorage['rs-intro']`), `assets/app.css`, `tests/browser/ui-feel.case.js`.

**Interfaces — Consumes** the icon masters (Task 10), `data-theme` (Task 1). **Produces** `#boot` (the bubble slides in from its corner with `--ease-spring`, the dots type, «Recruitment Studio» rises) and `Opening({ onDone })` continuing it seamlessly; reduced motion: the icon and the name appear without movement.

- [ ] **Step 1: failing tests** — `opening: the boot screen shows the new icon in the page theme` (`window.__bootHasIcon === true`; `#boot` background equals the theme's `--chrome`); `opening: a key or a tap skips it at once` (render `Opening` with the session flag cleared, a key → `onDone` within 600 ms); `opening: calm mode does not move` (`data-motion=reduce` → no running transform animations in `.opening`).
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS; frames of the opening (light, dark, phone) checked by eye.

---

### Task 13: Documentation, full run, final review, package

- [ ] **Step 1:** `LEIA-ME.md`: «Aparência» (tema, vibração), «Instalar» per platform with the Tailscale note, the new icon, the tools `build-icons.mjs` / `build-screenshots.mjs`; the spec gets «Built and checked» (tests, emulated devices, measured frame cost of the opening and the crane on a 360×740 phone emulation).
- [ ] **Step 2:** `node --test "tests/unit/*.test.cjs"` and `node tools/test-browser.mjs` → all PASS (report counts).
- [ ] **Step 3:** fresh final review (most capable model) of the diff against `../web-publicar/recruitment-studio/` with this plan's Review Focus; Critical/Important fixed test-first; minors ledgered.
- [ ] **Step 4:** `node tools/build-web.mjs`, then `"C:\Program Files\7-Zip\7z.exe" t ..\web-publicar\recruitment-studio-web.zip` → «Everything is Ok»; Step 2 again; screenshots of home, editor, export and install in light and dark, desktop and phone, in the final message.
