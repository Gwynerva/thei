---
title: Moon lamp
summary: A lamp shaped like the moon, printed on a 3D printer
featured: true
cv: true
icon: icon-square
banner: banner-wide
tags: [craft]
synonyms: [night light]
reminder: Film the assembly
notes: |
  Work out the cost in **pounds**.
links:
  - url: https://example.org/lamp-files
    note: Model files
  - url: https://example.org/lamp-private
    note: Supplier
    private: true
files:
  - file: manual
    title: Assembly guide
    caption: Print on A4
  - file: sources
  - file: budget
    private: true
showcase:
  - file: photo-a
    caption: The finished lamp
  - file: clip
  - file: photo-b
    private: true
statuses:
  - date: 2024-10-01
    text: Printing the shell
    file: photo-c
  - date: 2024-10-15
    text: Waiting for the wiring
  - date: 2024-10-20
    empty: true
action:
  text: Download the model
  link: https://example.org/lamp-files
  color: "#3a7bd5"
  icon: favicon
  background: auto
  size: cover
relations:
  - to: event:fair
    kind: affects
    note: where I first showed the lamp
  - to: diary:2021-03-04
    kind: related
    notes:
      this: it all started that day
      other: the day I came up with the lamp
---

A lamp shaped like the moon.

## How it works

A paragraph with **bold**, *italic*, ~~struck~~, :hint[a hint]{note="this explains it"}, [an external link](https://example.org/lamp "a note on the link"), [a relative one](/life/) and [the idea](<ref:section:lamp/idea#h:Where the idea came from> "why it is here").\
A new line after a break, and <b>bold</b> by its tag.

### Details

> A plain quote.

:::quote[The quote's caption]{align="center"}
A centred quote.
:::

- an item
  - a nested item
- another

3. third
4. fourth

:::list{counter="lower-roman"}
1. first
2. second
:::

- [x] done
- [ ] not done

---

::media[The lamp]{file="photo-a" layout="centered"}

::media[A wide shot]{file="photo-b" layout="stretch"}

::media[The video as it is]{file="clip" layout="natural"}

:::gallery{title="Gallery"}
::media[First]{file="photo-c"}
::media[Second]{file="anim"}
::media[Third — mother-of-pearl]{file="photo-d"}
:::

::audio[The motor's hum]{file="tone-mp3" title="Motor"}

::file[Print on A4]{file="manual" title="Guide"}

:::files{title="Materials"}
::file[Cost sheet]{file="budget" title="Budget"}
::file[The second file: herbarium]{file="sources" title="Sources"}
::audio[A recording]{file="tone-ogg" title="Recording"}
:::

::link[The parts shop]{url="https://example.org/parts"}

::card[The fair where I showed it]{to="ref:event:fair#:~:text=lamp"}

::embed{url="https://www.youtube.com/watch?v=M7lc1UVf-VE"}

:::spoiler
A hidden word: mandrake.
:::

:::private
What it really cost: a pawnshop.
:::
