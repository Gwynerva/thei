# Select

`FieldSelect` is the one way to choose one option among several from a list
that opens: a sort order, a format, a model, the service it comes from. Its trigger
stands where a field would and shows the chosen option; the options open in a
popup under it, with a small filter at its foot. It is the same everywhere, so no
select of the site is the browser's own while another is a popup.

## When to use it

- A choice of one option among several that does not need to stay in sight:
  in a form, in a toolbar, as a filter of a list.

Not for:

- a handful of options that should all stay in sight, each with a title or a
  description — that is `FieldOptions`, a row of option cards;
- named stops along one track, compared at a glance — `FieldDiscreteBar`;
- on or off — `FieldToggle`;
- a menu of actions — a popup of buttons, not a choice that stays chosen.

## Rules

- Never a native `<select>`, never a dropdown made by hand.
- Options are real choices only. While nothing is chosen, the trigger shows a
  faded `placeholder`; no «choose…» option stands for none.
- Give options icons where they mean something — a format, a kind — and none
  where they would only decorate.
- Keep the height stable: a text field's in a form, a toolbar's with `compact`.
- Say what is being chosen: `label` heads the popup and names the trigger; an
  `aria-label` only names it; inside a `Field` its `FieldLabel` does both.
- A filter of a list is a `filter` select: its first option narrows nothing,
  and the list's counts go on the options.
- In a row that must fit a phone, make it `collapsible`: the chosen option
  shrinks to its icon there.

## How it is built

`app/components/field/FieldSelect.vue`, generic over the value's string type.

| Prop          | What it does                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `v-model`     | The chosen value.                                                                               |
| `options`     | A list of `SelectOption`, or a record of labels by value for options with nothing more to them. |
| `label`       | What is chosen: heads the popup and names the trigger.                                          |
| `placeholder` | What the trigger says, faded, while none of the options is chosen.                              |
| `compact`     | As tall as a toolbar's controls (`h-10`, `h-11` under a finger).                                |
| `filter`      | A filter of a list, see below.                                                                  |
| `collapsible` | Below `sm`, the chosen option by its icon alone.                                                |
| `wide`        | As wide as its place rather than its options.                                                   |
| `warning`     | Shown in the trigger in place of the chosen option, in the warning colours.                     |
| `disabled`    | Faded words; the field itself stays opaque.                                                     |

A `SelectOption` has a `value` and a `label`, and may have an `icon`, a `hint`
under the label, a `count`, a `badge`, a `group` heading it begins, `indent`
under the option before it, `leads` (a chevron: choosing it goes further), and
a `divider` after it.

```vue
<FieldSelect
  v-model="order"
  :options="{ newest: phrase.sort_newest, oldest: phrase.sort_oldest }"
  :aria-label="phrase.sort_order"
  compact
/>
```

Behaviour that comes with it:

- The trigger is as wide as its longest option, so a choice never moves what
  stands beside it.
- The popup is at least as wide as the trigger, grows to 20rem tall at most and
  scrolls inside; it is a `FloatingPopup` (see [Popups](popups.md)).
- The filter stands below the options and stays in sight while they scroll:
  above them it would come between a group's heading and its choices, and a
  popup turned up over the trigger brings it next to the trigger.
- The filter is in focus as it opens — except on a touch screen, where it waits
  for a tap. Letters narrow the list, the arrows walk it, Enter picks; Tab
  closes it and moves on; Escape gives the focus back to the trigger.
- The option Enter would pick is ringed in the accent, as the keyboard's focus
  is, apart from the shade a pointer gives — the chosen one too, when it is
  the one.
- As a `filter`, any choice but the first is drawn in the accent, so a narrowed
  list is never taken for the whole; an option counted empty is faded and
  cannot be picked, unless it is the choice already.

The search row of the library, `app/components/AssetLibrarySearch.vue`, shows
two filter selects beside the search field, `compact` and `collapsible`.

## Why

- The owner found a mix of native and popup selects pointless, and options that
  do nothing — «Choose a service» — worse: an empty choice is the placeholder's
  job.
- A select that changed height between a form and a toolbar made rows jump.

## How it is checked

- `tests/e2e/link-picker.spec.ts` opens selects, picks by filter and keys,
  and checks their popups with `expectPopupUsable`.
- A new use is checked in the browser at a phone's width, where `collapsible`
  and the popup's placement matter.
