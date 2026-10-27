# Recruitment Studio Web - design

Date: 2026-10-16. Owner approved "go with the recommendation, as long as it
works locally without internet".

## Why

The Flutter candidate (`Recruitment-Studio-source/`, compiled build in this
folder) draws one fixed layout ("Editorial B") into fixed pixel boxes. Text one
pixel too long is an export-blocking error, body text is 26/30/34 px only and
nothing shrinks. Its posters look nothing like the reference the owner wants
(timework "Maurer, Schaler und Bauarbeiter" ad: condensed bold headline, icon
benefits, highlighted positions box, contact block, photo bleeding on the
right). About 20k lines of storage plumbing lock the project format to that one
layout, and this PC has neither the Flutter SDK nor the C++ toolchain.

## Decisions (owner)

- Rebuild as a **local web app**: opens in Edge/Chrome from disk, no server, no
  internet, no CDN. Everything (fonts, icons, library) is embedded in the folder.

## Decisions (builder's call, open to correction)

- Folder `recruitment-studio-web/`. Vanilla JS classic scripts (ES modules do
  not load from `file://`), Preact + htm standalone (13 KB, vendored) for the
  UI, Canvas 2D for the poster. Fonts as base64 `@font-face` (fonts from
  `file://` are blocked by CORS); icons as SVG path data (Path2D), so no image
  ever taints the export canvas.
- Launcher `Abrir Recruitment Studio.cmd` opens Edge in app mode (own window,
  no browser bars).
- Interface in pt-PT; code in English.
- Flow: home (my posters) -> **choose template** (live previews) -> editor.
- Editor: left rail (Modelo, Texto, Imagens, Estilo), form panel, dark
  workspace with the live poster. Every keystroke re-renders the preview.
  Clicking a poster element jumps to its field; dragging the photo reframes it;
  dropping a file sets the photo (or the logo when dropped on the logo).
- **Nothing blocks.** Text auto-fits: one global scale factor is
  binary-searched so the whole stack fits its panel, headline size is maximised
  per line count with balanced lines. Shrinking is reported as a hint, never as
  an error. No hard limits on item counts.
- Content model shared by every template, so switching template keeps the text:
  logo or brand name, kicker, headline, intro, benefits (icon + text), positions
  box (title + items), contacts (icon + text), badge. Each block can be hidden.
- Languages: pt-PT, de-CH, de-DE, fr, it, en, es. Texts per language; photo,
  logo, colours and template shared. Adding a language copies the current texts
  and swaps the stock labels ("Estamos a recrutar" -> "Wir suchen").
- Formats: square 1080x1080, portrait 1080x1350 (default), story 1080x1920
  (with Instagram safe-zone guides in the editor only).
- Style: 4 base colours (primary, accent, background, text) + curated palettes
  + palette from the logo; 4 font pairings; text-size and headline-size
  sliders; uppercase headline toggle; logo size and white/dark/original mode.
- Six templates in the reference style: Diagonal (the reference), Noite (dark),
  Faixa (photo top + slanted band), Cartão (full photo + card), Sinal
  (industrial yellow), Editorial (light, serif).
- Export: PNG/JPG at full size, any combination of formats x languages, ZIP
  when more than one (own STORE zip writer). Non-blocking checks (no photo,
  heavy shrinking, low photo resolution). Post caption generated from the
  fields, editable, copy button. Copy image to clipboard.
- Storage: IndexedDB (projects, images as Blobs, brand kit), autosave,
  undo/redo (Ctrl+Z / Ctrl+Y), soft delete with "Anular". Project file
  `.anuncio` (JSON with embedded images) to back up or move to another PC.
- Brand kit: save logo, colours, font pairing, brand name and contacts once;
  new posters start with it.

## Round 2 (owner request, same day)

Owner asked for: weak spots fixed, more templates for construction trades,
a large bundled photo library in the reference style, a premium opening
animation, a launcher that looks like a program (icon), full mobile support and
smooth animations everywhere. Builder's calls:

- 12 templates (new: Estaleiro, Planta, Betão, Divisão, Faísca, Moldura); each
  has a default trade. 15 trade presets (`js/trades.js`) with ready texts in
  pt / de / fr / en from a shared phrase book: adding a language translates the
  texts still equal to the preset. Gallery and editor both offer the trade.
- Photo library: bundled photos are built from the owner's folder by
  `tools/build-photos.mjs` (sub-folder = trade) into JS files with data URLs,
  loaded by script injection (an `<img>` from `file://` taints the canvas).
  People can also add their own photos to an in-browser library.
- Launcher: `Recruitment Studio.exe` compiled with the .NET Framework C#
  compiler shipped with Windows, with the app icon; it opens Edge in app mode.
  A `.cmd` creates a Desktop shortcut. A `.cmd` cannot carry its own icon.
- Opening animation drawn live (CSS + real poster renders), about 2.6 s,
  skippable, once per window, off with "reduce motion".
- Motion: View Transitions between screens (the chosen poster morphs into the
  editor), entrance and exit animations, transform/opacity only, tokens in CSS.
- Mobile (≤ 860 px): preview on top, panel, bottom tab bar with Exportar,
  finger reorder of lists, two-finger zoom of the photo, Web Share to
  Instagram/Facebook/WhatsApp. Using it on a phone needs the folder on an
  https address; `manifest.webmanifest` + `sw.js` make it installable and
  offline there.
- Extras: QR code next to the contacts, photo brightness/contrast/colour,
  hashtags per trade in the post caption.

## Round 3: loading states (2026-10-19)

Owner: pages take a while and nothing changes on click, so people click again
and think the app froze. Found and fixed:

- Root cause of the slowness: `transition()` waited for a frame
  (`requestAnimationFrame`) inside the View Transition callback. The browser
  draws no frames while that callback runs, so every screen change froze for
  Chrome's 4-second timeout (measured 4107 ms; 52 ms after the fix). The
  callback now waits one macrotask only. Rule: never wait for a frame there.
- One navigation at a time (`App.run`): further clicks are ignored while a
  screen opens (a double click on a template made two posters). The clicked
  element shows a spinner and its own words ("A abrir os modelos…",
  "A preparar o anúncio…", "A abrir…", "A guardar…"), the other cards rest
  at half opacity, a thin bar runs at the top, and a status line is announced
  to screen readers.
- Slow work happens before the screen change, while the card shows its state:
  creating a poster imports the library photo first; opening a poster decodes
  its photo and logo first, so the editor opens complete.
- Thumbnails are drawn a few per frame (budget about 12 ms) with a shimmer
  until each is drawn; the gallery opens at once. Gallery previews use the
  small photo already in the library index, then the full photo.
- Photos: "A preparar a fotografia…" pill on the preview and a veil on the drop
  zone; the chosen library tile shows a spinner; one image at a time. The
  library shows skeleton tiles while its index loads. Adding several photos
  shows "A adicionar 2 de 5…". Library photos (JPEG within the size limit)
  are stored as they are, without a redraw and re-encode.
- Export: the clicked button shows its progress ("A preparar 2 de 6…",
  "A guardar…"), painted before each heavy render; one export at a time.
- First opening: `index.html` paints a start screen before any script runs and
  loads `fonts.css` (700 KB) without blocking it; `RS.engine.loadFonts` waits
  for that stylesheet. Under "reduce motion" spinners still turn, slowly.

## Non-goals

Direct publishing to Facebook/Instagram, automatic translation, opening the
Flutter `.recruitproj` files, accounts or sync.

## Acceptance

Manual, by the owner, on this PC: open with the launcher offline, create a
poster from each template, edit with live preview, export PNG/JPG/ZIP, reopen.
