/**
 * The dust over a hidden spoiler: many tiny specks flying in random
 * directions, each living for a moment and fading in and out, the way a
 * messenger hides a spoiler. Drawn on a canvas, because a repeating gradient
 * can only slide as a lattice, and a lattice reads as wallpaper.
 *
 * Speed is in pixels per second of real time, taken from the frame clock
 * alone, so a one-line spoiler and a tall gallery move exactly alike however
 * long a frame takes to draw. The specks live in flat typed arrays and are
 * reborn in place: a frame allocates nothing, so there is no garbage for the
 * collector to stop the animation over.
 *
 * The loop runs only while the block is on screen and the page is visible,
 * and a reader who asked for less motion gets one still frame instead.
 */

export interface SpoilerParticleSettings {
  /** Specks per square pixel; the count follows the block's area. */
  density: number;
  minCount: number;
  maxCount: number;
  /** Pixels per second. */
  speed: [min: number, max: number];
  /** Seconds. */
  life: [min: number, max: number];
  /** CSS pixels. Most specks are near the smaller end, a few near the larger. */
  size: [min: number, max: number];
}

/**
 * The dust drifts rather than flies: over its life a speck travels a few
 * pixels, so even a one-line spoiler shimmers in place instead of streaming
 * across its own height.
 */
export const SPOILER_PARTICLES: SpoilerParticleSettings = {
  density: 1 / 40,
  minCount: 80,
  maxCount: 3000,
  speed: [4, 12],
  life: [1.2, 2.6],
  size: [0.6, 1.8],
};

/** Every speck of one spoiler, one array per property. */
export interface ParticleField {
  count: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  age: Float32Array;
  life: Float32Array;
  size: Float32Array;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** The longest step a frame may take, so a tab left in the background does not jump. */
const MAX_STEP = 0.05;
/** Brightness is drawn in this many steps: one fill per step, not per speck. */
const ALPHA_LEVELS = 8;
/** How often the dust re-reads its colour, which follows the theme. */
const COLOR_REFRESH_MS = 1000;

function between(range: [number, number]) {
  return range[0] + Math.random() * (range[1] - range[0]);
}

export function spoilerParticleCount(
  width: number,
  height: number,
  settings = SPOILER_PARTICLES,
) {
  const wanted = Math.round(width * height * settings.density);
  return Math.min(settings.maxCount, Math.max(settings.minCount, wanted));
}

export function createParticleField(capacity: number): ParticleField {
  return {
    count: 0,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    age: new Float32Array(capacity),
    life: new Float32Array(capacity),
    size: new Float32Array(capacity),
  };
}

/**
 * Gives speck `index` a new life somewhere in the block. `ageFraction` starts
 * it part-way through, so the first specks are not all born together.
 */
export function spawnParticle(
  field: ParticleField,
  index: number,
  width: number,
  height: number,
  settings: SpoilerParticleSettings,
  ageFraction = 0,
) {
  const angle = Math.random() * Math.PI * 2;
  const speed = between(settings.speed);
  const life = between(settings.life);
  field.x[index] = Math.random() * width;
  field.y[index] = Math.random() * height;
  field.vx[index] = Math.cos(angle) * speed;
  field.vy[index] = Math.sin(angle) * speed;
  field.age[index] = ageFraction * life;
  field.life[index] = life;
  // Squared, so most of the dust is fine and only a grain here and there is
  // coarse: evenly spread sizes read as one uniform grit.
  const [smallest, largest] = settings.size;
  field.size[index] = smallest + Math.random() ** 2 * (largest - smallest);
}

/** One step of every speck: it moves, ages, and is reborn elsewhere when spent. */
export function stepParticles(
  field: ParticleField,
  step: number,
  width: number,
  height: number,
  settings: SpoilerParticleSettings,
) {
  const { x, y, vx, vy, age, life } = field;
  for (let index = 0; index < field.count; index++) {
    age[index]! += step;
    if (age[index]! >= life[index]!) {
      spawnParticle(field, index, width, height, settings);
      continue;
    }
    let nextX = x[index]! + vx[index]! * step;
    let nextY = y[index]! + vy[index]! * step;
    if (nextX < 0) nextX += width;
    else if (nextX > width) nextX -= width;
    if (nextY < 0) nextY += height;
    else if (nextY > height) nextY -= height;
    x[index] = nextX;
    y[index] = nextY;
  }
}

/** How bright a speck is at this point of its life: born dark, brightest midway. */
export function particleAlpha(age: number, life: number) {
  return Math.sin((Math.PI * age) / life);
}

/**
 * The time a frame moves the dust by: the gap between two frame timestamps,
 * never negative, never longer than `MAX_STEP`, and nothing for the first
 * frame after a pause.
 */
export function frameStep(now: number, previous: number | undefined) {
  if (previous === undefined) return 0;
  return Math.min(MAX_STEP, Math.max(0, (now - previous) / 1000));
}

export function startSpoilerParticles(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  settings = SPOILER_PARTICLES,
) {
  const context = canvas.getContext('2d');
  if (!context) return () => {};

  let width = 0;
  let height = 0;
  let field = createParticleField(0);
  let frame: number | undefined;
  let previous: number | undefined;
  let color = '';
  let colorReadAt = -Infinity;
  let onScreen = true;
  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);

