# Recruitment Studio: «Fala comigo» and motion-graphics video styles (design)

Date: 2026-10-20. Status: **approved by the owner on 2026-10-20** ("vamos a
isso"), after the brainstorming of 2026-10-19/20 and a builder check (its
questions answered or settled below). Builds on the web app specs of 2026-10-16 and the
video spec of 2026-10-19 (`2026-10-19-recruitment-studio-video-design.md`).

## Intent and why

The person who uses the app is a recruiter for a construction company and is
paid a fixed amount for every person he convinces who **starts work** (paid on
the first day; people who leave later do not cost him the commission). Today he
hires mostly by talking to workers of other companies; his strength is the
conversation itself: he is very good at convincing people once they talk to him.

So the app must not try to convince anyone. It must:

1. get as many people as possible to **talk to him, fast**, while the interest
   is fresh: one tap to WhatsApp him, a QR when face to face;
2. make the ads **stop the scroll**: short motion-graphics videos in the style
   of the reference the owner liked (a 15 s product video, "LetMotion": one idea
   per beat, huge kinetic words, 3D arrangements of many images, numbers
   counting up, glitch cuts, a closing card with a call-to-action pill, music
   and sound effects). A throwaway prototype of this style for recruitment was
   built and the owner loved it (kept in `.superpowers/brainstorm/`,
   `prototipo-video.html`; not app code).

Losses happen mostly between "yes" and the first day (excuses). That is the
next project ("Os meus candidatos", see Non-goals), not this one.

The app is also handed to other people by the owner: each of them must manage
alone, with their own number and brand, without help.

## Goals

### Part A: «Fala comigo» (contact in one tap)

- **WhatsApp number** of the recruiter in «A minha marca» (and per ad, filled
  from the brand). Every ad can produce a `wa.me` link with a **pre-written
  message** in the ad's language that names the ad's trade(s), e.g.
  "Olá! Vi o anúncio para pedreiro e servente e tenho interesse." **No tag or
  code in the message** (owner, 2026-10-20: nothing he did not write should be
  visible to the candidate; hidden characters are unreliable and would mislead
  the candidate, so there is no hidden tag either). Where a candidate came from
  is a question for the next project («Os meus candidatos»).
- **The message is easy to change** (owner, 2026-10-20): in Texto › Contactos,
  next to the number, a field «Mensagem que o candidato envia», per language,
  already filled in and editable in place, with «Repor» to bring back the
  generated one; the default wording for new ads is editable in «A minha marca».
- **QR in the ad**: a QR mode «WhatsApp (recomendado)» that encodes that link,
  next to the existing «Link» mode. A green call-to-action footer
  ("Manda mensagem · 912 345 678 · aponte a câmara") is available in the poster
  templates.
- **Post text**: the generated caption carries the WhatsApp link and the phone
  number (links in the text are what people tap on Facebook and WhatsApp; nobody
  can scan the QR on their own screen). A button «Copiar link do WhatsApp» for
  the Instagram Story link sticker (Instagram has no links in captions).
