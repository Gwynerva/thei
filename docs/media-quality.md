# Media quality levels and size estimates

How the asset editor's quality bar maps onto what is stored and encoded, and
where the sizes it shows come from. The stored recipe is described in
`shared/asset-upload-settings.ts`; this page is about the numbers.

## Levels

A variant is made at one of five named levels, or — for a raster image — at
the lossless stop past them. The recipe keeps the number a level stands for,
so files made by older versions at other numbers stay described exactly:

| Level    | Stored `quality` |    WebP quality | AVIF quality | Video bitrate × medium | Video's Opus | Recording, stereo / mono |
| -------- | ---------------: | --------------: | -----------: | ---------------------: | -----------: | -----------------------: |
| minimal  |               40 |              35 |           30 |                    0.3 |         64 k |              48 k / 24 k |
| low      |               60 |              62 |           45 |                   0.55 |         96 k |              64 k / 32 k |
| medium   |               75 |              80 |           55 |                      1 |        128 k |              96 k / 48 k |
| high     |               90 |              86 |           65 |                    1.7 |        128 k |             128 k / 64 k |
| maximum  |               95 |              89 |           72 |                    2.8 |        128 k |             160 k / 80 k |
| lossless |              100 | `webp-lossless` |            — |                      — |            — |                        — |

A number between two levels reads the tables along the line between them
(`interpolateByQualityLevel`). Images, videos and recordings all default to
medium; a place with an upload profile of its own may start higher
(`shared/asset-upload-profiles.ts`). The tables live in
`shared/asset-quality-levels.ts`.

The recipe describes what was asked for, not what an encoder was told. The
WebP column dates from 0.0.9: 0.0.8 and earlier gave libwebp the stored
number as it was, so a WebP file they made at `quality` 75, 90 or 95 was
encoded at libwebp 75, 90 or 95, where the same recipe now encodes at 80, 86
or 89. Such a file keeps its recipe and its settings key, and its bytes are
its own; nothing re-encodes it.

## Recordings

A recording is stored as Opus in WebM, under the extension `weba` (MIME
`audio/webm`): the codec and container video sound already uses, played by
every current browser — Chrome, Edge, Firefox, and Safari from 16 on macOS
and 17.4 on iOS — and the smallest of what they all play. At medium, stereo
is 96 kbit/s, which Xiph puts at the low end of storing music and near
transparent for it; mono is half of that, more than a voice needs. A minute
of WAV is about 10 MB; at medium it is 0.7 MB, or 0.35 MB in mono.

The bitrate is capped by a lossy source's own (`audioTargetBitrate` in
`shared/asset-upload-quality.ts`): an MP3 at 64 kbit/s is not re-encoded at 96. A lossless source — PCM, FLAC, ALAC — has no such ceiling. Anything with
more than two channels is folded into stereo, and "Mono" folds it into one;
a mono source is always described as mono, so both spellings share one
settings key (`audio-transform:q75:mono:1`). The encode
(`buildAudioEncodeArgs` in `server/thei/assets/audio.ts`) is

```
-map 0:a:0 -vn -map_metadata -1 -map_chapters -1
-c:a libopus -b:a <bitrate> -vbr on -ar 48000 -ac <1|2>
-fflags +bitexact -flags:a +bitexact -f webm out.weba
```

— the muxer is named because ffmpeg does not know `weba`, and `bitexact`
keeps its own version out of the bytes, so one source and one recipe always
make one file. A recording pasted into the text is converted at medium
without asking, unless it is already Opus in a `weba`: a second pass would
only lose a little more.

