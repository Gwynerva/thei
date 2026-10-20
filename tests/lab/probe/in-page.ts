// The probe's measuring, done inside the page: one function with nothing
// outside it, handed whole to `page.evaluate(runProbe, options)`. It reads
// the layout as it stands and changes nothing — no marks, no scrolling, no
// focus — so the screenshot taken beside it is of the same page.
//
// What it measures is the active root: the open modal `<dialog>`, else the
// body. Its leaves are lines of text (a Range's rectangles, shrunk to the
// ink of the font), media and controls; what is invisible, zero-sized,
// screen-reader-only or wholly clipped by its ancestors takes no part. Each
// leaf belongs to a layer: its nearest top-layer element, floating popup,
// fixed or sticky box, or absolute box with a z-index. Leaves are compared
// only within a layer: a popup over a page is meant to cover it.
//
// Its findings are suspicions for a reviewer, so every rule leans towards
// silence: what a page does on purpose — an overlay on a picture, a sticky
// header over scrolled text, an ellipsis, a clamp, a fade — is let be.
import type { ProbeFinding, ProbeRule } from '../types';

export interface InPageAllow {
  id: string;
  rule: ProbeRule | '*';
  /** A finding any of whose elements is inside a match is set aside. */
  selector?: string;
  /** Or one whose element's signature — `role|name|path|heading` — contains this. */
  signature?: string;
}

export interface InPageOptions {
  theme: 'light' | 'dark';
  allow?: InPageAllow[];
  /**
   * For the probe's own tests: each element of a finding also carries the
   * `id` of its nearest ancestor-or-self with this attribute.
   */
  mark?: string;
  /** At most this many findings of one rule; the default is 30. */
  perRule?: number;
}

export interface InPageElement {
  path: string;
  desc: string;
  mark?: string;
}

export interface InPageResult {
  viewport: { width: number; height: number };
  dpr: number;
  scrollY: number;
  root: 'page' | 'dialog';
  findings: (Omit<ProbeFinding, 'elements'> & { elements: InPageElement[] })[];
  suppressed: { allow: string; count: number }[];
  stats: { elements: number; leaves: number; ms: number };
}