- **«Mostrar QR»**: a full-screen QR on his phone for face-to-face moments (the
  other person points the camera, WhatsApp opens with "Olá, falámos agora há
  pouco…"), reachable in one tap from the home screen and from the editor.
- **No photo of the recruiter anywhere** (owner: he does not like showing his
  face).

### Part A2: several trades per ad (owner, 2026-10-20)

- An ad can target **one or more trades** (e.g. pedreiro + servente +
  cofragista). The trade chips in the gallery and in Texto become
  multi-select; the first chosen is the main one.
- The ready texts come from the main trade; the positions («Vagas») of the
  other chosen trades are added to the list (no duplicates); the person can edit
  everything as today.
- The photos offered (and used by the video scenes) are those of all chosen
  trades; hashtags in the post text cover all of them; the WhatsApp message names
  them (up to three; beyond that it says "o vosso anúncio de emprego" in the
  ad's language).
- Old ads with one trade keep working (one-element list).

### Part B: motion-graphics video styles

- **Same ad, no extra work**: the video is built from the ad's existing content
  (trades, headline, benefits, positions, contacts, photos, brand), plus two new
  optional fields: **salary** (amount + period, e.g. "1900 € por mês") and
  **number of vacancies**. Missing fields simply drop their scene.
- **Styles, not editing**: the person picks a **motion style** in a gallery
  where every style is already moving. Scenes are assembled automatically; there
  is no timeline to edit.
- **Scenes** (each style uses a selection, in its own look), always with the
  ad's own words: hook (the ad's kicker and headline, line by line); fan of
  photos with a design-tool selection frame; 3D sphere of photos; counter
  (salary, vacancies) with chips; 3D tunnel; photo wall with the ad's positions
  cycling; one scene per benefit; closing card «Fala comigo» (number, pulsing
  WhatsApp pill, QR, logo or brand name, ring of photos). Cuts on the
  beat with glitch/RGB split and flash; film grain, vignette, small technical
  labels, progress bar — as in the prototype.
- **Styles at launch (proposal, builder may refine the looks)**: Néon (the
  prototype), Obra (yellow/black, caution tape, industrial), Limpo (light,
  corporate), Cinema (full photo, Ken Burns, kinetic text over it), Impacto
  (typography only, huge words), Curto (6 s, for Stories).
- **Customisation, kept simple** (owner, 2026-10-20: colours and similar easy
  things): style; **colours** — «Cores do estilo» or «Cores da marca» (the ad's
  primary and accent colours), a row of ready palettes to tap, and one
  «Cor de destaque» picker (the neon colour of the prototype); **background**
  dark or light where the style allows; **letra** among the app's four font
  pairs; duration (style-dependent, among 6 / 10 / 15 s); photos (the trades'
  library photos by default, or the ad's own); languages and formats as today
  (Story 9:16 first; 4:5 and 1:1 with adapted layouts); sound (below). The
  preview moves live and follows every edit. Nothing more advanced (no timing,
  no per-scene settings).
- **Company logo** (evaluated by the builder, 2026-10-20): it builds trust —
  job ads, especially for work abroad, attract scams, and a real company's logo
  makes people more willing to answer — but the recruiter may want discreet
  campaigns, since he recruits from other companies' workers. So the video
  follows the ad's existing «Logótipo» switch: when visible, the logo sits small
  in a corner through the video and large on the closing card; without a logo,
  the brand name takes its place; when hidden, neither appears.
- **Sound (owner's decision, 2026-10-20)**, three options in the video export:
  1. **music generated by the app** (default): a beat plus effects (whooshes on
     the cuts, hits on the counters, pops on the chips, a riser before the
     closing card), synthesised in the browser, so there are no music rights;
  2. **own sound**: an audio file from the phone/PC (MP3/M4A), fitted to the
     video length with a fade-out;
  3. **no sound**, to add the platform's music later in Instagram/Facebook.
- **Export**: MP4 with the sound inside (AAC), as fast as the device allows,
  with progress and cancel as today; share on phones; several videos in a ZIP.
  Reels, Stories and WhatsApp status.
- **Offline, easy, everywhere the app runs today**: `file://` on the PC (Edge),
  the installable web version on phones.

## Non-goals

- The recruiter's face, photo or voice in the ads.
- AI-generated footage (Higgsfield-like); everything is drawn by the app.
- Posting or scheduling through Meta's API.
- A timeline or per-element animation editor.
- «Os meus candidatos» (tracking people until their first day, reminders, the
  first-day card) and «Traz um colega» (referral card): next projects, in that
  order, after this one.

## Anti-goals (would be a failure even if it works)

- Anything that needs an internet connection to create or export.
- Music or sound effects copied from elsewhere (rights).
- Making the person "edit a video": if it needs more than choosing a style and
  pressing «Criar vídeo», it is wrong.
- A QR as the only way to reach him in a social post.
- Breaking the existing still images, the existing animated-poster video or the
  saved ads (`.anuncio` files and IndexedDB).

## Constraints

- Existing app: classic scripts (no ES modules on `file://`), Preact + htm,
  Canvas 2D engine in poster pixels (1080 wide), IndexedDB, no CDN, everything
  in the app folder; video export already uses WebCodecs H.264 +
  `vendor/mp4-muxer.js` (MIT) with a MediaRecorder fallback.
- Phones: the installable web version (https). Instagram covers the top 250 px
  and the bottom 280 px of a 1080 × 1920 Story.
- Languages: pt-PT, de-CH, de-DE, fr, it, en, es (the app's list); the
  pre-written WhatsApp messages need all of them.
- Workspace rules: plan before code, code in English, documentation current,
  nothing outside the project folder.

## Decided by the owner

- Order of work: «Fala comigo» first, then the motion video; candidates list and
  referral later (2026-10-19).
- No photo of the recruiter (2026-10-19).
- The look: the prototype's style, "loved it" (2026-10-20).
- The app must ship with several styles so that anyone the owner gives it to can
  make these videos easily, offline (2026-10-20).
- Sound: generated / own file / none (2026-10-20). This replaces the 2026-10-19
  decision "silent video".
- **The video shows only the ad's own text, exactly as the person wrote it**
  (2026-10-20): the person writes whatever they want and the video is built from
  that ad, so the same ad can be posted once as an image and once as a video.
  No slogans or short forms supplied by the app ("Obra a sério.", "Equipa
  forte.", "PEDREIRO?" in the prototype were placeholders). Consequences for the
  scenes: the hook is the ad's kicker and headline, revealed line by line; each
  benefit and each position is shown as written, as large as the engine's text
  fitting allows, split over two beats when long; the counters use the salary
  and vacancy fields only when filled in.
- **Multi-language means the ads and videos, not the app** (2026-10-20): every
  language of an ad (pt-PT, de-CH, de-DE, fr, it, en, es) gets its own video,
  with that language's texts, WhatsApp message, call-to-action labels and post
  text; the export keeps choosing languages as today (several videos in a ZIP).
  The app's own interface stays in Portuguese.
- **Several trades per ad**; **no tag or code in the WhatsApp message**; the
  pre-written message **easy to change** in the ad (and its default in «A minha
  marca»); **easy colour customisation** in the video; the builder evaluates the
  **logo** (2026-10-20; see Parts A, A2 and B).

## Builder's calls (open to the owner's correction)

- The existing animated-poster video stays as one more style («Cartaz animado»),
  so nothing is lost.
- The motion styles live in a new module next to `templates.js`, sharing the
  engine's text fitting, photos, colours and the `anim` time model; the
  prototype is reference material only.
- Sound in the preview is played live with WebAudio; the export renders the
  same soundtrack offline and encodes it as AAC with WebCodecs `AudioEncoder`;
  where AAC encoding is missing, the video is exported without sound with a
  clear note.
- Defaults: style Néon, 15 s (Curto is always 6 s), generated sound on.
- **Functional labels are not "slogans"**: the call-to-action pill («Manda
  mensagem»), «Aponta a câmara», the salary period and the word for vacancies
  come from the app in the ad's language (like the existing stock labels), and
  the brand name from «A minha marca». Nothing else is added to the ad's words.
- **Photos for the photo-heavy scenes** (sphere, tunnel, wall, ring need many
  cards): the ad's own photo first, then the trade's library photos, then the
  person's «As minhas» photos of that trade, then photos of closely related
  trades (e.g. obras, servente for any building trade). Repeats are allowed with
  different crops; with fewer than 4 distinct photos a scene uses its variant
  with fewer, larger cards. No per-ad photo set in this project. Recommendation
  to the owner: add photos for the trades that have only one (carpinteiro,
  técnico).
- The photo wall cycles the ad's positions list (the person's text).
- **Sound on every device**: where WebCodecs AAC encoding is missing (some
  phones), the video is recorded in real time with MediaRecorder carrying the
  same soundtrack (it then takes as long as the video); only if that also fails
  is it saved silent, with a note.
- **Salary and vacancies** show in the video and in the post text; they do not
  change the still posters in this project.
- `project.trades` (list, main first) replaces the single `project.trade`;
  `normalize` turns old ads' `trade` into a one-element list.

## Left to the builder

The exact looks of the six styles, scene timings per duration, the beat and
effect synthesis, layouts for 4:5 and 1:1, performance tuning (preview frame
rate on phones, thumbnails in the gallery), and the data shape of the new fields
(kept in `project`, normalised like the rest).

## Acceptance

Manual, by the owner: on the PC and on a phone, make one ad for two trades in
two languages, change its WhatsApp message, open the WhatsApp link and the QR
(the message arrives as written, naming both trades, with no code), copy the
link for an Instagram Story, use «Mostrar QR» face to face; create a 15 s video
in two styles with each of the three sound options, with the brand colours and
with the logo on and off, and post one as a Reel and one as a Story.

## Built and checked: Parts A and A2 (2026-10-20)

Plan: `documentation/plans/2026-10-20-fala-comigo-multi-trade-plan.md`.
Not yet accepted by the owner (the manual acceptance above is still to do).

- **Number and message** (Texto, Contactos): country + number, the switch
  «Botão WhatsApp no anúncio», «Mensagem que o candidato envia» (generated from
  the ad's trades and language until the person writes their own; «Repor»).
  No code or tag anywhere in the message or the link.
  The number may be typed "912 345 678", "+351 912…", "00351 912…",
  "(+351) 912…" or "351 912 345 678": all give the same link. An emptied
  message field stays empty while the person writes and shows the generated
  message again once they leave it.
- **Pill text**: «Manda mensagem · +351 …», without "aponte a câmara" (the
  pill is what people tap on social media, where nobody can scan their own
  screen; the QR beside it speaks for itself). «Aponta a câmara» is used in
  «Mostrar QR». Open to the owner's correction.
- **Poster**: the green «Manda mensagem · +351 …» pill comes first in the
  contacts, in every template and format; a contact with the same number is not
  drawn a second time while the pill shows. Without a number the poster is as
  before.
- **QR**: «WhatsApp (recomendado)» encodes the ad's wa.me link; «Link» keeps a
  link the person typed. Old ads that had a QR link open in «Link».
- **Post text** carries the wa.me link and the number; «Copiar link do
  WhatsApp» (export dialog, hidden without a number) copies the link of the
  caption's language for the Instagram Story link sticker.
- **«Mostrar QR»**: home screen (brand number) and editor top bar (ad number);
  full screen, white, 7 language chips, «Aponta a câmara» in that language, the
  number and the opening message under it; Escape or ✕ closes. Without a number
  it asks for it and keeps it (brand / ad).
- **Several trades**: multi-select chips in the gallery and in Texto (the first
  is the main one: headline and benefits; every trade's positions go in the
  box); hashtags, the WhatsApp message and the photo filter «Deste anúncio»
  follow all of them.
- **A minha marca** also keeps the number and a default message for new
  Portuguese ads (`{profissões}`); a brand holding only a number (typed in
  «Mostrar QR») gives new ads the number and leaves the template's company name,
  logo and colours alone.
- Tests: 30 unit (`node --test "tests/unit/*.test.cjs"`) and 21 browser cases
  (`node tools/test-browser.mjs`: engine page + full-app page) pass; console
  clean in headless Edge. Web package rebuilt (cache
  `recruitment-studio-0e029ae957`, 107 files); its ZIP tests clean with 7-Zip.

## Built and checked: Part B (2026-10-20)

Plan: `documentation/plans/2026-10-20-motion-video-styles-plan.md`. Not yet
accepted by the owner (the manual acceptance above is still to do).

- **Offer fields** (Texto › «Salário e vagas (opcional)»): salary, currency
  (€, CHF, £), period, vacancies; shown in the video and in the post text
  ("1900 € por mês · 30 vagas"), never on the still posters.
- **Timeline** (`js/motion-timeline.js`): scenes from the ad's own words, on a
  0.5 s beat, hook first and the closing card last; a style may list several
  benefit slots (Néon spreads its benefits between photo scenes); when time
  runs out the later photo scenes go first, then the last benefits.
- **Seven styles** (`js/motion.js`): Néon (the prototype), Obra (caution tape,
  yellow flash), Limpo (light or dark, soft), Cinema (full photo with Ken Burns,
  letterbox), Impacto (typography only, every other scene on the highlight
  colour), Curto (6 s) and «Cartaz animado» (the existing animated poster,
  pixel-identical). Only the ad's words appear, plus the functional labels
  («Manda mensagem», «Aponta a câmara», the salary period, the vacancies word)
  and the brand name. Texts stay inside Instagram's safe zones and are at least
  52 px at 1080 width; a 1080 × 1920 frame draws in a few milliseconds.
- **Colours**: style colours, the ad's brand colours or a ready palette, a
  highlight colour, light/dark where the style allows, the app's four fonts;
  text and highlight kept at 4.5:1 or more.
- **Sound** (`js/sound.js`): generated beat and effects (offline, 48 kHz
  stereo, the same in the preview and the file), the person's MP3/M4A fitted to
  the video (trimmed with a 1 s fade, or followed by silence; −1 dBFS), or no
  sound. Own sounds are kept with the ad, in housekeeping and in .anuncio files.
- **MP4 with sound** (`js/video.js`): AAC via WebCodecs; real-time recording
  with sound where AAC is missing; otherwise a silent MP4 and a notice.
- **Export dialog**: style gallery (every style moving), duration, colours,
  sound with «Ouvir» (any change restarts the preview and its sound), progress
  and «Cancelar»; «Ver animação» in the editor plays the chosen style.
- Measured on this PC (headless Edge): a 15 s Néon Story with the generated
  music is created in 13.6 s (15.6 MB, H.264 + AAC); Cinema 14.2 s.
- Tests: 57 unit and 77 browser cases pass (engine page: timeline, renderer,
  styles, sound, MP4 with sound; full-app page: «Fala comigo», offer, export
  dialog, «Ver animação»); web package rebuilt (cache
  `recruitment-studio-5de1f60a31`, 110 files), its ZIP tests clean with 7-Zip.
- After the final review: no word of the person's texts is ever dropped (texts
  that cannot be shown in two halves wrap smaller instead); scenes get time to
  be read (0.5 s per 18 characters, at least 1 s per half of a long text and
  per group of the positions wall, at most three wall groups); ads saved before
  the motion styles keep «Cartaz animado» silent, as they were exported, and a
  poster with music gets a plain beat; the person's own sound is decoded once
  per video length.
- Deferred points fixed (2026-10-20, each with a test that failed first): a
  «+41 …» number typed with Portugal chosen is grouped after its own code;
  `{profissoes}` without the tilde works; the post text lists the WhatsApp
  number once; Contactos says when a contact is the WhatsApp number; «Usar os
  textos prontos» changes only the languages with ready texts (it/es keep the
  person's); an incomplete number never becomes the brand's; an aborted screen
  transition is not an error; repeated photos get other crops and few photos
  give fewer, larger cards; the export dialog says what a video leaves out;
  «A sua empresa» (the template sample) is not shown in videos; Curto's 6 s
  does not stick to the next style; «Cor de destaque» shows the chosen colour
  and says when the video uses a readable variant; a sound that is gone gives
  a clear message; without canvas filters (Safari < 18) the hook photo is
  still soft; layer caches are bounded; the safe-zone and size checks cover
  every style; the tests wait on conditions instead of fixed pauses.
