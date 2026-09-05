/** Compact 5×7 glyphs for baking short overlay text without Skia/canvas on native. */
const FONT_5X7: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0],
  A: [0x1e, 0x05, 0x05, 0x05, 0x1e],
  B: [0x1f, 0x15, 0x15, 0x15, 0x0a],
  C: [0x0e, 0x11, 0x11, 0x11, 0x0a],
  D: [0x1f, 0x11, 0x11, 0x11, 0x0e],
  E: [0x1f, 0x15, 0x15, 0x15, 0x11],
  F: [0x1f, 0x05, 0x05, 0x05, 0x01],
  G: [0x0e, 0x11, 0x15, 0x15, 0x1c],
  H: [0x1f, 0x04, 0x04, 0x04, 0x1f],
  I: [0x11, 0x11, 0x1f, 0x11, 0x11],
  J: [0x08, 0x10, 0x10, 0x11, 0x0f],
  K: [0x1f, 0x04, 0x0a, 0x11, 0x11],
  L: [0x1f, 0x10, 0x10, 0x10, 0x10],
  M: [0x1f, 0x02, 0x04, 0x02, 0x1f],
  N: [0x1f, 0x02, 0x04, 0x08, 0x1f],
  O: [0x0e, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1f, 0x05, 0x05, 0x05, 0x02],
  Q: [0x0e, 0x11, 0x19, 0x11, 0x0e],
  R: [0x1f, 0x05, 0x0d, 0x15, 0x12],
  S: [0x12, 0x15, 0x15, 0x15, 0x09],
  T: [0x01, 0x01, 0x1f, 0x01, 0x01],
  U: [0x0f, 0x10, 0x10, 0x10, 0x0f],
  V: [0x07, 0x08, 0x10, 0x08, 0x07],
  W: [0x1f, 0x08, 0x04, 0x08, 0x1f],
  X: [0x11, 0x0a, 0x04, 0x0a, 0x11],
  Y: [0x03, 0x04, 0x18, 0x04, 0x03],
  Z: [0x11, 0x19, 0x15, 0x13, 0x11],
  '0': [0x0e, 0x19, 0x15, 0x13, 0x0e],
  '1': [0x00, 0x12, 0x1f, 0x10, 0x00],
  '2': [0x12, 0x19, 0x15, 0x15, 0x12],
  '3': [0x11, 0x15, 0x15, 0x15, 0x0a],
  '4': [0x07, 0x04, 0x04, 0x1f, 0x04],
  '5': [0x17, 0x15, 0x15, 0x15, 0x09],
  '6': [0x0e, 0x15, 0x15, 0x15, 0x08],
  '7': [0x01, 0x01, 0x19, 0x05, 0x03],
  '8': [0x0a, 0x15, 0x15, 0x15, 0x0a],
  '9': [0x02, 0x15, 0x15, 0x15, 0x0e],
  '!': [0x00, 0x00, 0x17, 0x00, 0x00],
  '?': [0x02, 0x01, 0x15, 0x05, 0x02],
  '.': [0x00, 0x00, 0x10, 0x00, 0x00],
  ',': [0x00, 0x10, 0x08, 0x00, 0x00],
  "'": [0x00, 0x00, 0x03, 0x00, 0x00],
  '-': [0x04, 0x04, 0x04, 0x04, 0x04],
  '+': [0x04, 0x04, 0x1f, 0x04, 0x04],
  '#': [0x0a, 0x1f, 0x0a, 0x1f, 0x0a],
  '&': [0x0a, 0x15, 0x15, 0x0a, 0x10],
  ':': [0x00, 0x00, 0x0a, 0x00, 0x00],
};

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function setPixel(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 1
) {
  if (x < 0 || y < 0 || x >= width || y >= height || a <= 0) return;
  const i = (y * width + x) * 4;
  const inv = 1 - a;
  data[i] = clampByte(data[i] * inv + r * a);
  data[i + 1] = clampByte(data[i + 1] * inv + g * a);
  data[i + 2] = clampByte(data[i + 2] * inv + b * a);
}

