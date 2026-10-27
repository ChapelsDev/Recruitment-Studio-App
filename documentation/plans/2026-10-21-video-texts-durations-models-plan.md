# Video texts, 10–30 s videos and eight new models — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every text of the video is the owner's (per language, following the image until edited), every model lasts 10–30 s or «Automática» with pages of information, eight new motion-graphics models join the five recipes, and the «Vídeo» panel is reorganised in four tabs — plus the five small fixes.

**Architecture:** `RS.motionTimeline.content()` becomes the single source of video texts (image → `video.texts` overrides → `video.show`), a new pure scheduler `RS.motionTimeline.schedule()` turns content into acts with pages (and the fillable lengths), the recipe framework in `js/motion.js` passes pages to each act (default intro/closing acts, two new travel moves), each model is one file in `js/recipes/`, and `js/app.js` gets a tabbed «Vídeo» panel with a «Textos» editor.

**Tech Stack:** classic browser scripts (Preact + htm vendor), Canvas 2D, WebCodecs export via `RS.video.create`, node:test unit tests (`tests/load.cjs`), headless Edge browser tests (`tools/test-browser.mjs`).

**Spec:** `documentation/specs/2026-10-21-recruitment-studio-video-texts-durations-models-design.md` (builds on `documentation/specs/2026-10-20-recruitment-studio-video-recipes-design.md`).

## Global Constraints

