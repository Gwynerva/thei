import { computed, onUnmounted, ref } from 'vue';

const ZOOM_MIN = 0.05;
const DEFAULT_ZOOM_MAX = 5.0;
const FIT_PADDING = 48;

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

interface MediaControlsOptions {
  maxZoom?: () => number;
  fitZoom?: (
    container: { width: number; height: number },
    content: { width: number; height: number },
  ) => number | undefined;
  uncappedFitZoom?: (
    container: { width: number; height: number },
    content: { width: number; height: number },
  ) => number | undefined;
}

export function useMediaControls(options: MediaControlsOptions = {}) {
  const zoom = ref(1);
  const tx = ref(0);
  const ty = ref(0);
  const isFitMode = ref(true);
  const fitZoom = ref(1);
  const uncappedFitZoom = ref(1);
  const isDragging = ref(false);

  const contentW = ref(0);
  const contentH = ref(0);
  const isReady = ref(false);

  let containerW = 0;
  let containerH = 0;
  let targetZoom = 1;
  let targetTx = 0;
  let targetTy = 0;
  let rafId: number | null = null;
  let lastRafTime: number | null = null;

  const activePointers = new Map<number, PointerState>();
  let pinchStart: PinchStartState | null = null;
  let panStart: PanStartState | null = null;

  let resizeObserver: ResizeObserver | null = null;
  let containerEl: HTMLElement | null = null;
  let wheelHandler: ((e: WheelEvent) => void) | null = null;

  const isDraggable = computed(() => zoom.value > uncappedFitZoom.value + 0.01);

  const transformStyle = computed(
    () => `translate(${tx.value}px, ${ty.value}px)`,
  );

  const mediaStyle = computed(() => {
    if (contentW.value === 0 || contentH.value === 0) return {};
    return {
      width: `${contentW.value * zoom.value}px`,
      height: `${contentH.value * zoom.value}px`,
    };
  });

  const zoomPercent = computed(() => Math.round(zoom.value * 100));

  function maxZoom(): number {
    return Math.max(DEFAULT_ZOOM_MAX, options.maxZoom?.() ?? DEFAULT_ZOOM_MAX);
  }

  function clampZoom(value: number): number {
    return Math.min(maxZoom(), Math.max(ZOOM_MIN, value));
  }

  function clampBounds(value: number): { maxTx: number; maxTy: number } {
    const scaledW = contentW.value * value;
    const scaledH = contentH.value * value;
    const overflow = Math.min(
      300,
      Math.min(window.innerWidth, window.innerHeight) * 0.25,
    );

    return {
      maxTx: Math.max(scaledW / 2 - containerW / 2 + overflow, 0),
      maxTy: Math.max(scaledH / 2 - containerH / 2 + overflow, 0),
    };
  }

  function clampPair(
    nextZoom: number,
    nextTx: number,
    nextTy: number,
  ): { tx: number; ty: number } {
    const bounds = clampBounds(nextZoom);
    return {
      tx: Math.min(bounds.maxTx, Math.max(-bounds.maxTx, nextTx)),
      ty: Math.min(bounds.maxTy, Math.max(-bounds.maxTy, nextTy)),
    };
  }

  function clampTranslation(): void {
    if (contentW.value === 0 || contentH.value === 0) return;
    const clamped = clampPair(zoom.value, tx.value, ty.value);
    tx.value = clamped.tx;
    ty.value = clamped.ty;
  }

  function computeFitZoom(): number {
    if (
      contentW.value === 0 ||
      contentH.value === 0 ||
      containerW === 0 ||
      containerH === 0
    ) {
      return 1;
    }

    const customFit = options.fitZoom?.(
      { width: containerW, height: containerH },
      { width: contentW.value, height: contentH.value },
    );
    if (customFit !== undefined && Number.isFinite(customFit)) {
      return clampZoom(customFit);
    }

    const availW = Math.max(containerW - FIT_PADDING, 1);
    const availH = Math.max(containerH - FIT_PADDING, 1);
    return Math.min(availW / contentW.value, availH / contentH.value, 1);
  }

  function computeUncappedFitZoom(): number {
    if (
      contentW.value === 0 ||
      contentH.value === 0 ||
      containerW === 0 ||
      containerH === 0
    ) {
      return 1;
    }

    const availW = Math.max(containerW - FIT_PADDING, 1);
    const availH = Math.max(containerH - FIT_PADDING, 1);
    return Math.min(availW / contentW.value, availH / contentH.value);
  }

  function computeEffectiveUncappedFitZoom(): number {
    if (
      contentW.value === 0 ||
      contentH.value === 0 ||
      containerW === 0 ||
      containerH === 0
    ) {
      return 1;
    }

    const customFit = options.uncappedFitZoom?.(
      { width: containerW, height: containerH },
      { width: contentW.value, height: contentH.value },
    );
    if (customFit !== undefined && Number.isFinite(customFit)) {
      return Math.max(ZOOM_MIN, customFit);
    }

    return computeUncappedFitZoom();
  }

  const LERP_SPEED = 14;

  function animateTick(time: number): void {
    const dt =
      lastRafTime !== null
        ? Math.min((time - lastRafTime) / 1000, 0.1)
        : 1 / 60;
    lastRafTime = time;

    const k = 1 - Math.exp(-LERP_SPEED * dt);
    const nextZoom = zoom.value + (targetZoom - zoom.value) * k;
    const nextTx = tx.value + (targetTx - tx.value) * k;
    const nextTy = ty.value + (targetTy - ty.value) * k;

    const done =
      Math.abs(nextZoom - targetZoom) < 0.0002 &&
      Math.abs(nextTx - targetTx) < 0.1 &&
      Math.abs(nextTy - targetTy) < 0.1;

    zoom.value = done ? targetZoom : nextZoom;
    tx.value = done ? targetTx : nextTx;
    ty.value = done ? targetTy : nextTy;

    rafId = done ? null : requestAnimationFrame(animateTick);
    if (done) lastRafTime = null;
  }

  function startAnimation(): void {
    if (rafId !== null) return;
    lastRafTime = null;
    rafId = requestAnimationFrame(animateTick);
  }

  function stopAnimation(): void {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
    lastRafTime = null;
  }

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

  function enterZoomMode(value: number): void {
    isFitMode.value = false;
    targetZoom = clampZoom(value);
    targetTx = 0;
    targetTy = 0;
    startAnimation();
  }

  function resetView(): void {
    stopAnimation();
    fitZoom.value = computeFitZoom();
    uncappedFitZoom.value = computeEffectiveUncappedFitZoom();
    isFitMode.value = true;
    zoom.value = fitZoom.value;
    tx.value = 0;
    ty.value = 0;
    targetZoom = fitZoom.value;
    targetTx = 0;
    targetTy = 0;
  }

  function syncFitAfterResize(): void {
    const nextFit = computeFitZoom();
    fitZoom.value = nextFit;
    uncappedFitZoom.value = computeEffectiveUncappedFitZoom();

    if (isFitMode.value) {
      targetZoom = nextFit;
      targetTx = 0;
      targetTy = 0;
      startAnimation();
      return;
    }

    const nextZoom = clampZoom(zoom.value);
    const clamped = clampPair(nextZoom, tx.value, ty.value);
    zoom.value = nextZoom;
    tx.value = clamped.tx;
    ty.value = clamped.ty;
    targetZoom = nextZoom;
    targetTx = clamped.tx;
    targetTy = clamped.ty;
  }

  function onDimensionsKnown(): void {
    fitZoom.value = computeFitZoom();
    uncappedFitZoom.value = computeEffectiveUncappedFitZoom();
    isReady.value = true;

    if (isFitMode.value) {
      zoom.value = fitZoom.value;
      tx.value = 0;
      ty.value = 0;
      targetZoom = fitZoom.value;
      targetTx = 0;
      targetTy = 0;
    }
  }

  function handleZoomButtonClick(): void {
    if (!isFitMode.value) {
      enterFitMode();
      return;
    }

    enterZoomMode(1);
  }

  function handleZoomTargetButtonClick(value: number): void {
    const nextZoom = clampZoom(value);
    const isAtTarget =
      !isFitMode.value && Math.abs(targetZoom - nextZoom) < 0.0005;

    if (isAtTarget) {
      enterFitMode();
      return;
    }

    enterZoomMode(nextZoom);
  }

  function zoomTo(value: number): void {
    enterZoomMode(value);
  }

  function fitToCurrentTarget(): void {
    fitZoom.value = computeFitZoom();
    enterFitMode();
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();

    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16;
    if (e.deltaMode === 2) delta *= 400;

    const factor = Math.pow(0.999, delta);
    const nextZoom = clampZoom(targetZoom * factor);

    const rect = containerEl!.getBoundingClientRect();
    const cx = e.clientX - rect.left - containerW / 2;
    const cy = e.clientY - rect.top - containerH / 2;
    const ratio = nextZoom / targetZoom;
    const nextTx = cx - (cx - targetTx) * ratio;
    const nextTy = cy - (cy - targetTy) * ratio;
    const clamped = clampPair(nextZoom, nextTx, nextTy);

    targetZoom = nextZoom;
    targetTx = clamped.tx;
    targetTy = clamped.ty;
    isFitMode.value = false;
    startAnimation();
  }

  function pointerDist(): number {
    const points = [...activePointers.values()];
    const dx = points[0]!.x - points[1]!.x;
    const dy = points[0]!.y - points[1]!.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pointerMidpoint(): { cx: number; cy: number } {
    const points = [...activePointers.values()];
    const rect = containerEl!.getBoundingClientRect();
    const mx = (points[0]!.x + points[1]!.x) / 2 - rect.left - containerW / 2;
    const my = (points[0]!.y + points[1]!.y) / 2 - rect.top - containerH / 2;
    return { cx: mx, cy: my };
  }

  function onPointerDown(e: PointerEvent): void {
    snapToTarget();
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = e.currentTarget as HTMLElement;

    if (activePointers.size === 2) {
      for (const id of activePointers.keys()) {
        el.setPointerCapture(id);
      }

      const midpoint = pointerMidpoint();
      pinchStart = {
        dist: pointerDist(),
        zoom: zoom.value,
        tx: tx.value,
        ty: ty.value,
        cx: midpoint.cx,
        cy: midpoint.cy,
      };
      isDragging.value = false;
      panStart = null;
      return;
    }

    if (activePointers.size === 1 && isDraggable.value) {
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
  }

  function onPointerMove(e: PointerEvent): void {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2 && pinchStart !== null) {
      const currentDist = pointerDist();
      const factor = currentDist / pinchStart.dist;
      const nextZoom = clampZoom(pinchStart.zoom * factor);
      const ratio = nextZoom / pinchStart.zoom;

      tx.value = pinchStart.cx - (pinchStart.cx - pinchStart.tx) * ratio;
      ty.value = pinchStart.cy - (pinchStart.cy - pinchStart.ty) * ratio;
      zoom.value = nextZoom;
      clampTranslation();
      targetZoom = zoom.value;
      targetTx = tx.value;
      targetTy = ty.value;
      isFitMode.value = false;
      return;
    }

    if (activePointers.size === 1 && isDragging.value && panStart !== null) {
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
      const remaining = [...activePointers.entries()][0]!;
      isDragging.value = isDraggable.value;
      panStart = isDraggable.value
        ? { tx: tx.value, ty: ty.value, px: remaining[1].x, py: remaining[1].y }
        : null;
    }

    if (activePointers.size === 0) {
      isDragging.value = false;
      panStart = null;
      if (!isDraggable.value) {
        targetTx = 0;
        targetTy = 0;
        startAnimation();
      }
    }
  }

  function onPointerCancel(e: PointerEvent): void {
    activePointers.delete(e.pointerId);

    if (activePointers.size !== 0) return;

    isDragging.value = false;
    panStart = null;
    pinchStart = null;
    if (!isDraggable.value) {
      targetTx = 0;
      targetTy = 0;
      startAnimation();
    }
  }

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
      syncFitAfterResize();
    });
    resizeObserver.observe(container);

    const rect = container.getBoundingClientRect();
    containerW = rect.width;
    containerH = rect.height;

    wheelHandler = onWheel;
    container.addEventListener('wheel', wheelHandler, { passive: false });

    const dimensions = getMediaDimensions();
    if (dimensions && dimensions.w > 0 && dimensions.h > 0) {
      contentW.value = dimensions.w;
      contentH.value = dimensions.h;
      onDimensionsKnown();
    }
  }

  function onMediaLoaded(w: number, h: number): void {
    const effectiveW = w > 0 ? w : containerW * 0.8;
    const effectiveH = h > 0 ? h : containerH * 0.8;
    if (effectiveW <= 0 || effectiveH <= 0) return;

    const dimensionsChanged =
      contentW.value !== effectiveW || contentH.value !== effectiveH;

    contentW.value = effectiveW;
    contentH.value = effectiveH;

    if (!isReady.value) {
      onDimensionsKnown();
      return;
    }

    if (!dimensionsChanged) return;

    if (isFitMode.value) {
      resetView();
      return;
    }

    syncFitAfterResize();
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
    zoom,
    transformStyle,
    mediaStyle,
    zoomPercent,
    isDraggable,
    isDragging,
    isFitMode,
    fitZoom,
    isReady,
    handleZoomButtonClick,
    handleZoomTargetButtonClick,
    zoomTo,
    fitToCurrentTarget,
    resetView,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    initMedia,
    onMediaLoaded,
  };
}
