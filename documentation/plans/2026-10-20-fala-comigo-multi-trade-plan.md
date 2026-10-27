# «Fala comigo» and several trades per ad — Implementation Plan (phase 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every ad can send candidates straight to the recruiter's WhatsApp with a pre-written, editable message (link, QR, poster pill, post text, «Mostrar QR»), and an ad can target several trades.

**Architecture:** A new pure module `js/contact.js` builds numbers, messages and `wa.me` links; `js/trades.js` learns singular trade nouns and multi-trade texts; `js/model.js` gains the new project fields and migrates old ads; the engine reads the link for the QR and draws a WhatsApp pill in the two contact helpers; the UI changes are in `js/app.js`. Phase 2 (motion videos) is a separate plan.

**Tech Stack:** classic browser scripts (no ES modules), Preact + htm (`window.htmPreact`), Canvas 2D engine, IndexedDB; tests with Node 22's built-in runner (`node:test`) and an Edge-headless browser runner.

**Spec:** `documentation/specs/2026-10-20-recruitment-studio-contacts-motion-design.md` (Parts A and A2).

All paths below are relative to `recruitment-studio-web/` unless they start with `documentation/`.

## Global Constraints

- Offline on `file://` (Edge on the PC) and as the installable web version; no CDN; classic scripts only; every new script listed in `index.html` and in the `CORE` list of `sw.js`.
- Ad languages: pt-PT, de-CH, de-DE, fr, it, en, es; de-CH and de-DE share German wording.
- Exact copy (pt-PT): «Mensagem que o candidato envia», «Repor», «Copiar link do WhatsApp», «Mostrar QR», «WhatsApp (recomendado)», CTA «Manda mensagem», hint «Aponta a câmara»; generated message "Olá! Vi o anúncio para {profissões} e tenho interesse."; with more than three trades "Olá! Vi o vosso anúncio de emprego e tenho interesse."; face-to-face message "Olá, falámos agora há pouco."
- No tag or code in any WhatsApp message, visible or hidden.
- No photo of the recruiter anywhere.
- Old ads (`.anuncio` files and IndexedDB) open and render exactly as before unless the person adds a number.
- App interface text in Portuguese; code and comments in English.
- No git commits (house rule: the owner commits); each task ends with a checkpoint instead.

## Review Focus

1. Numbers typed any way ("912 345 678", "+351912345678", "00351 912…", Swiss "079 123 45 67" with country 41) must give digits-only international numbers; a number that is too short gives no link (the QR falls back, the field shows a hint) — tests in Task 2.
2. Old ads with a link in the QR field keep showing that QR (mode «Link») and get no pill — test in Task 3.
3. Messages with accents, `&`, `?`, `#` and line breaks are encoded so WhatsApp shows them unchanged — test in Task 2.
4. A message the person edited stays when the trades change; only an empty (generated) message follows the trades; «Repor» empties it — tests in Tasks 2 and 3.
5. Adding a language to a multi-trade ad translates the merged positions of every trade and keeps the person's own texts — test in Task 1.

---

### Task 1: Test runners + multi-trade texts in `trades.js`

**Files:**
- Create: `tests/load.cjs`, `tests/unit/trades.test.cjs`, `tests/browser/run.html`, `tests/browser/harness.js`, `tools/test-browser.mjs`
- Modify: `js/trades.js`

**Interfaces:**
- Produces: `node --test "tests/unit/*.test.cjs"` (unit) and `node tools/test-browser.mjs` (browser; exit code 0 when all pass, prints `PASS`/`FAIL name: reason`).
- Produces: `tests/load.cjs` → `module.exports = (...files) => RS` (sets `global.window = global`, keeps one `global.RS`, `require`s `js/<file>` in order).
- Produces: `tests/browser/harness.js` → globals `test(name, async fn)`, `assert(cond, msg)`, `assertEqual(a, b, msg)`; runs after `window.onload`, sets `window.__results = [{ name, ok, error }]` and `window.__testsDone = true`. `run.html` loads the vendor scripts, the app scripts in `index.html` order (not `app.js`), the harness, then every `tests/browser/*.case.js` listed in it.
- Produces in `RS.trades`:
  - `nouns(tradeIds: string[], locale: string): string[]` — singular, as used inside a sentence (pt "pedreiro", de "Maurer", fr "maçon", it "muratore", en "bricklayer", es "albañil"), for all 15 trades in pt/de/fr/it/en/es.
  - `textsFor(tradeIds: string[], locale: string): Texts` — `texts()` of the first trade, with the positions of every listed trade appended without duplicates (same text) and keyed `pos:<tradeId>:<index>`.
  - `translate(src, tradeIds: string | string[], from, to)` — as today, also translating positions keyed `pos:<tradeId>:<i>` (old `pos<i>` keys keep meaning "position i of the first trade").
  - `hashtagsFor(tradeIds: string[], locale: string): string` — the language's general tags once, then each trade's tag, no repeats.
  - `texts(id, locale)` and `hashtags(id, locale)` stay as wrappers of the list versions.

