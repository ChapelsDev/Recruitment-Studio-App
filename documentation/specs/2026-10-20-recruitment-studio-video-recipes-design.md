# Recruitment Studio: video recipes and the video editor (design)

Date: 2026-10-20. Status: **decided by the owner on 2026-10-20** (all five
example recipes chosen; the customisation set accepted as proposed; still no
timeline editor). Builds on
`2026-10-20-recruitment-studio-contacts-motion-design.md` (Part B, the seven
motion styles) and the examples in `.superpowers/receitas-video/` (scratch:
`saida/escolher.html` holds the five 15 s Story MP4s, their storyboards and
contact sheets; `kit.js` and `r-*.js` are the reference code).

## Intent and why

The motion styles made the videos move, but every style is the same structure
in another look. The owner wants **video recipes**: each one a different
structure built around one idea, made the way a motion designer would (one
concept, every shot born from the previous one, a beat to everything), and he
wants to shape the video **in the editor**, seeing it move, not in the export
dialog.

## Goals

### 1. Video editing moves into the editor

- A switch **«Imagem | Vídeo»** in the editor's top bar, as in the export
  dialog. «Imagem» is today's editor.
- In **«Vídeo»** the panel holds every video setting (below) and the stage plays
  the video in a loop, in the chosen format (Story, Retrato, Quadrado), with
  «Ouvir» for its sound. Clicking the video pauses / resumes it.
- The texts still come from the ad: the video panel says so and has a button
  that goes back to «Imagem › Texto».
- **«Exportar imagem» becomes «Exportar»** (Ctrl+E too) and opens the dialog on
  the tab the editor shows (Imagem or Vídeo).
- The **export dialog keeps only**: the Imagem | Vídeo tabs, formats,
  languages, the file (PNG/JPG; MP4 for video), create / download / share /
  cancel with progress, a small preview, and the post text. Style, duration,
  colours, font, background and sound leave it; a link «Mudar o vídeo» closes
  the dialog and opens «Vídeo».
- «Ver animação» goes away: «Vídeo» replaces it.

### 2. Five video recipes (all chosen by the owner)

| Recipe | Concept (one line) | Camera language | Font | Colours |
|---|---|---|---|---|
| **Tijolo** | The brick becomes a word, the words become a building. | crane: up, down, in, out; fixed axonometric view from the 3D bar on | Barlow Condensed | cement, brick, WhatsApp green |
| **Píxel** | Every pixel is a brick: at the end the pixels form the QR. | console screen: fixed; a scene changes by scrolling the whole room | Barlow drawn in 6 px pixels | black, yellow, blue, green |
| **Planta** | One dimension line takes you from the title to WhatsApp, no cuts. | one continuous move along the line: slow drift at the stops, blurred whips between them | DM Sans | blueprint blue, yellow, green |
| **Apresentação** | One slide, one idea: the job presented like a launch. | still camera; every element glides from its place to the next (spring, no overshoot) | Montserrat | white, orange, green |
| **Colagem** | The ad's letters are windows onto the job site. | always forward (push through a letter, a face, a screen); one pull-out closes the loop | Anton | black, yellow, green + photos |

The seven current styles stay as they are, after the recipes in the gallery.

Every recipe follows the owner's direction: one concept; each shot born from
the previous one (no cuts, no fades); one font; at most three colours plus
black and white; one camera language; 120 BPM with something on every beat;
the last frame equals the first (loop); no particles, glows, flares, shake,
RGB split, crossfades, generic gradients, bouncy easing or holds over 0.5 s
(except the contact, which stays still as long as needed); spring and
exponential easing as functions of time; directional blur in proportion to
speed; sound with a kick on every beat, a riser into the last bar and a hit on
every scene change; frames drawn by `render(t)` with no state between frames;
export through the app's own pipeline (`RS.video.create` with `frame` and
`audio`).

### 3. Customisation: everything that matters, nothing that needs editing skills

In «Vídeo», in this order:

1. **Recipe / style**: a gallery where every card moves (recipes first, then
   the seven styles).
