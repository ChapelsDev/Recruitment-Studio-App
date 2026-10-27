# Recruitment Studio: video texts, 10–30 s videos and eight new models (design)

Date: 2026-10-21. Status: **described by the owner on 2026-10-21 (all six
proposed models + extras welcome; lengths the information cannot fill are
unavailable); document approved by the owner on 2026-10-21.** Builds on
`2026-10-20-recruitment-studio-video-recipes-design.md` (the five recipes, the
«Vídeo» mode, the recipe framework in `js/motion.js`, `js/motion-kit.js`,
`js/recipes/`) and its plan/ledger
(`documentation/plans/2026-10-20-video-recipes-plan.md`,
`Dev/.superpowers/sdd/2026-10-20-video-recipes-plan/progress.md`).

## Intent and why

The owner loves the recipes and wants the video side to become a complete
tool. In his words: everything written in the video must be **100%
customisable** («quero escrever o que me apetecer lá»), so he can make several
videos in several languages **with the texts of his choice**; he wants a model
that **puts the numbers first** (salary, benefits); videos must grow with the
information, **up to 30 seconds**; ideally **everything written on the image
goes into the video**, so he writes once on the image and then converts it
into any video model; and he wants **more models** — premium, captivating
motion graphics tied to the theme (construction work) — while keeping and
extending the current ones. The «Vídeo» UI must be well organised, premium,
easy, with every change visible live (as today).

Why it matters: the recruiter posts the same job in several languages and
platforms; today the video can only repeat a subset of the ad (≤3 benefits,
fixed labels, ≤15 s), so richer ads lose information and he cannot adapt the
wording to a video or a language.

## Goals

### 1. «Textos do vídeo»: every text is his, per language

- The video has **its own texts per language**. By default each field
  **follows the image** of that language: everything that is on the poster —
  kicker, headline, intro, badge, all benefits, the positions title and all
  positions, the salary and vacancies, the contacts, the brand name — plus the
  WhatsApp message (already editable in Texto › Contactos).
- He can **change any field** for the video only, without touching the image,
  and **add or remove lines** in the lists (benefits, highlights, positions,
  contacts).
- The fixed labels become editable too: the button («Manda mensagem»), the
  QR hint («Aponta a câmara»), and the labels of the numbers («por mês»,
  «vagas»). A new optional **closing line** (e.g. «Começa já na
  segunda-feira») can be written.
- **Highlights («Destaques»)**: a list of value + label pairs (e.g. «1900 €» ·
  «por mês», «12» · «vagas», «40 h» · «por semana»). They start from the ad's
  salary, vacancies and badge; he adds the numbers he wants. Values made of
  plain digits (optionally with a currency or unit) count up; anything else is
  shown exactly as written.
- Each block has the **eye** (show/hide in the video), like the poster editor:
  kicker, intro, benefits, highlights, positions, WhatsApp conversation,
  contacts, closing line. The QR switch moves to «Som e fim».
- A field he changed shows **«Repor da imagem»**; the tab has **«Repor tudo da
  imagem»** for that language.
- Each language is edited on its own (language chips at the top of the tab);
  the export makes one video per language with that language's texts (as
  today).
- The owner's earlier rule «the video shows only the ad's own words» is
  replaced by: **the video shows the texts of «Textos do vídeo»**, which start
  as the ad's words. The app still adds no slogans of its own.

### 2. From the image to the video

- A **«Converter em vídeo»** button on the image (in the preview bar of
  «Imagem») opens «Vídeo» with everything already there: since the video texts
  follow the image until changed, converting needs no copy step.

### 3. 10 to 30 seconds for every model, or «Automática»

- Every model (the five recipes, the eight new ones and the seven styles)
  offers **10, 15, 20, 25 and 30 s** and **«Automática»**. «Automática» is the
  default for new ads and gives the time the information needs, at the same
  rhythm, between 10 and 30 s; the chosen length is shown next to it
  («Automática · 22 s»). «Curto» keeps its 6 s; the recipes and styles that
  offer 6 s today keep it as an extra option.
