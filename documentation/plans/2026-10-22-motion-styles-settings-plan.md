# Plan — three motion styles and «Definições»

Spec: `documentation/specs/2026-10-22-recruitment-studio-motion-styles-settings-design.md`.
Execution: native, test-first, ledger `Dev/.superpowers/sdd/2026-10-22-motion-styles-settings-plan/progress.md`
(every decision taken for the owner is a «Ruling:» line with its cost if wrong).

Commands (from `recruitment-studio-web/`): `node --test "tests/unit/*.test.cjs"`,
`node tools/test-browser.mjs run-ui.html run-mobile.html` (≈5 min). Visual and frame
checks: `.superpowers/receitas-video/motion-check.mjs [exe|phone] [calm]`, `guide-shots.mjs`.

## Task 1 — the motion setting

- `RS.appearance`: `motion: 'illustrative' | 'sober' | 'calm' | null` (null = not
  chosen: Calmo when the device asks for reduced motion, else Ilustrativo);
  `resolveMotion(choice, prefersReduced)`; `<html data-motion="illustrative|sober|calm">`
  set before the first paint; follows the device while not chosen.
- Every `data-motion='reduce'` rule and check becomes `'calm'` (CSS, `RS.ui.calm()`,
  app.js `reducedMotion()` reads the setting, tests).
- Tests: unit (defaults, junk, resolution, saved choice wins over the device);
  browser (data-motion on `<html>` before the first paint; Calmo still has no flights).

## Task 2 — «Definições»

- `SettingsPanel` (Movimento: three cards with a live mini preview each; Tema;
  Vibração) shared by: the home («Definições» button in the top bar → a sheet; on
  phones a bottom sheet) and the editor (a «Definições» tab in the rail and in the
  floating phone bar). The «Aparência» menu goes; its tests move to the new place
  (theme reveal from the option, the pill, vibration remembered).
- Tests: choose each style from the home and from the editor (desktop and 360 px
  phone); the choice is on `<html>` and kept; the phone bar keeps every button whole
  and ≥ 44 px; the sheet fits the phone; Escape and the close button return focus.

## Task 3 — smoothness: theme, taps, iPhone press

- Colour transitions off while the theme changes (`html.theme-switching`).
- «Um toque novo ganha»: a navigation tapped while a screen change animates skips
  that animation and runs.
- A passive `touchstart` listener so iPhone Safari applies `:active`.
- Tests: no colour transitions start during a theme change; back from the gallery
  tapped during its opening animation lands on the home; the listener exists.

## Task 4 — smoothness: «Vídeo», gallery, export sheet

- Style cards prepared one per task after the panel shows (placeholder until
  ready); only cards on screen animate.
- Thumbnail jobs yield to input between jobs (one job per task, not a frame loop).
- The export previews draw after the sheet has risen.
- Tests: the «Vídeo» panel is on screen within 300 ms of the tap with
  `RS.motion.prepare` slowed; a click queued behind slow thumbnail jobs runs after
  at most one job; the export sheet's entrance has no long task in it (preview
  drawn after the entrance). Checked again with `motion-check.mjs phone`.

## Tasks 5–12 — Ilustrativo moments (CSS under `html[data-motion='illustrative']`, small JS where needed)

5. **Um toque**: a brick jumps from the pressed primary control and lands (WAAPI on
   a fixed, pointer-free layer). Test: a brick appears on a primary tap in
   Ilustrativo only, and is gone after its animation.
6. **Abrir o editor / voltar**: the poster's View Transition hoists (lift, travel,
   set down with a small sway) with a crane hook travelling with it; editor chrome
   builds around. Test: the poster group carries the hoist keyframes and a hook
   takes part, only in Ilustrativo; Sóbrio keeps today's morph.
7. **Mudar de secção**: the pill swings (individual `rotate`, horizontal bars) or
   bounces (vertical rail) when it stops; panel blocks drop like bricks. Test:
   a swing plays after the pill arrives; blocks' animation is the drop.
8. **Linhas**: a new row is laid with mortar; a removed row tips and falls (longer
   exit in Ilustrativo). Test: names of the row animations per style.
9. **O início, vivo**: background crane with a swinging load, the wordmark's dots
   typing now and then, cards leaning with the pointer, a light sweep; paused when
   hidden. Test: ambient pieces only in Ilustrativo, aria-hidden, pointer tilt.
10. **Mudar de tema**: night-fall / dawn scene (sky rises, sun sets or rises,
    crane lights), the theme switched under it, a tap ends it. Test: the scene
    plays and the theme is set; a tap ends it at once.
11. **Mensagens e erros**: toasts hang from the hook and swing; error toasts get
    the site tape and swing in as a sign. Test: animation names per style.
12. **Apagar e guardado**: a deleted card crumbles into bricks, the grid closes the
    gap; «Guardado» draws a trowel stroke into a check. Test: crumble pieces appear
    then go; the card is deleted once (Anular still works); the check draws.

## Task 13 — calm, cost, docs, review, package

- Calmo audit: every new moment fades in Calmo (no transform animations), Sóbrio
  unchanged (its tests stay green).
- Frame cost on the phone (`motion-check.mjs phone`, CPU 4×) for the new moments.
- LEIA-ME («Definições», the three styles), spec «Built and checked».
- Full suite; fresh final reviewer (read-only) on the diff against
  `../web-publicar/recruitment-studio/`; fix Critical/Important test-first.
- `node tools/build-web.mjs`, `7z t` the ZIP.