Every stored recording, converted or kept as it is, is decoded once more
right after it is made (`readAudioDetails`): to 8 kHz mono PCM on a pipe,
measured as it flows, never held whole. Its `meta` records the `duration`
counted from the samples (an MP3's header may only guess it), its
`channels` and `bitrate`, and 128 `peaks`: the loudest 10 ms RMS window of
each slice, normalised to the loudest slice and put through a square root,
so quiet speech still shows. The player draws those before it loads a byte
of sound. Recordings run in a lane of their own (`server/thei/assets/queue.ts`):
libopus takes one core and little memory, so a recording never waits behind
a video encode. Recordings stored before 0.0.4 are read by the update task
`update/tasks/0.0.4-audio-waveforms.ts`; one that cannot be read gets an
empty waveform and no length, and its player asks the file.

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
`-bufsize 2×`, no `-crf`), both at `cpu-used 4`. There is no single-pass
road: on the media bench one pass, good or realtime, came out anywhere from
0.83 to 3.2 of the size promised — a screen recording at three times it —
and three to eight VMAF points under two passes, so the fast conversion of
0.0.7 was dropped in 0.0.8 (`update/migrations/0.0.8-fast-conversion.ts`
takes the mark off the recipes it left). See `videoTargetBitrate` in
`shared/asset-upload-quality.ts` and `buildVideoEncodePasses` in
`server/thei/assets/process.ts`.

## Size estimates

- **Video**: `(video bitrate × 1.02 + audio bitrate) × duration / 8`, plus one
  percent and 4 KiB for the container. The 1.02 is where two-pass libvpx
  lands against its target with both passes at `cpu-used 4`: 0.99–1.05 on
  five clips of the media bench, a screen recording and a still camera among
  them. Shown as ≈ until the variant exists.
- **Recordings**: `(bitrate + 3 kbit/s) × duration / 8 + 1 KiB`, the 3 kbit/s
  being what WebM spends around Opus's 20 ms packets. Opus in VBR mode takes
  the rate as a target: varied sound lands near it, a "stereo" recording of
  one voice or long quiet stretches come out well under it (pink noise with
  the same sound in both channels: 66 kbit/s of a 96 target), and only
  something as bare as a pure tone goes over (106). Shown as ≈ until the
  variant exists.
- **Images**: every quality stop is rendered on the server for real, the
  chosen stop first and the rest nearest first. Until a stop's render is in,
  its size is scaled from the nearest rendered level by a per-format ratio
  table, and before anything is rendered it is read off the source's bytes
  per pixel. Guesses are marked ≈ and replaced as renders arrive.

Both estimates are in `shared/asset-size-estimate.ts`.

## Images: how a transform is made

A transform (`processImage` in `server/thei/assets/process.ts`) reads the
source with sharp, orients it by its EXIF, applies the admin's turn, cuts the
crop and resizes it to the size asked for, then encodes: AVIF at the level's
quality with `effort: 3`, WebP at the stored quality with `effort: 4` and
smart subsampling, or lossless WebP with `effort: 4`. Encoding drops every
embedded tag, so the orientation is baked into the pixels first; an
embedded colour profile — Display P3 from a phone, say — is converted to
sRGB by sharp on the way.

Decoding is the expensive part of a large photo, and libvips can decode a
JPEG already shrunk by two, four or eight — but only when nothing has to
happen to the full-size picture first. So whenever the output is no larger
than its crop, the whole frame is resized by the crop's scale and the crop is
cut out of the result, in the turned frame (`planResizeBeforeCrop`): sharp
applies the orientation and the turn after the resize and before a later
extract, and sizes the resize in the turned frame, so the pixels come out
the same, truer even at the crop's edge, where the resampler sees the real
neighbours. An enlargement — allowed for a vector only — and an SVG, drawn
at a density of its own, keep the plain order: crop, then resize.

The decoder's warnings — a mangled EXIF block, an odd colour profile, a few
stray bytes before a marker — do not refuse a photo (`failOn: 'truncated'`);
a file cut short still does.

A transform's 720 px preview is not decoded from the finished AVIF, which
would mean the whole picture at full size again: it is the transform once
more at the preview's size, from the source, with the same crop and turn
(`renderImagePreview`, `MediaPreviewOrigin` in `media-preview.ts`). A kept
original, a vector kept a vector and a file brought in without its source
are drawn from the stored bytes.

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

## The media bench

Every number above is weighed on `tests/bench/media.test.ts`, which runs
only when asked: `bun run bench:media` writes
`tests/.artifacts/media-bench/report.md` — decode times with and without
shrink-on-load, each encoder setting at each level with its time, size,
SSIM and PSNR against the source, each video preset with its time, speed
against real time, size against the estimate and VMAF, and sound — on
pictures, clips and a recording the bench makes itself
(`tests/helpers/media.ts`), or on the owner's own files from
`THEI_MEDIA_BENCH_SOURCES=<dir>`. `bun run bench:media:docker --cpus 1`
runs the same in the release bench's Debian image with the CPU and memory
of a small VPS, where the waits the owner feels are. A change to an
encoder's settings comes with the bench's rows before and after in its
commit.

