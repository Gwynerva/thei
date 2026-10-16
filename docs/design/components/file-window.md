# File window

A file's window is the modal a file is looked at in: the file itself, and
beside it — under it on a phone — a panel that says what it is and what can be
done with it. Four windows share it: the library's file, the editor a file is
taken into a place with, a placement's details, and a visitor's window on a
public page. They read alike, so a file is the same thing wherever it opens.

## When to use it

- Whenever a file is looked at in depth: in the library, while it is taken
  into a place, once it is placed, or when a visitor opens it.
- Not for choosing a file: that is the picker
  (`app/modals/pick-file/ModalPickReuseFile.vue`), which opens the editor
  once a file is chosen.

## Rules

The panel:

- Its header is one slim row: the kind's icon and a name. The library names
  the kind of file (Image, Video, Audio, File); a placement names its place's
  role; a visitor's window names the file by its title, in the text's colour.
  A panel that goes screen by screen puts its Back at the left of this row,
  never under it. On a phone the row also folds the panel.
- What it holds goes in sections one under another, each under a caption in
  small capitals with a count when it lists something, divided by a hairline.
  No section has a box or a ground of its own.
- Facts are a label over a value, three to a row: extension, size, and
  whatever the file has — its resolution, its length. Never a lone "0"; facts
  still coming hold their place with placeholders of their size.
- A footer, when there is one, is slim: the main action as one wide button,
  and square icon buttons for a way out — removing the file from its place,
  cancelling what runs, going on without a description. It stands right
  under what the panel holds, never at the bottom of a tall screen; only a
  panel too long for the screen scrolls above it, the footer staying in view.

The file's description:

- «Описание файла» ("File description") says what the file is or shows, for
  whoever cannot see it, for search and for an AI. There is one for a file
  and all its variants.
- It is `app/components/FileDescriptionField.vue` everywhere. Where the
  window is about one place — a placement, the editor — it is marked
  «Глобально» with a globe in the warning colour, whose hint says the
  description goes wherever the file is shown.
- A visitor's window always shows it, when it has one, first in its «Файл»
  group, before the facts.

The library's window:

- Its sections: the facts; the description, saved on its own; «Где
  используется»; «Как получен файл»; «Другие варианты».
- «Где используется» lists each place as a chip: the place's picture along
  the chip's right edge (its kind's icon when it has none), its name, and
  under it every way the file is used there, with how many times and how many
  of them are private. A section says its project above its name, from the
  chip's left edge, after a mirrored arrow going down to it and the project's
  icon. A chip opens the place's editor in a new tab.
- A file nothing uses says so in one quiet line with an icon and a «?» hint —
  when it goes, or that a text's history still keeps it — never with a count
  of nothing.
- «Другие варианты» lists every variant but the one open; a row turns the
  window to its variant in place.

The editor goes one screen at a time:

- «Как взять файл»: as it is, with a line of what that is; a saved variant,
  only when there are any, with how many; a new variant, with what making one
  does; and last «Другой файл», with the file icon and «Загрузить или
  переиспользовать», a hairline closing the list. The foot's button goes on
  with the file as it is.
- A saved variant and a new one open a screen of their own: the list, or the
  settings with what they make. The foot's one button goes on — or, for a
  video or an archive, makes it first, and goes on once it has been looked
  at. The choice is not repeated in the foot, and no notice says a file was
  uploaded before: the saved variants say it.
- Last, «Файл»: the description field alone, required, with a hint of why it
  matters. «Готово» is off until it holds words; to its left a grey square
  button with a dead face, «Продолжить без описания файла», goes on without
  one. Back returns to the screen the file was taken on.

A placement's window:

- The facts, then «Здесь» — what this place says of the file: its caption or
  title and description, whether it is private — then «Файл», the
  description, marked «Глобально».
- Its foot: remove from the place, «Изменить», and the main action.

A visitor's window:

- The caption of the place, in the text's colour; the «Файл» group, its
  description and then its facts; and «Где ещё используется», the other pages
  the file is shown on, as chips of the library's kind without a private
  count.
- Those pages are only ones a stranger may find and would see the file on:
  never the page the window is open over, a page open by its link alone, a
  private page, a file marked private, a private part of a text or an owner's
  note. The answer is the same for every reader, the owner and a share link
  included, and a file nobody may see answers as one that never was.
