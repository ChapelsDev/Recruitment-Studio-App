# Recruitment Studio — three motion styles and «Definições»

Date: 2026-10-22 · Status: approved by the owner in conversation («concordo com tudo… avança já com a implementação») · App: `recruitment-studio-web/`

## Intent and why

The premium-feel round shipped one motion direction (the owner's «C»: sober every
day, illustrative in the waits and the wins). The owner now wants to choose: «o
ideal era ter uma app cheia de motion que se sinta viva, digno de uma obra de
arte» — and also the calmer ways. Three styles, chosen in a settings tab that is
always at hand, at the start (where an ad is opened) and while editing.

A motion walk-through of the app (2026-10-22, `.superpowers/receitas-video/motion-check.mjs`:
the `.exe` window and a 360 × 740 phone with the CPU slowed 4×) found freezes that
no amount of motion can hide; they are fixed in this round («uma obra de arte
não pode congelar»).

## Goals

### 1. Three motion styles (owner)

- **Ilustrativo** — the default for a new device. The building site happens in
  every touch and every screen; the app is alive even when nothing is touched.
  The ten moments the owner chose on the animated mockups
  (`.superpowers/brainstorm/1670-1792669933/content/ilustrativo-momentos.html`, all ten selected):
  1. **Um toque** — the button sinks and a brick jumps out and lands (vibration).
  2. **Abrir o editor** — the crane fetches the tapped model (or ad), hoists it and
     sets it down as the poster; the editor builds itself around it. Leaving the
     editor plays it back into the card.
  3. **Mudar de secção** — the «selected» pill travels like the crane's trolley and
     swings when it stops; the panel arrives block by block, like bricks.
  4. **Linhas de uma lista** — a new row is laid like a brick, with a line of
     mortar; a deleted row tips over and falls, the others move up.
  5. **O início, vivo** — even when idle: a crane in the background swings its
     load, the icon's dots type now and then, the cards lean with the pointer (or
     the phone) and a light sweeps across them.
  6. **Mudar de tema** — night falls on the site: the sun sets behind the crane,
     the sky darkens, the crane's lights come on, the app turns dark; the reverse
     at dawn.
  7. **Mensagens** — messages come down hanging from the hook, swing and settle;
     the crane takes them away.
  8. **Apagar um anúncio** — the card cracks and crumbles into bricks that fall;
     the other cards close the gap.
  9. **Guardado** — a trowel smooths a line of mortar that becomes a check.
  10. **Um erro** — the site tape crosses the screen and a sign with the message
      comes down, swings and settles (error vibration).
  Plus everything that already exists (opening, bricks while preparing photos,
  the crane and «PRONTO», the celebration, the install guide, the welcome).
- **Sóbrio** — exactly what the app does today (owner chose «como hoje, C»):
  quick spring-like motion every day, the illustrative pieces only in the waits
  and the wins.
- **Calmo** — the same changes as cross-fades: nothing flies, bounces, swings or
  counts. A device that asks for reduced motion starts in Calmo until the person
  chooses otherwise.

### 2. «Definições» (owner)

A settings tab always at hand: on the home screen (where an ad is opened) and in
the editor. It holds **Movimento** (Ilustrativo · Sóbrio · Calmo, each with a small
live preview), **Tema** (Automático · Claro · Escuro) and **Vibração**. It replaces
today's small «Aparência» menu. In the editor it is a tab of the section bar (the
desktop rail and the floating phone bar), so it is there on the smallest phones
too (today the «Aparência» button hides at ≤ 400 px). Choices are kept on the
device and apply at once, everywhere (another open window follows).

### 3. Smoothness (from the walk-through)

1. Tapping «Vídeo» froze the app 6 s (PC) and 12–27 s (phone): the style gallery
   prepared ~20 videos at once, then animated them all. The panel must appear at
   once and the cards fill in without blocking a tap.
2. A tap on a template right after the gallery opened answered ~8.5 s late on
   the phone (thumbnails drawn in long blocking jobs): a tap must be answered
   within one job.
3. Changing theme ran ~200 colour transitions under the reveal (21 slow frames).
4. «Um toque novo ganha»: a navigation tapped during a screen animation was
   ignored; it must win (the animation jumps to its end and the new tap runs).
5. The export sheet stalled 0.3–0.65 s while rising on the phone.
6. iPhone Safari never showed the press (no `touchstart` listener, so no `:active`).

## Rules for every style (builder's calls, owner agreed: «concordo com tudo»)

- Nothing makes people wait: in Ilustrativo the everyday moments stay short (up to
  about 1 s); a new tap or key jumps the running animation to its end and acts.
  Only real waits (exporting, preparing photos) last as long as the wait.
- 60 frames per second on a mid-range phone: motion animates only transform and
  opacity (and clip-path / stroke-dashoffset for drawings); ambient motion pauses
  when the page is hidden.
- The ad and the video never change with the style — the motion is the app's.
- Vibration follows the moments that touch (tap, error, ready) and obeys «Vibração».
- Keyboard and screen readers unchanged: decorative pieces are `aria-hidden`,
  focus stays visible, a tap does exactly one thing.

## Non-goals

- No change to posters, video recipes or exports.
- No sounds in the interface.
- No new settings beyond the three groups above (owner: «penso que seja só isso»).

## Constraints

As before: offline from `file://` and as a PWA; classic scripts, no CDN, Preact +
htm; tests first (unit + `run-ui.html` + `run-mobile.html`); interface in
Portuguese; code and comments in English; the owner makes the commits.

## Acceptance

Manual, by the owner on his phone and PC: open «Definições» from the home and from
the editor; switch the three styles and feel each moment; the theme at night and
at dawn; tap «Vídeo» and keep working while the cards fill in; open a template
right after the gallery opens.

## Built and checked (2026-10-22)

Built natively from `documentation/plans/2026-10-22-motion-styles-settings-plan.md`;
every decision taken for the owner is a «Ruling» in the ledger
`Dev/.superpowers/sdd/2026-10-22-motion-styles-settings-plan/progress.md`.

- **Code:** `js/appearance.js` (the motion style: `motion` null → Ilustrativo, or
  Calmo when the device asks for reduced motion; `<html data-motion>`),
  `js/ui-motion.js` (`RS.ui`: the pill's swing, the brick on a press, the crane hook
  in the screen change, the crumbling card, the night scene, the leaning cards,
  exits as long as the style's), `js/app.js` («Definições»: the home's sheet and the
  editor's tab; the smoothness fixes), `assets/app.css` (everything Ilustrativo under
  `html[data-motion='illustrative']`; Sóbrio is the stylesheet as it was).
- **Smoothness** (phone 360 × 740, CPU slowed 4×, real touch): «Vídeo» worst frame
  0.72 s (was 11.7–26.7 s); the export sheet 0.22 s (was 2.76 s); a tap on a template
  waits at most one thumbnail (≤ 1.9 s; was 4.3–8.5 s); the night scene 16.9 ms p95;
  a new tap during a screen change wins.
- **Tests:** unit 127, browser 137 (`run-ui.html` + `run-mobile.html`), including
  every Ilustrativo moment, Calmo without flights, the «Definições» sheet and tab on
  the PC and the phone, and the smoothness cases.
- **Final review** (fresh reviewer, read-only): 0 critical, 3 important, 5 minor —
  all fixed (the important ones test-first).
- **Not checked here** (needs the owner's devices): the tilt with a real Android
  phone, the iPhone press and ticks, how fast the thumbnails fill in on a real
  mid-range phone.
