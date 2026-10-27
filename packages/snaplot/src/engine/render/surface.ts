import { warnOnce } from '../errors';
import { adoptStyles, styleRootOf } from '../../dom/styles';
import { shared } from './scheduler';

/** A side of the chart's root that chrome (the built-in legend) can take space from. */
export type ChromeSide = 'top' | 'bottom';

/**
 * Detect a devicePixelRatio change that leaves the CSS size unchanged, e.g. dragging the window
 * between monitors with different scale factors. The ResizeObserver never fires in that case (the
 * contentRect is identical), so the backing store would stay at the old resolution and render
 * blurry until an unrelated resize. A `(resolution: Ndppx)` media query matches only the current
 * dpr, so its `change` event fires when dpr moves off N; the watcher then re-arms for the new
 * dpr. One query serves every chart on the page.
 *
 * The query also fires without a dpr change: Blink flips it when entering and leaving print
 * media, with no animation frame before the snapshot. Resizing then would clear every canvas into
 * the printout (gap-environments-01), so listeners resize only on a real dpr change.
 */
const watchDpr = shared((notify) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let query: MediaQueryList;
  const onChange = () => {
    query.removeEventListener('change', onChange);
    arm();
    notify();
  };
  const arm = () => {
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener('change', onChange);
  };
  arm();
  return () => query.removeEventListener('change', onChange);
});

/** The height a chart takes in a host that gives it none (plan D26). */
const FALLBACK_HEIGHT = 300;

/**
 * The layout size, made exact from the bounding box when the two agree (the bounding box is
 * fractional; under a CSS transform it is scaled, and the layout size is the one to keep).
 */
function exactSize(layout: number, box: number): number {
  return Math.abs(box - layout) < 1 ? box : layout;
}

/**
 * The canvas's 2D context, or one that draws nothing where there is none (jsdom without a canvas
 * package, a blocked context), so the chart mounts, updates and destroys without throwing.
 */
