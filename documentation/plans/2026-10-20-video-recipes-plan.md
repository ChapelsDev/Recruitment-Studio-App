# Video recipes and the video editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the five video recipes (Tijolo, Píxel, Planta, Apresentação, Colagem) in 6/10/15 s and three formats, with all video settings in a new «Vídeo» mode of the editor, and a trimmed export dialog.

**Architecture:** Recipes register into `RS.motion` as styles flagged `recipe`, so gallery, stage, export and sound share one path. A pure act scheduler in `motion-timeline.js` picks the acts (H M V D L C K O) for the duration, content and contact hold; `motion.js` runs a recipe act by act (bespoke entry from the canonical predecessor, the recipe's travel move otherwise). Shared drawing helpers (ported from the scratch `kit.js`) live in `js/motion-kit.js`; each recipe in `js/recipes/<id>.js`, ported from `.superpowers/receitas-video/r-<id>.js`.

**Tech Stack:** classic browser scripts, Canvas 2D, WebAudio (OfflineAudioContext), WebCodecs via the existing `RS.video`, Preact + htm (vendor), node:test for pure code, headless Edge (`tools/test-browser.mjs`) for browser cases.

**Spec:** `documentation/specs/2026-10-20-recruitment-studio-video-recipes-design.md` (reference examples: `.superpowers/receitas-video/saida/escolher.html`, code in `.superpowers/receitas-video/`).

## Global Constraints

- Classic scripts only (no ES modules on `file://`), no CDN, offline; every new file listed in `index.html`, `tests/browser/run.html`, `tests/browser/run-ui.html` and `sw.js` `CORE`.
- Interface text in Portuguese (pt-PT); code and comments in English.
- No commits (the owner commits).
- Only the ad's own words plus «Manda mensagem», «Aponta a câmara», the salary period, the vacancies word and the brand name; no word dropped or cut; person's text ≥ 40 px at 1080 width; accents never clipped.
- 120 BPM, beat 0.5 s, bar 4 beats; H = 4 beats, O = 2 beats, middle acts 4 beats, K = 4 beats («2 s») or 8 («4 s»), middle priority D, M, C, V, L, leftover beats to K.
- ≤ 3 colours + black and white per recipe; WhatsApp green `#25D366` for the button; text contrast ≥ 4.5:1.
- Last frame equals the first (loop); no cuts, fades, particles, glows, flares, shake, RGB split, crossfades, generic gradients, bouncy easing.
- Story text zone: y ∈ [250, 1640] (Instagram); 4:5 and 1:1 use 56 px margins.
- Frame ≤ 30 ms on average at 1080 × 1920, measured as the export does (draw, then `new VideoFrame(canvas).close()`), never with `getImageData`.
- Generated music peaks ≤ −1 dBFS (0.891).
- Tests stay green: `node --test "tests/unit/*.test.cjs"` and `node tools/test-browser.mjs`.

## Review Focus

1. A headline or benefit with a very long word (German «Bauarbeiterunterkunft…», 40+ letters in one word) — it must shrink or wrap inside every recipe (bricks, pixel text, title block, slides, letters), never cut or leave the frame. Test: `recipes: a 40-letter word stays inside the frame` (shared check, Task 3).
2. An ad without a WhatsApp number — no conversation act, the card shows the brand and the ad's contacts without button or QR, and the loop is still exact. Test: fixture `no-number` in the shared check (Task 3).
3. Vacancies that are not a plain number («10+») or very large («250») — no unit chart overflow, no counting for text, shown as written. Test: `recipes: vacancies «10+» and «250» are shown as written` (shared check, Task 3).
4. Salaries written «1.900», «1 900,50» or in CHF — shown exactly as the ad has them; only plain digits count up. Test: `recipes: «1 900,50» is shown as written` (shared check, Task 3).
5. Few or no photos (Colagem; chosen photos later deleted) — the recipe repeats what it has or uses a plain tile; a missing chosen photo falls back to the trades' photos. Tests: `colagem: works with one photo and with none` (Task 8) and `photos: a chosen photo that is gone falls back to the trades` (Task 3).

---

### Task 1: Video settings, content switches and the act scheduler

**Files:**
- Modify: `js/model.js` (DEFAULT_VIDEO, MOTIONS, normalize)
- Modify: `js/motion-timeline.js` (content: include switches; new `acts`; `build` honours `hold`)
- Test: `tests/unit/model-video.test.cjs`, `tests/unit/motion-timeline.test.cjs`

**Interfaces:**
- Produces: `RS.model.RECIPES = ['tijolo', 'pixel', 'planta', 'apresentacao', 'colagem']`; `MOTIONS` = recipes + the seven styles.
- Produces: `project.video.include = { benefits: string[] | null, offer: boolean, positions: boolean, chat: boolean, qr: boolean }` (benefit item **ids**, so edits keep the choice; null = the first three), `project.video.hold = 2 | 4`, `project.video.photos = { mode: 'trades' | 'chosen', ids: string[] }` (≤ 8).
- Produces: `RS.motionTimeline.content(project, locale)` also returns `icons: string[]` (one per shown benefit), `benefitIds: string[]`, `message` (the ad's WhatsApp message), `qr: boolean`, `chat: boolean`; benefits filtered by `include.benefits` in the ad's order; `offer`/`vacancies` null when `include.offer === false`; `positions` [] when `include.positions === false`.
- Produces: `RS.motionTimeline.acts(available: string[], { duration: 6|10|15, hold: 2|4, priority?: string[] }) -> [{ kind, beats, start, end }]` (start/end in seconds), kinds from `['H','M','V','D','L','C','K','O']` in that order; H 4, O 2, middles 4, K 4 (hold 2) or 8 (hold 4) capped so H+K+O fits, leftover beats to K.
- Produces: `TL.build(c, { duration, scenes, hold })` — the seven styles' closing card lasts at least `hold` seconds.

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/model-video.test.cjs`:
```js
test('normalize: video include, hold and photos get defaults and stay clean', () => {
  const raw = json(M.newProject(TPL, { trades: ['pedreiro'] }));
  raw.video = { motion: 'tijolo', duration: 10, include: { benefits: ['x', 5], offer: 'no', chat: false }, hold: 9, photos: { mode: 'chosen', ids: ['a', 3, 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] } };
  const v = M.normalize(raw).video;
  assert.equal(v.motion, 'tijolo');
  assert.deepEqual(v.include, { benefits: ['x'], offer: true, positions: true, chat: false, qr: true });
  assert.equal(v.hold, 2);
  assert.deepEqual(v.photos, { mode: 'chosen', ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] });
});
test('normalize: an ad without the new fields gets them', () => {
  const raw = json(M.newProject(TPL, { trades: ['pedreiro'] }));
  raw.video = { motion: 'neon', duration: 15 };
  const v = M.normalize(raw).video;
  assert.deepEqual(v.include, { benefits: null, offer: true, positions: true, chat: true, qr: true });
  assert.equal(v.hold, 2);
  assert.deepEqual(v.photos, { mode: 'trades', ids: [] });
});
test('model: the five recipes are motions', () => {
  for (const id of ['tijolo', 'pixel', 'planta', 'apresentacao', 'colagem']) assert.ok(M.MOTIONS.includes(id));
});
```
In `tests/unit/motion-timeline.test.cjs`:
```js
const K = (list) => list.map((a) => `${a.kind}${a.beats}`).join(' ');
test('acts: 15 s with everything = H M V D L C K O', () => {
  assert.equal(K(TL.acts(['M','V','D','L','C'], { duration: 15, hold: 2 })), 'H4 M4 V4 D4 L4 C4 K4 O2');
});
test('acts: 10 s keeps D and M, the rest of the time goes to the card', () => {
  assert.equal(K(TL.acts(['M','V','D','L','C'], { duration: 10, hold: 2 })), 'H4 M4 D4 K6 O2');
});
test('acts: 6 s is the hook, the card and the loop', () => {
  assert.equal(K(TL.acts(['M','V','D','L','C'], { duration: 6, hold: 2 })), 'H4 K6 O2');
});
test('acts: a 4 s contact takes a bar from the lowest priority', () => {
  assert.equal(K(TL.acts(['M','V','D','L','C'], { duration: 15, hold: 4 })), 'H4 M4 V4 D4 C4 K8 O2');
  assert.equal(K(TL.acts(['M','V','D','L','C'], { duration: 6, hold: 4 })), 'H4 K6 O2');
});
test('acts: missing content leaves its time to the card; times are on the beat', () => {
  const a = TL.acts(['V', 'C'], { duration: 15, hold: 2 });
  assert.equal(K(a), 'H4 V4 C4 K16 O2');
  assert.deepEqual(a.map((x) => x.start), [0, 2, 4, 6, 14]);
  assert.equal(a[a.length - 1].end, 15);
});
test('content: switches hide benefits, offer, positions and the QR', () => {
  // sample(): pedreiro + servente, offer 1900 € / 12, WhatsApp 912345678
  const p = sample();
  const ids = p.texts['pt-PT'].benefits.map((b) => b.id);
  p.video.include = { benefits: [ids[3], ids[1]], offer: false, positions: false, chat: false, qr: false };
  const c = TL.content(p, 'pt-PT');
  assert.deepEqual(c.benefits, [p.texts['pt-PT'].benefits[1].text, p.texts['pt-PT'].benefits[3].text]);
  assert.equal(c.offer, null); assert.equal(c.vacancies, null);
  assert.deepEqual(c.positions, []);
  assert.equal(c.qr, false); assert.equal(c.chat, false);
  assert.match(c.message, /pedreiro/);
});
test('build: the closing card of the styles lasts the chosen hold', () => {
  const p = sample(); p.video.hold = 4;
  const c = TL.content(p, 'pt-PT');
  const tl = TL.build(c, { duration: 15, scenes: ['hook', 'benefit', 'counter', 'benefit', 'end'], hold: 4 });
  const end = tl.scenes[tl.scenes.length - 1];
  assert.ok(end.end - end.start >= 4);
});
```

- [ ] **Step 2: Run** `node --test "tests/unit/*.test.cjs"` → the new tests FAIL (`include` undefined, `TL.acts is not a function`).
- [ ] **Step 3: Implement** in `model.js`: `RECIPES`, `MOTIONS = [...RECIPES, 'poster', 'neon', …]`, `DEFAULT_VIDEO` gains `include`, `hold: 2`, `photos`; `normalize` cleans them as the tests say. In `motion-timeline.js`: `content` applies `project.video.include`; add `acts(available, { duration, hold, priority = ['D','M','C','V','L'] })`; `build` honours `hold`.
- [ ] **Step 4: Run** the unit tests → all PASS (old ones too).

---

### Task 2: `js/motion-kit.js` and the recipe music in `js/sound.js`

**Files:**
- Create: `js/motion-kit.js` (port of `.superpowers/receitas-video/kit.js` without sample/sheet/check code)
- Modify: `js/sound.js` (synth events), `index.html`, `tests/browser/run.html`, `tests/browser/run-ui.html`, `sw.js` (CORE)
- Test: `tests/browser/motion-kit.case.js` (new, listed in `run.html`)

**Interfaces:**
- Produces `RS.motionKit` (load order: after `engine.js`, before `motion.js`):
  - easing: `clamp, lerp, win(t, a, d), expoOut, expoIn, expoInOut, spring(x)` (critically damped, reaches 1 at x = 1, never > 1), `speed(f, t)`.
  - `zones(fmt) -> { W, H, story, top, bottom, cy, cH, left: 80, w: 920 }` (story: top 298, bottom 1592; others 56 px margins).
  - text: `fit(P, text, { font, maxSize, minSize, maxW, maxLines, maxH?, lh?, track?, upper? }) -> layout` (never drops a word; lowers `P.minTextSize`); `line(P, text, { font, size, upper?, track? })`; `words(L, x, y, align, boxW)`; `fillText(ctx, text, x, base, L, color)`; `textWidth(text, L)`; `text(R, L, x, y, color, align, boxW, tag)` (draws, records a box with the text through `R.rec`).
  - `recorder(R)` makes `R.rec(x, y, w, h, tag, text)`: skips when `R.moving`, alpha < 0.6 or off-frame; pushes `{ pts, x, y, w, h, tag, text }` into `R.boxes` when present.
  - motion blur: `blurred(R, v, drawCopy(ctx, s), bbox?)` (≤ 7 samples, ≤ 5 full-frame; sets `R.moving` while copying; draws once when `R.lite`), `smear(R, vx, vy)` (≤ 12 copies; nothing when `R.lite`).
  - shapes: `rrect, rectLerp, plane, ticks`; `qr(ctx, link, x, y, size, { dark, light, tile, radius, reveal })`; `qrSprite(link, size, opts)` (cached).
  - `chatLayout(P, S)` and `chatDraw(R, L, lt, { type0, type1, send, noBubble })` as in the scratch kit, sizes scaled by `S.w / 880`.
  - `opening(R, img, shape(g), drift)` — a window onto a screen-fixed photo (screen buffer, `source-in`).
- Produces in `RS.sound`: `synth(ac, dest, events, t0, from, duration)` for events `{ t, kind: 'kick'|'tone'|'noise'|'riser', … }`; `renderGenerated(timeline)` and `preview(timeline)` use it when `timeline.synth` is an array; rendered peaks limited to 0.891.

- [ ] **Step 1: Write `tests/browser/motion-kit.case.js`:**
```js
const K = RS.motionKit;
test('kit: spring reaches 1 and never overshoots; expo is monotonic', () => {
  let prev = 0;
  for (let i = 0; i <= 100; i++) { const v = K.spring(i / 100); assert(v >= prev - 1e-9 && v <= 1, `spring ${v} at ${i}`); prev = v; }
  assertEqual(K.spring(1), 1); assertEqual(K.expoOut(1), 1);
});
test('kit: fit keeps a 40-letter word and stays inside the width', () => {
  const P = { minTextSize: Infinity, locale: 'de-DE' };
  const L = K.fit(P, 'Bauarbeiterunterkunftsverwaltungsgesellschaft gesucht', { font: { family: 'Anton', weight: 400 }, maxSize: 200, minSize: 40, maxW: 920, maxLines: 3 });
  assert(L.lines.join('').replace(/-/g, '').includes('Bauarbeiterunterkunftsverwaltungsgesellschaft'), 'word lost');
  assert(L.w <= 921, `too wide ${L.w}`); assert(P.minTextSize >= 40, 'min size');
});
test('kit: zones of the three formats', () => {
  const z = K.zones(RS.model.FORMATS.story); assertEqual([z.top, z.bottom], [298, 1592]);
  const q = K.zones(RS.model.FORMATS.square); assertEqual([q.top, q.bottom], [56, 1024]);
});
test('kit: chatDraw types the ad\'s message and records it', () => {
  // P with content.message «Olá! Vi o anúncio…»; R with boxes = []; chatDraw at lt 1.0, type0 0.5, type1 1.3
  // expect a box tagged 'chat-typing' whose text starts the message
});
test('sound: recipe music is rendered at the video length with peaks ≤ −1 dBFS', async () => {
  const synth = []; for (let b = 0; b < 30; b++) synth.push({ t: b * 0.5, kind: 'kick', gain: 1.5 });
  const buf = await RS.sound.renderGenerated({ duration: 15, synth, scenes: [], events: [] });
  assertEqual(buf.length, 15 * 48000);
  let peak = 0; for (let c = 0; c < 2; c++) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  assert(peak <= 0.8915 && peak > 0.3, `peak ${peak}`);
});
```
- [ ] **Step 2: Run** `node tools/test-browser.mjs run.html` → FAIL (`RS.motionKit` undefined).
- [ ] **Step 3: Implement** `js/motion-kit.js` from the scratch kit and `RS.sound.synth`; add the script to the four lists.
- [ ] **Step 4: Run** both test commands → PASS.

---

### Task 3: Recipe framework in `js/motion.js`

**Files:**
- Modify: `js/motion.js`
- Test: `tests/browser/recipes.case.js` (new, in `run.html`); `motion-styles.case.js` / `motion-neon.case.js` loops filter `!s.recipe`

**Interfaces:**
- Consumes: `RS.motionTimeline.acts/content`, `RS.motionKit`.
- Produces `RS.motion.register(def)`; `def = { id, name, concept, font: { head, bold }, palettes: { dark?: Pal, light?: Pal }, bgModes, photos: number, needs?: { [kind]: kinds[] }, travel: 'crane'|'scroll'|'whip'|'glide'|'push', canonical: { M: 'H', V: 'M', D: 'V', L: 'D', C: 'L', K: 'C', O: 'K' }, prepare(P), acts: { H, M, V, D, L, C, K, O }, sound(P) -> synth events }`, `Pal = { bg, ink, main, accent }`; each act is `(R, A) => void`, `A = { kind, start, end, d, lt, prev, next, bespoke }` (`bespoke` = `prev === def.canonical[kind]`).
- Produces: recipe entries in `RS.motion.STYLES` with `recipe: true`, `durations: [6, 10, 15]`, `defaultDuration: 15`, `bgModes`, `palette` (its default palette, with `accent`), `name`, `concept`; `styleOf(id)` finds them.
- Produces: `RS.motion.prepare(project, { format, locale, images, photos, lite })` for a recipe → `P = { project, locale, fmt, Z, C: { bg, ink, main, accent, cta, ctaInk, mode, accentChosen }, F, content, photos: Image[], timeline: { duration, scenes, cuts, synth, events: [] }, minTextSize, style, lite, recipe, acts }`; `scenes` = acts with `kind` names `hook, shapes, volume, data, list, chat, card, loop`.
- Produces: `RS.motion.render(ctx, P, { t, scale, boxes })` — recipes: background `C.bg`, then the current act; during the first 0.4 s of a non-bespoke act the framework draws the travel move between the previous act's last frame and this act (crane: vertical, scroll: whole room in 6 px steps, whip: horizontal with `smear`, glide: old up / new from below on a spring, push: the new act inside a growing centred opening); `boxes` collects recorded texts.
- Produces: `RS.motion.leftOut(P)` for recipes from the scheduled acts; `RS.motion.colorsFor(style, project)` for recipes (`brand` → main = ad primary, accent = ad accent; palettes the same; «Cor de destaque» → accent; ink and accent ≥ 4.5:1 on bg).
- Produces: `RS.motion.photoIds(project, libraryItems, userItems) -> string[]` (chosen ids that still exist, else the trades' library ids) and `RS.motion.recipePhotos(project, images, n) -> Promise<Image[]>` (the ad photo first, then full-size photos, repeats when fewer than n, `[]` without any).

- [ ] **Step 1: Write `tests/browser/recipes.case.js`** — a test-only recipe (`register({ id: 'test-recipe', … })`, acts paint the frame one colour each and record one text), then:
  - `framework: acts become the timeline scenes and cuts` (15 s full → 8 scenes, cuts 2, 4, … 14),
  - `framework: a non-bespoke act starts with the travel move` (10 s: at D's start + 0.1 s both M's and D's colours show; at + 0.5 s only D's),
  - `framework: brand colours and the highlight follow the ad, text keeps 4.5:1`,
  - `framework: boxes collect the recorded texts`,
  - `photos: a chosen photo that is gone falls back to the trades`,
  - and `checkRecipe(id)` for Tasks 4–8 (skipped while `id` is not registered): fixtures full / minimal / long / no-number (plus the Review Focus cases 1, 3, 4), formats story / portrait / square, durations 6 / 10 / 15:
    - every scene draws (pixels change),
    - settled text boxes (every 1/10 s) inside [250, 1640] in Story and inside the frame elsewhere,
    - every recorded text is part of the allowed words (ad texts, functional labels, brand name, typing prefixes), case-insensitive,
    - `P.minTextSize ≥ 40`,
    - first and last frames equal (mean channel difference < 1 at 1/4 scale),
    - average frame < 30 ms at 1080 × 1920 with the VideoFrame flush,
    - `renderGenerated(P.timeline)` peak ≤ 0.8915 and a kick on every beat in `P.timeline.synth`.
- [ ] **Step 2: Run** `node tools/test-browser.mjs run.html` → framework tests FAIL (`RS.motion.register` undefined).
- [ ] **Step 3: Implement** in `motion.js`: `register`, the recipe branch in `prepare`/`render`/`leftOut`/`colorsFor`, the five travel moves, `photoIds`, `recipePhotos`; style-only tests filter `!s.recipe`.
- [ ] **Step 4: Run** both test commands → PASS.

---

### Tasks 4–8: the five recipes

One task per recipe, in this order: **4 Tijolo, 5 Píxel, 6 Planta, 7 Apresentação, 8 Colagem**. Each:

**Files:** Create `js/recipes/<id>.js` (+ script tag in the four lists). Test: `checkRecipe('<id>')` and the recipe's own cases in `tests/browser/recipes.case.js`.

**Interfaces:** Consumes Task 2 (`RS.motionKit`) and Task 3 (`RS.motion.register`, `A`, `P`). Produces the registered recipe `<id>`.

**Port rules (all five):** start from `.superpowers/receitas-video/r-<id>.js`; every absolute time becomes `A.start + offset` or `A.lt`; every Story constant (CY 945, widths 920, phone 1220, 1080 × 1920) comes from `P.Z`; colours from `P.C`, fonts from `P.F`; an act draws its bespoke entry when `A.bespoke`, else starts clean (the framework draws the travel move); K without a contact shows brand + the ad's contacts (no button, no QR), and no QR when `content.qr` is false; O ends exactly on H's first frame; `R.lite` skips blur; no act assumes the canonical neighbour's layout exists.

- [ ] **Step 1:** add `checkRecipe('<id>')` and the cases below → **Run** `node tools/test-browser.mjs run.html` → FAIL (not registered).
- [ ] **Step 2:** implement `js/recipes/<id>.js`.
- [ ] **Step 3:** **Run** both commands → PASS; render the 15 s Story contact sheet with the scratch driver and compare with `saida/<id>-folha.png`.

Recipe-specific values and cases:
- **Tijolo** — `palettes: { light: { bg: '#ECE6DA', ink: '#161412', main: '#C4502E', accent: '#C4502E' }, dark: { bg: '#1A1714', ink: '#F2EDE4', main: '#C4502E', accent: '#E8A27A' } }`, `bgModes: ['light', 'dark']`, travel `crane`. Cases: `tijolo: one lit window per vacancy (up to 24)`; `tijolo: a five-line headline makes five courses inside the frame`.
- **Píxel** — `dark: { bg: '#0A0A0F', ink: '#FFFFFF', main: '#FFD23F', accent: '#2E6BFF' }`, travel `scroll`, 6 px grid. Cases: `pixel: an uppercase accent keeps its mark (Õ)`; `pixel: everything moves in whole 6 px steps`.
- **Planta** — `dark: { bg: '#0F3B8C', ink: '#FFFFFF', main: '#0F3B8C', accent: '#FFD23F' }`, travel `whip`. Case: `planta: the camera never stops for more than 0.5 s outside the card`.
- **Apresentação** — `light: { bg: '#FFFFFF', ink: '#0D0D0D', main: '#0D0D0D', accent: '#E8470C' }, dark: { bg: '#0D0D0D', ink: '#FFFFFF', main: '#FFFFFF', accent: '#FF6A2B' }`, `bgModes: ['light', 'dark']`, travel `glide`, `needs: { V: ['M'] }`. Case: `apresentacao: nothing is left on screen after it leaves (the list is gone before the phone)`.
- **Colagem** — `dark: { bg: '#0B0B0B', ink: '#FFFFFF', main: '#FFFFFF', accent: '#FFC400' }`, travel `push`, `photos: 8`. Cases: `colagem: works with one photo and with none`; `colagem: the push through the letter lands on the same photo`.

---

### Task 9: The editor's «Vídeo» mode and the trimmed export dialog

**Files:**
- Modify: `js/app.js` (Editor, Workspace, ExportDialog, MotionPicker/MotionCard; new `VideoPanel`, `VideoStage`, `VideoPhotos`), `assets/app.css`
- Test: `tests/browser/ui-video.case.js` (rewritten), other UI cases that look for «Exportar imagem»

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces: `Editor` state `mode: 'image' | 'video'`; top-bar `.mode-switch` (role radiogroup, «Imagem», «Vídeo»); in video mode the `.panel` holds `VideoPanel` and the workspace holds `VideoStage` (`canvas[data-motion=<id>]`, a «Ouvir»/«Parar» button, the format switch, click pauses); `ExportDialog({ initialKind })`; the top-bar primary button reads «Exportar».
- `VideoPanel` groups (exact labels): «Receita ou estilo» (gallery with headings «Receitas» then «Estilos»), «Duração», «Cores», «Letra», «Fundo», «O que entra» (one checkbox per benefit, at most three ticked; «Salário e vagas»; «Lista de vagas»; «Conversa no WhatsApp» (recipes only); «Código QR»), «Fotografias» («Das funções do anúncio» | «Escolher» with a grid of library and «As minhas», at most eight), «Contacto no fim» («2 s» | «4 s»), «Som»; the note «Os textos vêm do anúncio.» with «Editar textos» (→ «Imagem», Texto); the left-out note.

- [ ] **Step 1: Rewrite `ui-video.case.js`** (runs after `ui-offer.case.js`): `video: «Vídeo» shows the panel and the moving stage` (12 cards, «Receitas» heading); `video: picking «Tijolo» saves it and the stage follows`; `video: a fourth benefit cannot be ticked`; `video: «Contacto no fim» 4 s is saved`; `video: «Escolher» photos keeps the picked ids`; `video: «Exportar» opens the dialog on «Vídeo», without style, colours or sound`; `video: «Exportar» from «Imagem» opens on «Imagem»`; the MP4 cases kept («Sem som» → no `soun`, own WAV → `soun`, cancel saves nothing); `video: the panel speaks Portuguese`; `editor: «Ver animação» is gone`.
- [ ] **Step 2: Run** `node tools/test-browser.mjs run-ui.html` → FAIL.
- [ ] **Step 3: Implement** the mode switch, `VideoPanel`, `VideoStage`, the photo picker, the trimmed `ExportDialog` (formats, languages, file, actions, preview, caption, «Mudar o vídeo»), CSS for desktop and ≤ 860 px.
- [ ] **Step 4: Run** both test commands → PASS.

---

### Task 10: Documentation, package, final review

**Files:** Modify `LEIA-ME.md`, the spec («Built and checked»), `sw.js`; run `tools/build-web.mjs`.

- [ ] **Step 1:** `LEIA-ME.md` «Vídeo para Reels e Stories» rewritten for the «Vídeo» mode and the recipes; the spec gets «Built and checked» with measured numbers.
- [ ] **Step 2:** `node --test "tests/unit/*.test.cjs"` and `node tools/test-browser.mjs` → all PASS (report counts).
- [ ] **Step 3:** `node tools/build-web.mjs`, then `"C:\Program Files\7-Zip\7z.exe" t ..\web-publicar\recruitment-studio-web.zip` → «Everything is Ok».
- [ ] **Step 4:** one fresh reviewer (most capable model) on the whole change against the spec; confirmed findings fixed test-first; Step 2 again.