- **A longer video shows more, not slower**: more benefits, all the
  highlights, the whole list of positions and the conversation each get their
  moment at the same pace (a bar of four beats, 2 s, per page of
  information).
- When the fixed length is longer than the information needs at the normal
  pace, the time goes, in this order, to: one benefit per page instead of
  three (more focus), one highlight per page, one position page per two
  positions, the model's own extra moment (its «showcase» act, one bar), then
  a longer contact (up to 4 s).
- **Lengths the information cannot fill are unavailable** (owner, 2026-10-21):
  in «Duração» they are greyed out with a note such as «Escreva mais 3
  vantagens ou destaques para chegar aos 30 s». A video is never stretched,
  slowed down or repeated. 10 s is always available (the showcase and the
  contact fill it). If an old ad's saved length cannot be filled any more, the
  video uses the longest length that can and the panel says so.
- When the information does not fit the chosen length, the panel says what is
  left out (as today) and suggests «Automática».

### 4. Eight new models (the owner chose all six proposed + two extra)

Same direction as the five recipes (one concept, each shot born from the
previous one, one font, ≤3 colours + black/white, one camera language, 120
BPM, last frame = first frame, no particles/glows/flares/shake/RGB
split/crossfades/generic gradients/bouncy easing, holds ≤0.5 s except the
contact, spring/expo easing, directional blur, kick every beat + riser into
the card + hit on every act change, Story safe zones, texts ≥40 px).

| Model | Concept (one line) | Camera language | Font | Colours |
|---|---|---|---|---|
| **Números** | Every number rolls like an odometer and takes the whole screen. | still; numbers roll vertically, digit by digit; the screen is a number counter | Anton | black, yellow, white + green |
| **Partidas** | An airport departures board: each line of the ad flips in letter by letter; boarding is WhatsApp. | fixed board; rows flip (split-flap); the board flips over between acts; the card is a boarding pass with the QR | Barlow Condensed | board black, flap yellow, white + green |
| **Notificações** | A phone lock screen at 07:00: each benefit arrives as a notification; WhatsApp's opens the chat. | the phone is the frame; notifications stack and slide; one push into the WhatsApp notification | DM Sans | dark wallpaper (a trade photo, darkened), white cards, green |
| **Grua** | A tower crane lowers every piece of information on its hook and sets it on the building. | vertical crane follow (up/down with the hook); fixed side view | Barlow Condensed | sky, crane yellow, dark ink + green |
| **Contrato** | A contract on a clipboard: benefits ticked in blue ink, a signature drawn, a stamp at the end. | top-down desk; slow push; page turns between acts | DM Serif Display | paper, blue ink, stamp red + green |
| **Crachá** | A site ID badge comes out of a printer, turns in 3D and shows the ad on its sides; the QR is on the badge. | the badge is the subject: 3D turns, flips, lanyard swing; printer slot opens/closes | DM Sans | navy, white, safety orange + green |
| **Fita métrica** | A tape measure unrolls across the screen; every piece of information is a mark; the salary is the measurement. | horizontal track following the tape; the tape retracts into its case at the end | Barlow Condensed | tape yellow, black ticks, white + green |
| **Esteira** | A conveyor belt carries boxes with the ad's words; a press stamps them; the last box opens into the contact. | fixed factory side view; the belt moves; boxes enter left and leave right | Anton | steel grey, safety orange, black + green |

Each new model uses the same acts (hook, benefits, showcase/2D→3D,
highlights, positions, conversation, card, loop), supports multi-page acts and
10–30 s, and has its own generated music. No recruiter face anywhere (the
badge shows a helmet icon, never a photo of a person).

### 5. The five recipes and seven styles last longer

- Tijolo, Píxel, Planta, Apresentação and Colagem show benefits, highlights
  and positions **in pages** (a bar each), with their own page-to-page move
  (e.g. Tijolo builds the next floor, Píxel scrolls the next room, Planta
  whips to the next sheet, Apresentação glides the next slide, Colagem pushes
  through the next tile). They show all the benefits, not only three.
- The seven styles accept 10–30 s and «Automática»; more time gives more
  benefit and photo scenes. They read the video texts too.
