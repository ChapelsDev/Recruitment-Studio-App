# Plan: video ads (MP4) for Reels and Stories

Status: **all 7 steps done and browser-tested on 2026-10-19** (results in the
spec, "Built and measured"). Pending: the owner's acceptance on Instagram.

Spec: `../specs/2026-10-19-recruitment-studio-video-design.md` (approved
2026-10-19 with the recommendations: silent, 6/10/15 s default 10, Dinâmico +
Suave). All paths below are inside `recruitment-studio-web/`.

1. **Assets:** `tools/build-assets.mjs` adds the `play` and `video` icons to
   `APP_ICONS` and vendors `mp4-muxer` 5.2.2 (`build/mp4-muxer.js`, global
   `Mp4Muxer`) to `vendor/mp4-muxer.js` with `licenses/mp4-muxer-MIT.txt`.
   Re-run it with the same unpacked packages; only `js/icons.js` and the new
   files may change.
2. **Engine (`js/engine.js`):** `animState({ duration, style })`, and
   `render(…, { anim })`. Entrances: logo, kicker, headline line by line
   (mask), bar, intro, benefits one by one, positions box then items, badge
   stamp, contacts row by row, QR, first-contact pulse; photo Ken Burns
   (100 % → 108 %). Entrance times shrink for short videos
   (k = clamp((duration − 2.5) / 6.5, 0.55, 1.25)), so the complete poster
   always holds ≥ 2 s. `plan()` results cached per video; `hit()` is a no-op
   in video mode. Without `anim` nothing changes.
3. **Encoder (`js/video.js`, new):** `RS.video.support()` (WebCodecs H.264,
   else MediaRecorder, else none) and `RS.video.create(project, opts)` →
   MP4 `Blob`, with progress and cancel (`AbortSignal`), 30 fps, 8 Mbit/s,
   key frame every 2 s, `fastStart: 'in-memory'`. Real-time `MediaRecorder`
   fallback.
4. **Model (`js/model.js`):** `project.video = { duration: 10, style: 'dynamic' }`
   in `newProject` and `normalize`.
5. **Interface (`js/app.js`, `assets/app.css`):** "Ver animação" on the
   preview bar (plays in a loop, stops on a click or an edit); export dialog
   switch **Imagem | Vídeo** with format (default Story), duration, style,
   languages, animated preview, "Criar vídeo" with "A criar o vídeo… 45%"
   and Cancelar, Partilhar on phones, ZIP for several.
6. **Wiring:** `index.html` loads `vendor/mp4-muxer.js` and `js/video.js`;
   the dev `sw.js` core list gains both; `LEIA-ME.md` explains the video.
7. **Checks:** frame time ≤ 12 ms at 1080 × 1920 on this PC; an exported
   MP4 decodes in the browser with the right duration and size and has
   `moov` before `mdat`; no console errors; same in Edge headless; rebuild
   `web-publicar` with `tools/build-web.mjs`.