What it found on 2026-11-08 (Ryzen 5 5600X, twelve threads; a synthetic
24-megapixel photo for the decode and the WebP, lossless, preview and video
rows, four 7.5-megapixel phone photographs for the AVIF rows):

| Step                        | Before                                | After                                  |
| --------------------------- | ------------------------------------- | -------------------------------------- |
| Decode for a 1600 px crop   | 251 ms, whole picture                 | 123 ms, shrunk on load                 |
| AVIF medium, phone photo    | effort 4: 3.0 s, 679 KB, SSIM 0.9670  | effort 3: 0.75 s, 683 KB, SSIM 0.9664  |
| AVIF maximum, phone photo   | effort 4: 4.2 s, 1279 KB, SSIM 0.9855 | effort 3: 0.95 s, 1275 KB, SSIM 0.9845 |
| WebP medium, 24 MP          | effort 6: 3.3 s, 765 KB               | effort 4: 2.8 s, 780 KB                |
| Lossless WebP, 24 MP        | effort 6: 14.0 s                      | effort 4: 12.1 s, same bytes           |
| 720 px preview              | effort 4: 215 ms                      | effort 3: 114 ms, same bytes           |
| VP9 two passes, 1080p, 20 s | cpu-used 4 → 2: 65 s, VMAF 73.4       | cpu-used 4 → 4: 35 s, VMAF 72.8        |

AVIF's quality table is as it was: at effort 3 and the same quality a real
photograph comes out within three percent of its old size and 0.0005–0.003
lower in SSIM, a fraction of the step between two levels. A synthetic
picture had the file a quarter larger at effort 3 and suggested lower
qualities; on photographs those cost a full level, so they were not kept.
4:2:0 chroma, which would have been faster still, lost a decibel of PSNR
and was not taken.

## Image formats: one quality for a level, and what "Auto" picks

A level is the same closeness to the source in AVIF and in WebP: each has a
table of its own (`AVIF_QUALITY_BY_LEVEL`, `WEBP_QUALITY_BY_LEVEL`). WebP
cannot take the stored number as it is: libwebp's scale has a knee at 75
(`QualityToCompression` in its `quant_enc.c`), three times steeper above it
than below, so 40, 60 and 75 are nearly one quality and 90 and 95 twice
AVIF's size.

"Auto" stores a picture in whichever format comes out smallest for the exact
settings, on real sizes (`recommendImageFormat` in
`shared/asset-image-format-auto.ts`):

- A photograph is AVIF at once. Nothing else is encoded for it until chosen;
  a format not encoded shows a guess of its size.
- Anything else is weighed. AVIF and WebP decide as soon as both are
  encoded; lossless WebP takes the longest, joins when it arrives and takes
  the choice over only when it is also the smallest.

A picture committed from a draft with no format named — a file pasted into a
text — gets the same choice on the server (`autoFormat` in
`server/thei/assets/drafts.ts`). A variant made outside a draft with no
format named — the admin's direct upload (`POST /api/admin/assets`), a file
an app brings over MCP — is not weighed: it is AVIF, or WebP when its long
side is under 128 pixels (`resolveAssetImageFormat` in
`shared/asset-upload-settings.ts`).

The server tells a photograph when a draft opens
(`server/thei/assets/image-content.ts`, `photographic` of the draft). The
picture's brightness is cut into blocks of 16×16 pixels, and the share of
blocks holding one value, or two to four, is counted: the count AV1 encoders
decide "screen content" by, with the flat blocks counted too, so a large
drawing, nearly all flat blocks, stays a drawing. Under 10 % of such blocks
is a photograph; anything else, and any picture of fewer than 64 blocks, is
weighed. A picture over four megapixels is sampled by the nearest pixel,
each taken as it is; only a JPEG of 64 megapixels and more is first decoded
at half its size or less by libjpeg, which averages. Counting a 45-megapixel
JPEG takes under a second, nearly all of it the decode.

