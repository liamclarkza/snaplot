/**
 * Creates and manages the 3-layer canvas stack + DOM overlay.
 *
 * Layer 0 (grid):    Gridlines, axis lines. alpha:false for perf.
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
  private dprMediaQuery: MediaQueryList | null = null;
  private boundDprChange: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private onResize?: (width: number, height: number) => void,
  ) {
    this._dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    // Container. `tabindex="0"` makes the chart keyboard-focusable,    // arrow-key pan / +/- zoom / 0-reset get wired up by GestureManager.
    // We don't set `:focus-visible` styling here; consumers can target
    // the container with their own CSS.
    this.container = document.createElement('div');
    this.container.tabIndex = 0;
    this.container.setAttribute('role', 'application');
    this.container.style.cssText =
      'position:relative;width:100%;height:100%;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:auto;border-radius:6px;outline:none;';
    parent.appendChild(this.container);

    // Create canvases
    this.gridCanvas = this.createCanvas(0);
    this.dataCanvas = this.createCanvas(1);
    this.overlayCanvas = this.createCanvas(2);

    // Grid canvas is opaque (no transparency compositing needed)
    this.gridCtx = this.gridCanvas.getContext('2d', { alpha: false })!;
    this.dataCtx = this.dataCanvas.getContext('2d')!;
    this.overlayCtx = this.overlayCanvas.getContext('2d')!;

    // DOM overlay for text (P2: hybrid rendering)
    this.domLayer = document.createElement('div');
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
  }

  get dpr(): number {
    return this._dpr;
  }

  get cssWidth(): number {
    return this.container.clientWidth;
  }

  get cssHeight(): number {
    return this.container.clientHeight;
  }

  /** Enable ResizeObserver for auto-resize */
  enableAutoResize(): void {
    if (this.resizeObserver) return;
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        this.resize(width, height);
        this.onResize?.(width, height);
      }
    });
    this.resizeObserver.observe(this.container);
    this.watchDpr();
  }

  /**
   * Detect a devicePixelRatio change that leaves the CSS size unchanged, e.g.
   * dragging the window between monitors with different scale factors. The
   * ResizeObserver never fires in that case (the contentRect is identical), so
   * the backing store would stay at the old resolution and render blurry until
   * an unrelated resize. A `(resolution: Ndppx)` media query matches only the
   * current dpr, so its `change` event fires exactly when dpr moves off N; we
   * then re-size and re-arm for the new dpr.
   */
  private watchDpr(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    this.unwatchDpr();
    const dpr = window.devicePixelRatio || 1;
    this.dprMediaQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
    this.boundDprChange = () => {
      this.resize(this.cssWidth, this.cssHeight);
      this.onResize?.(this.cssWidth, this.cssHeight);
      // The query is pinned to the old dpr, re-arm against the new one.
      this.watchDpr();
    };
    this.dprMediaQuery.addEventListener('change', this.boundDprChange);
  }

  private unwatchDpr(): void {
    if (this.dprMediaQuery && this.boundDprChange) {
      this.dprMediaQuery.removeEventListener('change', this.boundDprChange);
    }
    this.dprMediaQuery = null;
    this.boundDprChange = null;
  }

  /**
   * Resize all canvases. HiDPI: physical pixels = CSS pixels × dpr.
   * Called once on init + on ResizeObserver callback, never per frame.
   */
  resize(width: number, height: number): void {
    this._dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    for (const canvas of [this.gridCanvas, this.dataCanvas, this.overlayCanvas]) {
      canvas.width = width * this._dpr;
      canvas.height = height * this._dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
    }

    // Reset transforms after resize (canvas resize clears context state)
    this.gridCtx.scale(this._dpr, this._dpr);
    this.dataCtx.scale(this._dpr, this._dpr);
    this.overlayCtx.scale(this._dpr, this._dpr);
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
    canvas.style.cssText = `position:absolute;inset:0;z-index:${zIndex};pointer-events:none;`;
    this.container.appendChild(canvas);
    return canvas;
  }
}
