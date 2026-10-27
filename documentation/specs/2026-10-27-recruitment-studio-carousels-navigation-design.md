# Recruitment Studio: carousels as a first-class piece, and a simpler navigation (design)

Date: 2026-10-27. Status: **direction chosen by the owner on 2026-10-27; this
document is waiting for the owner's approval.** Builds on the Codex round of
2026-10-26 (`Dev/RS-codex/`, notes in
`Dev/RS-codex/entregas/2026-10-26-final/IMPLEMENTACAO.md`), on the video
recipes (`2026-10-20-recruitment-studio-video-recipes-design.md`,
`2026-10-21-recruitment-studio-video-texts-durations-models-design.md`) and on
the analysis page `.superpowers/proposta-2026-10-27/proposta.html` (problems
observed in the running app, platform limits, wireframes).

## Intent and why

The owner had Codex add a set of improvements, among them carousels. In the
owner's words, the carousels are «abaixo do nível» of the image and video ads,
the place where they live is wrong, and the app «está a ficar confusa». The
owner wants:

- carousels as a **first-class format**, static and animated, for social
  networks, with **several styles that differ in composition and visual
  language, not only colour**, a consistent identity across slides, per-slide
  adjustments, a real preview and the right export per network;
- a clear place to **start each format, find and edit it, and adapt one ad
  into another format**;
- an interface that is **minimal on the surface and complete in depth**: few
  menus and actions with clear names, essentials at hand, advanced options
  revealed in context, no duplication, a clear path create → edit → preview →
  save → export. «Depth» does not mean more submenu levels.

What was observed in the Codex copy (2026-10-27, running app, see the analysis
page): the carousel is reached through Exportar → «Carrosséis e campanha
completa» → a second dialog → «Personalizar páginas» → one accordion per slide;
the six art directions change only the cover (slides 2–7 are near-identical
text cards in all six); the slides ignore what makes the ads work (benefit
icons, salary/vacancies as highlights, the green WhatsApp button, the chat,
trade photos); «Personalizar páginas» bakes the automatic line breaks into the
text; only PNG 4:5/1:1. Navigation: every editor panel starts with 2–6
management buttons; on a 360 px phone the home shows no ad above the fold with
only two ads; three ways to reach the video; the export dialog does four jobs;
a 7-item phone bar with the app's settings next to the ad's sections.

The experiment that sets the direction: the video recipes, frozen near the end
of each act at 4:5, already give strong and truly different slides (Tijolo puts
«1900 € · 12 vagas» on a building, Contrato is a clipboard, Notificações a lock
screen, Planta a blueprint). The carousel should be built from them.

## Decisions taken by the owner (2026-10-27)

1. **Carousel styles come from the video recipes** (each recipe gets a
   «slide mode»), plus a cover option made from the ad's own poster. The six
   Codex art directions are retired; the Codex trade drawings
   (`js/carousel-art.js`) stay as illustrations for slides without a photo
   where a style needs one.
2. **Carousel and navigation are done in the same round.** The animated
   carousel comes in the next round (see Non-goals).
3. **The Codex copy becomes the main version of the app** (see Goal 1).

## Goals

### 1. One trunk: the Codex copy becomes `recruitment-studio-web/`

- `Recruitment-Studio-Windows-candidata-20261015/recruitment-studio-web/`
  (the version of 2026-10-23) is kept, renamed into
  `Recruitment-Studio-Windows-candidata-20261015/Versões Anteriores/recruitment-studio-web-2026-10-23/`.
- `Dev/RS-codex/recruitment-studio-web/` is copied into its place (with its
  `node_modules`, needed by `npm test`). `Dev/RS-codex/` and
  `Recruitment-Studio-Windows-candidata-20261015/RS-codex/` (identical copies)
  are left untouched.
- `web-publicar/recruitment-studio/` (the folder the owner serves over
  Tailscale) is only rebuilt at the end of the round, after the review, as in
  earlier rounds.
- Everything the Codex round added is kept unless this document says
  otherwise. The Codex choice to hide «Planear publicação» and «Textos
  guardados» from the interface stays (a test pins it; their saved data
  survives); the manual and `LEIA-ME.md`, which still describe them, are
  corrected.

### 2. One ad, three pieces: Imagem · Carrossel · Vídeo

- The **ad** is the offer: texts per language, offer sheet, trades, contacts,
  photos, brand. **Imagem, Carrossel and Vídeo are three pieces made from the
  same ad**, each with its own style.