- Every variant of a file counts as the file: a reader does not know of
  variants.
- A chip goes to its page in the same tab, the window closing on the way; a
  click that asks for a new tab is the browser's.

## How it is built

- `app/modals/asset-modal/AssetModal.vue` — the window: the file
  (`preview`, `nav`, `buttons`) and the panel, whose header takes
  `asideTitle`, `asideIcon`, `titleStrong` and a `lead` slot for Back, whose
  `aside` slot scrolls and whose `footer` slot is the slim foot.
- `app/modals/asset-modal/AssetPanelSection.vue` — one section: the small
  capitals caption, its count, what it holds. The panel lays them with
  `divide-y divide-border-1`.
- `app/modals/asset-modal/AssetModalFileInfo.vue` — the facts; `pending`
  draws their placeholders.
- `app/modals/asset-modal/AssetPlaceChip.vue` — a place as a chip, its texts
  given formatted; `app/modals/asset-library/AssetUsageChip.vue` makes one of
  the library's placements.
- `app/components/FileDescriptionField.vue` — `global` adds «Глобально»,
  `required` the hint of why; an `embedded` one has no button of its own, and
  the window's action saves it through the exposed `save()`, reading `filled`
  and `saving`.
- The windows: `app/modals/asset-library/LibraryAssetDetailsModal.vue`,
  `app/modals/upload-settings/ModalUploadSettings.vue`,
  `app/modals/asset-details/AssetDetailsModal.vue`,
  `app/modals/public-asset/PublicAssetModal.vue`.
- `server/thei/assets/usage-media.ts` gives the library's places their
  pictures; `server/thei/public/file-places.ts` finds a visitor's places,
  answered at `/api/files/<slug>/places`: the library says where the file is
  placed, and each place is kept only when anyone may list it and the
  stranger's own build of its page carries the file.

```vue
<AssetPanelSection
  :title="phrase.asset_used_elsewhere"
  :count="places.length"
  data-asset-places
>
  <div class="flex flex-col gap-1.5">
    <AssetPlaceChip
      v-for="place in places"
      :key="place.href"
      :href="place.href"
      :media="place.media"
      :icon="assetSourceIcon[place.kind]"
      :title="assetSourceTitle({ type: place.kind, title: place.title })"
      :uses="place.uses.map((use) => assetUseLabel(use, place.kind)).join(' · ')"
      @click="goTo($event, place.href)"
    />
  </div>
</AssetPanelSection>
```

(Shortened from `app/modals/public-asset/PublicAssetModal.vue`.)

## Why

- The owner compared three layouts of the panel side by side and chose the
  sheet: sections under small captions, divided by hairlines, the facts as
  label over value. Cards in boxes and tabs both hid too much.
- «Расшифровка» became «Описание файла», and «Где стоит» «Где используется»;
  the places became chips with their pictures, read at a glance like the
  relations block. A description for each variant was weighed and dropped:
  "if the description changed, it is probably another file".
- The editor showed every choice and every setting at once; the owner asked
  for screens, Back in the panel's header, one wide button in the foot, and
  no line repeating the choice.
- The description comes last and is required because it is what a reader
  gets who cannot see the picture, and what search and an AI read; going on
  without it stays possible, on purpose and visibly.
- A visitor's «Где ещё используется» is there to draw a reader further in,
  and the owner asked for it with care not to leak anything private: hence a
  stranger's view built by the pages' own builders rather than a second set
  of rules.

## How it is checked

- `tests/e2e/admin-project-files.spec.ts` takes a file through the editor's
  screens and its description into a placement.
- `tests/e2e/asset-editor.spec.ts` and `tests/e2e/asset-library.spec.ts`
  cover the editor's screens and the library's chips.
- `tests/e2e/file-description.spec.ts` saves a description in the library
  and reads it on a public page.
- `tests/server/public/file-places.test.ts` and
  `tests/e2e/file-places.spec.ts` check what a visitor's window never names.
- `tests/server/assets/usage-media.test.ts` covers the places' pictures.
- Every window is looked at 375 px wide and at 960 × 720, in both themes.