- [ ] **Step 1: Write the runners and the failing unit tests** in `tests/unit/trades.test.cjs`:
  - `nouns(['pedreiro','servente'], 'pt-PT')` deep-equals `['pedreiro', 'servente']`; `nouns(['pedreiro'], 'de-CH')` → `['Maurer']`; every trade in `RS.trades.list` has a non-empty noun in pt, de, fr, it, en, es.
  - `textsFor(['pedreiro','servente'], 'pt-PT').positions.map(p => p.text)` contains "Pedreiro com experiência" and "Ajudante de pedreiro" and has "Servente de obra" only once; `headline` equals `texts('pedreiro','pt-PT').headline`; keys start with `pos:pedreiro:` / `pos:servente:`.
  - `translate(textsFor(['pedreiro','servente'],'pt-PT'), ['pedreiro','servente'], 'pt-PT', 'de-CH').positions` contains "Maurerhilfe"; a position whose text the person changed stays as written.
  - `hashtagsFor(['pedreiro','servente'],'pt-PT')` contains `#pedreiro` and `#servente` and `#emprego` exactly once.
- [ ] **Step 2: Run** `node --test "tests/unit/*.test.cjs"` — expected: FAIL (`nouns is not a function`).
- [ ] **Step 3: Implement** the four functions in `js/trades.js` (a `NOUN` table per trade id; positions merge keeps the first trade's order).
- [ ] **Step 4: Run** the unit tests — expected: all PASS. Run `node tools/test-browser.mjs` with an empty case list — expected: `0 passed, 0 failed`, exit 0.
- [ ] **Step 5: Checkpoint:** `node --check js/trades.js`; both runners green.

### Task 2: `js/contact.js` — numbers, messages, links

**Files:**
- Create: `js/contact.js`, `tests/unit/contact.test.cjs`
- Modify: `js/model.js` (STOCK only), `index.html`, `sw.js`

**Interfaces:**
- Consumes: `RS.trades.nouns`, `RS.model.STOCK`.
- Produces `RS.contact`:
  - `COUNTRIES: { code: string, label: string }[]` — 351 Portugal, 41 Suíça, 49 Alemanha, 33 França, 352 Luxemburgo, 34 Espanha, 39 Itália, 44 Reino Unido (Portugal first).
  - `digits(country: string, number: string): string | null` — international digits without "+"; `+…`/`00…` input is taken as already international; otherwise one leading `0` is dropped (not for 39) and the country code is prefixed; `null` when the result has fewer than 8 or more than 15 digits.
  - `display(country: string, number: string): string` — "+351 912 345 678" style (country code, then the national digits in groups of three); `''` when `digits` is null.
  - `waLink(digits: string, message: string): string` — `https://wa.me/<digits>` plus `?text=<encodeURIComponent(message)>` when the message is not empty.
  - `defaultMessage(tradeIds: string[], locale: string, template?: string): string` — 1–3 trades: `template || STOCK.waMsg[locale]` with `{profissões}` replaced by the nouns joined with the language's "e/und/et/e/and/y"; 0 or more than 3 trades: `STOCK.waMsgAny[locale]`.
  - `adMessage(project, locale): string` — `project.texts[locale].waMessage` when not empty, else `defaultMessage(project.trades, locale, (project.waTemplates || {})[locale])`.
  - `adLink(project, locale): string | null` — `waLink(digits(...), adMessage(...))`, or `null` without a valid `project.whatsapp`.
  - `meetLink(country, number, locale): string | null` — link with `STOCK.waMeet[locale]`.
- Produces in `RS.model.STOCK` (7 locales each): `waMsg`, `waMsgAny`, `waMeet`, `waCta`, `scanHint`, `waCaption` (pt: "Fala comigo no WhatsApp").

- [ ] **Step 1: Write the failing tests** in `tests/unit/contact.test.cjs`:
  - `digits('351','912 345 678')` → `'351912345678'`; `digits('351','+351 912345678')` → same; `digits('351','00351912345678')` → same; `digits('41','079 123 45 67')` → `'41791234567'`; `digits('39','06 1234 5678')` → `'390612345678'`; `digits('351','12')` → `null`.
  - `display('351','912345678')` → `'+351 912 345 678'`.
  - `waLink('351912345678','Olá & bem-vindo? #1\nok')` → `'https://wa.me/351912345678?text=Ol%C3%A1%20%26%20bem-vindo%3F%20%231%0Aok'`; with `''` → no `?text`.
  - `defaultMessage(['pedreiro','servente'],'pt-PT')` → `'Olá! Vi o anúncio para pedreiro e servente e tenho interesse.'`; four trades → `'Olá! Vi o vosso anúncio de emprego e tenho interesse.'`; de-CH with one trade names "Maurer".
  - `adMessage` returns the custom `waMessage` when set, and the generated one (following `trades`) when it is `''`.
  - The message never contains the ad id, the format or a language code.
- [ ] **Step 2: Run** the unit tests — expected: FAIL (module missing).
- [ ] **Step 3: Implement** `js/contact.js` and the STOCK entries; add `<script src="js/contact.js">` after `js/model.js` in `index.html` and `'./js/contact.js'` to `CORE` in `sw.js`; add it to `tests/browser/run.html`.
- [ ] **Step 4: Run** unit tests — expected: PASS.
- [ ] **Step 5: Checkpoint:** `node --check js/contact.js js/model.js`; both runners green.

### Task 3: Project fields, migration and post text (`js/model.js`)

**Files:**
- Modify: `js/model.js`
- Create: `tests/unit/model.test.cjs`

**Interfaces:**
- Consumes: `RS.trades.textsFor`, `RS.trades.hashtagsFor`, `RS.contact.adLink`, `RS.contact.display`.
- Produces on every project (new and normalised):
  - `trades: string[]` (main first) and `trade` = `trades[0] || null` (kept for older code).
  - `whatsapp: { country: string, number: string } | null`.
  - `waTemplates: { [locale]: string }` (copied from the brand; may be `{}`).
  - `qrMode: 'whatsapp' | 'link'` — normalise: `'link'` when any locale has a non-empty `qr`, else `'whatsapp'`.
  - `show.waCta: boolean` (default `true`; only drawn when a valid number exists).
  - `texts[locale].waMessage: string` (default `''`).
- Produces: `newProject(template, { format, trades })` (still accepts `trade`); `setTrades(project, ids): project` (sets `trades` and `trade`, texts untouched); `addLocale` translates with `project.trades`; `caption(project, locale)` adds, when a number exists, a line `💬 <waCaption>: <adLink>` and `📞 <display>` before the hashtags, and uses `hashtagsFor(project.trades, locale)`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/model.test.cjs`:
  - an old project object with `trade: 'pintor'`, no `trades`, no `whatsapp` and `texts['pt-PT'].qr = 'https://x.pt'` normalises to `trades ['pintor']`, `qrMode 'link'`, `whatsapp null`, `waMessage ''` in every locale.
  - `newProject(tpl, { trades: ['pedreiro','servente'] })` has both trades, `trade 'pedreiro'` and merged positions.
  - `caption` of a project with `whatsapp { country: '351', number: '912345678' }` contains `https://wa.me/351912345678?text=` and `+351 912 345 678`; without a number it contains no `wa.me`.
  - after `setTrades(p, ['ferro'])`, a project whose `waMessage` is `''` gives an `adMessage` naming "armador de ferro"; one with a custom message keeps it.
- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement** in `js/model.js`.
- [ ] **Step 4: Run** — expected: PASS (all unit files).
- [ ] **Step 5: Checkpoint:** both runners green.

### Task 4: Engine — QR from the link and the WhatsApp pill

**Files:**
- Modify: `js/engine.js` (`qrText`, `MAKERS.contacts`, `contactsRow`), `tools/build-assets.mjs` (icon `message-circle` in `APP_ICONS` and in `POSTER_ICONS` as `['message-circle', 'WhatsApp', 'mensagem whatsapp']`); regenerate `js/icons.js` with the unpacked packages.
- Create: `tests/browser/engine-contact.case.js`

**Interfaces:**
- Consumes: `RS.contact.adLink`, `RS.contact.display`, `RS.model.STOCK.waCta`.
- Produces: `qrText(R)` returns `adLink(project, locale)` when `qrMode === 'whatsapp'` and a link exists, else the old behaviour; exported as `RS.engine.qrText`.
- Produces: when `show.waCta !== false` and the ad has a valid number, the contacts block (stack) and the contacts row (footer bands) draw, first, a green pill (`#25D366`, dark text) with the `message-circle` icon, `STOCK.waCta[locale]` and `display(...)`, hit key `contact:wa`; with the video `anim`, it enters with the contacts (`TL.contacts`).

- [ ] **Step 1: Write the failing browser cases:** for all 12 templates × 3 formats, with a number: `render` does not throw and `regions` contain `contact:wa`; without a number: no `contact:wa` and the image is pixel-identical to rendering the same project with `show.waCta = false`; `RS.engine.qrText` of a WhatsApp-mode ad equals `RS.contact.adLink(...)`.
- [ ] **Step 2: Run** `node tools/test-browser.mjs` — expected: FAIL.
- [ ] **Step 3: Implement** the engine changes and regenerate the icons (`node tools/build-assets.mjs <unpacked packages>`; only `js/icons.js` may change).
- [ ] **Step 4: Run** both runners — expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 5: Editor and gallery — trades, number, message, QR mode, brand

**Files:**
- Modify: `js/app.js` (`TradeChips` → `TradePicker`, `Gallery`, `App.create`, `TextPanel`, `PhotoLibrary`, `StylePanel` «A minha marca», `applyBrand`, `focusField`), `assets/app.css`
- Create: `tests/browser/ui-contact.case.js`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces UI:
  - `TradePicker({ value: string[], onChange(ids: string[]), withTemplate?: boolean })` — multi-select chips; the first chosen is marked «principal»; used in the gallery (texts of new ads via `newProject({ trades })`) and at the top of Texto («Profissões do anúncio», with «Usar os textos prontos destas profissões», confirm dialog, keeps contacts, `qr`, `waMessage`).
  - Texto › Contactos: «O seu WhatsApp» (country select from `COUNTRIES` + number), hint when `digits` is null; «Mensagem que o candidato envia» textarea for the current language, filled with `adMessage`, editing writes `waMessage`, «Repor» sets `''`; QR mode seg «WhatsApp (recomendado)» / «Link» (the link field shows only in «Link»); switch «Botão WhatsApp no anúncio» (`show.waCta`).
  - «A minha marca»: number (country + number) and «Mensagem por omissão» for pt-PT (token `{profissões}` explained in a hint); `saveBrand` stores `brand.whatsapp` and `brand.waTemplates`; `applyBrand` copies both into the project.
  - Gallery: `onCreate(template, format, useBrand, trades: string[], photoId)`; `App.create` passes `trades`.
  - Photo library: a first category «Deste anúncio» with the library photos of all `project.trades` (selected by default when any exist), then the existing categories.
  - Clicking the pill on the poster (`contact:wa`) focuses the number field.
- [ ] **Step 1: Write the failing browser cases** (mount `App` in a test container, drive it with DOM events): choosing two trades in the gallery creates an ad with both; «Deste anúncio» in Imagens lists photos of both trades; typing a number makes the pill appear in the preview's regions; editing the message changes `adLink`; «Repor» brings back the generated text; an old-ad fixture with a QR link shows «Link» selected.
- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both runners — expected: PASS; open `index.html` in Edge and check the console is clean.
- [ ] **Step 5: Checkpoint.**

### Task 6: «Mostrar QR», «Copiar link do WhatsApp», docs and package

**Files:**
- Modify: `js/app.js` (`MeetQR` overlay, `Home` header button, editor top bar button, `ExportDialog` caption section), `assets/app.css`, `LEIA-ME.md`, `documentation/specs/2026-10-20-recruitment-studio-contacts-motion-design.md` (a "Built and checked" section for Part A)
- Create: `tests/browser/ui-meet.case.js`

**Interfaces:**
- Produces: `MeetQR({ country, number, onClose })` — full-screen, white tile QR of `meetLink(country, number, locale)` with language chips for the 7 locales (default pt-PT), «Aponta a câmara» under it in that language, Escape/close button; without a number it shows the number fields instead of a QR. Home: button «Mostrar QR» (uses the brand's number); editor top bar: the same (uses the ad's number).
- Produces: export dialog caption section button «Copiar link do WhatsApp» (copies `adLink` for the caption's language; toast on success; hidden without a number).
- [ ] **Step 1: Write the failing browser cases:** «Mostrar QR» with a brand number renders a QR whose text equals `meetLink(...)`; switching the chip to de-CH changes the message; without a number the fields show; «Copiar link do WhatsApp» calls `navigator.clipboard.writeText` with `adLink` (stub the clipboard).
- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement**; update `LEIA-ME.md` (how to set the number, edit the message, use «Mostrar QR», several trades) and the spec's "Built and checked" section.
- [ ] **Step 4: Run** both runners — expected: PASS; `node tools/build-web.mjs` builds the package (new cache name) and its ZIP tests clean with 7-Zip.
- [ ] **Step 5: Checkpoint** — the owner's manual acceptance (spec, Part A) follows; do not claim it.