  function readColor(now: number) {
    color = getComputedStyle(canvas).color;
    colorReadAt = now;
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context!.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = spoilerParticleCount(width, height, settings);
    if (count > field.x.length) {
      const grown = createParticleField(count);
      for (const key of ['x', 'y', 'vx', 'vy', 'age', 'life', 'size'] as const)
        grown[key].set(field[key].subarray(0, field.count));
      grown.count = field.count;
      field = grown;
    }
    // Specks added now are spread over their lives, or they would all be
    // born and die together.
    for (let index = field.count; index < count; index++)
      spawnParticle(field, index, width, height, settings, Math.random());
    // A block that shrank keeps its first specks; any left outside it come
    // back in through the edges on the next step.
    field.count = count;
    readColor(performance.now());
    if (reducedMotion.matches) draw();
  }

  function draw() {
    context!.clearRect(0, 0, width, height);
    context!.fillStyle = color;
    const { x, y, age, life, size } = field;
    if (reducedMotion.matches) {
      context!.globalAlpha = 0.55;
      context!.beginPath();
      for (let index = 0; index < field.count; index++)
        context!.rect(x[index]!, y[index]!, size[index]!, size[index]!);
      context!.fill();
      context!.globalAlpha = 1;
      return;
    }
    for (let level = 1; level <= ALPHA_LEVELS; level++) {
      const floor = (level - 0.5) / ALPHA_LEVELS;
      const ceiling = (level + 0.5) / ALPHA_LEVELS;
      context!.globalAlpha = level / ALPHA_LEVELS;
      context!.beginPath();
      for (let index = 0; index < field.count; index++) {
        const alpha = particleAlpha(age[index]!, life[index]!);
        if (alpha < floor || alpha >= ceiling) continue;
        context!.rect(x[index]!, y[index]!, size[index]!, size[index]!);
      }
      context!.fill();
    }
    context!.globalAlpha = 1;
  }

  function tick(now: number) {
    frame = undefined;
    const step = frameStep(now, previous);
    previous = now;
    if (now - colorReadAt > COLOR_REFRESH_MS) readColor(now);
    stepParticles(field, step, width, height, settings);
    draw();
    schedule();
  }

  function schedule() {
    if (frame !== undefined || !onScreen || document.hidden) return;
    if (reducedMotion.matches) return;
    frame = requestAnimationFrame(tick);
  }

  function pause() {
    previous = undefined;
    if (frame === undefined) return;
    cancelAnimationFrame(frame);
    frame = undefined;
  }

  function onMotionPreference() {
    pause();
    if (reducedMotion.matches) draw();
    else schedule();
  }

  function onVisibility() {
    if (document.hidden) pause();
    else schedule();
  }

  const resizeObserver = new ResizeObserver(resize);
  const viewObserver = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    if (onScreen) schedule();
    else pause();
  });
  resizeObserver.observe(host);
  viewObserver.observe(host);
  reducedMotion.addEventListener('change', onMotionPreference);
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  schedule();

  return () => {
    pause();
    resizeObserver.disconnect();
    viewObserver.disconnect();
    reducedMotion.removeEventListener('change', onMotionPreference);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
