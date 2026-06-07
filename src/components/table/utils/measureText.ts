const measurementCache: Record<string, number> = {};
let canvasCtx: CanvasRenderingContext2D | null = null;

export function measureTextCanvas(text: string, font: string = '14px Inter, sans-serif'): number {
  if (typeof document === 'undefined') return 100; // SSR fallback
  const cacheKey = `${font}|${text}`;
  if (measurementCache[cacheKey]) return measurementCache[cacheKey];

  try {
    if (!canvasCtx) {
      const canvas = document.createElement('canvas');
      canvasCtx = canvas.getContext('2d');
    }
    if (canvasCtx) {
      canvasCtx.font = font;
      const metrics = canvasCtx.measureText(text);
      const width = Math.ceil(metrics.width) + 2; 
      measurementCache[cacheKey] = width;
      return width;
    }
    return 100;
  } catch (e) {
    return 100;
  }
}

export const defaultMeasureText = measureTextCanvas;