2. **Duration**: 6, 10 or 15 s.
3. **Colours**: the recipe's, the brand's (the ad's primary and accent) or a
   ready palette, plus «Cor de destaque». WhatsApp green is always kept for the
   button. Text keeps 4.5:1 contrast.
4. **Font**: the recipe's or one of the app's four.
5. **Background** light or dark where the recipe allows it (Tijolo,
   Apresentação; the styles as today).
6. **What goes in** (switches): which benefits (up to three, the person ticks
   them), salary and vacancies, the list of positions, the WhatsApp
   conversation, the QR. The logo and brand name follow the ad, as today.
7. **Photos**: the photos of the ad's trades (default) or photos the person
   picks (library and «As minhas», up to eight).
8. **Contact at the end**: still for about 2 s or about 4 s.
9. **Sound**: the app's music (each recipe has its own), the person's sound, or
   none; «Ouvir» on the stage.

Not offered: a timeline, per-scene timing, scene order.

## How a recipe is built (rules for the builder)

### Acts and the beat schedule

A recipe is a chain of **acts** in a fixed order: hook (H), shapes /
benefits (M), 2D→3D (V), data / salary and vacancies (D), list of positions
(L), conversation (C), card (K), loop back to the first frame (O). The beat is
0.5 s; a bar is four beats.

- H always opens (4 beats), O always closes (2 beats).
- K (the contact card) gets 4 beats with «2 s», 8 with «4 s» (capped by the
  duration).
- Every middle act gets **one bar (4 beats)**: equal time for each moment.
- An act is only there when its content is there and switched on (M needs a
  ticked benefit, D salary or vacancies, L two or more positions, C a WhatsApp
  number and the switch, V is always possible but a recipe may require M).
- When the middle acts do not fit, they are kept by priority **D, M, C, V, L**
  and played in the canonical order; beats left over go to K (a longer still
  contact). So with every field filled and «2 s»: 15 s = H M V D L C K O
  (30 beats), 10 s = H M D K O with K on 6 beats, 6 s = H K O with K on
  6 beats.
- What the video leaves out (benefits not shown, the list, the salary) is
  said in the panel, as today.

### Transitions

- Along the full 15 s chain each act enters from its predecessor with the
  recipe's own transformation (the examples): the bricks merge into slabs, the
  loading bar's pixels become the first icon, the camera follows the line, the
  orange bar becomes a card, the camera goes through a letter, and so on.
- When an act follows another one (shorter videos, missing content), the
  recipe uses its **travel move**, built from its camera language: Tijolo a
  crane move, Píxel a room scroll, Planta a whip along the line, Apresentação
  the outgoing elements glide off as the new ones glide in, Colagem a push into
  an opening onto the next photo. Never a cut, never a fade.
- An act that does not get its usual predecessor starts from its own clean
  state (e.g. the card builds its number, button and QR by itself when there
  was no conversation).

### Layout, text and formats

- Story first (Instagram covers the top 250 px and the bottom 280 px), and the
  same recipe in Retrato 4:5 and Quadrado 1:1: every layout is computed from
  the format's text zone, never from fixed Story coordinates.
- Only the ad's own words, as written, plus the functional labels («Manda
  mensagem», «Aponta a câmara», the salary period, the word for vacancies) and
  the brand name. No word is ever dropped or cut; long texts wrap smaller; no
  person's text is under 40 px at 1080 width.
- Accents above capitals and below the line (É, Õ, Ç) are never clipped.
- Every language of the ad (pt-PT, de-CH, de-DE, fr, it, en, es) gets its own
  video, as today.

### Sound

- Each recipe has its generated music (Tijolo: warm kick and brick clacks;
  Píxel: chiptune; Planta: deep kick and whooshes on the whips; Apresentação:
  clean clicks and soft chords; Colagem: claps and tape slaps). It follows the
  act schedule: kick on every beat, hit on every act change, riser into the
  card. Peaks never above −1 dBFS.
- The same events play live in the stage («Ouvir») and offline in the export.
- «Um som meu» and «Sem som» as today.

### Performance

- A 1080 × 1920 frame draws in well under 30 ms on this PC (measured as the
  export does: frame then `VideoFrame`), so a 15 s video is created in about
  15 s or less. The gallery cards draw small and skip the motion blur.

## Constraints

- Classic scripts (no ES modules on `file://`), no CDN, offline, everything in
  the app folder; interface in Portuguese, code and comments in English.
- No recruiter face, photo or voice.
- Old ads keep working: their `video` settings stay valid; new fields get
  defaults.
- TDD for production code; `node --test "tests/unit/*.test.cjs"` and
  `node tools/test-browser.mjs` stay green; the web package is rebuilt and its
  ZIP tested with 7-Zip.

## Data (builder's call)

`project.video` gains:

- `include: { benefits: [benefit item ids] | null, offer: true, positions:
  true, chat: true, qr: true }` — ids, so editing or reordering the benefits
  keeps the choice; `benefits: null` means "the first three".
