# Recruitment Studio — the premium feel: motion, touch, dark mode, install, icon

Date: 2026-10-21 · Status: design for the owner's approval · App: `recruitment-studio-web/`

## Intent and why

The owner wants the app to have «aquele charme» of the apps he likes: smooth
motion for every kind of thing, satisfying to watch («regala os olhos do
utilizador, e de mim também»), with the small vibration iPhones give on a
touch — «pormenores mínimos, mas para mim fazem toda a diferença». It is not
about the app looking unprofessional today; it is about delight on PC and on
the phone, «100% premium em todos os aspetos». Alongside: installing the app
must be easy on any platform, there must be a dark mode, and a new icon must
carry the charm «desde o primeiro momento de contacto». Everything is adapted
to the app's own theme: construction work and recruitment, the orange signal
colour, the condensed display letter.

The owner asked for solid, quality work («não poupes trabalho, quero mesmo algo
sólido e de qualidade»).

## Goals

### 1. Motion: sober every day, illustrative in the waits and the wins (owner chose «C»)

The direction was chosen on animated mockups
(`.superpowers/brainstorm/2575-1792591023/content/estilo-animacoes.html`, column
B for «sober», column A for «illustrative»).

**Sober — everything done many times a day.** Short (about 0.12–0.35 s),
spring-like, never in the way; it can be interrupted at any moment (a new
touch wins).

- Every button, chip, card and switch answers the finger: it sinks a little
  (about 0.97) and comes back with a spring; on desktop, cards lift on hover.
- What opens grows from where it was touched: menus, pop-ups, the colour and
  icon pickers, dialogs; on the phone, sheets rise with a spring.
- Choosing a template (gallery) or an ad (home) grows that card into the
  editor's poster; leaving the editor shrinks the poster back into its card.
- The section bar (desktop rail and the floating phone bar), the «Vídeo»
  tabs, «Imagem | Vídeo», the formats and every segmented control: the
  «selected» pill glides from the old choice to the new one.
- Panels change with their contents arriving in a light cascade; list rows
  added, removed or brought back grow and shrink into place (no jumps).
- Numbers count instead of jumping: percentages, seconds («Automática · 22 s»),
  counters.
- Messages (toasts) arrive with a spring and leave the same way; the save
  dot pulses once when saved.
- Small loads (under about a second) use the sober loader: a dimension line
  (linha de cota) that draws, measures and retracts; nothing is shown for
  waits under about 0.3 s.

**Illustrative — the waits and the wins**, where there is time to charm and
the building site gives the app a personality no other app has.

- First opening and the boot screen: the new icon's bubble enters from its
  corner, the dots type, the wordmark arrives (replaces today's boot splash
  and intro).
- Preparing photos and other long loads: bricks laid one by one with a small
  bounce.
- Exporting an image or a video: the crane hoists the file while the
  progress fills; at the end it sways, settles and takes the stamp «PRONTO».
- The moment something is ready (export done, install done): a short
  celebration in the app's style.
- Installing the app: the animated guide and the welcome (goal 4).

### 2. Touch: the phone vibrates (owner: «feedback por vibração»)

- **Android**: short ticks on taps of real actions (primary buttons, choices,
  switches), and distinct patterns for «ready» and for «error»; never on every
  key typed.