- App folder: `recruitment-studio-web/`; all paths below are relative to it.
- Classic scripts only (no ES modules on `file://`), no CDN, offline; every new script is added to `index.html`, `tests/browser/run.html` (or `run-recipes.html`), `tests/browser/run-ui.html` and `sw.js` CORE (use `node ../.superpowers/receitas-video/add-recipe-script.mjs <id>` for recipes; extend its `prevOf` map for the new ids).
- Interface in Portuguese; code and comments in English.
- **No commits: the owner commits.** (No commit steps in this plan.)
- Never the recruiter's face, photo or voice (the badge uses a helmet icon).
- The video shows the texts of «Textos do vídeo» (which start as the image's words) plus translated, editable model labels; the app adds no slogans.
- Recipe rules (spec §4): one concept, no cuts/fades, one font, ≤3 colours + black/white, 120 BPM (beat 0.5 s, bar 2 s), last frame = first frame, no particles/glows/flares/shake/RGB split/crossfades/generic gradients/bouncy easing, holds ≤0.5 s except the contact, spring/expo easing, directional blur, kick every beat + riser into the card + hit on every act change, peaks ≤ −1 dBFS, Story safe zone y ∈ [248, 1642], texts ≥ 40 px, accents never clipped, render(t) stateless, 1080×1920 frame < 30 ms (VideoFrame flush).
- Lengths: `6 | 10 | 15 | 20 | 25 | 30 | 'auto'`; new ads `'auto'`; lengths the information cannot fill are unavailable (owner); 10 s always available; Curto stays 6 s only.
- TDD for production code; at the end `node --test "tests/unit/*.test.cjs"` and `node tools/test-browser.mjs` green, `node tools/build-web.mjs`, `"C:\Program Files\7-Zip\7z.exe" t ..\web-publicar\recruitment-studio-web.zip` → «Everything is Ok».
- Bash heredocs drop a backslash level on this machine: write patch scripts and regex-bearing code with the Write/Edit tools.

## Review Focus

1. A very long ad (12 benefits, 6 highlights, 10 positions) at «Automática» — the video is 30 s, what does not fit is named in the panel, no page overlaps another or leaves the zone. Test: `schedule: a very long ad is capped at 30 s and reports what is left out` (Task 4) and the `long` fixture at `'auto'` in the shared recipe checks (Task 5).
2. Highlights that are not numbers («A combinar», an empty value with only a label, «1 900,50 €», «10+») — shown exactly as written, never counted, no chart overflow. Test: `content: highlights keep their text; only plain numbers count` (Task 3) and the shared check `highlights are shown as written` (Task 5).
3. The video's headline emptied (and kicker hidden) — the first frame is never blank: brand name, else the first benefit, else the first highlight. Test: `content: an empty video headline falls back to the brand, then the first benefit` (Task 3).
4. Image edited after video edits (an item deleted on the image that had a video edit; a new image item; another language edited) — orphan edits are ignored, new items appear, languages stay independent. Test: `mergeList: orphan edits are ignored and new image items appear` (Task 2).
5. Old saved ads (`include`, `duration: 15`, `motion: 'poster'`, LEGACY video) — open with the same video as before. Test: `normalize: an ad saved with include keeps the same video` (Task 2).

---

### Task 1: The five small fixes

**Files:**
- Modify: `js/app.js` (VideoStage, Editor `vP` memo, ExportDialog open)
- Test: `tests/browser/ui-video.case.js`, `tests/browser/recipes.case.js`

**Interfaces:**
- Consumes: current `VideoStage({ P, project, format, setFormat, mobile })`, Editor `exportOpen`.
- Produces: `VideoStage({ …, quiet })` — when `quiet` is true «Ouvir» stops; Editor passes `quiet=${exportOpen}`; helper `videoKey(project) -> string` (JSON of every field the video reads: `video, texts, offer, whatsapp, waTemplates, brand, logo, photo, style, show, locales, locale, trades, trade`) used as the `vP` memo dependency instead of `project`.

- [ ] **Step 1: Write the failing tests** in `ui-video.case.js` (before «Exportar from Imagem»):
  - `video: «Sem som» stops «Ouvir» and choosing music again does not start it` — start «Ouvir» (count `RS.sound.preview` calls), pick «Sem som», pick «Música da app», wait 600 ms → no new preview call; `$('.video-stage .ws-listen')` not `.on`.
  - `video: opening «Exportar» stops «Ouvir»` — start «Ouvir», open the dialog → the wrapped preview's `stop()` was called.
  - `video: typing the ad's name does not prepare the video again` — count non-lite `RS.motion.prepare` calls while typing 8 characters in `.name-input` → 0.
- [ ] **Step 2: Write the failing recipe checks** in `checkRecipe(id)` (`recipes.case.js`):
  - `${id}: a German video stays in the zones with its own labels` — `p = RS.model.addLocale(fixture('full', id), 'de-CH', 'pt-PT')`, prepare with `locale: 'de-CH'`, render every 0.25 s of 15 s, boxes inside [248, 1642] and `wordsOk(p, boxes, 'de-CH')` (make `corpus(p, locale)` / `wordsOk(p, boxes, locale)` take the locale).
  - `${id}: «Código QR» off leaves the card without a QR` — `p.video.include.qr = false`; over the card act no box tagged `aponta` and `P.card.qr` falsy.
- [ ] **Step 3: Run** `node tools/test-browser.mjs run-ui.html` and `run.html` → the three UI tests FAIL; the recipe checks PASS or FAIL (they pin behaviour; any FAIL is fixed in the recipe).
- [ ] **Step 4: Implement** in `js/app.js`: `useEffect(() => { if (vid.sound === 'none' || quiet) setListening(false); }, [vid.sound, quiet])` in VideoStage; `videoKey` + `useMemo(…, [video, videoKey(project), vFormat, images, vPhotos])`.
- [ ] **Step 5: Run** both pages → PASS.

---

### Task 2: Video data — texts, eyes, lengths, migration

**Files:**
- Modify: `js/model.js` (DEFAULT_VIDEO, normalize, new helpers)
- Test: `tests/unit/model-video.test.cjs`

**Interfaces:**
- Produces (on `RS.model`):
  - `DURATIONS = [6, 10, 15, 20, 25, 30]`; `video.duration ∈ DURATIONS ∪ {'auto'}`; `DEFAULT_VIDEO.duration = 'auto'` for new ads (`newProject`), normalize keeps a saved valid value, invalid → 15; Curto → 6.
  - `DEFAULT_VIDEO_SHOW = { kicker: null, intro: null, benefits: null, highlights: null, positions: null, chat: true, contacts: null, closing: false, qr: true }` — `null` = follow the image's eye.
  - `video.texts: { [locale]: VideoTexts }`, `VideoTexts = { kicker?, headline?, intro?, positionsTitle?, message?, cta?, hint?, closing?, brandName?: string, benefits?, highlights?, positions?, contacts?: ListOverride, model?: { [modelId]: { [key]: string } } }`.
  - `ListOverride = { edits: { [imageItemId]: string | null | HighlightEdit }, added: [Item], order: [id] | null }`; `Item = { id, text, icon? }` or for highlights `{ id, role: 'own', value, label }`; `HighlightEdit = { value?, label? } | null`.
  - `mergeList(imageItems: Item[], override?: ListOverride) -> Item[]` — image items in image order with edits applied (`null` removes), then `added`; `order` (ids) reorders, unknown ids ignored, new image items appended after their image neighbour.
  - `cleanVideoTexts(texts, locales) -> object` and `cleanVideoShow(show) -> object` (drop unknown keys, non-strings, more than 40 items per list, strings over 400 chars cut).
  - normalize migrates `include` (2026-10-20): `offer:false → show.highlights=false`, `positions:false → show.positions=false`, `chat:false → show.chat=false`, `qr:false → show.qr=false`, `benefits:[ids] → for every locale texts[locale].benefits = { edits: {<image id not picked>: null}, added: [], order: null }` using `RS.motionTimeline.pickBenefits` semantics (same places in other languages); `include` is then dropped.

- [ ] **Step 1: Write the failing tests** (`model-video.test.cjs`):
  - `normalize: new ads start at «Automática»` — `newProject(...).video.duration === 'auto'`.
  - `normalize: lengths 6–30 and auto are kept, others fall back to 15` — 20 → 20, 'auto' → 'auto', 12 → 15, Curto + 30 → 6.
  - `normalize: an ad saved with include keeps the same video` — include `{benefits:[b2], offer:false, positions:true, chat:false, qr:false}` → `show.highlights === false`, `show.chat === false`, `show.qr === false`, `mergeList(t.benefits, texts['pt-PT'].benefits)` = `[b2]`, same places in an added `fr` locale, no `include` key.
  - `mergeList: edits, removals, additions and order` — image `[a,b,c]`, edits `{b:'B!', c:null}`, added `[x]`, order `[x,a,b]` → texts `['x','a','B!']`.
  - `mergeList: orphan edits are ignored and new image items appear` — edits for a missing id ignored; image `[a,n,b]` with order `[b,a]` → `[b,a,n]` or n after a (assert n present, a before b as ordered).
  - `cleanVideoTexts: junk is dropped` — numbers, unknown keys, 50-item lists (→ 40), 1000-char strings (→ 400).
- [ ] **Step 2: Run** `node --test tests/unit/model-video.test.cjs` → FAIL.
- [ ] **Step 3: Implement** in `js/model.js`; export `DURATIONS, DEFAULT_VIDEO_SHOW, mergeList, cleanVideoTexts, cleanVideoShow`. Update the Task 1 recipe check «Código QR off» to `p.video.show.qr = false` and every test/use of `video.include` (grep `include`) to the new fields.
- [ ] **Step 4: Run** all unit tests → PASS.

---

### Task 3: Video content v2 — one source for every text

**Files:**
- Modify: `js/motion-timeline.js` (`content`), `js/model.js` (STOCK labels if missing)
- Test: `tests/unit/motion-timeline.test.cjs`

**Interfaces:**
- Consumes: Task 2 data and `mergeList`.
- Produces: `RS.motionTimeline.content(project, locale) -> VideoContent`:
  - strings: `kicker, headline, intro, positionsTitle, message, closing, brandName` — each `video.texts[locale][key]` if present, else the image's (`t.kicker`, `t.headline`, `t.intro`, `t.positionsTitle`, `RS.contact.adMessage`, `''`, brand), `''` when its eye is off. Eye = `video.show[key]` if boolean else the image's `project.show[key]` (kicker, intro, benefits, positions, contacts; highlights follows the image's offer presence; closing defaults false).
  - `benefits: string[]`, `benefitIds`, `icons` — `mergeList(t.benefits, texts.benefits)`; no 3-item cap here.
  - `highlights: Highlight[]`, `Highlight = { id, role: 'salary'|'vacancies'|'badge'|'own', value, label, count: number|null, prefix, suffix }` — image items: `salary` (`offerParts.amount`, `offerParts.period`), `vacancies` (`count`, `word`), `badge` (`t.badge`, `''`, only when `project.show.badge`); edits by id `'salary'|'vacancies'|'badge'`; `count` = the number when `value` matches `/^(\D*?)(\d{1,7})(\D*)$/` (prefix/suffix kept), else `null`.
  - `offer` / `vacancies` kept for the five recipes, derived from the `salary` / `vacancies` highlights (`{ salary: digits or value, currency, periodLabel: label, amount: value }`, `{ count: value, word: label }`), null when absent or hidden.
  - `positions: string[]` (mergeList), `contacts: string[]` (mergeList, eye), `chat`, `qr` (`video.show`), `contact: { display, cta, hint, link } | null` with `cta`/`hint` from texts or STOCK.
  - headline fallback: empty headline (after texts) → brand name, else first benefit, else first highlight `value label`.
  - `labelFor(modelId, key, defaults) -> string` closure on the returned object: `texts[locale].model[modelId][key]` ?? `defaults[locale]` ?? `defaults['pt-PT']`.

- [ ] **Step 1: Write the failing tests** (`motion-timeline.test.cjs`):
  - `content: video texts win over the image, per language` — `texts['pt-PT'].headline = 'Novo'` → pt `'Novo'`, `fr` keeps the image's.
  - `content: every list follows the image item by item` — image benefit edited on the image after a video edit of another item → both changes present.
  - `content: highlights start from salary, vacancies and badge` — `[{role:'salary', value:'1900 €', label:'por mês', count:1900}, {role:'vacancies', value:'12', label:'vagas', count:12}]` (+ badge when shown).
  - `content: highlights keep their text; only plain numbers count` — `'A combinar'`, `''`+label, `'1 900,50 €'`, `'10+'` → `count === null`, values unchanged; `'40 h'` → `count 40, suffix ' h'`.
  - `content: the button, the hint and the message are his` — texts cta/hint/message → `contact.cta`, `contact.hint`, `message`.
  - `content: the video's eyes start from the image's` — image `show.benefits=false` → `[]`; `video.show.benefits=true` → the image benefits.
  - `content: an empty video headline falls back to the brand, then the first benefit` — headline `''` → brand; brand default → first benefit.
  - `content: model labels are translated and editable` — `labelFor('partidas','gate',{ 'pt-PT':'EMBARQUE', fr:'EMBARQUEMENT' })` → pt 'EMBARQUE', fr 'EMBARQUEMENT', with `texts.fr.model.partidas.gate='PORTE'` → 'PORTE'.
  - Update `content: switches hide …` and the cross-language benefits test to the new data.
- [ ] **Step 2: Run** `node --test tests/unit/motion-timeline.test.cjs` → FAIL.
- [ ] **Step 3: Implement** `content()`; drop `pickBenefits` from the content path (keep it exported for the Task 2 migration).
- [ ] **Step 4: Run** all unit tests → PASS.

---

### Task 4: The scheduler with pages and fillable lengths

**Files:**
- Modify: `js/motion-timeline.js` (replace `acts`)
- Test: `tests/unit/motion-timeline.test.cjs`

**Interfaces:**
- Consumes: `VideoContent` (Task 3).
- Produces: `RS.motionTimeline.schedule(c, opts) -> Schedule`, `opts = { duration: number|'auto', hold = 2, order = ['M','V','D','L','C','F'], priority = ['D','M','C','V','L','F'], has = {M,V,D,L,C,F,I}, beat = 0.5 }`:
  - Acts: `H` (4 beats), `I` intro (4, when `c.intro` and `has.I`), middles from `order`, `K` (4 or 8 = hold), `O` (2).
  - Pages: `M` items = benefit indices (normal 3/page, spacious 1), `D` = highlight indices (2 / 1), `L` = position indices (5 / 2; L needs ≥ 2), `V`, `C`, `F` one page each; every page is 4 beats; items spread evenly (`[3,2]` for 5 in 2 pages).
  - `Schedule = { duration, auto, max, lengths: [{ value, seconds, ok, missing }], acts: [{ kind, beats, start, end, pages: number[][] }], left: { benefits, highlights, positions, chat, closing, intro } }`.
  - `auto` = H + I + normal pages of all available acts + K + O, clamped to [10, 30] and rounded down to whole bars; `max` = same with spacious pages, V, and K = 8 beats, clamped to [10, 30].
  - Fixed length `T`: if `T > max`, `duration` = the largest of `[10,15,20,25,30]` ≤ `max` (or 10). Budget = T − H − O − K: first page of each available act by `priority`, then the I page, then further normal pages M, D, L, then spacious re-pagination M, D, L, then K → 8 beats; leftover beats go to K. What does not fit goes in `left`.
  - `lengths`: one entry per `[6?,10,15,20,25,30]` the model offers + `'auto'`: `ok = seconds <= max || seconds === 10`, `missing = ceil((seconds − max) / 2)` items when not ok.
- [ ] **Step 1: Write the failing tests**:
  - `schedule: «Automática» gives the time the information needs` — 3 benefits, 2 highlights, 3 positions, chat, no intro/closing → H4 M4 V4 D4 L4 C4 K4 O2 = 30 beats → `auto 15`.
  - `schedule: a longer video shows more, not slower` — 6 benefits at 20 s → M has 2+ pages of ≤3 and no act page longer than 4 beats.
  - `schedule: spare time becomes one benefit per page, then a longer card` — 2 benefits, salary only, 20 s → M pages `[[0],[1]]`, K 8 beats.
  - `schedule: lengths the information cannot fill are unavailable` — headline + 2 benefits + salary + chat: `lengths` 30 → `ok false, missing > 0`; 10 → ok.
  - `schedule: a very long ad is capped at 30 s and reports what is left out` — 12 benefits, 6 highlights, 10 positions, intro, closing at 'auto' → `duration 30`, `left.benefits > 0 || left.positions > 0`.
  - `schedule: Números can play the highlights first` — `order: ['D','M','V','L','C','F']` → kinds `H, D, M, …`.
  - `schedule: a saved length that cannot be filled any more falls back` — max 18 s, duration 30 → `duration 15`.
  - Remove/replace the old `acts:` tests with these.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** all unit tests → PASS.

---

### Task 5: Recipe framework — pages, intro/closing, labels, lengths, new travels

**Files:**
- Modify: `js/motion.js` (register, prepareRecipe, renderRecipe, travel, leftOut, new `lengths`), `js/motion-kit.js` (page helper), `tools/test-browser.mjs` (pages list, timeout)
- Create: `tests/browser/run-recipes.html` (recipe checks moved out of `run.html`)
- Test: `tests/browser/recipes.case.js`

**Interfaces:**
- Consumes: Tasks 3–4.
- Produces:
  - `register(def)`: entry `durations: [6, 10, 15, 20, 25, 30]` (+ 'auto' in UI), `def.order?`, `def.labels?: { [key]: { [locale]: string } }`, `def.acts.I?`, `def.acts.F?`, `def.pageMove?`; framework defaults for `I` and `F` (kinetic type of `c.intro` / `c.closing` in `P.C.ink` on `P.C.bg`, `P.F.head`, words rising one per beat, records tags `intro` / `fecho`).
  - `prepareRecipe`: duration from `schedule` (`'auto'` resolved), `P.schedule`, `P.acts[i].pages`, `P.label(key) = c.labelFor(def.id, key, def.labels[key])`; `has` = `{ M: benefits>0, V: true, D: highlights>0, L: positions>=2, C: contact&&chat, F: !!closing, I: !!intro }` minus `def.needs`; no 3-benefit cap.
  - Act object `A` gains `pages`, and `RS.motionKit.page(A) -> { index, count, lt, items, first, last }` (page = 2 s; `lt` local to the page).
  - Page changes inside an act: the act draws them itself when `def.pageMove` is true, else the framework draws `travel` between page `p−1` (end state) and page `p` for the first 0.4 s of the page.
  - Travel kinds `'flip'` (vertical card flip: old scaleY 1→0, new 0→1, expoIn/expoOut) and `'page'` (old page lifts and slides off left with −8° rotation over the new one).
  - `RS.motion.lengths(project, { locale }) -> { auto, max, options: [{ value, seconds, ok, missing }] }` for recipes (from `schedule`) and styles (Task 11).
  - `leftOut(P)` for recipes = `P.schedule.left`.
- [ ] **Step 1: Move** the recipe checks (`checkRecipe`, per-recipe cases) to `run-recipes.html` (same scripts as `run.html` + recipes); `tools/test-browser.mjs` default pages `['run.html', 'run-recipes.html', 'run-ui.html']`, per-page wait 25 min.
- [ ] **Step 2: Write the failing tests**:
  - Shared fixtures: `full` gains a 4th–6th benefit, `highlights` («40 h» · «por semana» added), 5 positions; new kinds `many` (12 benefits, 6 highlights, 10 positions, intro, closing) and `texts` (video texts changed: headline, cta, hint, a highlight «A combinar»).
  - Shared checks run durations `[10, 20, 30, 'auto']` (6 s only where offered) on `full`, `minimal`, `many`, `no-number`; sample every 0.5 s for 30 s videos.
  - `${id}: every page of every act draws` (mid-page frames, not just mid-act).
  - `${id}: highlights are shown as written` (`texts` fixture: «A combinar» appears, never a counting box for it).
  - `${id}: the video's own texts are the ones shown` (`texts` fixture: corpus = the video texts; the image's replaced headline never appears).
  - `framework: pages arrive in A.pages and page() splits the act` (test recipe).
  - `framework: default intro and closing acts draw the person's lines`.
  - `framework: flip and page travels draw both acts` (test recipe with `travel: 'flip'` / `'page'`, colours like the existing travel test).
  - `framework: lengths() greys what cannot be filled`.
- [ ] **Step 3: Run** `node tools/test-browser.mjs run.html run-recipes.html` → FAIL (framework) and the five recipes FAIL on pages/highlights (expected until Tasks 6–10).
- [ ] **Step 4: Implement** the framework. Mark the five recipes' new shared checks as `READY_V2 = []` (a second list) so only framework tests must pass at the end of this task; Tasks 6–10 add each id.
- [ ] **Step 5: Run** → framework tests PASS; `READY` (old checks) still PASS for the five recipes at 6/10/15 s.

---

### Tasks 6–10: the five recipes with pages, highlights and 10–30 s

One task per recipe, in this order: **6 Tijolo, 7 Píxel, 8 Planta, 9 Apresentação, 10 Colagem**. Each:

**Files:** Modify `js/recipes/<id>.js`. Test: add `<id>` to `READY_V2`; the recipe's own cases in `recipes.case.js`.

**Interfaces:** Consumes Task 5 (`A.pages`, `RS.motionKit.page`, `P.label`, `c.highlights`). Produces the recipe working at every length.

**Rules for all five:** read texts only from `P.content` (no `P.project.texts`); M, D, L draw `page(A).items`; layouts are prepared per page in `prepare`; D draws each highlight (`count` counts up, else the value as written) and keeps its per-vacancy visual for the `vacancies` highlight when `count` is a number; the act's bespoke entry only on page 0; I and F use the framework defaults unless stated.

- [ ] **Step 1:** add `<id>` to `READY_V2` + the case below → **Run** `node tools/test-browser.mjs run-recipes.html` → FAIL.
- [ ] **Step 2:** implement. **Step 3: Run** → PASS; render `node drive.mjs appsheet <id> story 30` and `square 10` (scratch) and check them by eye.

Recipe-specific page moves and cases:
- **Tijolo** — page move: the next floor is built on top (crane up); highlights as boards on the scaffold. Case: `tijolo: twelve benefits build more floors, never off the frame`.
- **Píxel** — page move: the room scrolls (6 px steps). Case: `pixel: every page change keeps the 6 px grid`.
- **Planta** — continuous: pages are new stations along the dimension line (`P.st` grows per page). Case: `planta: the camera never stops for more than 0.5 s before the card at 30 s`.
- **Apresentação** — page move: slides glide (magic move per page). Case: `apresentacao: nothing is left on screen after it leaves, at 30 s`.
- **Colagem** — page move: push through the next tile (photo per page). Case: `colagem: every page lands on a photo (one photo and none too)`.

---

### Task 11: The seven styles at 10–30 s and the video texts

**Files:** Modify `js/motion.js` (STYLES durations, styles `prepare`, `lengths` for styles, poster). Test: `tests/browser/motion-styles.case.js`, `motion-minors.case.js`.

**Interfaces:** Consumes Task 3 `content` (all styles read it: no `project.texts` reads left in `prepare`). Produces: styles `durations [6,10,15,20,25,30]` (Curto `[6]`), `'auto'` = `TL.build` needs; style `max` = hook ×2 + benefit scenes ×1.5 + counter + wall + photo scenes + end at hold; poster: durations 10–30, `RS.engine.animState({ duration, style })` spread over the length, Textos note in the UI (Task 20).

- [ ] **Step 1: Write the failing tests**: `styles: 30 s gives more benefit and photo scenes than 15 s`; `styles: the video's texts reach the styles` (headline/cta changed in `video.texts` → boxes show them); `styles: «Cartaz animado» lasts the chosen 10–30 s`; `styles: lengths() for a style greys what cannot be filled`.
- [ ] **Step 2: Run** `run.html` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.

---

### Tasks 12–19: eight new models

One task per model, in this order: **12 Números, 13 Partidas, 14 Notificações, 15 Grua, 16 Contrato, 17 Crachá, 18 Fita métrica, 19 Esteira**. Each:

**Files:** Create `js/recipes/<id>.js` (+ script tags via the add script; extend `RS.model.RECIPES` in order: `tijolo, pixel, planta, apresentacao, colagem, numeros, partidas, notificacoes, grua, contrato, cracha, fita, esteira`). Test: add `<id>` to `READY` and `READY_V2`; its cases in `recipes.case.js`.

**Interfaces:** Consumes Tasks 3–5. Produces the registered model `<id>` with `def = { id, name, concept, font, palettes, bgModes, photos, travel, order?, labels?, colors?, prepare, acts: {H, I?, M, V, D, L, C, F?, K, O}, sound }`.

**Common:** the concept and camera language of spec §4 table; every act and page; card without a number = brand + contacts (no button/QR); `show.qr` false = no QR; O ends on H's first frame; own music (kick every beat, riser into K, hit per act change, its own signature sounds).

- [ ] **Step 1:** add the checks + cases → **Run** `run-recipes.html` → FAIL (not registered).
- [ ] **Step 2:** implement. **Step 3: Run** → PASS; contact sheets (story 15, story 30, square 10) checked by eye; one 30 s Story MP4.

Model values and cases:
- **12 Números** (`numeros`) — font `{ head: Anton 400, bold: Anton 400 }`; `palettes.dark { bg '#0B0B0B', ink '#FFFFFF', main '#FFC400', accent '#FFC400' }`; travel `crane`; `order ['D','M','V','L','C','F']`; labels `benefits: { 'pt-PT': 'vantagens', 'de-CH': 'Vorteile', 'de-DE': 'Vorteile', fr: 'avantages', it: 'vantaggi', en: 'benefits', es: 'ventajas' }`. Odometer: each digit is a reel (0–9 strip) rolling to its target with a 0.06 s stagger; a value without `count` rolls in as a whole word. Cases: `numeros: the highlights come right after the hook`; `numeros: «1 900,50 €» never rolls`.
- **13 Partidas** (`partidas`) — Barlow Condensed 700; `dark { bg '#0E0F12', ink '#F5F5F0', main '#FFD23F', accent '#FFD23F' }`; travel `flip`; labels `board` (PARTIDAS / ABFAHRT / ABFAHRT / DÉPARTS / PARTENZE / DEPARTURES / SALIDAS), `benefit` (VANTAGEM / VORTEIL / VORTEIL / AVANTAGE / VANTAGGIO / BENEFIT / VENTAJA), `role` (FUNÇÃO / FUNKTION / FUNKTION / POSTE / RUOLO / ROLE / PUESTO), `gate` (EMBARQUE / EINSTIEG / EINSTIEG / EMBARQUEMENT / IMBARCO / BOARDING / EMBARQUE), `pass` (CARTÃO DE EMBARQUE / BORDKARTE / BORDKARTE / CARTE D'EMBARQUEMENT / CARTA D'IMBARCO / BOARDING PASS / TARJETA DE EMBARQUE). Split-flap cells cycle through characters to the target (each cell 4–8 flips, staggered); the card is a boarding pass (perforation, number, pill, QR). Cases: `partidas: every flap stops on the text as written`; `partidas: a long benefit takes more rows, never cut`.
- **14 Notificações** (`notificacoes`) — DM Sans 700/500; `dark { bg '#10141C', ink '#FFFFFF', main '#FFFFFF', accent '#4DA3FF' }`; `photos: 1` (wallpaper = first photo darkened to 45%, else `bg`); travel `glide`; labels `clock` ('07:00' all), `now` (agora / jetzt / jetzt / maintenant / ora / now / ahora). Cases: `notificacoes: works without a photo`; `notificacoes: a notification never covers the clock in the Story zone`.
- **15 Grua** (`grua`) — Barlow Condensed 800/700; `light { bg '#CFE3F5', ink '#14202B', main '#F2B705', accent '#C4502E' }`, `dark { bg '#0E1A26', ink '#F2F4F7', main '#F2B705', accent '#E8A27A' }`; bgModes `['light','dark']`; travel `crane`; hook swing = damped pendulum settling ≤ 0.5 s. Cases: `grua: every page hangs inside the frame`; `grua: more benefits, more floors`.
- **16 Contrato** (`contrato`) — DM Serif Display 400 for everything; `light { bg '#F3EEE3', ink '#1B3A7A', main '#1B3A7A', accent '#C0392B' }`; travel `page`; labels `title` (CONTRATO DE TRABALHO / ARBEITSVERTRAG / ARBEITSVERTRAG / CONTRAT DE TRAVAIL / CONTRATTO DI LAVORO / EMPLOYMENT CONTRACT / CONTRATO DE TRABAJO), `signature` (Assinatura / Unterschrift / Unterschrift / Signature / Firma / Signature / Firma), `stamp` (CONTRATA-SE / WIR STELLEN EIN / WIR STELLEN EIN / ON RECRUTE / SI ASSUME / HIRING / SE CONTRATA). Ink writing = outlined strokes with dash offset then fill (as Planta's `drawnText`); ticks drawn as pen strokes. Cases: `contrato: every tick lands on its benefit's line`; `contrato: the stamp never covers the number or the QR`.
- **17 Crachá** (`cracha`) — DM Sans 700/500; `dark { bg '#16213A', ink '#FFFFFF', main '#FFFFFF', accent '#F25C05' }`; travel `flip`; labels `role` (FUNÇÃO / FUNKTION / FUNKTION / POSTE / RUOLO / ROLE / PUESTO); the badge photo spot is a helmet icon. Cases: `cracha: no face — the badge shows the helmet icon`; `cracha: both sides stay readable (text recorded only when facing)`.
- **18 Fita métrica** (`fita`) — Barlow Condensed 700; `light { bg '#F4F1EA', ink '#111111', main '#F7C600', accent '#111111' }`; travel `whip`; the salary highlight is the reading under a cursor (tape slides until the value's mark aligns). Case: `fita: the salary reading matches the highlight as written`.
- **19 Esteira** (`esteira`) — Anton 400; `dark { bg '#2B2F33', ink '#FFFFFF', main '#F25C05', accent '#F25C05' }`; travel `whip`; labels `stamp` (CONTRATADO / EINGESTELLT / EINGESTELLT / EMBAUCHÉ / ASSUNTO / HIRED / CONTRATADO). Case: `esteira: every box is stamped once and leaves the frame`.

---

### Task 20: The «Vídeo» panel in four tabs, «Textos do vídeo», lengths, «Converter em vídeo»

**Files:** Modify `js/app.js` (VideoPanel → `VideoTabs`, new `VideoTexts`, `VideoLengths`; Workspace bar button), `assets/app.css`. Test: `tests/browser/ui-video.case.js`, `ui-minor.case.js`.

**Interfaces:**
- Consumes: Tasks 2–5, 11 (`RS.model.mergeList`, `content`, `RS.motion.lengths`), Editor `setMode`.
- Produces: panel tabs `.video-tabs` (role tablist) «Modelo», «Textos», «Aspeto», «Som e fim» (state kept in Editor while open); «Textos»: language chips `.texts-locales`, blocks (Chamada, Título, Introdução, Vantagens, Destaques, Vagas, Conversa no WhatsApp, Contactos, Botão e dica, Frase final, Nome da empresa, Textos do modelo) with eye (`aria-pressed`), fields ids `vt-<key>` / list rows `vt-<list>-<id>`, «Repor da imagem» (`.vt-reset`) on edited fields/items, «Repor tudo da imagem»; «Duração»: seg `10 s … 30 s` + «Automática · N s», unavailable options `disabled` with `title` and a note `.length-note` («Escreva mais N vantagens ou destaques para chegar aos 30 s»); Workspace bar button «Converter em vídeo» (`.ws-convert`) → `setMode('video')`; «Cartaz animado» → Textos shows the note «O Cartaz animado mostra a imagem tal como está: mude os textos na imagem».
- [ ] **Step 1: Write the failing tests** (`ui-video.case.js`; keep the existing ones, moving their selectors to the tabs):
  - `video: the panel has four tabs and remembers the open one`.
  - `video: «Converter em vídeo» opens «Vídeo» with the image's texts` — the headline field equals the image headline.
  - `video: a text changed in «Textos» is saved for that language only and reaches the stage` — type in `#vt-headline` → `video.texts['pt-PT'].headline`, add `fr` locale chip edit → `texts.fr`, `RS.motion.prepare(saved).content.headline` matches.
  - `video: a highlight can be added («40 h» · «por semana») and an image item removed and brought back`.
  - `video: «Repor da imagem» brings the image's text back`.
  - `video: lengths that cannot be filled are greyed with how much to write`.
  - `video: «Automática» shows its length`.
  - `video: «Cartaz animado» says its texts come from the image`.
  - `video: the tabs work at 390 px (scrollable row, no overlap)` — set the editor to mobile width via `window.resizeTo`-equivalent CSS check: `.video-tabs` `scrollWidth >= clientWidth` and no horizontal page scroll.
- [ ] **Step 2: Run** `run-ui.html` → FAIL. **Step 3: Implement** (desktop + ≤860 px CSS). **Step 4: Run** all browser pages → PASS; screenshots with `.superpowers/receitas-video/ui-shot.mjs desktop|phone` checked by eye.

---

### Task 21: Documentation, package, final review

- [ ] **Step 1:** `LEIA-ME.md` «Vídeo para Reels e Stories» rewritten (tabs, Textos, lengths, the 13 models); the spec gets «Built and checked» with measured numbers (frame times, 30 s export times).
- [ ] **Step 2:** `node --test "tests/unit/*.test.cjs"` and `node tools/test-browser.mjs` → all PASS (report counts).
- [ ] **Step 3:** one fresh reviewer (most capable model) on the change (diff against `../web-publicar/recruitment-studio/` before rebuilding) with this plan's Review Focus; Critical/Important fixed test-first; minors ledgered.
- [ ] **Step 4:** `node tools/build-web.mjs`, then `"C:\Program Files\7-Zip\7z.exe" t ..\web-publicar\recruitment-studio-web.zip` → «Everything is Ok»; Step 2 again.