Both rules are weighed on real pictures. `bun run bench:corpus` brings 111
free ones — photographs, screenshots of 3D and 2D games, logos, diagrams and
interface screenshots, 72 to 8256 pixels — listed with their authors and
licences in `tests/bench/image-corpus/manifest.json`; eighteen are kept in
`tests/fixtures/image-content/` and hold the threshold in the ordinary
tests. What the two benches found on 2026-11-10 (libaom 3.15, libwebp 1.6):

`bun run bench:image-quality` sweeps both encoders over 48 of the pictures at
every fifth quality and puts each result against its source by SSIM and PSNR
of the brightness, XPSNR and VMAF. Brightness, because AVIF keeps colour
whole and lossy WebP at half the resolution, which an eye sees far less than
a count over red, green and blue does: such a count puts the matching WebP
qualities 3 to 14 points too high.

| Level   | AVIF | WebP as close | WebP against AVIF, bytes, photographs |
| ------- | ---: | ------------: | ------------------------------------: |
| minimal |   30 |            35 |                                 ×1.85 |
| low     |   45 |            62 |                                 ×1.37 |
| medium  |   55 |            80 |                                 ×1.39 |
| high    |   65 |            86 |                                 ×1.37 |
| maximum |   72 |            89 |                                 ×1.35 |

- The four measures agree. At these pairs VMAF differs by less than a point
  and XPSNR by about a decibel on photographs and game screenshots, except
  at minimal, where WebP at 35 is still a little the closer.
- A photograph weighs about 0.73 of its WebP at the same closeness, which is
  what others measured at equal DSSIM (a median of 27 % smaller).
- A drawing would need more than WebP has: at high and maximum most never
  get as close as AVIF at any WebP quality.

`bun run bench:image-content` counts the blocks of all 111 and encodes each
at every level in every format.

- AVIF is the smallest of the three for 97 to 107 of the 111, by level.
  Lossy WebP is the smallest four times in the 555 encodes: two night
  photographs at low (AVIF 5 % and 11 % larger), one of them at medium
  (2 %), one small drawing at maximum (3 %).
- Lossless WebP is the smallest at some level for 13: a 72-pixel icon, too
  small to count blocks in, and twelve pictures with 24 % of flat and
  few-valued blocks or more. The least drawn logo or diagram has 13 %.
- Under 10 % are 33 pictures: 19 of the 27 photographs, 4 of the 19 3D
  screenshots, no logo and no diagram. Storing them as AVIF without looking
  costs those two night photographs their 5 % and 11 % at low, and saves 57 %
  of the time one encode in each format takes over the corpus.

## Dry runs, the queue and cancellation

The editor asks for its dry runs in order of worth (`draftRenderOrder` in
`app/modals/upload-settings/quality-stops.ts`): first the format "Use" would
store at the chosen stop, then the other formats "Auto" weighs there —
lossless WebP last, and none at all for a photograph — then the other stops
nearest first. Three requests are under way at a time — as
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
at `GET /api/admin/uploads/<id>`: `queued` while it waits for a slot, then
`processing` with one share that only grows — the encode takes it to 90 %
where the encoder measures it (ffmpeg and the zip writer do, sharp does not),
and it stands at 95 % while the preview is made and the file moved into the
library (`shared/api/asset-upload-progress.ts`). The client never shows a
share lower than the one it showed (`advanceUploadStatus`), whichever of its
two polls answers first.

A quick commit — a picture, usually a render the editor already judged — is
stored within its request, and "Cancel" closes that request. A video or audio
encode, or a zip (`isLongCommit` in `shared/asset-upload-settings.ts`), runs
as a job instead (`server/thei/assets/jobs.ts`): the request answers `202` at
once, the client polls the same address every second until the job reports
`done` with the variant or `failed` with the error's message and code, and
`DELETE` there cancels it — on "Cancel", when the editor closes, and as the
tab goes. No connection has to stay open for the minutes an encode takes, so
neither a dropped connection nor a proxy's read timeout can cut it short. A
job nobody has polled for ten minutes is cancelled as a safety net. Jobs live
in memory like drafts: after a restart the client is told the draft is gone
and stages the file again. One long job runs per draft; a second request
meanwhile is answered `409`.