- **iPhone**: since iOS 26.5 a web page can no longer vibrate from script;
  only a real tap on a hidden system switch still gives the iPhone's tick.
  So on iPhone the tick accompanies taps (each tick-bearing control carries an
  invisible switch under the finger, the technique web apps use today); the
  «ready» and «error» moments have no vibration on iPhone. Sources:
  [haptics on iOS 26.5+](https://haptics-web.vercel.app/),
  [ios-haptics](https://github.com/tijnjh/ios-haptics).
- **PC**: no vibration; the motion carries the feedback.
- A switch «Vibração» (on by default) lets the person turn it off.

### 3. Dark mode

- **Automático · Claro · Escuro**, «Automático» by default: it follows the
  phone or PC (and changes by itself if the device switches at night). The
  choice is kept on the device.
- The palette comes from the theme: asphalt and concrete greys (near-black
  backgrounds, panels a little lighter), the app's orange as the signal, warm
  white text; text contrast at least WCAG AA in both themes.
- Switching theme is itself a smooth animation — never a flash, and no flash
  of the wrong theme when the app opens.
- The ad and the video never change colour: they are what goes to Instagram
  (posters, thumbnails, the video stage and every export look the same in
  both themes).

### 4. Installing on any platform

- An **«Instalar»** button on the home screen, adapted to the device:
  - Android, and Chrome or Edge on PC: installs with one tap (the browser's
    own install prompt);
  - iPhone and iPad (Safari): an animated guide showing where to tap
    («Partilhar» → «Adicionar ao ecrã principal»);
  - Mac (Safari): an animated guide for «Adicionar à Dock».
- On PC, a **QR code** opens the app on the phone, ready to install.
- **The address** (owner, 2026-10-21): the published copy lives on the owner's
  Tailscale network, at `https://<machine>.tailfc994f.ts.net` (a real HTTPS
  certificate, so phones can install from it; the phone needs Tailscale on to
  reach it). When the app runs from that address, the QR uses it by itself.
  The PC version opened by `Recruitment Studio.exe` runs from files on the
  computer and has no address of its own: there the button becomes
  «Instalar no telemóvel», asks once for the app's address (pre-filled with
  `https://…ts.net`, kept on the computer) and shows the QR; its «install»
  and «welcome» logic never treats the `.exe` window as an installed app.
  The guide reminds that the phone must have Tailscale on.
- After installing: a **welcome screen** (the icon entering, a small
  celebration) on the first opening as an installed app; the app then opens
  without the browser bar.
- The Windows launcher (`Recruitment Studio.exe`) gets the new icon.

### 5. The new icon: «Balão a entrar» (owner chose it, option 2 of `icone-v3.html`)

- Orange gradient square-with-rounded-corners; a big white speech bubble
  entering from the top-left corner, tilted about 10°, cut by the edges;
  three black «typing» dots; its tail points to the bottom right. Orange
  behind, black and white for the rest (owner's request).
- Drawn with care for every size and place: the phone home screen (iPhone,
  Android with its round mask), Windows, Mac, the browser tab (16–64 px) and
  inside the app (boot screen, wordmark mark). Small sizes may simplify the
  drawing so the bubble and the dots still read.
- Its motion is the opening animation: the bubble slides in from its corner
  and the dots type.

## Non-goals and anti-goals

- The posters and the video models (their motion graphics) do not change.
- No app-store builds (App Store, Play Store): installing stays the web app's
  install plus the Windows launcher.
- No sounds in the interface *(builder's call — not asked for)*.
- Anti-goals — this would be a failure even if it technically works:
  animations that make people wait or block a tap; motion that stutters on a
  mid-range phone; vibration that annoys (on every key, or long buzzes); a
  flash of the light theme when a dark-mode user opens the app; unreadable
  text in either theme; an install guide that is wrong for the browser in use;
  an icon that becomes an unreadable blob at 16 px.

## Constraints

- Offline, from `file://` and as a PWA; classic scripts only (no ES modules),
  no CDN, no new heavy libraries; Preact + htm as today.
- People who ask their device for **reduced motion** get a calm version: the
  same changes as cross-fades, without flights, bounces or count-ups.
- Motion only animates what the browser animates cheaply (position, scale,
  opacity) so it keeps 60 frames per second on mid-range phones.
- Keyboard and screen-reader use must not get worse: focus stays visible, the
  invisible iPhone switches are hidden from assistive technology and from the
  Tab order, and a tap still does exactly one thing.
- Interface in Portuguese; code and comments in English; tests first (unit +
  browser pages, including the phone page `run-mobile.html`); the owner makes
  the commits; never the recruiter's face, photo or voice.

## Builder's calls (open to the owner's correction)

- Where the settings live: a small «Aparência» menu (Automático/Claro/Escuro +
  Vibração), reachable from the home top bar and from the editor.
- Install guides also cover the browsers that cannot install: inside the
  Instagram/Facebook in-app browser the guide says to open the link in Safari
  or Chrome first; Firefox and Samsung Internet get their own steps.
- The manifest gains what makes the Android install richer (description,
  screenshots, the new icons, a maskable icon) and the browser bar colour
  follows the theme.
- The celebration is short and in the app's style (the stamp and the check,
  a few bricks), not confetti.
- Empty states (no ads yet) may get a small building-site illustration.
- The exact durations, springs and patterns are tuned by eye on real devices;
  shared-element moves may use the browser's view transitions where
  available, with a fallback elsewhere.

## Acceptance

Manual, by the owner, on his phone and his PC: install the app (phone and
PC); open it in light and dark (automatic and chosen); feel the ticks on
taps; open a template into the editor and come back; change tabs and
sections; export an image and a video and watch the crane and the «PRONTO»;
see the new icon on the home screen, the dock or task bar and the browser tab.

## Built and checked (2026-10-22)

Built natively from `documentation/plans/2026-10-21-premium-feel-plan.md` (13
tasks; every decision taken on the owner's behalf is a «Ruling» in the ledger
`Dev/.superpowers/sdd/2026-10-21-premium-feel-plan/progress.md`).

- **Code:** `js/appearance.js` (theme and vibration, in `<head>`),
  `js/ui-motion.js` (`RS.ui`: the gliding pill, numbers that count, the
  dimension-line and brick loaders, the crane and «PRONTO», the opening, exits
  and the rows that glide into place), `js/haptics.js` (Android vibration,
  iPhone switches), `js/install.js` (platform, steps, address, welcome),
  `assets/brand/icon*.svg` and `tools/build-icons.mjs` (every PNG, the
  maskable icon, `app.ico` via `tools/build-launcher.mjs`),
  `tools/build-screenshots.mjs` (the manifest's install screenshots); the
  stylesheet takes every colour from tokens, with a dark set.
- **Tests:** unit (Node) for appearance, haptics, install and the assets
  (keyframes that animate only cheap properties, motion tokens, the icon's
  pixels, the manifest); browser cases in `tests/browser/ui-feel.case.js`
  (run-ui, desktop) and `ui-mobile.case.js` (run-mobile, 360 × 740 phone
  emulation): AA contrast of every text on home, gallery, editor and export in
  both themes, the theme on `<html>` before the first paint, the pill under the
  last of fast choices, count-ups, calm mode, pop-ups growing from their button,
  rows leaving before they go, the card ↔ editor morph both ways, loaders only
  after 300 ms, the crane's real percentage, «PRONTO» before the dialog closes,
  one tick per tap on Android and one action per tap through the iPhone
  switches (Tab order and assistive tech unchanged), the `.exe`'s address and
  QR, one-tap install, the iPhone guide on a phone, the welcome once, the real
  start screen with the icon in the page theme, the opening taking over
  without a jump and skipping on a key or a tap.
- **Frame cost** (360 × 740 phone emulation, CPU slowed 4×): the opening
  (first 3 s from the page's start) 157 frames, median 17.9 ms, p95 18.1 ms,
  1 frame over 20 ms; the crane hoisting with its count 152 frames, median
  18.0 ms, p95 18.0 ms, 2 frames over 20 ms.
- **Not checked here** (needs the owner's devices): the iPhone's tick through
  the hidden switches (no iPhone on this machine), the Android vibration on a
  real phone, installing from the Tailscale address, the icon on a real home
  screen, dock and task bar.
