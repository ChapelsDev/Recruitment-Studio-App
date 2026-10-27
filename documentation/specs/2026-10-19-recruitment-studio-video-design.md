# Recruitment Studio: video ads for Reels and Stories (design)

Date: 2026-10-19. Status: **approved by the owner on 2026-10-19 with the
recommendations**: silent video (music added in the Instagram app), 6 / 10 /
15 s with 10 s as the default, styles Dinâmico + Suave.
Builds on `2026-10-16-recruitment-studio-web-design.md` (rounds 1-3).

## Why

Instagram and Facebook give video (Reels, Stories) far more reach than still
images. The owner wants the same poster animated: the title comes in, the photo
moves, the contacts arrive at the end, exported as MP4, offline, from the app
that already exists.

## What the person does

- **Editor:** a "Ver animação" (play) button on the preview bar plays the
  animation in place, on a loop until pressed again. Nothing else changes in
  the editor; every edit still shows at once on the still poster.
- **Export:** the dialog gets a switch at the top: **Imagem | Vídeo**. Video
  options:
  - format: Story / Reel 9:16 (1080 × 1920, the default), Retrato 4:5,
    Quadrado 1:1;
  - duration: 6, 10 or 15 seconds (default 10);
  - style: **Dinâmico** (the default) or **Suave**;
  - languages, as for images; several videos go into a ZIP.
- **"Criar vídeo"** shows its progress ("A criar o vídeo… 45%") with a
  **Cancelar** button, following the round-3 loading rules. On a phone,
  **Partilhar** sends the MP4 to Instagram, Facebook or WhatsApp; the post
  text is copied too.
- File name: `<ad name>-<language>-<format>.mp4`, like the images.

## The animation (10-second Dinâmico)

The order follows how a poster is read. For 6 s the entrances run faster
(everything is in by about 3.3 s); for 15 s a little slower; the complete
poster always holds at least 2 s at the end
(time scale k = clamp((duration − 2.5) / 6.5, 0.55, 1.25)).

| Time | What happens |
|---|---|
| whole video | photo: slow push-in (100 % → 108 %) drifting towards its focal point (Ken Burns) |
| 0.0 s | template background and shapes already in place (first frame is never empty) |
| 0.2 s | logo or brand name fades in |
| 0.4–1.3 s | kicker, then the headline rising behind a mask, line after line |
| 1.3–1.8 s | intro fades in |
| 1.8–3.4 s | benefits one by one: icon pops, text slides in |
| 3.4–4.3 s | positions box slides in, items one by one |
| 4.3 s | badge stamps in (spring scale, slight turn) |
| 5.0–5.8 s | contacts and QR code rise in; the first contact pulses once at 6.5 s |
| 6–10 s | the complete poster holds, readable; the last frame is the complete poster, so Instagram's loop and cover image look right |

**Suave:** same order with fades and small moves only, longer easing, no pops.

## How it works (builder's calls)

- **Engine:** `RS.engine.render(ctx, project, { …, anim: { t, duration, style } })`.
  Without `anim`, rendering is unchanged: images, thumbnails and the editor
  stay exactly as they are.
- **No template changes:** every content block is already drawn through a few
  common helpers (`plan().draw` for kicker, headline, intro, benefits,
  positions and contacts; `photo`, `badge`, `logoAt`, `contactsRow`, `drawQR`).
  Each gets an enter/leave wrapper (alpha, move, scale, mask from the timeline,
  or "not visible yet"). Template decorations (bands, cards, caution tape) are
  part of the background.
- **Layout computed once per video:** the text fitting (`plan`) gives the
  same result on every frame, so it is cached for the video. Today a
  1080 × 1920 frame takes 9–41 ms because the layout is recomputed; the target
  is ≤ 12 ms per frame.
- **Encoder:** WebCodecs `VideoEncoder` (H.264 High, `avc1.640028`, hardware
  when available, 30 fps, about 8 Mbit/s) and `vendor/mp4-muxer.js`
  (mp4-muxer 5.2.2, MIT, single file, offline; `moov` at the start, as
  Instagram prefers). Frames are rendered as fast as the machine allows, not
  in real time, so no frame is ever dropped. Licence goes to `licenses/`.
- **Fallback:** without WebCodecs H.264 (old browsers), `MediaRecorder` records
  in real time (MP4 when supported), with a note that quality may vary. With
  neither, the video option says to use Edge or Chrome.
- **Responsiveness:** frames are produced in small batches that yield to the
  page, so the progress bar moves and **Cancelar** works.
- **Measured on 2026-10-19 (this PC):** Chrome 143 and Edge 155 from
  `file://` report a secure context, H.264 1080 × 1920 and AAC encoders, and
  MP4 `MediaRecorder`. 90 frames (3 s) rendered and encoded in 4.1 s with
  today's engine, giving about 0.6 MB; a 10 s video should be 2–6 MB.

## Built and measured (2026-10-19)

- Frame time with the layout cache: 4–10 ms at 1080 × 1920 (target ≤ 12 ms).
- A 10 s Story video: 4.7–5.3 s to create on this PC, about 8 MB (the photo
  moves in every frame, so more than first estimated); `ftyp > moov > mdat`;
  the browser plays it back at 10.00 s, 1080 × 1920. Two formats in a ZIP:
  5.8 s. Cancel stops at once and saves nothing.
- Edge 155 (headless, software encoder): 3 s video in 2.4 s, valid MP4.
- Extras found while building: the Estaleiro caution tape scrolls in the
  video; `afterPaint` no longer waits more than 50 ms in a throttled window;
  `loadFonts` no longer waits for a stylesheet that already loaded.

## Instagram notes

- Stories and Reels are 9:16. The existing "Zonas do Instagram" guide also
  applies to the video. Reels cover a little more at the bottom (caption), so
  the final frame keeps the contacts above that zone, as the story layout
  already does.
- Instagram's own music library (added in the Instagram app after upload) is
  licensed and helps reach; see decision 1.

## Decisions for the owner

1. **Music:**
   - (a) silent video; music added in the Instagram app (recommended);
   - (b) also accept an audio file of the owner's own (MP3/M4A), mixed in with a fade at the end;
   - (c) bundled royalty-free tracks (needs a licence check per track).
2. **Durations:** 6 / 10 / 15 s with 10 s as the default (recommended), or a
   single fixed length.
3. **Styles:** Dinâmico + Suave (recommended), or only one.

## Out of scope

Direct upload or scheduling through Meta's API, a per-element timeline editor,
GIF export, voice-over.

## Acceptance

Manual, by the owner: export a 10 s Story video from three templates, upload
one as a Reel and one as a Story, check that it plays, that the text is
readable and that the contacts are visible at the end; on the phone, share
with the button.