Behind a reverse proxy, the timeouts in `update/instance/nginx.conf.example`
now only have to cover the upload of the file itself and a quick commit.

A picture or a video pasted into the text is stored without asking, through
a draft of its own, at medium quality, the whole frame at its own size, in
the format "Auto" picks (`shared/asset-paste-defaults.ts`). SVG
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
file; rows stored before that are filled in the first time they are read. A
recording's `meta` (`AudioAssetMeta`) records `duration`, `peaks`, `channels`
and `bitrate`, as described above.

## Video colour

A source is read through ffprobe's JSON (`server/thei/assets/probe.ts`):
its size, rate, codecs, the rotation in its side data, and its pixel format
and colour — transfer, primaries, matrix. Phones record ten-bit HDR now, as
PQ (`smpte2084`) or HLG (`arib-std-b67`) in BT.2020, and a browser shows a
VP9 file in SDR; written as if it were SDR already, such a video comes out
grey and flat, every colour washed out. So an HDR source is mapped down
(`videoColorFilters` in `process.ts`), after the scale so the work is done
on the small frame: to linear light, into BT.709 primaries, the highlights
rolled off with Hable's curve and the hues kept (`tonemap=hable:desat=0`),
back into video levels and `yuv420p`, and the file is tagged BT.709. The
mapping is told the source's transfer, primaries and matrix as the probe
read them rather than left to find them in the frames, and takes BT.2020
for primaries or a matrix left untagged: a file tagged by its transfer
alone would otherwise yield not a single frame, no encode and no still. A
ten-bit SDR source is only brought to eight bits by the output's pixel
format, and an SDR file keeps the colour tags it came with. The poster frame
and the chosen frame go through the same mapping (`video-thumbnail.ts`), or
the still of an HDR video would be washed out where the video is not. What
is not mapped: an SDR recording in BT.2020 primaries, wide gamut without an
HDR transfer, keeps its tags and is shown as the browser reads them; such
files are rare, and the mapping is for PQ and HLG.

ffmpeg itself is a static build the engine pins and fetches, not a package
(`update/README.md`, "ffmpeg").

## Video previews

A video's preview is the frame that best shows it, not its first frame. The
video is looked at in seven points spread over its length, skipping the very
opening and end (`VIDEO_PREVIEW_FRAME_POSITIONS` in
`shared/media-frame-score.ts`); at each, ffmpeg's `thumbnail` filter picks the
most typical frame of the second that follows, and `frameScore` weighs it: the
most colourful, well exposed frame wins, so a dark or washed-out one loses
even with a tint. ffmpeg writes the frame it picked no larger than the
preview (`maxSide`), so a frame of a large video is never read back whole.
The admin's browser weighs the same points with the same function to show a
poster before a picked video is uploaded.

The video's `meta.previewAt` records the seconds the frame was taken from, and
`meta.previewScore` its score. A video without a score has a preview chosen
by an older version; the update task
`update/tasks/0.0.2-video-preview-frames.ts` remakes those while the site is
closed for the update.

The owner may also choose the frame by hand, in the file's window: the frame
the player stands at is taken exactly (`extractVideoThumbnail` with `at`, a
seek and one frame, no `thumbnail` filter; the seek starts a frame early, as
the video's `fps` says, since a paused player shows the frame that began at
the moment or before it), still scored, for every video of
the family, each from its own bytes so a crop or a turn keeps its own picture
(`chooseVideoPreviewFrame` in `server/thei/assets/storage.ts`, in the video
lane). `meta.previewChosen` marks it: a remade preview keeps the moment, and a
variant made later takes the same one. Choosing "automatically" again drops
the mark and picks as on upload. The public poster's address carries the
frame in `?preview=` (`publicPreviewToken` in `server/thei/assets/urls.ts`),
so a browser that kept the old still for a day asks for the new one.

An SVG's preview is drawn at the preview's own size (`svgDensityFor` in
`server/thei/assets/svg-density.ts`), not at the size of its units, and
`update/tasks/0.0.2-svg-previews.ts` redraws the ones an older version made.
SVGs that rely on features librsvg does not implement — CSS custom properties
(`var(--x)`) above all — rasterise wrongly everywhere a raster is made; the
vector itself is always shown by the browser.