- **«Cartaz animado» stays «the image, animated»**: it shows the image as it
  is, so «Textos» shows a note («O Cartaz animado mostra a imagem tal como
  está: mude os textos na imagem») instead of the fields; its entrances spread
  over the length with a slow camera move, 10–30 s.

### 6. The «Vídeo» panel, organised

Four tabs at the top of the panel (state remembered while the editor is
open), every change shown live on the stage:

1. **Modelo** — the gallery (headings «Receitas», «Estilos»; 20 moving
   cards) and «Duração».
2. **Textos** — language chips; the blocks of goal 1 with eye, fields,
   lists, «Repor da imagem» and «Repor tudo da imagem»; the note on what is
   left out.
3. **Aspeto** — colours (model/brand/palette + «Cor de destaque»), letter,
   background, photos (only for models that use photos).
4. **Som e fim** — sound («Ouvir» stays on the stage), contact at the end
   (2 s / 4 s), QR on/off.

The look follows the current app (paper panel, orange signal colour, chips,
segmented controls). Desktop and ≤860 px both work; on the phone the tabs
are a scrollable row.

### 7. The five small fixes left from the last round

- With «Ouvir» on, switching «Som» to «Sem som» and back restarts the sound
  without a click: «Ouvir» resets when the sound is off.
- «Ouvir» keeps playing behind the export dialog: opening «Exportar» stops it.
- Typing the ad's name in «Vídeo» re-prepares the video on every keystroke:
  the preparation only follows what the video uses.
- The «left out» note forgot benefits beyond the third: with all benefits in
  the video now, it names whatever does not fit.
- Missing tests: a recipe in another language (German labels, «pro Monat»)
  and a recipe card with the QR switched off.

## Non-goals and anti-goals

- No timeline editor, no per-scene timing, no scene order (owner, 2026-10-20).
- Not a general video editor: the model decides the motion; he decides the
  words, colours, letter, photos, length and sound.
- Anti-goals: a video that loses information he wrote without saying so; a
  long video that is just slower; text under 40 px or cut; the recruiter's
  face, photo or voice; a cluttered panel.

## Constraints

- Classic scripts (no ES modules on `file://`), no CDN, offline, everything in
  the app folder; interface in Portuguese, code and comments in English.
- Old ads keep working: their video settings stay valid (missing new fields
  get defaults; `include` is migrated, see Data).
- TDD; `node --test "tests/unit/*.test.cjs"` and `node tools/test-browser.mjs`
  green; `tools/build-web.mjs` + 7-Zip test at the end; a fresh final review.
- A 1080×1920 frame draws in under 30 ms on this PC (as measured for the
  recipes); a 30 s export takes about twice a 15 s one.

## Data (builder's call, open to correction)

`project.video` gains / changes:

- `duration`: `6 | 10 | 15 | 20 | 25 | 30 | 'auto'` (new ads `'auto'`).
- `texts`: `{ [locale]: VideoTexts }` where every key is optional and an
  absent key **follows the image**:
  `kicker, headline, intro, positionsTitle, message, cta, hint, closing,
  brandName` (strings) and the lists `benefits, highlights, positions,
  contacts`.
- **Lists follow the image item by item** (so a salary changed on the image
  still reaches the video): each list is stored as
  `{ edits: { [imageItemId]: text | null }, added: [{ id, text, … }],
  order: [ids] | null }` — an image item that was not edited keeps following
  the image, an edited one shows «Repor da imagem», a removed one (`null`) can
  be brought back, added items are his. New image items appear in the video
  list automatically.
- **Highlights keep a role**: `{ id, role: 'salary' | 'vacancies' | 'badge' |
  'own', value, label }`. The image gives the `salary` (amount + period),
  `vacancies` (count + word) and `badge` items; he can edit them like any
  item; his additions are `own`. Models that draw something per vacancy
  (windows, dots, tiles, helmets) use the `vacancies` item when its value is a
  plain number; the «salary is the measurement» of Fita métrica and the lead
  number of Números use the `salary` item, else the first highlight.
