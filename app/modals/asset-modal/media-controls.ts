import { computed, onUnmounted, ref } from 'vue';

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 5.0;
const OVERFLOW = 300;
const FIT_PADDING = 48; // 24px each side

interface PointerState {
  x: number;
  y: number;
}

interface PinchStartState {
  dist: number;
  zoom: number;
  tx: number;
  ty: number;
  cx: number;
  cy: number;
}

interface PanStartState {
  tx: number;
  ty: number;
  px: number;
  py: number;
}

export function useMediaControls() {
  // ─── state ────────────────────────────────────────────────────────────────

  const zoom = ref(1);
  const tx = ref(0);
  const ty = ref(0);
  const isFitMode = ref(true);
  const fitZoom = ref(1);
  const uncappedFitZoom = ref(1);
  const isDragging = ref(false);

  // intrinsic media dimensions (set after load, reactive for computed)
  const naturalW = ref(0);
  const naturalH = ref(0);
  // whether dimensions are known and media is ready to display
  const isReady = ref(false);
  // container dimensions (set by ResizeObserver)
  let containerW = 0;
  let containerH = 0;

  // pointer tracking
  const activePointers = new Map<number, PointerState>();
  let pinchStart: PinchStartState | null = null;
  let panStart: PanStartState | null = null;

  // cleanup handles
  let resizeObserver: ResizeObserver | null = null;
  let containerEl: HTMLElement | null = null;
  let wheelHandler: ((e: WheelEvent) => void) | null = null;

  // smooth animation — wheel events update targets, rAF lerps current → target
  // pinch/pan bypass animation and set current directly for zero-latency response
  let targetZoom = 1;
  let targetTx = 0;
  let targetTy = 0;
  let rafId: number | null = null;
  let lastRafTime: number | null = null;

  // ─── derived ─────────────────────────────────────────────────────────────

  // Media is only draggable when it actually overflows the container, i.e. zoom
  // exceeds the uncapped fill zoom (not the capped fitZoom which stops at 1.0).
  const isDraggable = computed(() => zoom.value > uncappedFitZoom.value + 0.01);

  // Translate only — zoom is expressed via explicit width/height on the media element.
  // This ensures SVGs (and images) are re-rendered at display resolution, not scaled bitmaps.
  const transformStyle = computed(
    () => `translate(${tx.value}px, ${ty.value}px)`,
  );

  // Applied directly to <img>/<video> so the browser renders at the correct size.
  const mediaStyle = computed(() => {
    if (naturalW.value === 0 || naturalH.value === 0) return {};
    return {
      width: `${naturalW.value * zoom.value}px`,
      height: `${naturalH.value * zoom.value}px`,
    };
  });

  const zoomPercent = computed(() => Math.round(zoom.value * 100));

  // ─── helpers ─────────────────────────────────────────────────────────────

  function clampZoom(z: number): number {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  }

  // Returns the max allowed |tx| and |ty| for a given zoom level.
  function clampBounds(z: number): { maxTx: number; maxTy: number } {
    const scaledW = naturalW.value * z;
    const scaledH = naturalH.value * z;
    return {
      maxTx: Math.max(scaledW / 2 - containerW / 2 + OVERFLOW, 0),
      maxTy: Math.max(scaledH / 2 - containerH / 2 + OVERFLOW, 0),
    };
  }

  function clampPair(
    z: number,
    ttx: number,
    tty: number,
  ): { tx: number; ty: number } {
    const { maxTx, maxTy } = clampBounds(z);
    return {
      tx: Math.min(maxTx, Math.max(-maxTx, ttx)),
      ty: Math.min(maxTy, Math.max(-maxTy, tty)),
    };
  }

  // Clamp the live refs (used after pan/pinch).
  function clampTranslation(): void {
    if (naturalW.value === 0 || naturalH.value === 0) return;
    const clamped = clampPair(zoom.value, tx.value, ty.value);
    tx.value = clamped.tx;
    ty.value = clamped.ty;
  }

  function computeFitZoom(): number {
    if (
      naturalW.value === 0 ||
      naturalH.value === 0 ||
      containerW === 0 ||
      containerH === 0
    )
      return 1;
    const availW = containerW - FIT_PADDING;
    const availH = containerH - FIT_PADDING;
    return Math.min(availW / naturalW.value, availH / naturalH.value, 1.0);
  }

  // Same as computeFitZoom but without the 1.0 cap — the zoom level at which media
  // would exactly fill the container. Used to determine whether panning is possible.
  function computeUncappedFitZoom(): number {
    if (
      naturalW.value === 0 ||
      naturalH.value === 0 ||
      containerW === 0 ||
      containerH === 0
    )
      return 1;
    const availW = containerW - FIT_PADDING;
    const availH = containerH - FIT_PADDING;
    return Math.min(availW / naturalW.value, availH / naturalH.value);
  }

  // ─── rAF animation loop ───────────────────────────────────────────────────
  // LERP_SPEED: time-constant in 1/s — higher = snappier (14 ≈ ~70ms settle time)
  const LERP_SPEED = 14;

  function animateTick(time: number): void {
    const dt =
      lastRafTime !== null
        ? Math.min((time - lastRafTime) / 1000, 0.1)
        : 1 / 60;
    lastRafTime = time;

    const k = 1 - Math.exp(-LERP_SPEED * dt);
    const newZoom = zoom.value + (targetZoom - zoom.value) * k;
    const newTx = tx.value + (targetTx - tx.value) * k;
    const newTy = ty.value + (targetTy - ty.value) * k;

    const done =
      Math.abs(newZoom - targetZoom) < 0.0002 &&
      Math.abs(newTx - targetTx) < 0.1 &&
      Math.abs(newTy - targetTy) < 0.1;

    zoom.value = done ? targetZoom : newZoom;
    tx.value = done ? targetTx : newTx;
    ty.value = done ? targetTy : newTy;

    rafId = done ? null : requestAnimationFrame(animateTick);
    if (done) lastRafTime = null;
  }

  function startAnimation(): void {
    if (rafId !== null) return; // already running
    lastRafTime = null;
    rafId = requestAnimationFrame(animateTick);
  }

  function stopAnimation(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      lastRafTime = null;
    }
  }

  // Snap live state to targets and stop animation (called before pan/pinch).
  function snapToTarget(): void {
    stopAnimation();
    zoom.value = targetZoom;
    tx.value = targetTx;
    ty.value = targetTy;
  }

  function enterFitMode(): void {
    isFitMode.value = true;
    targetZoom = fitZoom.value;
    targetTx = 0;
    targetTy = 0;
    startAnimation();
  }

  function enterOriginalMode(): void {
    isFitMode.value = false;
    targetZoom = clampZoom(1);
    targetTx = 0;
    targetTy = 0;
    startAnimation();
  }

  function onDimensionsKnown(): void {
    if (isReady.value) return; // guard against duplicate calls (sync read + load event)
    fitZoom.value = computeFitZoom();
    uncappedFitZoom.value = computeUncappedFitZoom();
    isReady.value = true;
    if (isFitMode.value) {
      // snap immediately on first load — no animation needed
      zoom.value = fitZoom.value;
      tx.value = 0;
      ty.value = 0;
      targetZoom = fitZoom.value;
      targetTx = 0;
      targetTy = 0;
    }
  }

  // ─── public API ───────────────────────────────────────────────────────────

  function handleZoomButtonClick(): void {
    if (!isFitMode.value) {
      enterFitMode();
    } else {
      enterOriginalMode();
    }
  }

  // ─── wheel ────────────────────────────────────────────────────────────────

  function onWheel(e: WheelEvent): void {
    e.preventDefault();

    let delta = e.deltaY;
    if (e.deltaMode === 1 /* DOM_DELTA_LINE */) delta *= 16;
    if (e.deltaMode === 2 /* DOM_DELTA_PAGE */) delta *= 400;

    const factor = Math.pow(0.999, delta);
    // apply zoom factor to TARGET (not current) so rapid scrolling accumulates correctly
    const newZoom = clampZoom(targetZoom * factor);

    const rect = containerEl!.getBoundingClientRect();
    const cx = e.clientX - rect.left - containerW / 2;
    const cy = e.clientY - rect.top - containerH / 2;

    // cursor-anchor computed against target state
    const ratio = newZoom / targetZoom;
    const newTx = cx - (cx - targetTx) * ratio;
    const newTy = cy - (cy - targetTy) * ratio;

    const clamped = clampPair(newZoom, newTx, newTy);
    targetZoom = newZoom;
    targetTx = clamped.tx;
    targetTy = clamped.ty;

    isFitMode.value = false;
    startAnimation();
  }

  // ─── pointer ──────────────────────────────────────────────────────────────

  function pointerDist(): number {
    const pts = [...activePointers.values()];
    const dx = pts[0]!.x - pts[1]!.x;
    const dy = pts[0]!.y - pts[1]!.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pointerMidpoint(): { cx: number; cy: number } {
    const pts = [...activePointers.values()];
    const rect = containerEl!.getBoundingClientRect();
    const mx = (pts[0]!.x + pts[1]!.x) / 2 - rect.left - containerW / 2;
    const my = (pts[0]!.y + pts[1]!.y) / 2 - rect.top - containerH / 2;
    return { cx: mx, cy: my };
  }

  function onPointerDown(e: PointerEvent): void {
    // snap any in-flight wheel animation so pan/pinch start from a clean state
    snapToTarget();

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = e.currentTarget as HTMLElement;

    if (activePointers.size === 2) {
      // start pinch — capture both active pointers so moves are always received
      for (const id of activePointers.keys()) {
        el.setPointerCapture(id);
      }
      const { cx, cy } = pointerMidpoint();
      pinchStart = {
        dist: pointerDist(),
        zoom: zoom.value,
        tx: tx.value,
        ty: ty.value,
        cx,
        cy,
      };
      isDragging.value = false;
      panStart = null;
    } else if (activePointers.size === 1 && isDraggable.value) {
      // start pan — capture this pointer so moves outside the element are received
      el.setPointerCapture(e.pointerId);
      isDragging.value = true;
      panStart = {
        tx: tx.value,
        ty: ty.value,
        px: e.clientX,
        py: e.clientY,
      };
      pinchStart = null;
    }
    // else: single tap, not draggable — don't capture so native controls (e.g. video)
    // can receive the pointer normally
  }

  function onPointerMove(e: PointerEvent): void {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2 && pinchStart !== null) {
      // pinch zoom — anchor the content point under the START midpoint to the
      // CURRENT midpoint, so the image stays under the fingers throughout the
      // gesture (fixes misalignment on zoom-out and enables two-finger pan).
      const currentDist = pointerDist();
      const factor = currentDist / pinchStart.dist;
      const newZoom = clampZoom(pinchStart.zoom * factor);
      const ratio = newZoom / pinchStart.zoom;

      // Use the fixed start midpoint as anchor — panning is intentionally
      // disabled during pinch; finger drift is ignored.
      tx.value = pinchStart.cx - (pinchStart.cx - pinchStart.tx) * ratio;
      ty.value = pinchStart.cy - (pinchStart.cy - pinchStart.ty) * ratio;
      zoom.value = newZoom;
      clampTranslation();
      // keep targets in sync so a subsequent wheel starts from the right place
      targetZoom = zoom.value;
      targetTx = tx.value;
      targetTy = ty.value;
      isFitMode.value = false;
    } else if (
      activePointers.size === 1 &&
      isDragging.value &&
      panStart !== null
    ) {
      // pan
      tx.value = panStart.tx + (e.clientX - panStart.px);
      ty.value = panStart.ty + (e.clientY - panStart.py);
      clampTranslation();
      targetTx = tx.value;
      targetTy = ty.value;
    }
  }

  function onPointerUp(e: PointerEvent): void {
    activePointers.delete(e.pointerId);

    if (activePointers.size < 2) {
      pinchStart = null;
    }

    if (activePointers.size === 1 && isDragging.value) {
      // dropped one finger during pinch — restart pan from current state
      const remaining = [...activePointers.entries()][0]!;
      isDragging.value = isDraggable.value;
      panStart = isDraggable.value
        ? { tx: tx.value, ty: ty.value, px: remaining[1].x, py: remaining[1].y }
        : null;
    }

    if (activePointers.size === 0) {
      isDragging.value = false;
      panStart = null;
      // gravitate to center when media is smaller than the container
      if (!isDraggable.value) {
        targetTx = 0;
        targetTy = 0;
        startAnimation();
      }
    }
  }

  function onPointerCancel(e: PointerEvent): void {
    activePointers.delete(e.pointerId);
    if (activePointers.size === 0) {
      isDragging.value = false;
      panStart = null;
      pinchStart = null;
      // gravitate to center when media is smaller than the container
      if (!isDraggable.value) {
        targetTx = 0;
        targetTy = 0;
        startAnimation();
      }
    }
  }

  // ─── init / teardown ─────────────────────────────────────────────────────

  function initMedia(
    container: HTMLElement,
    getMediaDimensions: () => { w: number; h: number } | null,
  ): void {
    containerEl = container;

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      containerW = entry.contentRect.width;
      containerH = entry.contentRect.height;
      const newFit = computeFitZoom();
      fitZoom.value = newFit;
      uncappedFitZoom.value = computeUncappedFitZoom();
      if (isFitMode.value) {
        // animate to new fit on window resize
        targetZoom = newFit;
        targetTx = 0;
        targetTy = 0;
        startAnimation();
      } else {
        const clamped = clampPair(zoom.value, tx.value, ty.value);
        tx.value = clamped.tx;
        ty.value = clamped.ty;
        targetTx = clamped.tx;
        targetTy = clamped.ty;
      }
    });
    resizeObserver.observe(container);

    // read initial container size synchronously if already laid out
    const rect = container.getBoundingClientRect();
    containerW = rect.width;
    containerH = rect.height;

    // set up wheel listener with { passive: false } to allow preventDefault
    wheelHandler = onWheel;
    container.addEventListener('wheel', wheelHandler, { passive: false });

    // try to get dimensions immediately (if already loaded)
    const dims = getMediaDimensions();
    if (dims && dims.w > 0 && dims.h > 0) {
      naturalW.value = dims.w;
      naturalH.value = dims.h;
      onDimensionsKnown();
    }
  }

  function onMediaLoaded(w: number, h: number): void {
    // SVGs without intrinsic dimensions report 0×0 — fall back to container size
    const effectiveW = w > 0 ? w : containerW;
    const effectiveH = h > 0 ? h : containerH;
    if (effectiveW > 0 && effectiveH > 0) {
      naturalW.value = effectiveW;
      naturalH.value = effectiveH;
      onDimensionsKnown();
    }
  }

  onUnmounted(() => {
    if (containerEl && wheelHandler) {
      containerEl.removeEventListener('wheel', wheelHandler);
    }
    stopAnimation();
    resizeObserver?.disconnect();
    resizeObserver = null;
    containerEl = null;
    wheelHandler = null;
  });

  return {
    transformStyle,
    mediaStyle,
    zoomPercent,
    isDraggable,
    isDragging,
    isFitMode,
    fitZoom,
    isReady,
    handleZoomButtonClick,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    initMedia,
    onMediaLoaded,
  };
}