- A three-way switch **Imagem | Carrossel | Vídeo** in the editor's top bar is
  the only way to change piece. «Converter em vídeo» and the rail's «Vídeo»
  tab disappear; the export dialog no longer switches piece (it exports the
  piece on screen; the full campaign package covers several pieces).
- Editing the ad's content (offer, contacts) never leaves the current piece:
  the preview keeps showing the carousel or the video while the person types.
- The carousel's and the video's texts **follow the ad until changed**, per
  language («Só no carrossel» / «Só no vídeo», «Repor do anúncio»), exactly as
  «Textos do vídeo» already works (`project.video.texts`,
  `RS.motionTimeline.content`). There is no copy per language to go stale and
  no «dados antigos» warning.

### 3. The carousel piece

**Sequence.** A carousel is an ordered list of **blocks**, each giving one or
more slides:

| Block | Act | Slides |
|---|---|---|
| Capa | H | 1 (the style's hook, or the ad's poster — see Cover) |
| Oferta | D | 1 (salary, vacancies, location, start date, badge, own highlights) |
| Introdução | I | 1 (the intro line) |
| Vantagens | M | one per page of the style (the style's page size, 2–3 items), with the ad's icons |
| Vagas | L | one per page |
| Fotografia | V | 1, only in styles that use photos |
| Conversa | C | 1 (the WhatsApp message being sent), when there is a WhatsApp number |
| Frase final | F | 1, when the person wrote a closing line |
| Contacto | K | 1 (number, green «Manda mensagem» button, QR if on) |
| Diapositivo de texto | I renderer | 1 per extra slide the person adds |

- The default order is the style's own act order (so consecutive slides keep
  the style's continuity); the loop-back act (O) is never a slide.
- Order and hidden blocks are shared by all languages; texts are per language,
  so a long language may have one benefit page more than another.
- A carousel never has more than 20 slides (Instagram's limit); when the
  content would need more, the panel says what does not fit instead of
  dropping it silently.

**Slide mode.** Each slide is the recipe's own drawing of that act (and page)
in its **settled** state: every item of the page visible, no motion blur, no
half-finished counter, no travel move. Where the settled frame of the video is
not a good slide (mid-flight photo act, counters, partial reveals), the recipe
gets its own slide drawing for that act. Text on a slide is never cut, never
ellipsised, and never smaller than the existing legibility warning (26 px at
1080 px width) — the target is clearly larger, since slides are read at feed
size; text that does not fit moves to another page.

**Styles in this round.** Six recipes get a slide mode: **Tijolo, Números,
Contrato, Notificações, Planta, Apresentação**. The other seven recipes
(Píxel, Colagem, Partidas, Grua, Crachá, Fita, Esteira) follow in the next
round with the animated carousel. The older video styles (Néon, Obra, Limpo,
Cinema, Impacto, Curto, Cartaz animado) are not carousel styles.

**Cover.** «Capa: do estilo» (the style's hook) or «Capa: cartaz do anúncio»
(the image piece drawn in the carousel's format). The style gallery's first
card, **«Do anúncio»**, is the poster cover + the recipe closest to the ad's
template + the ad's own colours. Where the poster cannot be drawn in the
carousel's format (3:4, see Formats), the poster cover is unavailable and says
why.

**Look.** Per carousel, like the video's «Aspeto»: the style's colours, the
brand's colours or a ready palette, a highlight colour, the font, a light or
dark background where the style allows it, and the photos (for styles that use
them: the trades' photos or up to eight chosen, with «Enquadrar»). Default the
first time the carousel is opened: the video's recipe and look if the video
uses one of the six; otherwise «Do anúncio».

**Formats.** 4:5 (1080 × 1350, default), 1:1 (1080 × 1080), 3:4 (1080 × 1440,
carousel only) and 9:16 (1080 × 1920). All slides of a carousel share one
format (Instagram requires it).

**Preview and editing.**

- The stage shows the current slide large with its neighbours peeking, arrows,
  dots, and swipe on touch; the format chips sit above it.
- A tap on a text of a slide opens that slide's block in «Sequência» with the
  field focused (as a tap on the poster opens its field today).
- «Sequência» lists the blocks with drag handles (reorder), eyes (hide) and,
  per block, the texts it shows with «Só no carrossel» / «Repor do anúncio»,
  item eyes in lists, and «Acrescentar diapositivo de texto».
- The style is chosen from a gallery that shows **the real cover slide** of
  each style for this ad (not abstract swatches), with a «Recomendado» mark from
  simple rules: salary given → Números; four or more positions → Contrato;
  photos available → Notificações; no photos → Planta or Tijolo.

**Export (static).** From the export dialog with the carousel on screen:
numbered PNGs (or JPGs) per language in a ZIP, with the publication text. The
destination sets the format (see Goal 5). The campaign package's «carrossel»
part uses this new carousel.

**Migration.** A Codex carousel (`project.carousel` v1: art direction,
variation, per-language personalised slides) becomes the new carousel: the
direction maps to the closest recipe (editorial → Apresentação, blueprint →
Planta, signal → Números, workshop → Tijolo, collage → Notificações,
atelier → Contrato, auto → «Do anúncio»); the personalised slides are kept
untouched under `project.carousel.legacy` (in `.anuncio`, backups and history)
but are not shown — the texts follow the ad again. Only test ads are known to
have them (the Codex version was never published).

### 4. Navigation: minimal surface, depth where it is used

**Editor top bar.** ‹ Anúncios · name + «Guardado» · **Imagem | Carrossel |
Vídeo** · language · ↶ ↷ · **⋯** · **Exportar**. On a phone: first row ‹ ·
name · ⋯; second row piece switch · language · ↶ ↷.

**⋯ (editor).** Guardar ficheiro (.anuncio) · Histórico de versões · Mostrar
QR · Organizar · Rever traduções (n) · Rever publicação (per language, when the
publication text needs review) · Marcas e modelos · Definições. Pending things
show as a count on ⋯ and on the item; untranslated blocks also mark the
language chip.

**Rail: three questions.**

- *What it says* (shared by the three pieces): **Oferta** (today's «Texto»:
  trades, texts, offer sheet), **Contactos**, **Fotos** (the photos of the
  piece on screen: the poster's photo and logo for Imagem; the piece's photo
  choice and «Enquadrar» for Carrossel and Vídeo, or a note when the style uses
  no photos).
- *How it looks*: **Estilo** (Imagem: template + colours, font, sizes, brand
  library — today's «Aspeto»; Carrossel and Vídeo: the style gallery + cover +
  colours, font, background).
- *How it unfolds* (Carrossel and Vídeo only): **Sequência** (Carrossel: the
  blocks above; Vídeo: duration, «Textos do vídeo», sound and ending — today's
  «Modelo» duration, «Textos» and «Som e fim» tabs).
- The phone's floating bar holds at most these five plus Exportar. «Definições»
  leaves the rail (⋯ in the editor, ⋯ on the home).
- The management buttons leave the top of the panels (they live in ⋯).

**Home.**

- Top bar: wordmark · Mostrar QR (icon) · ⋯ (Abrir ficheiro · Marcas e modelos
  · Cópias de segurança · Reciclagem · Instalar no telemóvel, when offered ·
  Definições).
- «Os seus anúncios» with a one-line subtitle; «Criar anúncio» stays the first
  card.
- Search and filters appear only when there are enough ads to need them (about
  eight; always while a filter is active); filters fold behind one «Filtros»
  button.
- Each card keeps its thumbnail, name, status and menu, and gets three small
  shortcuts (Imagem · Carrossel · Vídeo) that open the editor on that piece.
- On a 360 × 740 phone, the first ad card is visible without scrolling.

**Create.** The template gallery gets **«Começar por: Imagem · Carrossel ·
Vídeo»**: Imagem shows the poster templates (as today); Carrossel shows the six
carousel styles with real slides; Vídeo shows the video models. Choosing one
creates the ad (trades as today) and opens it on that piece; the other pieces
start from their defaults.

### 5. Export: «Para onde?»

The export dialog exports the piece on screen and starts from the destination;
the destination picks the format(s), and «Escolher formatos» opens today's
manual choice.

| Piece | Destinations → format |
|---|---|
| Imagem | Feed Instagram/Facebook → 4:5 · Stories / Estado do WhatsApp → 9:16 · Quadrado → 1:1 |
| Carrossel | Instagram carrossel → the carousel's format · Facebook → 4:5 or 1:1 (note: several photos publish as a grid; the swiping carousel needs a link per card) · TikTok (fotografias) → 9:16, warns under 4 slides · Stories / Estado do WhatsApp → 9:16 images |
| Vídeo | Reels / Stories / TikTok / Estado do WhatsApp → 9:16 · Feed → 4:5 · Quadrado → 1:1 |

Below the main action stay the publication text (Copiar, Link do WhatsApp,
Regenerar), the checks folded into «n pontos a confirmar», and **«Pacote
completo»**, which opens today's campaign package (the Codex production dialog,
reduced to the campaign mode).

### 6. Fixes carried into this round

- The baked line breaks of «Personalizar páginas» disappear with the new text
  model (Goal 2).
- The contact slide has the green WhatsApp button and the QR (block K).
- **The offer sheet shows on the image when filled, for new ads** (old ads
  keep their setting). Today a filled salary does not appear on the poster.
- The six failing real-Edge browser tests of the Codex copy (533 pass, 6 fail
  on 2026-10-27, e.g. «illustrative: messages hang from the hook…») are fixed
  or, if the behaviour changed on purpose, updated with the reason.

## Non-goals (this round)

- **Animated carousel** (each slide moving with its recipe's motion and ending
  on the static slide; MP4 per slide for Instagram; «carrossel em vídeo» 9:16
  with sound). Next round, together with the other seven recipes. This round's
  slide mode must not make it harder: a slide is an act page of the recipe.
- Alternative compositions per slide beyond the cover choice (next round).
- LinkedIn PDF export.
- Bringing back «Planear publicação» and «Textos guardados» in the interface.
- Changing the poster templates or what the videos look like (the slide mode
  must not change a single frame of the exported videos).
- Cleaning the Codex evidence (`tests/evidence`, 178 MB) and delivery folders.

## Anti-goals

- Slides that read as boxes of text, or styles that differ only on the cover.
- Losing any data the Codex round introduced (backups, history, organisation,
  publication records, phrase library, offer sheet, covers, framings).
- New layers of menus or dialogs on top of dialogs; any action used daily
  hidden in ⋯ (editing, previewing, exporting, switching piece or language).
- Cut, ellipsised or unreadably small text on any slide.
- A different look between the preview and the exported file.

## Constraints

- Offline web app, opened from `file://` (Edge `--app`) and served over HTTPS
  (PWA): classic scripts only, no CDN, photos as JS data URLs, canvas never
  tainted.
- Interface in Portuguese (pt-PT); ad texts in seven languages.
- The three motion styles of the interface (Ilustrativo, Sóbrio, Calmo), the
  themes and the accessibility of the current app keep working.
- Tests: `npm test` (Node, DOM simulated) and `node tools/test-browser.mjs`
  (real Edge, including the phone page); both green at the end.
- Network limits (checked 2026-10-27; they change): Instagram 2–20 items per
  carousel, one aspect ratio for all (3:4, 4:5, 1:1), video slides allowed;
  TikTok photo mode 4–35 images, 9:16; Facebook pages publish several photos as
  a grid (link carousel 2–10 cards); LinkedIn documents as PDF; WhatsApp
  Status has no carousel.

## Left to the builder

- How the slide mode is added to the recipe framework (`js/motion.js`,
  `js/recipes/*.js`) and which acts need their own slide drawing.
- The minimum text size on slides (above 26 px at 1080 px) and how pages split.
- The data shape of `project.carousel` v2 and the generalisation of
  `RS.motionTimeline.content` and «Textos do vídeo» to both pieces.
- The template → recipe table behind «Do anúncio».
- The exact thresholds (when filters appear, recommendation rules) and how the
  card shortcuts look.
- Whether the poster engine gains 3:4 (then the poster cover works in 3:4 too).
- File names inside the ZIPs.

## Validation required by the owner

Every path is walked in the real app (desktop 1440 × 900 and phone 360 × 740,
light and dark): create from each starting piece; switch pieces; edit the
offer while the carousel is on screen; choose each style; reorder, hide and
edit slides; tap a slide's text; export to each destination. The exported
files are opened and checked (count, order, size, language, button and QR
present, no clipped text). The final report separates **what was implemented,
what was actually tested (and how), and what remains limited or pending**.

## Acceptance (owner, on real devices)

- A static carousel of each of the six styles posted (or staged) on Instagram
  and a 9:16 set in TikTok photo mode look right on the phone.
- The editor and the home feel simpler: the owner finds where to start each
  piece, how to switch, and where Organizar, Histórico and Definições went.
- Nothing from the Codex round is missing.