export function context2d(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D {
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (context) return context;
  warnOnce(
    'environment',
    'The canvas has no 2D context here (jsdom without the canvas package?), so the chart draws nothing.',
  );
  const state: Record<string | symbol, unknown> = { canvas };
  const results: Record<string, unknown> = {
    createLinearGradient: { addColorStop() {} },
    createRadialGradient: { addColorStop() {} },
    createPattern: null,
    getLineDash: [],
    isPointInPath: false,
    isPointInStroke: false,
    measureText: { width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 },
  };
  return new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'getImageData' || key === 'createImageData')
        return (...args: number[]) => {
          const [w, h] = key === 'getImageData' ? args.slice(2) : args;
          return {
            width: w,
            height: h,
            data: new Uint8ClampedArray(Math.max(0, 4 * w * h)),
          };
        };
      return () => results[key as string];
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** An element's content-box height: its client height less vertical padding. */
function contentHeight(element: HTMLElement): number {
  if (typeof getComputedStyle === 'undefined') return element.clientHeight;
  const style = getComputedStyle(element);
  return (
    element.clientHeight -
    (parseFloat(style.paddingTop) || 0) -
    (parseFloat(style.paddingBottom) || 0)
  );
}

/** The keys the chart's interactive element handles (plan D20). */
const KEY_SHORTCUTS = 'ArrowLeft ArrowRight Home End Shift+ArrowLeft Shift+ArrowRight + - 0 Escape';
const KEY_HINT = 'Arrow keys move between points, Shift and an arrow pans, + and − zoom, 0 resets.';
const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;';

/**
 * The focus ring (plan D20): a 2 px outline in the theme's accent, shown for keyboard focus only;
 * the system highlight colour in forced colours.
 */
export const SURFACE_CSS = `.snaplot-surface{outline:none}
.snaplot-surface:focus-visible{outline:2px solid var(--snaplot-theme-accent,#2563eb);outline-offset:2px}
@media (forced-colors:active){.snaplot-surface:focus-visible{outline-color:Highlight}}`;

/**
 * Creates and manages the 3-layer canvas stack + DOM overlay, and the space chrome reserves at
 * the top and bottom of the root (`reserveChrome`, a W5 contract: plan §3.2).
 *
 * Layer 0 (grid):    Gridlines, axis lines. Alpha-capable: the plot is transparent (plan D5).
 * Layer 1 (data):    Series marks (lines, fills, points, bars).
 * Layer 2 (overlay): Crosshair, selection box. pointer-events:none.
 * DOM layer:         Axis labels, tick values, tooltip, legend.
 *
 * Per spec §3: overlay has pointer-events:none, events pass through
 * to the data canvas (or a hit-test div).
 */
export class CanvasManager {
  readonly container: HTMLDivElement;
  readonly gridCanvas: HTMLCanvasElement;
  readonly dataCanvas: HTMLCanvasElement;
  readonly overlayCanvas: HTMLCanvasElement;
  readonly domLayer: HTMLDivElement;
  readonly interactionLayer: HTMLDivElement;

  readonly gridCtx: CanvasRenderingContext2D;
  readonly dataCtx: CanvasRenderingContext2D;
  readonly overlayCtx: CanvasRenderingContext2D;

  private resizeObserver: ResizeObserver | null = null;
  private _dpr = 1;
  /** The CSS size and dpr the backing stores were last allocated for. */
  private allocated: { width: number; height: number; dpr: number } | null = null;
  private unwatchDprChange: (() => void) | null = null;
  /** CSS pixels reserved for chrome at each side of the root. */
  private chrome: Record<ChromeSide, number> = { top: 0, bottom: 0 };
  /** The explicit CSS height of the root, or null to fill the host (plan D26). */
  private explicitHeight: string | null = null;
  /** Whether the root holds the 300 px fallback height for a host that gives it none. */
  private fallback = false;
  /** Whether the overlay has a backing store: only once it first shows something. */
  private overlayActive = false;

  constructor(
    parent: HTMLElement,
    /**
     * Called after a non-zero ResizeObserver delivery, and after a real dpr
     * change. `reallocated` says whether the backing stores were cleared.
     */
    private onResize?: (width: number, height: number, reallocated: boolean) => void,
  ) {
    this._dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    // Container. `isolation: isolate` keeps the layers' z-indices inside the chart, so page
    // content above it is never painted under a canvas; `break-inside: avoid` keeps a printed
    // chart on one page. It is the chart's interactive element (plan D20): a named
    // `role="application"` tab stop with a focus ring from the injected stylesheet
    // (`setInteractive`, `setAccessibleName`); the canvases and the label layer are hidden from
    // assistive tech, and a polite live region reads the keyboard cursor.
    adoptStyles(styleRootOf(parent), 'surface', SURFACE_CSS);
    this.container = document.createElement('div');
    this.container.className = 'snaplot-surface';
    this.container.style.cssText =
      'position:relative;isolation:isolate;break-inside:avoid;max-width:100%;width:100%;height:100%;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:auto;border-radius:6px;';
    this.setInteractive(true);
    parent.appendChild(this.container);

    // Create canvases
    this.gridCanvas = this.createCanvas(0);
    this.dataCanvas = this.createCanvas(1);
    this.overlayCanvas = this.createCanvas(2);

    this.gridCtx = context2d(this.gridCanvas);
    this.dataCtx = context2d(this.dataCanvas);
    this.overlayCtx = context2d(this.overlayCanvas);
    // A new canvas is 300 × 150; the overlay holds no backing store until `activateOverlay`.
    this.overlayCanvas.width = 0;
    this.overlayCanvas.height = 0;

    // DOM overlay for text (P2: hybrid rendering)
    this.domLayer = document.createElement('div');
    this.domLayer.setAttribute('aria-hidden', 'true');
    this.domLayer.style.cssText =
      'position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden;';
    this.container.appendChild(this.domLayer);

    // Transparent input layer. It is resized to the plot area by ChartCore so
    // axis labels/gutters remain regular page surface unless axis controls are
    // explicitly enabled.
    this.interactionLayer = document.createElement('div');
    this.interactionLayer.style.cssText =
      'position:absolute;z-index:4;background:transparent;pointer-events:auto;touch-action:none;';
    this.container.appendChild(this.interactionLayer);

    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.style.cssText = VISUALLY_HIDDEN;
    this.container.appendChild(this.liveRegion);
  }

  /** A polite live region inside the chart (`announce`). */
  readonly liveRegion: HTMLDivElement;
  private name = '';
  private interactive = true;

  /**
   * Whether the chart takes keyboard input: an interactive chart is a named `application` tab
   * stop; a readonly one is neither (plan D20).
   */
  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
    if (interactive) {
      this.container.tabIndex = 0;
      this.container.setAttribute('role', 'application');
      this.container.setAttribute('aria-roledescription', 'interactive chart');
      this.container.setAttribute('aria-keyshortcuts', KEY_SHORTCUTS);
    } else {
      for (const name of ['tabindex', 'role', 'aria-roledescription', 'aria-keyshortcuts']) {
        this.container.removeAttribute(name);
      }
    }
    this.applyName();
  }

  /** The chart's accessible name; the interactive element adds how to use the keys. */
  setAccessibleName(name: string): void {
    this.name = name;
    this.applyName();
  }

  private applyName(): void {
    if (this.interactive && this.name) {
      this.container.setAttribute('aria-label', `${this.name}. ${KEY_HINT}`);
    } else this.container.removeAttribute('aria-label');
  }

  get dpr(): number {
    return this._dpr;
  }

  /** The root's exact CSS width: fractional, as a ResizeObserver reports it. */
  get cssWidth(): number {
    return exactSize(this.container.clientWidth, this.container.getBoundingClientRect().width);
  }

  /** The root's exact CSS height: fractional, as a ResizeObserver reports it. */
  get cssHeight(): number {
    return exactSize(this.container.clientHeight, this.container.getBoundingClientRect().height);
  }

  /**
   * Apply the chart's height (plan D26). An explicit `height` (pixels or a CSS length) always sets
   * the root's height. Without one the root fills its host; when the host gives it no height (an
   * auto-height block), `sizeToHost` gives the root an in-flow 300 px and warns once. The
   * fallback ends when the host is sized by other means.
   */
  setHeight(height: number | string | undefined): void {
    this.explicitHeight =
      height === undefined ? null : typeof height === 'number' ? `${height}px` : height;
    if (this.explicitHeight !== null) this.fallback = false;
    this.applyHeight();
  }

  /** Switch the 300 px fallback on or off for the host's current size (see `setHeight`). */
  sizeToHost(): void {
    if (this.explicitHeight !== null) return;
    const host = this.container.parentElement;
    if (!host) return;
    if (this.fallback) {
      // Sized by the fallback, the host's content box is exactly 300 px; anything else is the
      // author's own height.
      const content = contentHeight(host);
      if (content > 0 && Math.abs(content - FALLBACK_HEIGHT) > 0.5) {
        this.fallback = false;
        this.applyHeight();
      }
      return;
    }
    // A host with no width is hidden (display: none), not unsized.
    if (this.container.clientHeight > 0 || this.container.clientWidth === 0) return;
    this.fallback = true;
    this.applyHeight();
    warnOnce(
      'zero-height',
      `The chart's container has no height, so the chart is ${FALLBACK_HEIGHT} px tall. Give the container a height, or pass height.`,
    );
  }

  private applyHeight(): void {
    this.container.style.height =
      this.explicitHeight ?? (this.fallback ? `${FALLBACK_HEIGHT}px` : '100%');
  }

  /**
   * Enable ResizeObserver for auto-resize. Every non-zero delivery calls
   * back, even when the backing stores need no reallocation: a box shown
   * again at its old size after `display: none` (deliveries of 0 × 0 are
   * skipped) may still carry the fallback layout made while hidden.
   */
  enableAutoResize(): void {
    if (this.resizeObserver) return;
    if (typeof ResizeObserver === 'undefined') {
      warnOnce(
        'environment',
        'ResizeObserver is not available here, so the chart keeps its first size.',
      );
      return;
    }
    this.resizeObserver = new ResizeObserver((entries) => {
      // The host is observed for the height fallback; its own size changes reach the root.
      if (entries.some((entry) => entry.target !== this.container)) this.sizeToHost();
      const entry = entries.find((candidate) => candidate.target === this.container);
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        this.onResize?.(width, height, this.resize(width, height));
      }
    });
    this.resizeObserver.observe(this.container);
    if (this.container.parentElement) this.resizeObserver.observe(this.container.parentElement);
    this.watchDpr();
  }

  /**
   * Follow a devicePixelRatio change that leaves the CSS size unchanged (see `watchDpr`); only a
   * real change resizes.
   */
  private watchDpr(): void {
    this.unwatchDpr();
    this.unwatchDprChange = watchDpr(() => {
      if (
        (window.devicePixelRatio || 1) !== this._dpr &&
        this.resize(this.cssWidth, this.cssHeight)
      ) {
        this.onResize?.(this.cssWidth, this.cssHeight, true);
      }
    });
  }

  private unwatchDpr(): void {
    this.unwatchDprChange?.();
    this.unwatchDprChange = null;
  }

  /**
   * Resize all canvases. HiDPI: physical pixels = CSS pixels × dpr.
   * Called once on init + on ResizeObserver callback, never per frame.
   *
   * Assigning a canvas's width or height clears its bitmap even when the
   * value is unchanged, so a call with the same CSS size and dpr as the last
   * allocation does nothing (gap-scale-longevity-01). Returns whether the
   * backing stores were reallocated (and so need a repaint).
   */
  resize(width: number, height: number): boolean {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const last = this.allocated;
    if (last && last.width === width && last.height === height && last.dpr === dpr) return false;
    this._dpr = dpr;
    this.allocated = { width, height, dpr };

    this.allocate(this.gridCanvas, this.gridCtx);
    this.allocate(this.dataCanvas, this.dataCtx);
    if (this.overlayActive) this.allocate(this.overlayCanvas, this.overlayCtx);
    return true;
  }

  /** Give the overlay its backing store, at the current size (a no-op once it has one). */
  activateOverlay(): void {
    if (this.overlayActive) return;
    this.overlayActive = true;
    if (this.allocated) this.allocate(this.overlayCanvas, this.overlayCtx);
  }

  /**
   * Size one layer to the allocation: whole device pixels for the backing store, the exact
   * (fractional) box for the CSS size, and the DPR transform the resize cleared.
   */
  private allocate(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.allocated!;
    canvas.width = Math.round(width * this._dpr);
    canvas.height = Math.round(height * this._dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(this._dpr, this._dpr);
  }

  /**
   * Reserve `px` CSS pixels at the `side` of the root for chrome shown there (the built-in legend;
   * M12b calls this): the layout (M10) keeps the plot and its axes out of them. A non-finite or
   * negative `px` reserves nothing. Returns whether the reservation changed, so the caller lays
   * out and repaints (`ChartCore.reserveChrome` does both).
   */
  reserveChrome(side: ChromeSide, px: number): boolean {
    const value = Number.isFinite(px) && px > 0 ? px : 0;
    if (this.chrome[side] === value) return false;
    this.chrome[side] = value;
    return true;
  }

  /** The CSS pixels reserved at `side` of the root (0 until chrome reserves some). */
  reservedChrome(side: ChromeSide): number {
    return this.chrome[side];
  }

  /** Clear a specific layer or all layers */
  clear(layer: 'grid' | 'data' | 'overlay' | 'all'): void {
    if (layer === 'grid' || layer === 'all') {
      this.clearFull(this.gridCtx, this.gridCanvas);
    }
    if (layer === 'data' || layer === 'all') {
      this.clearFull(this.dataCtx, this.dataCanvas);
    }
    if (layer === 'overlay' || layer === 'all') {
      this.clearFull(this.overlayCtx, this.overlayCanvas);
    }
  }

  /**
   * Clear the full backing store. The context carries a dpr scale transform,
   * so `canvas.width / dpr` in user space maps to the entire bitmap. Using the
   * canvas's own size (not `container.clientWidth`, which is integer-rounded)
   * means no stale edge pixels survive when the CSS box is fractional.
   */
  private clearFull(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    ctx.clearRect(0, 0, canvas.width / this._dpr, canvas.height / this._dpr);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.unwatchDpr();
    // Release the backing stores now: a detached canvas keeps its memory until collected.
    for (const canvas of [this.gridCanvas, this.dataCanvas, this.overlayCanvas]) {
      canvas.width = 0;
      canvas.height = 0;
    }
    this.container.remove();
  }

  setInteractionRect(rect: { left: number; top: number; width: number; height: number }): void {
    this.interactionLayer.style.left = rect.left + 'px';
    this.interactionLayer.style.top = rect.top + 'px';
    this.interactionLayer.style.width = rect.width + 'px';
    this.interactionLayer.style.height = rect.height + 'px';
  }

  private createCanvas(zIndex: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = `position:absolute;inset:0;z-index:${zIndex};pointer-events:none;`;
    this.container.appendChild(canvas);
    return canvas;
  }
}