function fillRect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 1
) {
  const x1 = Math.min(width, Math.round(x0 + w));
  const y1 = Math.min(height, Math.round(y0 + h));
  for (let y = Math.max(0, Math.round(y0)); y < y1; y++) {
    for (let x = Math.max(0, Math.round(x0)); x < x1; x++) {
      setPixel(data, width, height, x, y, r, g, b, a);
    }
  }
}

function drawGlyph(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cols: number[],
  originX: number,
  originY: number,
  scale: number,
  color: { r: number; g: number; b: number },
  outline = false
) {
  for (let gx = 0; gx < 5; gx++) {
    const col = cols[gx] ?? 0;
    for (let gy = 0; gy < 7; gy++) {
      if ((col >> gy) & 1) {
        const px = originX + gx * scale;
        const py = originY + gy * scale;
        if (outline) {
          fillRect(data, width, height, px - 1, py - 1, scale + 2, scale + 2, 0, 0, 0, 0.85);
        }
        fillRect(data, width, height, px, py, scale, scale, color.r, color.g, color.b, 1);
      }
    }
  }
}

export type BakeTextOverlay = {
  text: string;
  /** Normalized 0–1 center X */
  x: number;
  /** Normalized 0–1 center Y */
  y: number;
  color: string;
  style: 'plain' | 'bold' | 'outline' | 'pill' | 'neon' | 'shadow' | 'banner';
  scale: number;
  align?: 'left' | 'center' | 'right';
};

function textOriginX(
  cx: number,
  totalW: number,
  align: BakeTextOverlay['align']
): number {
  if (align === 'left') return Math.round(cx);
  if (align === 'right') return Math.round(cx - totalW);
  return Math.round(cx - totalW / 2);
}

/** Draw overlay stickers into a pixel buffer (native jpeg-js path). */
export function bakeTextOverlaysOnBuffer(
  buffer: { data: Uint8ClampedArray; width: number; height: number },
  overlays: BakeTextOverlay[]
) {
  if (!overlays.length) return;
  const { data, width, height } = buffer;
  const minDim = Math.min(width, height);

  for (const overlay of overlays) {
    const raw = overlay.text.trim().slice(0, 48);
    if (!raw) continue;
    const text = raw.toUpperCase();
    const scale = Math.max(2, Math.round((minDim / 90) * (overlay.scale || 1)));
    const glyphW = 5 * scale + scale;
    const glyphH = 7 * scale;
    const totalW = text.length * glyphW;
    const cx = Math.round(overlay.x * width);
    const cy = Math.round(overlay.y * height);
    let startX = textOriginX(cx, totalW, overlay.align);
    const startY = Math.round(cy - glyphH / 2);
    const color = parseHexColor(overlay.color || '#FFFFFF');
    const withStroke =
      overlay.style === 'outline' ||
      overlay.style === 'bold' ||
      overlay.style === 'neon' ||
      overlay.style === 'shadow';

    if (overlay.style === 'pill' || overlay.style === 'banner') {
      fillRect(
        data,
        width,
        height,
        startX - scale * 2,
        startY - scale,
        totalW + scale * 4,
        glyphH + scale * 2,
        0,
        0,
        0,
        0.55
      );
    }

    if (overlay.style === 'shadow') {
      let shadowX = startX + Math.max(1, Math.round(scale * 0.35));
      for (const ch of text) {
        const cols = FONT_5X7[ch] || FONT_5X7['?'];
        drawGlyph(data, width, height, cols, shadowX, startY + Math.max(1, Math.round(scale * 0.35)), scale, {
          r: 0,
          g: 0,
          b: 0,
        });
        shadowX += glyphW;
      }
    }

    if (overlay.style === 'neon') {
      let glowX = startX;
      for (const ch of text) {
        const cols = FONT_5X7[ch] || FONT_5X7['?'];
        drawGlyph(data, width, height, cols, glowX - 1, startY, scale, color);
        drawGlyph(data, width, height, cols, glowX + 1, startY, scale, color);
        drawGlyph(data, width, height, cols, glowX, startY - 1, scale, color);
        drawGlyph(data, width, height, cols, glowX, startY + 1, scale, color);
        glowX += glyphW;
      }
    }

    for (const ch of text) {
      const cols = FONT_5X7[ch] || FONT_5X7['?'];
      drawGlyph(data, width, height, cols, startX, startY, scale, color, withStroke && overlay.style !== 'neon');
      startX += glyphW;
    }
  }
}

