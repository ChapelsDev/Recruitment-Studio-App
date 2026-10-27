# Motion-graphics video styles with sound — Implementation Plan (phase 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From any ad, make a scroll-stopping motion-graphics video (six styles plus the existing animated poster) with generated music, the person's own sound or no sound, exported as MP4 per language, offline.

**Architecture:** A pure timeline builder (`js/motion-timeline.js`) turns the ad's own words into scenes, cuts and sound events; a renderer (`js/motion.js`) draws one frame of a style at time `t` with the engine's text fitting; `js/sound.js` synthesises the soundtrack (WebAudio, offline render) or fits the person's file; `js/video.js` gains a frame callback and an AAC audio track. The throwaway prototype (`.superpowers/brainstorm/*/content/prototipo-video.html`) is the visual reference only.

**Tech Stack:** classic browser scripts, Canvas 2D, WebAudio (`AudioContext`, `OfflineAudioContext`), WebCodecs (`VideoEncoder`, `AudioEncoder` AAC `mp4a.40.2`), `vendor/mp4-muxer.js` (MIT), MediaRecorder fallback; Node `node:test` and the Edge-headless runner from phase 1.

**Spec:** `documentation/specs/2026-10-20-recruitment-studio-contacts-motion-design.md` (Part B). Requires phase 1 (`2026-10-20-fala-comigo-multi-trade-plan.md`) done: `RS.contact`, `project.trades`, the test runners.

All paths are relative to `recruitment-studio-web/` unless they start with `documentation/`.

## Global Constraints