export async function runProbe(options: InPageOptions): Promise<InPageResult> {
  const started = performance.now();
  const html = document.documentElement;
  const vw = html.clientWidth;
  const vh = html.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  /** What counts as "not exactly": half a device pixel, more at 1×. */
  const t = dpr >= 2 ? 0.5 : 0.75;
  const screenClass = window.innerWidth < 640 ? 'phone' : 'desktop';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const rootFont = parseFloat(getComputedStyle(html).fontSize) || 16;
  const perRule = options.perRule ?? 30;
  const INF = Number.POSITIVE_INFINITY;

  type Rect4 = { x1: number; y1: number; x2: number; y2: number };
  type LayerKind = 'root' | 'top' | 'popup' | 'fixed' | 'sticky' | 'z';
  interface Clip extends Rect4 {
    el: Element;
    /** The clipper's own padding box; the fields above are the whole chain's. */
    own: Rect4;
    scroll: boolean;
    ellipsis: boolean;
    clamp: boolean;
    parent: Clip | null;
  }
  interface Info {
    el: Element;
    local: string;
    cs: CSSStyleDeclaration;
    r: Rect4;
    w: number;
    h: number;
    parent: Info | null;
    pos: string;
    layer: Element;
    layerKind: LayerKind;
    /** The clip its own box is under, and the one its content is under. */
    clip: Clip | null;
    inner: Clip | null;
    shown: boolean;
    shifted: boolean;
    masked: boolean;
    kids: Info[];
    /** In-flow children for alignment and gaps; null where the flow breaks. */
    items: (Info | null)[];
    /** May be compared for alignment and gaps. */
    flow: boolean;
    inlineLevel: boolean;
    /** Has words of its own, which move what follows them. */
    hasText: boolean;
  }
  interface Ctx {
    parent: Info | null;
    itemParent: Info | null;
    layer: Element;
    layerKind: LayerKind;
    flowClip: Clip | null;
    absClip: Clip | null;
    fixedClip: Clip | null;
    masked: boolean;
  }
  interface Leaf {
    kind: 'text' | 'media' | 'control';
    info: Info;
    node: Node;
    /** The element a finding names: a text's parent, or the leaf itself. */
    el: Element;
    /** What is seen of it: clipped by ancestors and the viewport. */
    box: Rect4;
    /** Its whole box, or the ink of a line. */
    full: Rect4;
    vis: number;
    clip: Clip | null;
    /** A line of text: the Range's own rectangle, before the ink. */
    line?: Rect4;
  }
  interface Found {
    rule: ProbeRule;
    hint: 'serious' | 'minor' | 'info';
    els: Element[];
    boxes: Rect4[];
    measure: Record<string, number>;
    message: string;
  }

  const is = (el: Element, selector: string) => {
    try {
      return el.matches(selector);
    } catch {
      return false;
    }
  };
  const px = (value: string) => parseFloat(value) || 0;
  const round = (value: number, step = 0.1) =>
    Number((Math.round(value / step) * step).toFixed(2));
  const fmt = (value: number) => String(Math.round(value * 10) / 10);
  const area = (r: Rect4) =>
    Math.max(0, r.x2 - r.x1) * Math.max(0, r.y2 - r.y1);
  const meet = (a: Rect4, b: Rect4 | null): Rect4 | null => {
    if (!b) return a;
    const r = {
      x1: Math.max(a.x1, b.x1),
      y1: Math.max(a.y1, b.y1),
      x2: Math.min(a.x2, b.x2),
      y2: Math.min(a.y2, b.y2),
    };
    return r.x2 > r.x1 && r.y2 > r.y1 ? r : null;
  };
  const viewport: Rect4 = { x1: 0, y1: 0, x2: vw, y2: vh };
  const inView = (r: Rect4) => r.x2 > 0 && r.y2 > 0 && r.x1 < vw && r.y1 < vh;
  const rect4 = (b: DOMRect): Rect4 => ({
    x1: b.left,
    y1: b.top,
    x2: b.right,
    y2: b.bottom,
  });

  // ─── The active root ──────────────────────────────────────────────────────

  let root: Element = document.body;
  let rootKind: 'page' | 'dialog' = 'page';
  const openDialogs = document.querySelectorAll('dialog[open]');
  for (let i = openDialogs.length - 1; i >= 0; i--) {
    const dialog = openDialogs[i]!;
    if (is(dialog, ':modal') && dialog.getClientRects().length > 0) {
      root = dialog;
      rootKind = 'dialog';
      break;
    }
  }
  const htmlStyle = getComputedStyle(html);
  /** The body's overflow goes to the viewport while the root's is visible. */
  const bodyPropagates =
    htmlStyle.overflowX === 'visible' && htmlStyle.overflowY === 'visible';

  // ─── The walk ─────────────────────────────────────────────────────────────

  const infos = new Map<Element, Info>();
  const leaves: Leaf[] = [];
  const layerRoots: Info[] = [];
  const images: Info[] = [];
  const range = document.createRange();
  const canvas = document.createElement('canvas').getContext('2d');
  const fonts = new Map<
    string,
    { key: string; ratio: number; ascent: number; descent: number }
  >();

  /**
   * Where the ink of a font's line sits within its content box: as deep as
   * the font's descenders reach, which a line without them does not.
   */
  function fontOf(cs: CSSStyleDeclaration) {
    const key = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    let font = fonts.get(key);
    if (font) return font;
    const size = px(cs.fontSize) || 16;
    let fa = size * 0.9;
    let fd = size * 0.25;
    let ia = size * 0.72;
    let id = size * 0.2;
    if (canvas) {
      canvas.font = key;
      const up = canvas.measureText('Hbdfhklt');
      const down = canvas.measureText('gjpqy');
      if (up.fontBoundingBoxAscent > 0) fa = up.fontBoundingBoxAscent;
      if (up.fontBoundingBoxDescent > 0) fd = up.fontBoundingBoxDescent;
      if (up.actualBoundingBoxAscent > 0) ia = up.actualBoundingBoxAscent;
      if (down.actualBoundingBoxDescent > 0) id = down.actualBoundingBoxDescent;
    }
    font = { key, ratio: fa / (fa + fd), ascent: ia, descent: id };
    fonts.set(key, font);
    return font;
  }

  const CONTROL_ROLES = new Set([
    'button',
    'link',
    'checkbox',
    'radio',
    'switch',
    'tab',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'slider',
    'combobox',
    'textbox',
    'searchbox',
    'spinbutton',
  ]);
  const MEDIA = new Set([
    'img',
    'svg',
    'video',
    'canvas',
    'iframe',
    'object',
    'embed',
  ]);
  const OPAQUE = new Set([
    'svg',
    'img',
    'video',
    'canvas',
    'iframe',
    'object',
    'embed',
    'select',
    'textarea',
    'input',
    'math',
    'audio',
  ]);

  function isControl(el: Element, local: string) {
    if (
      local === 'button' ||
      local === 'select' ||
      local === 'textarea' ||
      local === 'summary'
    )
      return true;
    if (local === 'a') return el.hasAttribute('href');
    if (local === 'input') return (el as HTMLInputElement).type !== 'hidden';
    const role = el.getAttribute('role');
    return !!role && CONTROL_ROLES.has(role.trim().split(/\s+/)[0]!);
  }
  function isField(el: Element) {
    const local = el.localName;
    if (local === 'textarea' || local === 'select') return true;
    if (local === 'input')
      return ![
        'button',
        'submit',
        'reset',
        'image',
        'checkbox',
        'radio',
      ].includes((el as HTMLInputElement).type);
    const role = el.getAttribute('role');
    return role === 'textbox' || role === 'searchbox' || role === 'combobox';
  }
  function hiddenByClip(cs: CSSStyleDeclaration) {
    if (cs.clipPath === 'inset(50%)') return true;
    if (cs.clip && cs.clip !== 'auto') {
      const n = cs.clip.match(/-?[\d.]+/g)?.map(Number);
      if (n && n.length === 4 && (n[2]! <= n[0]! || n[1]! <= n[3]!))
        return true;
    }
    return false;
  }

  function walk(el: Element, ctx: Ctx) {
    const cs = getComputedStyle(el);
    const display = cs.display;
    if (display === 'none' || cs.contentVisibility === 'hidden') return;
    if (parseFloat(cs.opacity) < 0.05) return;
    const pos = cs.position;
    const b = el.getBoundingClientRect();
    const out = pos === 'absolute' || pos === 'fixed';
    // Screen-reader-only: a pixel with its overflow hidden, or clipped away.
    if (out && b.width <= 1.5 && b.height <= 1.5 && cs.overflowX !== 'visible')
      return;
    if (out && hiddenByClip(cs)) return;
    if (cs.clipPath === 'inset(50%)') return;

    const local = el.localName;
    let layer = ctx.layer;
    let layerKind = ctx.layerKind;
    if (el === root) {
      layer = el;
      layerKind = rootKind === 'dialog' ? 'top' : 'root';
    } else if (local === 'dialog' && (el as HTMLDialogElement).open) {
      layer = el;
      layerKind = is(el, ':modal') ? 'top' : 'popup';
    } else if (el.hasAttribute('popover') && is(el, ':popover-open')) {
      layer = el;
      layerKind = 'top';
    } else if (el.hasAttribute('data-floating-popup')) {
      layer = el;
      layerKind = 'popup';
    } else if (pos === 'fixed') {
      layer = el;
      layerKind = 'fixed';
    } else if (pos === 'sticky') {
      layer = el;
      layerKind = 'sticky';
    } else if (pos === 'absolute' && cs.zIndex !== 'auto') {
      layer = el;
      layerKind = 'z';
    }
    const ownLayer = layer === el;

    let clip =
      pos === 'absolute'
        ? ctx.absClip
        : pos === 'fixed'
          ? ctx.fixedClip
          : ctx.flowClip;
    if (ownLayer && layerKind === 'top') clip = null;

    let inner = clip;
    const contain = cs.contain;
    const paints = /paint|strict|content/.test(contain);
    const free = el === document.body && bodyPropagates;
    const clipsX = !free && (cs.overflowX !== 'visible' || paints);
    const clipsY = !free && (cs.overflowY !== 'visible' || paints);
    if (clipsX || clipsY) {
      const own: Rect4 = {
        x1: clipsX ? b.left + px(cs.borderLeftWidth) : -INF,
        x2: clipsX ? b.right - px(cs.borderRightWidth) : INF,
        y1: clipsY ? b.top + px(cs.borderTopWidth) : -INF,
        y2: clipsY ? b.bottom - px(cs.borderBottomWidth) : INF,
      };
      const clamp =
        cs.getPropertyValue('-webkit-line-clamp') ||
        cs.getPropertyValue('line-clamp');
      inner = {
        el,
        own,
        x1: clip ? Math.max(clip.x1, own.x1) : own.x1,
        y1: clip ? Math.max(clip.y1, own.y1) : own.y1,
        x2: clip ? Math.min(clip.x2, own.x2) : own.x2,
        y2: clip ? Math.min(clip.y2, own.y2) : own.y2,
        // Scrolled by code too: a carousel with its overflow hidden.
        scroll:
          /auto|scroll/.test(cs.overflowX) ||
          /auto|scroll/.test(cs.overflowY) ||
          el.scrollTop !== 0 ||
          el.scrollLeft !== 0,
        ellipsis: cs.textOverflow === 'ellipsis',
        clamp: !!clamp && clamp !== 'none',
        parent: clip,
      };
    }

    const transformed =
      cs.transform !== 'none' ||
      cs.translate !== 'none' ||
      cs.rotate !== 'none' ||
      cs.scale !== 'none';
    const offset =
      pos === 'relative' &&
      ['top', 'left', 'bottom', 'right'].some((side) => {
        const value = cs.getPropertyValue(side);
        return value !== 'auto' && px(value) !== 0;
      });
    const containerType = cs.getPropertyValue('container-type');
    const boundsFixed =
      transformed ||
      cs.perspective !== 'none' ||
      cs.filter !== 'none' ||
      (cs.getPropertyValue('backdrop-filter') || 'none') !== 'none' ||
      /paint|layout|strict|content/.test(contain) ||
      (!!containerType && containerType !== 'normal') ||
      /transform|perspective|filter/.test(cs.willChange);
    const maskImage =
      cs.getPropertyValue('mask-image') ||
      cs.getPropertyValue('-webkit-mask-image');
    const masked = ctx.masked || (!!maskImage && maskImage !== 'none');
    const shown = cs.visibility === 'visible';
    const r = rect4(b);
    const w = b.width;
    const h = b.height;
    const inlineLevel = display.startsWith('inline');

    const info: Info = {
      el,
      local,
      cs,
      r,
      w,
      h,
      parent: ctx.parent,
      pos,
      layer,
      layerKind,
      clip,
      inner,
      shown,
      shifted: transformed || offset,
      masked,
      kids: [],
      items: [],
      flow: false,
      inlineLevel,
      hasText: false,
    };
    infos.set(el, info);
    ctx.parent?.kids.push(info);

    // Its place in its parent's flow, for alignment and gaps.
    if (ctx.itemParent && display !== 'contents' && !out) {
      const eligible =
        shown &&
        w >= 1 &&
        h >= 1 &&
        display !== 'inline' &&
        !display.startsWith('table-') &&
        (pos === 'static' || pos === 'relative') &&
        !info.shifted &&
        cs.float === 'none' &&
        inView(r);
      if (display === 'inline') {
        // Inline content makes a line of its own between blocks.
        if (w >= 1 && h >= 1) ctx.itemParent.items.push(null);
      } else {
        info.flow = eligible;
        ctx.itemParent.items.push(eligible ? info : null);
      }
    }

    const leavesBefore = leaves.length;
    const media = MEDIA.has(local);
    const control =
      !(el as HTMLElement).isContentEditable && isControl(el, local);
    if (shown && (media || control) && w >= 1 && h >= 1) {
      let full = r;
      // A link across lines: its first piece, not the box around all of them.
      if (display === 'inline') {
        const pieces = el.getClientRects();
        if (pieces.length > 1) full = rect4(pieces[0]!);
      }
      const seen = meet(full, clip);
      const box = seen && meet(seen, viewport);
      if (box)
        leaves.push({
          kind: control ? 'control' : 'media',
          info,
          node: el,
          el,
          box,
          full,
          vis: area(box) / Math.max(1, area(full)),
          clip,
        });
    }
    if (local === 'img' && shown) images.push(info);

    if (!OPAQUE.has(local)) {
      const childCtx: Ctx = {
        parent: info,
        itemParent: display === 'contents' ? ctx.itemParent : info,
        layer,
        layerKind,
        flowClip: inner,
        absClip: pos !== 'static' || boundsFixed ? inner : ctx.absClip,
        fixedClip: boundsFixed ? inner : ctx.fixedClip,
        masked,
      };
      const closed = local === 'details' && !(el as HTMLDetailsElement).open;
      for (let node = el.firstChild; node; node = node.nextSibling) {
        if (node.nodeType === 1) {
          if (!closed || (node as Element).localName === 'summary')
            walk(node as Element, childCtx);
        } else if (node.nodeType === 3 && !closed)
          text(node as Text, info, childCtx);
      }
    }
    if (
      ownLayer &&
      layerKind !== 'root' &&
      layerKind !== 'sticky' &&
      layerKind !== 'z'
    )
      if (leaves.length > leavesBefore && w >= 1 && h >= 1)
        layerRoots.push(info);
  }

  function text(node: Text, info: Info, ctx: Ctx) {
    if (!/\S/.test(node.data)) return;
    info.hasText = true;
    ctx.itemParent?.items.push(null);
    if (!info.shown) return;
    if (!inView(info.r) && info.cs.display !== 'inline') return;
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    if (!rects.length) return;
    const font = fontOf(info.cs);
    for (let i = 0; i < rects.length; i++) {
      const q = rects[i]!;
      if (q.width < 1 || q.height < 1) continue;
      const baseline = q.top + q.height * font.ratio;
      const ink: Rect4 = {
        x1: q.left,
        x2: q.right,
        y1: Math.max(q.top, baseline - font.ascent),
        y2: Math.min(q.bottom, baseline + font.descent),
      };
      if (ink.y2 - ink.y1 < 1 || !inView(ink)) continue;
      const seen = meet(ink, ctx.flowClip);
      if (!seen) continue;
      const box = meet(seen, viewport);
      if (!box) continue;
      leaves.push({
        kind: 'text',
        info,
        node,
        el: info.el,
        box,
        full: ink,
        vis: area(seen) / Math.max(0.01, area(ink)),
        clip: ctx.flowClip,
        line: rect4(q),
      });
    }
  }

  const rootCtx: Ctx = {
    parent: null,
    itemParent: null,
    layer: root,
    layerKind: rootKind === 'dialog' ? 'top' : 'root',
    flowClip: null,
    absClip: null,
    fixedClip: null,
    masked: false,
  };
  walk(root, rootCtx);
  // A toast shown over a modal stands in the top layer above it.
  if (rootKind === 'dialog')
    for (const popover of document.querySelectorAll('[popover]'))
      if (!root.contains(popover) && is(popover, ':popover-open'))
        walk(popover, { ...rootCtx, layer: popover, layerKind: 'top' });

  // ─── Naming what was found ────────────────────────────────────────────────

  const ROLE_WORDS: Record<string, string> = {
    button: 'button',
    link: 'link',
    textbox: 'field',
    searchbox: 'search field',
    spinbutton: 'number field',
    checkbox: 'checkbox',
    radio: 'radio button',
    switch: 'switch',
    combobox: 'combo box',
    listbox: 'list box',
    option: 'option',
    tab: 'tab',
    menuitem: 'menu item',
    menuitemcheckbox: 'menu item',
    menuitemradio: 'menu item',
    slider: 'slider',
    img: 'image',
    graphic: 'icon',
    heading: 'heading',
    paragraph: 'paragraph',
    listitem: 'list item',
    list: 'list',
    dialog: 'dialog',
    popup: 'popup',
    menu: 'menu',
    tooltip: 'tooltip',
    status: 'status',
    alert: 'alert',
    video: 'video',
    canvas: 'drawing',
    frame: 'embedded page',
    label: 'label',
    navigation: 'navigation',
    banner: 'header',
    contentinfo: 'footer',
    main: 'main area',
    region: 'region',
    article: 'article',
    form: 'form',
    table: 'table',
    toolbar: 'toolbar',
    tablist: 'tab list',
    tabpanel: 'tab panel',
    complementary: 'sidebar',
    generic: 'box',
  };

  function roleOf(el: Element): string {
    const explicit = el.getAttribute('role')?.trim().split(/\s+/)[0];
    if (explicit) return explicit;
    if (el.hasAttribute('data-floating-popup')) return 'popup';
    const local = el.localName;
    switch (local) {
      case 'a':
        return el.hasAttribute('href') ? 'link' : 'generic';
      case 'button':
      case 'summary':
        return 'button';
      case 'input': {
        const type = (el as HTMLInputElement).type;
        if (type === 'checkbox' || type === 'radio') return type;
        if (type === 'range') return 'slider';
        if (type === 'search') return 'searchbox';
        if (type === 'number') return 'spinbutton';
        if (['button', 'submit', 'reset', 'image'].includes(type))
          return 'button';
        return 'textbox';
      }
      case 'textarea':
        return 'textbox';
      case 'select':
        return (el as HTMLSelectElement).multiple ? 'listbox' : 'combobox';
      case 'img':
        return 'img';
      case 'svg':
        return el.hasAttribute('aria-label') ||
          el.hasAttribute('aria-labelledby')
          ? 'img'
          : 'graphic';
      case 'p':
        return 'paragraph';
      case 'li':
        return 'listitem';
      case 'ul':
      case 'ol':
        return 'list';
      case 'nav':
        return 'navigation';
      case 'header':
        return 'banner';
      case 'footer':
        return 'contentinfo';
      case 'aside':
        return 'complementary';
      case 'section':
        return 'region';
      case 'iframe':
        return 'frame';
      case 'main':
      case 'dialog':
      case 'video':
      case 'canvas':
      case 'label':
      case 'article':
      case 'form':
      case 'table':
        return local;
    }
    return /^h[1-6]$/.test(local) ? 'heading' : 'generic';
  }

  function clean(value: string, max = 40) {
    const text = value.replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  }
  function textOf(el: Element, max = 40) {
    let text = '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (
      let node = walker.nextNode();
      node && text.length <= max * 2;
      node = walker.nextNode()
    )
      text += ` ${(node as Text).data}`;
    return clean(text, max);
  }
  function nameOf(el: Element): string {
    const label = el.getAttribute('aria-label');
    if (label?.trim()) return clean(label);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const text = by
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
      if (text.trim()) return clean(text);
    }
    const local = el.localName;
    if (local === 'img') return clean(el.getAttribute('alt') ?? '');
    if (local === 'input' || local === 'select' || local === 'textarea') {
      const field = el as HTMLInputElement;
      const labelled = field.labels?.[0];
      if (labelled) {
        const text = textOf(labelled);
        if (text) return text;
      }
      if (field.placeholder) return clean(field.placeholder);
      if (['button', 'submit', 'reset'].includes(field.type) && field.value)
        return clean(field.value);
    }
    const hint =
      el.getAttribute('title') || el.getAttribute('data-title-popup');
    const text = MEDIA.has(local) ? '' : textOf(el);
    return text || clean(hint ?? '');
  }
  function pathOf(el: Element) {
    const parts: string[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      parts.push(e.localName);
      if (e === root || e === document.body) break;
    }
    parts.reverse();
    const out: string[] = [];
    for (let i = 0; i < parts.length;) {
      let j = i;
      while (j + 1 < parts.length && parts[j + 1] === parts[i]) j++;
      out.push(j > i ? `${parts[i]}×${j - i + 1}` : parts[i]!);
      i = j + 1;
    }
    return out.join('>');
  }
  let headings: Element[] | null = null;
  function headingOf(el: Element) {
    headings ??= [
      ...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'),
    ].filter(
      (h) =>
        (rootKind === 'page' || root.contains(h)) &&
        (h as HTMLElement).checkVisibility?.() !== false,
    );
    let lo = 0;
    let hi = headings.length - 1;
    let found: Element | undefined;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const h = headings[mid]!;
      if (
        h === el ||
        h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        found = h;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found && found !== el ? textOf(found) : '';
  }

  const described = new Map<
    Element,
    { sig: string; look: string; path: string; desc: string; mark?: string }
  >();
  function describe(el: Element) {
    let d = described.get(el);
    if (d) return d;
    const role = roleOf(el);
    const name = nameOf(el);
    const path = pathOf(el);
    const heading = headingOf(el);
    let word = ROLE_WORDS[role] ?? role;
    if (role === 'generic' && name) word = 'text';
    d = {
      sig: `${role}|${name}|${path}|${heading}`,
      look: `${role}|${path}`,
      path,
      desc: `${word}${name ? ` “${name}”` : ''}${heading && heading !== name ? ` under “${heading}”` : ''}`,
    };
    if (options.mark) d.mark = el.closest(`[${options.mark}]`)?.id ?? '';
    described.set(el, d);
    return d;
  }
  /** The element that stands for a node met in a hit test: the nearest one walked. */
  function walked(el: Element): Element {
    for (let e: Element | null = el; e; e = e.parentElement)
      if (infos.has(e)) return e;
    return el;
  }
  const ids = new WeakMap<Element, number>();
  let nextId = 1;
  const idOf = (el: Element) => {
    let id = ids.get(el);
    if (!id) ids.set(el, (id = nextId++));
    return id;
  };

  const found: Found[] = [];

  // ─── What a popup or a bar hides ──────────────────────────────────────────

  // A leaf wholly under an open popup, a sheet or a bar the page scrolls
  // under is not seen, so nothing is said about it.
  {
    const covers = [...infos.values()].filter(
      (info) =>
        info.layer === info.el &&
        info.layerKind !== 'root' &&
        info.layerKind !== 'z' &&
        info.w >= 1 &&
        info.h >= 1,
    );
    if (covers.length) {
      const seen = leaves.filter((leaf) => {
        const b = leaf.box;
        for (const cover of covers) {
          const r = cover.r;
          if (cover.el.contains(leaf.node)) continue;
          if (
            b.x1 < r.x1 - 1 ||
            b.x2 > r.x2 + 1 ||
            b.y1 < r.y1 - 1 ||
            b.y2 > r.y2 + 1
          )
            continue;
          const hit = document.elementFromPoint(
            (b.x1 + b.x2) / 2,
            (b.y1 + b.y2) / 2,
          );
          if (hit && cover.el.contains(hit) && excused(leaf.el, leaf.info, hit))
            return false;
        }
        return true;
      });
      leaves.length = 0;
      leaves.push(...seen);
    }
  }

  // ─── overlap ──────────────────────────────────────────────────────────────

  function commonAncestor(a: Element, b: Element) {
    let c: Element | null = a;
    while (c && !c.contains(b)) c = c.parentElement;
    return c;
  }
  function childToward(ancestor: Element, el: Element) {
    let c: Element | null = el;
    while (c && c.parentElement !== ancestor) c = c.parentElement;
    return c;
  }
  function positionedBelow(el: Element, ancestor: Element) {
    for (let e: Element | null = el; e && e !== ancestor; e = e.parentElement) {
      const pos = infos.get(e)?.pos ?? getComputedStyle(e).position;
      if (pos !== 'static') return true;
    }
    return false;
  }
  /** An overlap a page makes on purpose. */
  const stacks = new Map<Element, boolean>();
  /**
   * A row of like tiles, each laid over the one before by the same amount:
   * an avatar group. Each covers a part of the one before it, on purpose.
   */
  function stacked(container: Element) {
    let known = stacks.get(container);
    if (known !== undefined) return known;
    known = false;
    const info = infos.get(container);
    if (info) {
      const { display, flexDirection } = info.cs;
      const row = display.includes('flex')
        ? !flexDirection.startsWith('column')
        : !display.includes('grid');
      const kids = info.kids.filter(
        (kid) =>
          kid.shown &&
          kid.w >= 1 &&
          kid.h >= 1 &&
          kid.pos !== 'absolute' &&
          kid.pos !== 'fixed',
      );
      if (row && kids.length >= 2) {
        const first = kids[0]!;
        const step = first.r.x2 - kids[1]!.r.x1;
        known =
          step > 1 &&
          step < first.w - 1 &&
          kids.every(
            (kid, i) =>
              Math.abs(kid.w - first.w) <= 1 &&
              Math.abs(kid.h - first.h) <= 1 &&
              Math.abs(kid.r.y1 - first.r.y1) <= 1 &&
              (i === 0 || Math.abs(kids[i - 1]!.r.x2 - kid.r.x1 - step) <= 1),
          );
      }
    }
    stacks.set(container, known);
    return known;
  }
  /** Two elements in two tiles of one stack. */
  function inOneStack(a: Element, b: Element) {
    const common = commonAncestor(a, b);
    if (!common) return false;
    const ca = childToward(common, a);
    const cb = childToward(common, b);
    return !!ca && !!cb && ca !== cb && stacked(common);
  }

  function deliberate(a: Leaf, b: Leaf) {
    if (a.el === b.el) return false;
    const common = commonAncestor(a.el, b.el);
    if (!common) return false;
    if (inOneStack(a.el, b.el)) return true;
    // Grid items placed in one area: stacking only happens when asked for.
    const display = infos.get(common)?.cs.display ?? '';
    if (display.endsWith('grid')) {
      const ca = childToward(common, a.el);
      const cb = childToward(common, b.el);
      const ra = ca && infos.get(ca)?.r;
      const rb = cb && infos.get(cb)?.r;
      if (ca !== cb && ra && rb && meet(ra, rb)) return true;
    }
    // Words, a badge or a button laid over a picture or into a field.
    const surface =
      a.kind === 'media' ||
      b.kind === 'media' ||
      (a.kind === 'control' && isField(a.el)) ||
      (b.kind === 'control' && isField(b.el));
    return (
      surface &&
      (positionedBelow(a.el, common) || positionedBelow(b.el, common))
    );
  }

  {
    const cell = 64;
    const buckets = new Map<number, number[]>();
    leaves.forEach((leaf, index) => {
      const b = leaf.box;
      for (
        let cy = Math.floor(b.y1 / cell);
        cy <= Math.floor((b.y2 - 0.01) / cell);
        cy++
      )
        for (
          let cx = Math.floor(b.x1 / cell);
          cx <= Math.floor((b.x2 - 0.01) / cell);
          cx++
        ) {
          const key = cy * 10_000 + cx;
          const list = buckets.get(key);
          if (list) list.push(index);
          else buckets.set(key, [index]);
        }
    });
    const n = leaves.length;
    const seen = new Set<number>();
    const pairs = new Map<string, Found>();
    for (const list of buckets.values())
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const ia = list[i]!;
          const ib = list[j]!;
          const key = ia < ib ? ia * n + ib : ib * n + ia;
          if (seen.has(key)) continue;
          seen.add(key);
          const a = leaves[ia]!;
          const b = leaves[ib]!;
          if (a.info.layer !== b.info.layer) continue;
          // Pieces of one line of one text, such as the words an ellipsis hides.
          if (a.node === b.node && Math.abs(a.full.y1 - b.full.y1) < 1)
            continue;
          if (a.kind !== 'text' && (a.node as Element).contains(b.node))
            continue;
          if (b.kind !== 'text' && (b.node as Element).contains(a.node))
            continue;
          if (a.kind === 'control' && a.info.cs.display === 'inline') continue;
          if (b.kind === 'control' && b.info.cs.display === 'inline') continue;
          const iw =
            Math.min(a.box.x2, b.box.x2) - Math.max(a.box.x1, b.box.x1);
          const ih =
            Math.min(a.box.y2, b.box.y2) - Math.max(a.box.y1, b.box.y1);
          if (iw < 2 || ih < 2) continue;
          const overlap = iw * ih;
          if (!(
            overlap > 0.15 * Math.min(area(a.box), area(b.box)) || overlap > 40
          ))
            continue;
          if (deliberate(a, b)) continue;
          const kinds = [a.kind, b.kind].sort().join('+');
          const serious =
            kinds === 'text+text' ||
            kinds === 'control+text' ||
            kinds === 'control+control';
          const els =
            a.el === b.el
              ? [a.el]
              : [a.el, b.el].sort((x, y) => idOf(x) - idOf(y));
          const pairKey = els.map(idOf).join(':');
          const known = pairs.get(pairKey);
          if (known) {
            known.measure.pairs! += 1;
            if (overlap > known.measure.overlapPx2!) {
              known.measure.overlapPx2 = round(overlap, 1);
              known.boxes = [a.box, b.box];
            }
            continue;
          }
          const one = describe(els[0]!).desc;
          const message =
            els.length === 1
              ? `Lines of ${one} overlap each other by ${fmt(iw)}×${fmt(ih)} px`
              : `${one} and ${describe(els[1]!).desc} overlap by ${fmt(iw)}×${fmt(ih)} px`;
          const finding: Found = {
            rule: 'overlap',
            hint: serious ? 'serious' : 'minor',
            els,
            boxes: [a.box, b.box],
            measure: {
              overlapPx2: round(overlap, 1),
              widthPx: round(iw),
              heightPx: round(ih),
              pairs: 1,
            },
            message,
          };
          pairs.set(pairKey, finding);
          found.push(finding);
        }
  }

  // ─── covered-control ──────────────────────────────────────────────────────

  function disabled(el: Element) {
    return (
      (el as HTMLButtonElement).disabled === true ||
      el.getAttribute('aria-disabled') === 'true' ||
      !!el.closest('fieldset:disabled, [inert]')
    );
  }
  function labelledBy(control: Element, hit: Element) {
    const label = hit.closest('label');
    if (!label) return false;
    const labels = (control as HTMLInputElement).labels;
    return !!labels && [...labels].includes(label);
  }
  function scrollerOf(el: Element): Element {
    for (
      let e = el.parentElement;
      e && e !== document.body;
      e = e.parentElement
    ) {
      const info = infos.get(e);
      const cs = info?.cs ?? getComputedStyle(e);
      if (
        /auto|scroll/.test(cs.overflowY) &&
        e.scrollHeight > e.clientHeight + 1
      )
        return e;
    }
    return document.scrollingElement ?? html;
  }
  /** A cover the page means: a popup opened over it, a bar it scrolls under. */
  function excused(control: Element, info: Info, coverer: Element) {
    const cover = infos.get(walked(coverer));
    if (!cover || cover.layer === info.layer) return false;
    if (cover.layer.contains(control)) return false;
    if (cover.layerKind === 'top' || cover.layerKind === 'popup') return true;
    if (cover.layerKind === 'fixed' || cover.layerKind === 'sticky') {
      const bar = infos.get(cover.layer)?.r ?? cover.r;
      const seen = meet(bar, viewport);
      if (seen && area(seen) >= 0.9 * vw * vh) return true;
      const scroller = scrollerOf(control);
      const above = (bar.y1 + bar.y2) / 2 < vh / 2;
      return above
        ? scroller.scrollTop > 0
        : scroller.scrollTop + scroller.clientHeight <
            scroller.scrollHeight - 1;
    }
    return false;
  }

  for (const leaf of leaves) {
    if (leaf.kind !== 'control') continue;
    const el = leaf.el;
    if (disabled(el) || leaf.info.cs.pointerEvents === 'none') continue;
    const v = leaf.box;
    const w = v.x2 - v.x1;
    const h = v.y2 - v.y1;
    if (w < 2 || h < 2) continue;
    // The corners of a rounded control are not the control: each point is
    // taken far enough in to be inside its curve.
    const { cs } = leaf.info;
    const side = Math.min(
      leaf.full.x2 - leaf.full.x1,
      leaf.full.y2 - leaf.full.y1,
    );
    const inset = (radius: string) => {
      const first = radius.split(' ')[0] ?? '0';
      const r = first.endsWith('%') ? (px(first) / 100) * side : px(first);
      return Math.max(4, r * 0.3 + 1);
    };
    const ix = (radius: string) => Math.min(inset(radius), w / 2 - 0.5);
    const iy = (radius: string) => Math.min(inset(radius), h / 2 - 0.5);
    const points = [
      [(v.x1 + v.x2) / 2, (v.y1 + v.y2) / 2],
      [v.x1 + ix(cs.borderTopLeftRadius), v.y1 + iy(cs.borderTopLeftRadius)],
      [v.x2 - ix(cs.borderTopRightRadius), v.y1 + iy(cs.borderTopRightRadius)],
      [
        v.x1 + ix(cs.borderBottomLeftRadius),
        v.y2 - iy(cs.borderBottomLeftRadius),
      ],
      [
        v.x2 - ix(cs.borderBottomRightRadius),
        v.y2 - iy(cs.borderBottomRightRadius),
      ],
    ] as const;
    let covered = 0;
    const hits = new Map<Element, number>();
    for (const [x, y] of points) {
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
      if (labelledBy(el, hit)) continue;
      covered++;
      const by = walked(hit);
      hits.set(by, (hits.get(by) ?? 0) + 1);
    }
    if (covered < 2) continue;
    const coverer = [...hits].sort((a, b) => b[1] - a[1])[0]![0];
    if (excused(el, leaf.info, coverer) || inOneStack(el, coverer)) continue;
    // A button or an icon laid into a field: its clear button, its search mark.
    if (isField(el)) {
      const common = commonAncestor(el, coverer);
      if (common && positionedBelow(coverer, common)) continue;
    }
    const coverBox =
      infos.get(coverer)?.r ?? rect4(coverer.getBoundingClientRect());
    found.push({
      rule: 'covered-control',
      hint: 'serious',
      els: [el, coverer],
      boxes: [v, meet(coverBox, viewport) ?? coverBox],
      measure: { coveredPoints: covered, ofPoints: 5 },
      message: `${describe(el).desc}: ${covered} of 5 points are covered by ${describe(coverer).desc}`,
    });
  }

  // ─── clipped-text ─────────────────────────────────────────────────────────

  /** The ink of one line by the glyphs on it. */
  function exactInk(leaf: Leaf): Rect4 | null {
    if (!canvas || !leaf.line || leaf.node.nodeType !== 3) return null;
    const node = leaf.node as Text;
    const line = leaf.line;
    let text = node.data;
    range.selectNodeContents(node);
    if (range.getClientRects().length > 1) {
      text = '';
      for (let i = 0; i < node.data.length && i < 4000; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.height > 0 && Math.abs(r.top - line.y1) < 1) text += node.data[i];
      }
    }
    if (!text.trim()) return null;
    const font = fontOf(leaf.info.cs);
    canvas.font = font.key;
    const m = canvas.measureText(text);
    const baseline = line.y1 + (line.y2 - line.y1) * font.ratio;
    return {
      x1: line.x1,
      x2: line.x2,
      y1: baseline - m.actualBoundingBoxAscent,
      y2: baseline + m.actualBoundingBoxDescent,
    };
  }

  {
    const groups = new Map<
      string,
      {
        el: Element;
        cutter: Element;
        ellipsis: boolean;
        boxes: Rect4[];
        vis: number;
      }
    >();
    for (const leaf of leaves) {
      if (leaf.kind !== 'text' || leaf.vis >= 0.97 || leaf.info.masked)
        continue;
      const ink = leaf.full;
      const inkArea = Math.max(0.01, area(ink));
      let cutter: Clip | null = null;
      for (let c = leaf.clip; c; c = c.parent) {
        const part = meet(ink, c.own);
        const vis = part ? area(part) / inkArea : 0;
        if (vis < 0.97 || (!cutter && vis < 1)) {
          cutter = c;
          if (vis < 0.97) break;
        }
      }
      if (!cutter || cutter.scroll || cutter.clamp) continue;
      // Measured again by the glyphs the line has: a cut through where a
      // descender would be is no cut when the line has none. The ink is
      // estimated from the font, which can be a pixel deeper than the glyphs
      // drawn (a solid line's "y" in a box ending under it lost nothing on
      // screen), so a cut counts from two pixels.
      const exact = exactInk(leaf) ?? ink;
      const own = cutter.own;
      const depth = Math.max(
        own.x1 - exact.x1,
        exact.x2 - own.x2,
        own.y1 - exact.y1,
        exact.y2 - own.y2,
      );
      const seen = meet(exact, leaf.clip);
      const vis = seen ? area(seen) / Math.max(0.01, area(exact)) : 0;
      if (depth < 2 || vis >= 0.97 || vis === 0) continue;
      const key = `${idOf(leaf.el)}:${idOf(cutter.el)}`;
      const box = meet(exact, viewport) ?? leaf.box;
      const known = groups.get(key);
      if (known) {
        known.boxes.push(box);
        known.vis = Math.min(known.vis, vis);
      } else
        groups.set(key, {
          el: leaf.el,
          cutter: cutter.el,
          ellipsis: cutter.ellipsis || leaf.info.cs.textOverflow === 'ellipsis',
          boxes: [box],
          vis,
        });
    }
    for (const g of groups.values()) {
      const pct = Math.round(g.vis * 100);
      const own = g.cutter === g.el;
      const text = describe(g.el).desc;
      found.push({
        rule: 'clipped-text',
        // Cut through its descenders only, a line still reads.
        hint: g.ellipsis ? 'info' : g.vis < 0.85 ? 'serious' : 'minor',
        els: own ? [g.el] : [g.el, g.cutter],
        boxes: g.boxes,
        measure: { visiblePct: pct, lines: g.boxes.length },
        message: g.ellipsis
          ? `Shortened with an ellipsis: ${text}, ${pct}% of the line is seen`
          : own
            ? `${text} does not fit: ${pct}% of the line is seen`
            : `${text}: ${pct}% of the line is seen, cut off by ${describe(g.cutter).desc}`,
      });
    }
  }

  // ─── page-overflow ────────────────────────────────────────────────────────

  if (rootKind === 'page') {
    const scroller = document.scrollingElement ?? html;
    const over = scroller.scrollWidth - html.clientWidth;
    const viewportX = bodyPropagates
      ? getComputedStyle(document.body).overflowX
      : htmlStyle.overflowX;
    if (over > 0.5 && !/hidden|clip/.test(viewportX)) {
      const limit = html.clientWidth + 0.5;
      const sx = window.scrollX;
      const culprits: Element[] = [];
      const visit = (el: Element) => {
        if (culprits.length >= 5) return;
        const cs = infos.get(el)?.cs ?? getComputedStyle(el);
        if (cs.display === 'none' || cs.position === 'fixed') return;
        const b = el.getBoundingClientRect();
        if (
          cs.display !== 'contents' &&
          (b.width > 0 || b.height > 0) &&
          (b.right + sx > limit || b.left + sx < -0.5)
        ) {
          culprits.push(el);
          return;
        }
        if (cs.overflowX !== 'visible' && cs.display !== 'contents') return;
        for (const child of el.children) visit(child);
      };
      for (const child of document.body.children) visit(child);
      for (const el of culprits) {
        const b = rect4(el.getBoundingClientRect());
        const beyond = Math.max(b.x2 + sx - html.clientWidth, -(b.x1 + sx));
        found.push({
          rule: 'page-overflow',
          hint: 'serious',
          els: [el],
          boxes: [meet(b, viewport) ?? b],
          measure: { overflowPx: round(over, 1), beyondPx: round(beyond) },
          message: `The page is ${fmt(over)} px wider than the screen: ${describe(el).desc} sticks out`,
        });
      }
    }
  }

  // ─── leaves-viewport ──────────────────────────────────────────────────────

  {
    const boxes =
      rootKind === 'dialog' ? [infos.get(root)!, ...layerRoots] : layerRoots;
    const done = new Set<Element>();
    for (const info of boxes) {
      if (!info || done.has(info.el)) continue;
      done.add(info.el);
      const r = info.r;
      if (!inView(r)) continue;
      if (r.x1 <= 0 && r.y1 <= 0 && r.x2 >= vw && r.y2 >= vh) continue;
      const sides: [string, number][] = [
        ['on the left', -r.x1],
        ['on the right', r.x2 - vw],
        ['at the top', -r.y1],
        ['at the bottom', r.y2 - vh],
      ];
      const outside = sides.filter(([, value]) => value > 1);
      if (!outside.length) continue;
      const most = Math.max(...outside.map(([, value]) => value));
      found.push({
        rule: 'leaves-viewport',
        hint: 'serious',
        els: [info.el],
        boxes: [meet(r, viewport)!],
        measure: {
          outsidePx: round(most),
          left: round(Math.max(0, -r.x1)),
          right: round(Math.max(0, r.x2 - vw)),
          top: round(Math.max(0, -r.y1)),
          bottom: round(Math.max(0, r.y2 - vh)),
        },
        message: `${describe(info.el).desc} goes off the screen ${outside
          .map(([side, value]) => `${side} by ${fmt(value)} px`)
          .join(', ')}`,
      });
    }
  }

  // ─── near-miss and uneven-gap ─────────────────────────────────────────────

  const sigOfItem = (info: Info) =>
    `${info.local}|${info.el.getAttribute('role') ?? ''}`;
  const near = (d: number) => d >= t && d <= 3;
  const EDGE_WORDS = [
    'left edges',
    'right edges',
    'centres',
    'top edges',
    'bottom edges',
    'middles',
  ];
  const nearPairs = new Set<string>();

  function nearMiss(
    a: Info,
    b: Info,
    edge: number,
    delta: number,
    lines: [number, number],
    vertical: boolean,
  ) {
    const els = [a.el, b.el].sort((x, y) => idOf(x) - idOf(y));
    const key = els.map(idOf).join(':');
    if (nearPairs.has(key)) return;
    nearPairs.add(key);
    found.push({
      rule: 'near-miss',
      hint: 'minor',
      els,
      boxes: [a.r, b.r].map((r) => meet(r, viewport) ?? r),
      measure: vertical
        ? {
            deltaPx: round(delta, 0.01),
            lineY1: round(lines[0], 0.01),
            lineY2: round(lines[1], 0.01),
          }
        : {
            deltaPx: round(delta, 0.01),
            lineX1: round(lines[0], 0.01),
            lineX2: round(lines[1], 0.01),
          },
      message: `${describe(els[0]!).desc} and ${describe(els[1]!).desc} are almost aligned by their ${EDGE_WORDS[edge]}: ${fmt(delta)} px apart`,
    });
  }

  /** Two neighbours: aligned on some edge or centre, or off on purpose, or almost. */
  function compare(a: Info, b: Info, stacked: boolean) {
    const ra = a.r;
    const rb = b.r;
    const values = stacked
      ? [
          [ra.x1, rb.x1],
          [ra.x2, rb.x2],
          [(ra.x1 + ra.x2) / 2, (rb.x1 + rb.x2) / 2],
        ]
      : [
          [ra.y1, rb.y1],
          [ra.y2, rb.y2],
          [(ra.y1 + ra.y2) / 2, (rb.y1 + rb.y2) / 2],
        ];
    const deltas = values.map(([p, q]) => Math.abs(p! - q!));
    if (Math.min(...deltas) < t) return;
    let best = -1;
    deltas.forEach((d, i) => {
      if (near(d) && (best < 0 || d < deltas[best]!)) best = i;
    });
    if (best < 0) return;
    nearMiss(
      a,
      b,
      best + (stacked ? 0 : 3),
      deltas[best]!,
      values[best] as [number, number],
      !stacked,
    );
  }

  const baseline = (value: string) => value.includes('baseline');

  for (const container of infos.values()) {
    const items = container.items.filter(
      (item): item is Info => !!item && item.flow,
    );
    if (items.length < 2 || !container.shown || !inView(container.r)) continue;
    const cs = container.cs;
    const display = cs.display;
    const flexOrGrid = /flex|grid/.test(display);
    const list = items.slice(0, 60);

    // Neighbours: the nearest below with a shared column, the nearest
    // beside with a shared row.
    for (const a of list) {
      let below: Info | undefined;
      let beside: Info | undefined;
      for (const b of list) {
        if (b === a) continue;
        const ow = Math.min(a.r.x2, b.r.x2) - Math.max(a.r.x1, b.r.x1);
        const oh = Math.min(a.r.y2, b.r.y2) - Math.max(a.r.y1, b.r.y1);
        if (b.r.y1 >= a.r.y2 - t && ow >= 0.5 * Math.min(a.w, b.w))
          if (!below || b.r.y1 < below.r.y1) below = b;
        if (b.r.x1 >= a.r.x2 - t && oh >= 0.5 * Math.min(a.h, b.h))
          if (!beside || b.r.x1 < beside.r.x1) beside = b;
      }
      if (below && (flexOrGrid || (!a.inlineLevel && !below.inlineLevel)))
        compare(a, below, true);
      if (
        beside &&
        flexOrGrid &&
        !baseline(cs.alignItems) &&
        !baseline(a.cs.alignSelf) &&
        !baseline(beside.cs.alignSelf)
      )
        compare(a, beside, false);
    }

    // Repeated cards: the same parts at the same places in each.
    const groups = new Map<string, Info[]>();
    for (const item of list) {
      const key = `${sigOfItem(item)}|${item.kids
        .map((kid) => kid.local)
        .slice(0, 8)
        .join(',')}`;
      if (!item.kids.length) continue;
      const group = groups.get(key);
      if (group) group.push(item);
      else groups.set(key, [item]);
    }
    for (const cards of groups.values()) {
      // Three at least: with two, neither can say which one is off.
      if (cards.length < 3) continue;
      const parts = cards.slice(0, 12).map((card) => {
        const out: { path: string; info: Info }[] = [];
        const visit = (info: Info, path: string, depth: number) => {
          info.kids.forEach((kid, index) => {
            if (out.length >= 30) return;
            const kidPath = `${path}/${index}`;
            // Placed by the words before it: nothing to compare.
            if (kid.inlineLevel || info.hasText) return;
            if (
              kid.shown &&
              kid.w >= 1 &&
              kid.h >= 1 &&
              !kid.shifted &&
              kid.pos !== 'absolute' &&
              kid.pos !== 'fixed'
            )
              out.push({ path: kidPath, info: kid });
            if (depth < 4) visit(kid, kidPath, depth + 1);
          });
        };
        visit(card, '', 1);
        return { card, out };
      });
      for (const vertical of [false, true]) {
        const active = parts.map(() => true);
        const prefix = parts.map(({ card }) =>
          vertical ? '' : `${round(card.w, 0.5)}`,
        );
        const steps = Math.max(...parts.map(({ out }) => out.length));
        // A part's start, end and middle from its card's start, and its end
        // from the card's end: it is in its place if any of them agrees.
        const edgesOf = (card: Info, part: Info) => {
          const [c1, c2, p1, p2] = vertical
            ? [card.r.y1, card.r.y2, part.r.y1, part.r.y2]
            : [card.r.x1, card.r.x2, part.r.x1, part.r.x2];
          return {
            at: [p1, p2, (p1 + p2) / 2, p2],
            rel: [p1 - c1, p2 - c1, (p1 + p2) / 2 - c1, p2 - c2],
          };
        };
        for (let k = 0; k < steps; k++) {
          type Entry = {
            card: number;
            info: Info;
            at: number[];
            rel: number[];
          };
          const byKey = new Map<string, Entry[]>();
          parts.forEach(({ card, out }, ci) => {
            const part = out[k];
            if (!part || !active[ci]) return;
            const key = `${part.path}|${prefix[ci]}`;
            const list = byKey.get(key);
            const entry = {
              card: ci,
              info: part.info,
              ...edgesOf(card, part.info),
            };
            if (list) list.push(entry);
            else byKey.set(key, [entry]);
            prefix[ci] +=
              `|${round(vertical ? part.info.h : part.info.w, 0.5)}`;
          });
          for (const entries of byKey.values()) {
            if (entries.length < 2) continue;
            const agree = (p: Entry, q: Entry) =>
              p.rel.some((v, i) => Math.abs(v - q.rel[i]!) < t);
            // The part most others agree with is where it belongs.
            let reference: Entry | undefined;
            let most = 1;
            for (const e of entries) {
              const count = entries.filter(
                (o) => o === e || agree(e, o),
              ).length;
              if (count > most) [reference, most] = [e, count];
            }
            for (const e of entries) {
              if (reference && (e === reference || agree(e, reference)))
                continue;
              active[e.card] = false;
              if (!reference) continue;
              const deltas = e.rel.map((v, i) =>
                Math.abs(v - reference.rel[i]!),
              );
              const delta = Math.min(...deltas);
              if (delta > 3) continue;
              const edge = deltas.indexOf(delta);
              const expected =
                e.at[edge]! + (reference.rel[edge]! - e.rel[edge]!);
              nearMiss(
                e.info,
                reference.info,
                [0, 1, 2, 1][edge]! + (vertical ? 3 : 0),
                delta,
                [e.at[edge]!, expected],
                vertical,
              );
            }
          }
        }
      }
    }

    // Gaps along a run of in-flow children, split where the flow breaks.
    if (container.items.length < 3) continue;
    if (!flexOrGrid && items.some((item) => item.inlineLevel)) continue;
    const column =
      display.includes('flex') && cs.flexDirection.startsWith('column');
    const spacedX = /space-/.test(cs.justifyContent) && !column;
    const spacedY = column
      ? /space-/.test(cs.justifyContent)
      : /space-/.test(cs.alignContent);
    type Line = { items: Info[]; y1: number; y2: number };
    const runs: Line[][] = [[]];
    for (const item of container.items.slice(0, 120)) {
      const lines = runs[runs.length - 1]!;
      if (!item || !item.flow) {
        if (lines.length) runs.push([]);
        continue;
      }
      const line = lines[lines.length - 1];
      const last = line?.items[line.items.length - 1];
      const oh = line
        ? Math.min(line.y2, item.r.y2) - Math.max(line.y1, item.r.y1)
        : 0;
      if (
        line &&
        last &&
        oh >= 0.5 * Math.min(item.h, line.y2 - line.y1) &&
        item.r.x1 >= last.r.x2 - t
      ) {
        line.items.push(item);
        line.y1 = Math.min(line.y1, item.r.y1);
        line.y2 = Math.max(line.y2, item.r.y2);
      } else lines.push({ items: [item], y1: item.r.y1, y2: item.r.y2 });
    }
    type Gap = {
      a: Info;
      b: Info;
      size: number;
      from: number;
      to: number;
      kind: string;
      vertical: boolean;
    };
    const gapsX: Gap[] = [];
    const gapsY: Gap[] = [];
    for (const lines of runs) {
      if (flexOrGrid && !spacedX)
        for (const line of lines)
          for (let i = 1; i < line.items.length; i++) {
            const a = line.items[i - 1]!;
            const b = line.items[i]!;
            gapsX.push({
              a,
              b,
              size: b.r.x1 - a.r.x2,
              from: a.r.x2,
              to: b.r.x1,
              kind: [sigOfItem(a), sigOfItem(b)].sort().join('+'),
              vertical: false,
            });
          }
      if (!spacedY)
        for (let i = 1; i < lines.length; i++) {
          const p = lines[i - 1]!;
          const q = lines[i]!;
          const a = p.items[0]!;
          const b = q.items[0]!;
          gapsY.push({
            a,
            b,
            size: q.y1 - p.y2,
            from: p.y2,
            to: q.y1,
            kind: [sigOfItem(a), sigOfItem(b)].sort().join('+'),
            vertical: true,
          });
        }
    }
    for (const gaps of [gapsX, gapsY]) {
      if (gaps.length < 2 || gaps.some((gap) => gap.size < -t)) continue;
      const counts = new Map<number, number>();
      for (const gap of gaps) {
        const v = round(gap.size, 0.5);
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const [mode, count] = [...counts].sort(
        (a, b) => b[1] - a[1] || a[0] - b[0],
      )[0]!;
      if (count < 2) continue;
      for (const gap of gaps) {
        const delta = Math.abs(gap.size - mode);
        if (delta < 1 || delta > 4) continue;
        // The odd gap only counts against gaps between the same kinds.
        if (
          !gaps.some(
            (other) =>
              other !== gap &&
              other.kind === gap.kind &&
              Math.abs(other.size - mode) < 0.5,
          )
        )
          continue;
        found.push({
          rule: 'uneven-gap',
          hint: 'minor',
          els: [gap.a.el, gap.b.el],
          boxes: [gap.a.r, gap.b.r].map((r) => meet(r, viewport) ?? r),
          measure: {
            gapPx: round(gap.size, 0.01),
            modePx: mode,
            deltaPx: round(delta, 0.01),
            from: round(gap.from, 0.01),
            to: round(gap.to, 0.01),
            vertical: gap.vertical ? 1 : 0,
          },
          message: `Uneven gap: ${describe(gap.a.el).desc} → ${describe(gap.b.el).desc} is ${fmt(gap.size)} px, the others ${fmt(mode)} px`,
        });
      }
    }
  }

  // ─── small-target ─────────────────────────────────────────────────────────

  if (coarse) {
    const threshold = 2.75 * rootFont;
    const checked = new Set<Element>();
    for (const leaf of leaves) {
      if (leaf.kind !== 'control' || checked.has(leaf.el)) continue;
      const el = leaf.el;
      checked.add(el);
      if (
        disabled(el) ||
        leaf.info.cs.pointerEvents === 'none' ||
        leaf.vis < 0.5
      )
        continue;
      // A link inside running words is a part of the text.
      if (leaf.info.cs.display === 'inline') {
        const parent = el.parentElement;
        const own = (el.textContent ?? '').trim().length;
        if (parent && (parent.textContent ?? '').trim().length > own + 2)
          continue;
      }
      const targets: Rect4[] = [leaf.full];
      for (const label of (el as HTMLInputElement).labels ?? []) {
        const info = infos.get(label);
        if (info?.shown) targets.push(info.r);
      }
      const sizeOf = (r: Rect4) => Math.min(r.x2 - r.x1, r.y2 - r.y1);
      let target = targets[0]!;
      for (const r of targets) if (sizeOf(r) > sizeOf(target)) target = r;
      let w = target.x2 - target.x1;
      let h = target.y2 - target.y1;
      if (Math.min(w, h) >= threshold) continue;
      // A hit area larger than the box, drawn by a pseudo-element.
      const cx = (leaf.full.x1 + leaf.full.x2) / 2;
      const cy = (leaf.full.y1 + leaf.full.y2) / 2;
      const half = threshold / 2 - 1;
      const reaches = (x: number, y: number) => {
        if (x < 0 || y < 0 || x > vw || y > vh) return false;
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === el || el.contains(hit) || labelledBy(el, hit));
      };
      if (w < threshold && reaches(cx - half, cy) && reaches(cx + half, cy))
        w = threshold;
      if (h < threshold && reaches(cx, cy - half) && reaches(cx, cy + half))
        h = threshold;
      const size = Math.min(w, h);
      if (size >= threshold) continue;
      found.push({
        rule: 'small-target',
        hint: size < 32 ? 'serious' : 'minor',
        els: [el],
        boxes: [leaf.box],
        measure: {
          widthPx: round(w),
          heightPx: round(h),
          minPx: round(threshold),
        },
        message: `${describe(el).desc} is ${fmt(w)}×${fmt(h)} px; a finger needs ${fmt(threshold)} px`,
      });
    }
  }

  // ─── broken-image ─────────────────────────────────────────────────────────

  {
    const sleep = (ms: number) =>
      new Promise<false>((resolve) => setTimeout(() => resolve(false), ms));
    const candidates = images.filter((info) => {
      const img = info.el as HTMLImageElement;
      return (
        img.complete &&
        img.naturalWidth === 0 &&
        !!(img.currentSrc || img.getAttribute('src'))
      );
    });
    const broken = await Promise.all(
      candidates.map((info) =>
        Promise.race([
          (info.el as HTMLImageElement).decode().then(
            () => false,
            () => true,
          ),
          sleep(500),
        ]),
      ),
    );
    candidates.forEach((info, index) => {
      if (!broken[index]) return;
      const seen = inView(info.r);
      found.push({
        rule: 'broken-image',
        hint: 'serious',
        els: [info.el],
        boxes: [meet(info.r, viewport) ?? info.r],
        measure: { inView: seen ? 1 : 0 },
        message: `${describe(info.el).desc} did not load${seen ? '' : ' (off the screen)'}`,
      });
    });
  }

  // ─── Suppressions, order, output ──────────────────────────────────────────

  const RULES: ProbeRule[] = [
    'overlap',
    'covered-control',
    'clipped-text',
    'page-overflow',
    'leaves-viewport',
    'near-miss',
    'uneven-gap',
    'small-target',
    'broken-image',
  ];
  const HINTS = ['serious', 'minor', 'info'];
  const suppressed = new Map<string, number>();
  const kept: Found[] = [];
  for (const f of found) {
    const by = options.allow?.find(
      (allow) =>
        (allow.rule === '*' || allow.rule === f.rule) &&
        f.els.some((el) => {
          if (allow.selector) {
            try {
              if (el.closest(allow.selector)) return true;
            } catch {
              return false;
            }
          }
          return (
            !!allow.signature && describe(el).sig.includes(allow.signature)
          );
        }),
    );
    if (by) suppressed.set(by.id, (suppressed.get(by.id) ?? 0) + 1);
    else kept.push(f);
  }
  // Three or more of one rule on look-alike elements — the cells of a grid,
  // the rows of a list — are one finding, named by the first of them.
  const shapes = (f: Found) =>
    [
      f.rule,
      f.hint,
      ...f.els.map((el) => {
        const info = infos.get(el);
        return `${describe(el).look}|${Math.round(info?.w ?? 0)}x${Math.round(info?.h ?? 0)}`;
      }),
    ].join('\n');
  const alike = new Map<string, Found[]>();
  for (const f of kept) {
    const key = shapes(f);
    const list = alike.get(key);
    if (list) list.push(f);
    else alike.set(key, [f]);
  }
  const grouped = new Set<Found>();
  for (const list of alike.values()) {
    if (list.length < 3) continue;
    const [first, ...rest] = list;
    first!.measure.alike = list.length;
    first!.message += ` (and ${rest.length} more like it)`;
    for (const f of rest) {
      if (first!.boxes.length < 12)
        first!.boxes.push(...f.boxes.slice(0, 12 - first!.boxes.length));
      kept.splice(kept.indexOf(f), 1);
    }
    grouped.add(first!);
  }
  kept.sort(
    (a, b) =>
      HINTS.indexOf(a.hint) - HINTS.indexOf(b.hint) ||
      RULES.indexOf(a.rule) - RULES.indexOf(b.rule),
  );
  const perRuleCount = new Map<ProbeRule, number>();
  const hash = (text: string) => {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 =
      Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
      Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 =
      Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
      Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  const toBox = (r: Rect4) => ({
    x: round(r.x1),
    y: round(r.y1),
    width: round(r.x2 - r.x1),
    height: round(r.y2 - r.y1),
  });
  const findings: InPageResult['findings'] = [];
  for (const f of kept) {
    const count = perRuleCount.get(f.rule) ?? 0;
    if (count >= perRule) continue;
    perRuleCount.set(f.rule, count + 1);
    const elements = f.els.map((el) => describe(el));
    // A group is known by the look of its elements, not by the first one's name.
    const signs = grouped.has(f)
      ? ['alike', ...elements.map((e) => e.look)]
      : elements.map((e) => e.sig);
    findings.push({
      fp: `${f.rule}:${hash([f.rule, ...signs, screenClass, options.theme].join('\n'))}`,
      rule: f.rule,
      hint: f.hint,
      boxes: f.boxes.map(toBox),
      elements: elements.map(({ path, desc, mark }) =>
        mark === undefined ? { path, desc } : { path, desc, mark },
      ),
      measure: f.measure,
      message: f.message,
    });
  }

  return {
    viewport: { width: vw, height: vh },
    dpr,
    scrollY: Math.round(window.scrollY),
    root: rootKind,
    findings,
    suppressed: [...suppressed].map(([allow, count]) => ({ allow, count })),
    stats: {
      elements: infos.size,
      leaves: leaves.length,
      ms: Math.round(performance.now() - started),
    },
  };
}