- **Model labels**: words a model needs that the ad does not have (board
  headers in Partidas, «agora» and the clock in Notificações, the contract
  title and signature line in Contrato, the role label in Crachá, …) come
  translated in the seven languages and appear in «Textos» under «Textos do
  modelo» for that model, editable per language like everything else.
  `texts[locale].model[modelId][key]`.
- `show`: `{ kicker, intro, benefits, highlights, positions, chat, contacts,
  closing, qr }`. **Defaults follow the image's own eyes** (a block hidden on
  the image starts hidden in the video, and hiding the contacts on the image
  still removes the WhatsApp card from the video, as today); once he touches a
  video eye, the video's choice wins. `closing` starts off until he writes a
  closing line.
- `include` (2026-10-20) is migrated on load: `offer → show.highlights`,
  `positions → show.positions`, `chat → show.chat`, `qr → show.qr`; a ticked
  benefits list becomes `texts[locale].benefits` (the ticked items) for every
  language of the ad.
- `hold` and `photos` stay as they are.

The motion code reads texts **only** through the video content
(`RS.motionTimeline.content`), which resolves each field from `video.texts`
or the image and applies `show`.

## Acts and pages (builder's call)

- Beat 0.5 s, bar 4 beats. Hook H (1 bar; +1 bar for the intro when shown and
  time allows), card K (hold 2 s or 4 s), loop O (2 beats).
- Middle acts: M benefits (pages of up to 3, or 1 when spacious), V showcase
  (1 bar), D highlights (pages of up to 2, or 1 when spacious), L positions
  (pages of up to 5, or 2 when spacious), C conversation (1 bar), and F the
  **closing line** (1 bar of its own, right before the card, when written and
  shown — the card stays as it is).
- «Automática»: the sum of the pages the content needs at the normal pace,
  clamped to 10–30 s.
- Fixed length: first pages by the current priority (D, M, C, V, L, F), then
  further pages (M, D, L), then spacious pages, then V, then a longer K; what
  does not fit is reported. The longest fillable length is the same sum with
  every page spacious, V and K at 4 s.
- A model may declare its own act order (`def.order`): **Números plays the
  highlights first** (the biggest number is the hook's second bar, the others
  follow before the benefits, shown as a count — «6 vantagens» — with each
  benefit under it); all other models keep the shared order.
- Acts receive their pages (`A.pages`, the items of each page) and draw each
  page change with their own move.

## Builder's calls (open to the owner's correction)

- Two extra models (Fita métrica, Esteira) added to the six he chose, as he
  invited («se puderes mais alguns»); they come last in the plan.
- «Automática» is the default for new ads; old ads keep their length.
- 6 s stays where it exists (Curto only 6 s).
- The QR switch lives in «Som e fim»; the conversation's eye in «Textos».
- Fonts are the app's bundled fonts; no new font files.
- Models are built straight into the app (no separate examples step); contact
  sheets and MP4s of every model are shown at the end.
- Video lists follow the image item by item; highlights keep a role; model
  labels are translated and editable; the video's eyes start from the image's;
  Números plays the numbers first; «Cartaz animado» stays the image animated;
  the closing line has its own bar before the card (all in Data / Acts above,
  settled after the builder check of 2026-10-21).

## Built and checked (2026-10-21)

Built in `js/model.js` (`video.duration` 'auto' | 6–30, `video.show`,
`video.texts` per language with lists that follow the image item by item,
migration of `include`), `js/motion-timeline.js` (`imageTexts()`, `content()`
reading «Textos do vídeo», highlights with roles, `schedule()` in pages of 2 s,
`range()` for the styles), `js/motion.js` (lengths for every model, styles and
«Cartaz animado» up to 30 s with a slow push-in, `leftOut()` naming every
block left out), `js/motion-kit.js` (`cardLayout` / `cardDraw`, the shared
contact card), the five recipes in pages, eight new recipes in
`js/recipes/{numeros,partidas,notificacoes,grua,contrato,cracha,fita,esteira}.js`,
and the «Vídeo» panel in four tabs in `js/app.js` / `assets/app.css`.
Plan: `documentation/plans/2026-10-21-video-texts-durations-models-plan.md`.

Checked automatically (unit 95/95, browser 434/434, after the final review's
fixes and the ten small fixes):