- The video shows **only the ad's own words** (kicker, headline, benefits, positions, contacts) exactly as written; the only app-supplied words are functional labels in the ad's language: the CTA «Manda mensagem», «Aponta a câmara», the salary period, the vacancies word, and the brand name from «A minha marca».
- Every language of the ad gets its own video; the app interface stays in Portuguese.
- Sound options: generated (default) / own file (MP3/M4A, fitted, fade-out) / none. No bundled or copied music.
- Styles at launch: Néon (default), Obra, Limpo, Cinema, Impacto, Curto (always 6 s), plus «Cartaz animado» (the existing poster animation, unchanged). Durations among 6 / 10 / 15 s; default 15 s.
- Customisation limited to: style, «Cores do estilo» / «Cores da marca», a palette row, «Cor de destaque», background dark/light (where the style allows), font (the app's four pairs), duration, sound. No timeline, no per-scene settings.
- Logo follows the ad's «Logótipo» switch: small in a corner through the video, large on the closing card; brand name when there is no logo; nothing when hidden.
- No photo, face or voice of the recruiter.
- Story 9:16 is the main format; Instagram covers the top 250 px and the bottom 280 px of 1080 × 1920; 4:5 and 1:1 have adapted layouts.
- Offline, classic scripts, no CDN; new scripts in `index.html` and `sw.js` `CORE`. Existing images, the existing animated-poster video and saved ads must not change.
- No git commits (house rule); each task ends with a checkpoint.

## Review Focus

1. Very long texts written by the person (a 120-character headline, an 80-character benefit, ten positions) must fit inside the safe zones, larger than 40 px at 1080 width, split over two beats when needed — browser test in Task 3.
2. An ad with almost nothing (headline only, no benefits, no photo, no number) still gives a valid video: hook then closing card with the brand, no empty scenes — tests in Tasks 2 and 3.
3. Own sound shorter or longer than the video, mono, 44.1 kHz, or a file that cannot be decoded: fitted to exactly the video length at 48 kHz stereo with a 1 s fade, or a clear message and the generated sound offered instead — test in Task 5.
4. A phone without AAC encoding gets the real-time recording with sound; without that too, a silent MP4 and a note — test in Task 6 (stub `AudioEncoder` away).
5. Changing style, duration, colours or language while the preview plays, and cancelling an export half-way, leave no stale frames, no stuck sound and no file — tests in Tasks 6 and 7.

---

### Task 1: Offer fields and video settings (`js/model.js`, Texto panel)

**Files:**
- Modify: `js/model.js`, `js/app.js` (`TextPanel`: group «Salário e vagas (opcional)»)
- Create: `tests/unit/model-video.test.cjs`

**Interfaces:**
- Produces on every project:
  - `offer: { salary: string, currency: '€' | 'CHF' | '£', period: 'hour' | 'day' | 'week' | 'month', vacancies: string }` — default `{ salary: '', currency: '€', period: 'month', vacancies: '' }`; language-neutral numbers.
  - `video: { duration: 6 | 10 | 15, style: 'dynamic' | 'soft', motion: 'poster' | 'neon' | 'obra' | 'limpo' | 'cinema' | 'impacto' | 'curto', colors: 'style' | 'brand', accent: string | null, bg: 'dark' | 'light', font: string | null, sound: 'generated' | 'own' | 'none', ownSound: string | null }` — defaults `motion 'neon'`, `duration 15`, `colors 'style'`, `bg 'dark'`, `sound 'generated'`; old `{ duration, style }` keep their values with `motion 'poster'` (so old ads keep their animated poster).
  - `STOCK.period` (`hour/day/week/month` × 7 locales, pt "por hora/por dia/por semana/por mês") and `STOCK.vacancies` (pt "vagas").
  - `offerText(project, locale): string | null` — e.g. "1900 € por mês · 30 vagas"; `null` when both fields are empty.
  - `caption()` adds `offerText` as a line after the headline when present.
- [ ] **Step 1: Failing tests:** normalising an old project gives the default `offer` and `video.motion 'poster'` with its old `duration`/`style`; a new project has `motion 'neon'`, `duration 15`; `offerText` → `'1900 € por mês · 30 vagas'` (pt-PT) and names the German period in de-CH; empty → `null`; `caption` contains the offer line.
- [ ] **Step 2: Run** unit tests — FAIL.
- [ ] **Step 3: Implement** the model; add the Texto group (salary + currency select + period select, vacancies number field).
- [ ] **Step 4: Run** both runners — PASS.
- [ ] **Step 5: Checkpoint.**

### Task 2: Timeline builder (`js/motion-timeline.js`, pure)

**Files:**
- Create: `js/motion-timeline.js`, `tests/unit/motion-timeline.test.cjs`
- Modify: `index.html`, `sw.js`, `tests/browser/run.html`

**Interfaces:**
- Produces `RS.motionTimeline`:
  - `content(project, locale): Content` — `{ kicker, headline, benefits: string[], positions: string[], offer: { salary, currency, periodLabel } | null, vacancies: { count, word } | null, contact: { display, cta, hint, link } | null, brandName, showLogo: boolean, photos: number }` built only from the ad (functional labels from `STOCK`, contact from `RS.contact`); `photos` = how many photos the scene photo set has (filled by the caller).
  - `build(content, { duration, scenes: string[], beat = 0.5 }): Timeline` — `{ duration, scenes: [{ kind, start, end, data }], cuts: number[], events: [{ t, type: 'kick' | 'whoosh' | 'hit' | 'pop' | 'riser' }] }`, with `kind` among `hook`, `fan`, `sphere`, `benefit`, `counter`, `tunnel`, `wall`, `end`, taken in the style's `scenes` order.
  - Rules: `hook` (kicker + headline) first, 2 s (1.5 s when duration is 6); `end` last, at least 2.5 s (2 s at 6 s); between them, scenes whose content exists: `benefit` one per benefit (texts over 32 characters take 1.5 s; others 1 s), `counter` only with `offer` or `vacancies`, `wall` only with at least 2 positions, photo scenes (`fan`, `sphere`, `tunnel`) only with `photos > 0`; when time runs out, photo scenes go first, then the last benefits; every start and cut on a beat; events: a `kick` every beat, a `whoosh` at every cut, a `hit` when a counter lands, a `pop` per chip, a `riser` in the 1.5 s before `end`.
- [ ] **Step 1: Failing tests** (fixtures as plain objects): durations 6, 10, 15 end exactly at the duration; the last scene is `end` with the stated minimum; a headline-only content gives exactly `hook` + `end`; no `counter` without offer/vacancies; no photo scenes with `photos: 0`; all `start` values and `cuts` are multiples of 0.5; benefit texts appear in `data` exactly as given (no change of case or wording).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Checkpoint.**

### Task 3: Renderer and the Néon style (`js/motion.js`)

**Files:**
- Create: `js/motion.js`, `tests/browser/motion-neon.case.js`
- Modify: `js/engine.js` (export `qrModules`, `logoSource`), `index.html`, `sw.js`, `tests/browser/run.html`

**Interfaces:**
- Consumes: `RS.motionTimeline`, `RS.engine.textLayout`, `RS.engine.fitHeadline`, `RS.engine.setFont`, `RS.engine.qrModules`, `RS.engine.logoSource`, `RS.engine.SAFE`, `RS.model.FONTS`.
- Produces `RS.motion`:
  - `STYLES: { id, name, durations: number[], defaultDuration, scenes: string[], palette: { bg0, bg1, ink, accent, cta }, font: string, bgModes: ('dark' | 'light')[], fx: { grain: boolean, glitch: boolean, labels: boolean } }[]` — this task adds `neon` (palette from the prototype: accent `#C6F432`, CTA `#25D366`).
  - `photoSet(project, images, libraryItems): Promise<{ hero: CanvasImageSource | null, cards: CanvasImageSource[] }>` — in the order of the spec's builder's call (ad photo, trades' library photos, «As minhas» of those trades, related trades), at most 16 cards.
  - `prepare(project, { format, locale, photos }): Prepared` — timeline + text layouts measured once (cache for every frame).
  - `render(ctx, prepared, { t, scale }): void` — draws the frame at `t` seconds: background, scene, glitch on cuts, grain, vignette, small labels, progress bar; text sizes from `fitHeadline`/`textLayout` so every text fits its scene box inside the safe zones.
- [ ] **Step 1: Failing browser cases:** for formats story/portrait/square and the fixture ads "full" (all fields), "minimal" (headline only) and "long" (120-character headline, 80-character benefit, 10 positions): `render` at every scene's middle time does not throw and changes pixels; no text pixel above y = 250 or below y = 1640 in story (check with a text-only layer); the measured text size is at least 40 px; average `render` time at 1080 × 1920 is under 25 ms on this PC.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `motion.js` with the scene drawers (`hook`, `fan`, `sphere`, `benefit`, `counter`, `tunnel`, `wall`, `end`) and Néon's look; logo per the Global Constraints.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Checkpoint.**

### Task 4: The other styles and the colour options

**Files:**
- Modify: `js/motion.js`
- Create: `tests/browser/motion-styles.case.js`

**Interfaces:**
- Produces: `STYLES` entries `obra` (yellow/black, caution tape, industrial), `limpo` (light, corporate; `bgModes ['light', 'dark']`), `cinema` (full hero photo, Ken Burns, kinetic text over it), `impacto` (typography only, no photo scenes), `curto` (`durations [6]`), and `poster` (delegates to `RS.engine.render` with `anim`, unchanged look).
- Produces: `colorsFor(style, project): { bg0, bg1, ink, accent, cta }` — `video.colors 'brand'` maps the ad's primary to the background tint and accent to the highlight; `video.accent` overrides the highlight; `video.bg 'light'` swaps to the style's light palette when allowed; contrast kept with `RS.util.ensureContrast` (text ≥ 4.5:1).
- [ ] **Step 1: Failing browser cases:** every style × 3 formats × the three fixtures renders without error; `curto` has `durations [6]`; `impacto`'s timeline has no photo scenes; with `colors 'brand'` and primary `#12325A` the background pixels are blue-ish; `poster` frames equal `RS.engine.render(..., { anim })` frames.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Checkpoint.**

### Task 5: Sound (`js/sound.js`)

**Files:**
- Create: `js/sound.js`, `tests/browser/sound.case.js`
- Modify: `index.html`, `sw.js`, `tests/browser/run.html`, `js/store.js` (`RS.assets.importAudio`, housekeeping keeps `project.video.ownSound`)

**Interfaces:**
- Consumes: `Timeline.events`.
- Produces `RS.sound`:
  - `schedule(ac: BaseAudioContext, dest: AudioNode, timeline, t0: number): void` — beat (kick, hat, bass) plus effects per event, as in the prototype.
  - `renderGenerated(timeline, sampleRate = 48000): Promise<AudioBuffer>` — stereo, exactly `duration × sampleRate` frames, via `OfflineAudioContext`.
  - `fitOwn(data: ArrayBuffer, duration: number, sampleRate = 48000): Promise<AudioBuffer>` — decode, trim (or pad with silence), 1 s fade-out, peak normalised to −1 dBFS; rejects with `Error('Não foi possível ler este ficheiro de som.')`.
  - `preview(source: Timeline | AudioBuffer, startAt: number): { stop(): void }` — plays in sync with the preview clock.
- Produces: `RS.assets.importAudio(file): Promise<{ id: string, duration: number }>` (stores the original file as an asset of kind `audio`).
- [ ] **Step 1: Failing browser cases:** `renderGenerated` of a 15 s timeline has 720 000 frames per channel, is not silent, and the energy at every whoosh time is above the median; `fitOwn` of a 3 s mono 44.1 kHz test tone (generated in the test with `OfflineAudioContext` and WAV-encoded) to 10 s gives 480 000 frames, 2 channels, silence after 3 s; a 20 s tone fitted to 10 s ends with a fade (last 0.1 s RMS < 5 % of the start); garbage bytes reject with the message above; housekeeping keeps an `audio` asset referenced by a project.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Checkpoint.**

### Task 6: MP4 with sound (`js/video.js`)

**Files:**
- Modify: `js/video.js`
- Create: `tests/browser/video-audio.case.js`

**Interfaces:**
- Consumes: `RS.motion.prepare/render`, `RS.sound`.
- Produces: `RS.video.create(project, o)` with two new options: `o.frame?: (ctx, t) => void` (default: the animated poster as today) and `o.audio?: AudioBuffer | null`. With audio: `AudioEncoder` `{ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }`, muxer `audio: { codec: 'aac', numberOfChannels: 2, sampleRate: 48000 }`, audio fed in 1024-frame `AudioData` chunks; when AAC encoding is unsupported, the MediaRecorder route mixes the buffer through a `MediaStreamAudioDestinationNode` and records in real time; if that is unavailable too, the MP4 is silent and the result says so.
- Produces: `support()` additionally returns `aac: boolean`; `create` resolves to a `Blob` with `blob.silent = true` when sound was requested but could not be added.
- [ ] **Step 1: Failing browser cases:** a 6 s Néon video with generated sound: MP4 starts `ftyp`, `moov` before `mdat`, contains an `soun` handler and plays for 6.0 s in a `<video>`; with `audio: null` no `soun`; with `window.AudioEncoder` stubbed to `undefined` the recorder route still produces audio (`soun` present); aborting at 50 % rejects with `AbortError` and no blob.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Checkpoint.**

### Task 7: Export dialog, preview and docs

**Files:**
- Modify: `js/app.js` (`ExportDialog` video section, `VideoPreview`, `Workspace` «Ver animação»), `assets/app.css`, `LEIA-ME.md`, `documentation/specs/2026-10-20-recruitment-studio-contacts-motion-design.md` ("Built and checked" for Part B)
- Create: `tests/browser/ui-video.case.js`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces UI in Exportar › Vídeo:
  - `MotionPicker({ project, images, value, onChange })` — gallery of the seven styles, each a small moving preview (render at thumbnail scale, only while visible).
  - Options: duration seg (the style's `durations`), colours («Cores do estilo» / «Cores da marca», palette row from `RS.model.PALETTES`, «Cor de destaque», «Fundo» escuro/claro when the style allows, «Letra»), sound seg «Música da app» / «Um som meu» / «Sem som» (file picker → `importAudio`, shows the file name and «Trocar»; on decode failure the message from `fitOwn` and back to «Música da app»), all saved in `project.video`.
  - Preview: the chosen style moving; «▶ Ouvir» plays it with its sound; any change restarts the preview and stops the old sound.
  - «Criar vídeo» / «Criar N vídeos (ZIP)» / «Partilhar vídeo» as today, one video per chosen language and format, with progress and «Cancelar»; a note when `blob.silent`.
  - Editor «Ver animação» plays `project.video.motion` (sound off).
- [ ] **Step 1: Failing browser cases:** choosing «Impacto» stores `video.motion 'impacto'` and the preview changes; «Sem som» exports without `soun`; «Um som meu» with the WAV fixture exports with `soun`; changing the duration while «▶ Ouvir» plays stops the old sound (the old source's `stop` was called); cancelling during export leaves no saved blob; the dialog shows only Portuguese interface text.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; update `LEIA-ME.md` (video styles, colours, the three sound options) and the spec's "Built and checked".
- [ ] **Step 4: Run** both runners — PASS; `node tools/build-web.mjs` builds and its ZIP tests clean; measure a 15 s Néon story with sound on this PC (target: under 15 s to create) and record it in the spec.
- [ ] **Step 5: Checkpoint** — the owner's manual acceptance (spec, Part B) follows; do not claim it.