/** Draw overlays on a 2D canvas (web export). */
export function bakeTextOverlaysOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  overlays: BakeTextOverlay[]
) {
  for (const overlay of overlays) {
    const text = overlay.text.trim().slice(0, 48);
    if (!text) continue;
    const cx = overlay.x * width;
    const cy = overlay.y * height;
    const fontSize = Math.max(18, Math.round(Math.min(width, height) * 0.055 * (overlay.scale || 1)));
    const align = overlay.align || 'center';
    const weight = overlay.style === 'plain' ? '600' : '800';
    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.font = `${weight} ${fontSize}px system-ui, -apple-system, sans-serif`;

    if (overlay.style === 'pill' || overlay.style === 'banner') {
      const metrics = ctx.measureText(text);
      const padX = fontSize * (overlay.style === 'banner' ? 0.7 : 0.55);
      const padY = fontSize * (overlay.style === 'banner' ? 0.45 : 0.4);
      const tw = metrics.width + padX * 2;
      const th = fontSize + padY * 2;
      const r = overlay.style === 'pill' ? th / 2 : 4;
      let x = cx - tw / 2;
      if (align === 'left') x = cx - padX;
      if (align === 'right') x = cx - tw + padX;
      const y = cy - th / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + tw, y, x + tw, y + th, r);
      ctx.arcTo(x + tw, y + th, x, y + th, r);
      ctx.arcTo(x, y + th, x, y, r);
      ctx.arcTo(x, y, x + tw, y, r);
      ctx.closePath();
      ctx.fill();
    }

    if (overlay.style === 'shadow') {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillText(text, cx + fontSize * 0.06, cy + fontSize * 0.08);
    }

    if (overlay.style === 'neon') {
      ctx.shadowColor = overlay.color || '#FFFFFF';
      ctx.shadowBlur = fontSize * 0.55;
      ctx.lineWidth = Math.max(2, fontSize * 0.08);
      ctx.strokeStyle = overlay.color || '#FFFFFF';
      ctx.strokeText(text, cx, cy);
    }

    if (overlay.style === 'outline' || overlay.style === 'bold') {
      ctx.lineWidth = Math.max(3, fontSize * 0.12);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(text, cx, cy);
    }

    ctx.shadowBlur = overlay.style === 'neon' ? fontSize * 0.35 : 0;
    ctx.shadowColor = overlay.style === 'neon' ? overlay.color || '#FFFFFF' : 'transparent';
    ctx.fillStyle = overlay.color || '#FFFFFF';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }
}

/** Soft cinematic edge darken (top/bottom heavier) for vertical clips. */
export function applyCinematicEdges(
  buffer: { data: Uint8ClampedArray; width: number; height: number },
  amount: number
) {
  if (amount <= 0) return;
  const { data, width, height } = buffer;
  const strength = amount / 100;
  for (let y = 0; y < height; y++) {
    const ny = y / (height - 1 || 1);
    const edgeY = Math.pow(Math.max(0, 1 - Math.min(ny, 1 - ny) * 2.2), 1.6);
    for (let x = 0; x < width; x++) {
      const nx = x / (width - 1 || 1);
      const edgeX = Math.pow(Math.max(0, 1 - Math.min(nx, 1 - nx) * 2.4), 1.8);
      const factor = 1 - Math.min(0.85, (edgeY * 0.85 + edgeX * 0.35) * strength);
      const i = (y * width + x) * 4;
      data[i] = clampByte(data[i] * factor);
      data[i + 1] = clampByte(data[i + 1] * factor);
      data[i + 2] = clampByte(data[i + 2] * factor);
    }
  }
}