- every recipe draws every act in Story, Retrato and Quadrado at 10, 20 and
  30 s and at «Automática», with a full ad, a headline-only ad and a very long
  ad (12 benefits, 6 highlights, 10 positions); the last frame equals the
  first; Story texts stay inside the Instagram zones, Retrato and Quadrado
  inside the frame; no text under 40 px; the texts on screen are the video's
  texts (the image's until changed, plus the model's own words);
- highlights that are not plain numbers («A combinar», «1 900,50 €», «10+»,
  a label alone) are shown exactly as written and never counted;
- a longer video shows more, never slower: pages of 2 s, one benefit per page
  when time is left; lengths the information cannot fill are reported with how
  much is missing; 10 s is always possible;
- per model: Números rolls every digit to the value; Partidas never splits a
  word across rows unless even the smallest flaps cannot hold it; Notificações
  fits five positions under the clock in Quadrado; Grua's floors count only
  when set and inside the zone; Contrato's ticks sit on their clauses and the
  stamp never covers the number or the QR; Crachá's texts count only when the
  side faces us and the swing has settled; Fita métrica reads the salary under
  the cursor; Esteira stamps every box once and every box leaves the frame;
- the «Vídeo» panel: four tabs remembered while the editor is open and moved
  with the arrow keys; «Converter em vídeo» opens it with the image's texts;
  a text changed in «Textos» is kept for that language only and reaches the
  stage; a highlight «40 h · por semana» added; an image benefit taken out and
  brought back; «Repor da imagem» and «Repor tudo da imagem»; unfillable
  lengths greyed with how much to write; «Automática · N s»; the note on what
  is left out names benefits, highlights, positions, the intro, the
  conversation and the closing line, and at 30 s asks for fewer lines; the
  seven styles offer only the blocks they show; «Cartaz animado» says its
  texts come from the image; the tabs scroll without overlap at 390 px; the
  panel speaks Portuguese.

Measured on this PC (1080 × 1920, frame then `VideoFrame`, 120 frames over
30 s, full ad): average frame 1.4–7.4 ms for the 13 recipes (Tijolo 1.7, Píxel
2.5, Planta 5.3, Apresentação 3.2, Colagem 6.7, Números 3.6, Partidas 3.9,
Notificações 1.8, Grua 4.7, Contrato 7.4, Crachá 3.9, Fita métrica 1.4,
Esteira 4.9 ms); single slow frames up to 155 ms (Píxel) while sprites are
built for the first time. A 30 s Story MP4 with the app's music is created in
16.4–21.2 s (Números 21.2, Partidas 16.9, Notificações 21.2, Grua 21.0,
Contrato 17.4, Crachá 17.4, Fita métrica 19.9, Esteira 16.4 s); files of
8.9–31.7 MB (Notificações carries a photo), all exactly 30.0 s, H.264 + AAC.

Small fixes the same day (the review's ten minors, owner: «podes corrigir já
as pequenas falhas»), each with a test that failed first: the note on a length
the texts no longer fill says it once; a style asks for benefits only and
counts them from its true longest length (1.5 s each); edits of image items
that are gone are dropped (on load, after «Usar os textos prontos» and on every
change), so «Repor tudo da imagem» never stays on for nothing; the gallery no
longer redraws while the ad's name is typed; a style's lengths use the stage's
photos; «Duração» names each other language that cannot fill the chosen length
and how much to write there; only the open tab points at its panel; a text
left blank says what that does in the video; «Cartaz animado»'s push-in grows
about the point that lets the texts expand into their free room, at most 6 %,
so no text leaves the Story zones or the frame (a Story poster that fills its
zones keeps still; its photo still drifts).

Decisions taken while building are in the plan's ledger
(`Dev/.superpowers/sdd/2026-10-21-video-texts-durations-models-plan/progress.md`,
lines with «Ruling:»).

## Acceptance

Manual, by the owner: write a full ad on the image, press «Converter em
vídeo», change texts in two languages (including the button and a highlight
like «40 h · por semana»), try every model at 10, 20 and 30 s and
«Automática», in Story, Retrato and Quadrado; export one Story per language
and post it.
