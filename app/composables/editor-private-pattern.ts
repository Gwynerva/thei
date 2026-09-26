interface PrivateSectionBrackets {
  start: HTMLElement;
  end: HTMLElement;
}

/**
 * The lock pattern of an editor's private sections: one box per section.
 *
 * Editor.js keeps every block a sibling of the others, so nothing in its tree
 * spans a section, and a pattern drawn per block starts its tiling afresh at
 * each block and breaks at every gap. Each section gets a box of its own
 * instead, laid from the line of its opening bracket to the line of its
 * closing one, the way the section is drawn on a page. The boxes live in
 * `root`, beside Editor.js's tree, which paints over them; `root` must be
 * positioned.
 *
 * The sections are the pairs `createEditorPrivateSections` marks on the block
 * holders. The boxes follow whenever a block is added, moved or removed, a
 * pair is marked or unmarked, or anything changes size.
 */
export function createEditorPrivatePattern(root: HTMLElement) {
  const redactor = root.querySelector<HTMLElement>('.codex-editor__redactor');
  const boxes: HTMLElement[] = [];
  let observed = new Set<Element>();
  let frame: number | undefined;

  const scheduleSync = () => {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      sync();
    });
  };

  // The redactor's height follows every block's, and a bracket's width
  // follows the text column's.
  const resizeObserver = new ResizeObserver(scheduleSync);
  // Blocks come and go as the redactor's children; typing inside a block
  // changes its size, which the resize observer already sees.
  const mutationObserver = new MutationObserver((mutations) => {
    if (
      mutations.some(
        (mutation) =>
          mutation.type === 'attributes' || mutation.target === redactor,
      )
    )
      scheduleSync();
  });
  if (redactor) {
    mutationObserver.observe(redactor, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-private-section-edge'],
    });
  }
  sync();

  function sections() {
    const opened = new Map<string, HTMLElement>();
    const found: PrivateSectionBrackets[] = [];
    const edges = root.querySelectorAll<HTMLElement>(
      '.ce-block[data-private-section-edge]',
    );
    for (const block of edges) {
      const bracket = block.querySelector<HTMLElement>(
        '[data-private-section-id]',
      );
      const sectionId = bracket?.dataset.privateSectionId;
      if (!bracket || !sectionId) continue;
      if (block.dataset.privateSectionEdge === 'start') {
        opened.set(sectionId, bracket);
        continue;
      }
      const start = opened.get(sectionId);
      opened.delete(sectionId);
      // An empty section has nothing to lie under.
      if (start && start.closest('.ce-block')?.nextElementSibling !== block)
        found.push({ start, end: bracket });
    }
    return found;
  }

  function sync() {
    const current = sections();

    const watched = new Set<Element>(redactor ? [redactor] : []);
    for (const { start, end } of current) watched.add(start).add(end);
    for (const element of observed)
      if (!watched.has(element)) resizeObserver.unobserve(element);
    for (const element of watched)
      if (!observed.has(element)) resizeObserver.observe(element);
    observed = watched;

    for (const box of boxes.splice(current.length)) box.remove();
    // Hidden, under another modal: nothing to measure until it is back.
    if (root.getClientRects().length === 0) return;
    const origin = root.getBoundingClientRect();
    const originX = origin.left + root.clientLeft;
    const originY = origin.top + root.clientTop;
    const places = current.map(({ start, end }) => {
      const from = start.getBoundingClientRect();
      const to = end.getBoundingClientRect();
      const top = from.top + from.height / 2;
      return {
        left: from.left - originX,
        top: top - originY,
        width: from.width,
        height: Math.max(0, to.top + to.height / 2 - top),
      };
    });

    places.forEach((geometry, index) => {
      let box = boxes[index];
      if (!box) {
        box = document.createElement('div');
        box.className = 'content-private-pattern';
        root.prepend(box);
        boxes.push(box);
      }
      for (const [property, value] of Object.entries(geometry)) {
        const length = `${Math.round(value * 100) / 100}px`;
        if (box.style.getPropertyValue(property) !== length)
          box.style.setProperty(property, length);
      }
    });
  }

  return () => {
    mutationObserver.disconnect();
    resizeObserver.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    for (const box of boxes.splice(0)) box.remove();
  };
}
