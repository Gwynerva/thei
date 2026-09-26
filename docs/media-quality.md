# Media quality levels and size estimates

How the asset editor's quality bar maps onto what is stored and encoded, and
where the sizes it shows come from. The stored recipe is described in
`shared/asset-upload-settings.ts`; this page is about the numbers.

## Levels

A variant is made at one of five named levels, or — for a raster image — at
the lossless stop past them. The recipe keeps the number a level stands for,
so files made by older versions at other numbers stay described exactly:

| Level    | Stored `quality` |    WebP quality | AVIF quality | Video bitrate × medium |  Opus |
| -------- | ---------------: | --------------: | -----------: | ---------------------: | ----: |
| minimal  |               40 |              40 |           30 |                    0.3 |  64 k |
| low      |               60 |              60 |           45 |                   0.55 |  96 k |
| medium   |               75 |              75 |           55 |                      1 | 128 k |
| high     |               90 |              90 |           65 |                    1.7 | 128 k |
| maximum  |               95 |              95 |           72 |                    2.8 | 128 k |
| lossless |              100 | `webp-lossless` |            — |                      — |     — |

A number between two levels reads the tables along the line between them
(`interpolateByQualityLevel`). Images default to high, videos to medium. The
tables live in `shared/asset-quality-levels.ts`.

## Video bitrate ladder

Video is encoded to a bitrate, not to a quality, because only then is the
size known before encoding — the same reason Premiere, Telegram and Steam can
show one. The target, in bits per second, is

```
3.5 Mbit/s × (pixels / 1920·1080)^0.85 × (fps / 30)^0.6 × level factor
```

capped by the source's own video bitrate rescaled to the output pixels (a
re-encode cannot add detail), and kept between 100 kbit/s and 60 Mbit/s.
libvpx-vp9 runs two passes at that rate (`-b:v`, `-maxrate 1.45×`,
`-bufsize 2×`, no `-crf`); a fast conversion is one realtime pass at the same
rate. See `videoTargetBitrate` in `shared/asset-upload-quality.ts` and
`buildVideoEncodePasses` in `server/thei/assets/process.ts`.

## Size estimates

- **Video**: `(video bitrate × 0.96 + audio bitrate) × duration / 8`, plus one
  percent and 4 KiB for the container. The 0.96 is where two-pass libvpx
  lands against its target on this project's clips. Shown as ≈ until the
  variant exists.
- **Images**: every quality stop is rendered on the server for real, the
  chosen stop first and the rest nearest first. Until a stop's render is in,
  its size is scaled from the nearest rendered level by a per-format ratio
  table, and before anything is rendered it is read off the source's bytes
  per pixel. Guesses are marked ≈ and replaced as renders arrive.

Both estimates are in `shared/asset-size-estimate.ts`.

## What is stored

Nothing about the levels: a recipe holds `quality` as a number (and
`format: 'webp-lossless'` for the lossless stop), exactly as before. A video's
`meta` additionally records `duration`, `fps` and `bitrate` of the stored
file; rows stored before that are filled in the first time they are read.

## Video previews

A video's preview is the frame that best shows it, not its first frame. The
video is looked at in seven points spread over its length, skipping the very
opening and end (`VIDEO_PREVIEW_FRAME_POSITIONS` in
`shared/media-frame-score.ts`); at each, ffmpeg's `thumbnail` filter picks the
most typical frame of the second that follows, and `frameScore` weighs it: the
most colourful, well exposed frame wins, so a dark or washed-out one loses
even with a tint. The admin's browser weighs the same points with the same
function to show a poster before a picked video is uploaded.

The video's `meta.previewAt` records the seconds the frame was taken from, and
`meta.previewScore` its score. A video without a score has a preview chosen
by an older version; the update task
`update/tasks/0.0.2-video-preview-frames.ts` remakes those while the site is
closed for the update, and the library's file card can remake one by hand.

An SVG's preview is drawn at the preview's own size (`svgDensityFor` in
`server/thei/assets/svg-density.ts`), not at the size of its units, and
`update/tasks/0.0.2-svg-previews.ts` redraws the ones an older version made.
SVGs that rely on features librsvg does not implement — CSS custom properties
(`var(--x)`) above all — rasterise wrongly everywhere a raster is made; the
vector itself is always shown by the browser.
