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
(`interpolateByQualityLevel`). Images and videos both default to medium; a
place with an upload profile of its own may start higher
(`shared/asset-upload-profiles.ts`). The tables live in
`shared/asset-quality-levels.ts`.

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

## Looking at the result exactly

A browser resamples an image whenever it is not drawn at a whole number of
device pixels per image pixel — and on a screen scaled to 125 % or 150 %, or
with the browser zoomed, "100 %" of an image's CSS size is not that. The
blur this adds looks like an artifact of the encode and is not one. The
preview and the comparison therefore measure their zoom in device pixels
(`useDevicePixelRatio`, `exactImageRendering` in
`app/modals/asset-modal/compare-media.ts`): 100 % is one pixel of the file
on one device pixel, "fit" never goes past it, and from 100 % up every side
is drawn nearest-neighbour (`image-rendering: pixelated`, which every
current browser honours for images; Chrome ignores it on video), so each
device pixel shows one pixel of the file as it is. Below 100 % a side is
smoothed, since dropping pixels would mislead as much. In seamless
comparison the larger side is shown at the smaller one's size and is the
one below 100 %; the real mode shows both at their own pixels.

## Dry runs, the queue and cancellation

The editor asks for its dry runs in order of worth (`draftRenderOrder` in
`app/modals/upload-settings/quality-stops.ts`): first the format "Use" would
store at the chosen stop, then the other formats "Auto" weighs there, then
the other stops nearest first. Three requests are under way at a time — as
many as the image lane runs on the largest box (`RenderPump` in
`render-pump.ts`) — so "Use" is enabled as soon as the first one answers, and
the rest fill in behind it. A settled change drops the requests no longer
wanted at once and sends new ones after a short pause; a failed one is only
asked for again on "Retry".

On the server every dry run is low priority (`server/thei/assets/queue.ts`):
a commit, an upload or a pasted file arriving later goes ahead of it. What a
dropped request does depends on where its job is. Still waiting for a slot, it
leaves the queue. Encoding a video, ffmpeg is killed. Encoding an image, sharp
runs to the end — it cannot be stopped — and the result is kept as a render of
the draft, so asking for it again costs nothing. A commit whose request has
gone stores nothing; an image it had already encoded becomes a render of the
draft the same way.

A commit reports where it is under the `uploadId` the client gave it, polled
at `GET /api/admin/uploads/<id>`: `queued` while it waits for a slot,
`processing` (with a share for video and zip; sharp reports none), then
`finishing` while the preview is made and the file moved into the library.

A quick commit — a picture, usually a render the editor already judged — is
stored within its request, and "Cancel" closes that request. A video encode
or a zip (`isLongCommit` in `shared/asset-upload-settings.ts`) runs as a job
instead (`server/thei/assets/jobs.ts`): the request answers `202` at once, the
client polls the same address every second until the job reports `done` with
the variant or `failed` with the error's message and code, and `DELETE` there
cancels it — on "Cancel", when the editor closes, and as the tab goes. No
connection has to stay open for the minutes an encode takes, so neither a
dropped connection nor a proxy's read timeout can cut it short. A job nobody
has polled for ten minutes is cancelled as a safety net. Jobs live in memory
like drafts: after a restart the client is told the draft is gone and stages
the file again. One long job runs per draft; a second request meanwhile is
answered `409`.

Behind a reverse proxy, the timeouts in `update/instance/nginx.conf.example`
now only have to cover the upload of the file itself and a quick commit.

A picture or a video pasted into the text is stored without asking, through
a draft of its own, at medium quality, the whole frame at its own size, in
the format the long-side rule picks (`shared/asset-paste-defaults.ts`). SVG
and GIF are kept as they are: a re-encode would rasterise the one and flatten
the other. The block shows the upload's progress and offers the asset editor
meanwhile; the editor opens on the same draft, and an image encode the default
had finished is its first dry run. Dismissing the editor lets the default go
on. A gallery pasted as several files stores them two at a time, since the
server keeps only a few drafts and the editor may hold one.

A new file is never lost to its first variant. Whenever a draft that owns its
staged upload — a paste, or a file just picked in the editor — commits
anything but the file as it is, the upload is stored beside that variant in
the same commit, unchanged but for its metadata, as the unprocessed variant
of the same family (`keepOriginal` in `server/thei/assets/drafts.ts`). Nothing
uses it, so the library lists it as unused and the cleanup takes it a day
after its last touch; the editor's list of variants shows the date. Until
then, the editor opened on the pasted file derives every new variant from
that original rather than from the compressed file, and opening it as a base
starts its day again. Picking the same file once more meanwhile finds it,
as the picker finds any file already stored, and the editor opens on the
variants made from it. A failure to keep it is logged and does not cost the
variant.

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