- `hold: 2 | 4` (seconds of still contact; default 2).
- `photos: { mode: 'trades' | 'chosen', ids: [] }` — library ids or asset ids
  of «As minhas», up to eight.

`motion` accepts the five recipe ids (`tijolo`, `pixel`, `planta`,
`apresentacao`, `colagem`) next to the seven styles. The new-ad default stays
Néon, 15 s.

## Builder's calls (open to the owner's correction)

- The recipes are added to `RS.motion` as styles flagged `recipe`, so the
  gallery, the stage, the export and the sound use one path. Shared drawing
  helpers live in `js/motion-kit.js`; each recipe in its own file under
  `js/recipes/`.
- The switches in «O que entra» also apply to the seven styles where they make
  sense (benefits, salary and vacancies, positions, QR, contact hold, photos);
  «Conversa» only exists in the recipes.
- Default recipe settings: Tijolo light, Apresentação light; the others dark
  only.

## Acceptance

Manual, by the owner: in the editor, switch to «Vídeo», try the five recipes in
6, 10 and 15 s, in Story, Retrato and Quadrado, with the brand colours, another
font, two languages, some switches off, chosen photos, «4 s» at the end and
each sound option; export one Story and one 4:5 and post them; «Exportar» opens
on the tab in use.

## Built and checked (2026-10-21)

Built in `js/motion-kit.js`, `js/recipes/{tijolo,pixel,planta,apresentacao,colagem}.js`,
the recipe framework in `js/motion.js`, the act scheduler and the «O que entra»
switches in `js/motion-timeline.js`, the new `project.video` fields in
`js/model.js`, the recipe music in `js/sound.js` and the «Vídeo» mode in
`js/app.js` / `assets/app.css`. Plan: `documentation/plans/2026-10-20-video-recipes-plan.md`.

Checked automatically (unit 72/72, browser 156/156, after the final review's fixes):

- every recipe draws every act in Story, Retrato and Quadrado at 6, 10 and
  15 s, with a full ad and with a headline-only ad; the last frame equals the
  first (6, 10 and 15 s; with and without a number);
- Story texts stay inside 250 px / 280 px of the Instagram zones and are the
  ad's own words (plus the functional labels and the brand), also with a
  117-letter headline, a 45-letter word (in a benefit and as the whole headline), «1 900,50 €», «10+», «1.900 CHF» and
  «250» vacancies; Retrato and Quadrado texts stay inside the frame; no
  person's text under 40 px; contacts hidden in the ad stay out of the card;
- a kick on every beat and peaks ≤ −1 dBFS for each recipe's music;
- recipe-specific cases: one lit window per vacancy (Tijolo), accents kept on
  the 6 px grid and whole-pixel moves (Píxel), the camera never still for more
  than 0.5 s before the card (Planta), nothing left on screen after it leaves
  (Apresentação), one photo or none and the push-ins landing on the same photo
  (Colagem);
- the «Vídeo» mode: 12 cards with «Receitas» before «Estilos», the moving
  stage, pause on click, «Ouvir» restarting on a change, at most three
  benefits, «4 s», chosen photos, «Exportar» opening on the tab in use, the
  trimmed dialog with «Mudar o vídeo», MP4 with and without sound, cancel.

Measured on this PC (1080 × 1920, frame then `VideoFrame`, 90 frames over
15 s): average frame 2.3 ms (Tijolo), 4.3 ms (Píxel), 8.3 ms (Planta), 7.4 ms
(Apresentação), 7.1 ms (Colagem); single slow frames up to 27–130 ms while
sprites are built for the first time. A 15 s Story MP4 with the app's music is
created in 8.6 s (Tijolo), 8.1 s (Píxel), 16.3 s (Planta), 10.1 s
(Apresentação) and 11.2 s (Colagem); files of 1.7–16 MB.

Decisions taken while building (also in the plan's ledger): the benefits
ticked in one language take the same places in the other languages (each
language has its own items); the «Vídeo» stage has its own format, Story by
default; the rail also has «Vídeo»; picking a recipe sets its first background
(light for Tijolo and Apresentação); Planta's loop pulls out over the whole
sheet before diving back into the title; Apresentação falls back to whole
lines when a headline word cannot fit a line at 40 px; «Contacto no fim» and
«Código QR» also act on the seven styles; the panel shows only the settings
that act on the chosen recipe or style («Fotografias» only for Colagem and the
photo styles; «Cartaz animado» keeps duration, animation and sound), and
«Cor de destaque» colours Tijolo's bricks.
