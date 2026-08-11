import type { EmotionKind } from "./emotions/detectEmotion";
import type { UiGradient } from "./emotions/uiGradients";
import {
  getAuraAnimationFrame,
  shouldAnimateAura,
  type AuraPhotoZone,
} from "./auraAnimation";
import {
  isOverlayFullCover,
  overlayBlendMode,
  scaledAuraOpacity,
  scaledUiGradientOpacity,
} from "./overlayOpacity";
import type { SegmentationMask } from "./segmentation";

/** Reference palette — static fallback when not animating. */
export const CLASSIC_AURA_COLORS: Record<EmotionKind, string[]> = {
  neutral: [
    "rgba(28, 95, 255, 0.80)",
    "rgba(210, 45, 195, 0.74)",
    "rgba(0, 205, 255, 0.68)",
    "rgba(255, 92, 32, 0.76)",
    "rgba(205, 255, 55, 0.90)",
  ],
  angry: [
    "rgba(180, 20, 50, 0.78)",
    "rgba(255, 50, 90, 0.74)",
    "rgba(255, 80, 0, 0.70)",
    "rgba(255, 40, 0, 0.82)",
    "rgba(255, 160, 30, 0.85)",
  ],
  sad: [
    "rgba(25, 95, 255, 0.80)",
    "rgba(18, 115, 85, 0.76)",
    "rgba(115, 45, 210, 0.74)",
    "rgba(50, 90, 255, 0.72)",
    "rgba(100, 160, 255, 0.65)",
  ],
  happy: [
    "rgba(255, 230, 60, 0.82)",
    "rgba(255, 155, 35, 0.80)",
    "rgba(255, 105, 175, 0.78)",
    "rgba(255, 175, 0, 0.80)",
    "rgba(255, 200, 100, 0.85)",
  ],
};

const STATIC_LAYOUT: AuraPhotoZone[] = [
  { nx: 0.5, ny: -0.1, radius: 0.62 },
  { nx: 0.14, ny: 0.06, radius: 0.48 },
  { nx: 0.86, ny: 0.06, radius: 0.44 },
  { nx: 0.5, ny: 0.36, radius: 0.88 },
  { nx: 0.5, ny: 0.56, radius: 0.42 },
];

interface SubjectAnchor {
  cx: number;
  cy: number;
  bw: number;
  bh: number;
}

function subjectAnchorFromMask(
  mask: SegmentationMask,
  cw: number,
  ch: number
): SubjectAnchor {
  const { data, width, height } = mask;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x]! <= 128) continue;
      found = true;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (!found) {
    return { cx: cw * 0.5, cy: ch * 0.44, bw: cw * 0.42, bh: ch * 0.72 };
  }

  const scaleX = cw / width;
  const scaleY = ch / height;
  const sx0 = minX * scaleX;
  const sy0 = minY * scaleY;
  const sx1 = (maxX + 1) * scaleX;
  const sy1 = (maxY + 1) * scaleY;
  const bw = Math.max(sx1 - sx0, cw * 0.25);
  const bh = Math.max(sy1 - sy0, ch * 0.35);

  return {
    cx: (sx0 + sx1) * 0.5,
    cy: (sy0 + sy1) * 0.5,
    bw,
    bh,
  };
}

function parseRgba(color: string): [number, number, number, number] {
  const rgba = color.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/i
  );
  if (rgba) {
    return [
      Number(rgba[1]),
      Number(rgba[2]),
      Number(rgba[3]),
      rgba[4] !== undefined ? Number(rgba[4]) : 1,
    ];
  }
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1]!;
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      0.78,
    ];
  }
  return [255, 255, 255, 0.5];
}

function drawSoftRadialBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  alpha: number
): void {
  const [r, g, b, a] = parseRgba(color);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${Math.min(1, a * alpha)})`);
  grad.addColorStop(0.25, `rgba(${r}, ${g}, ${b}, ${a * alpha * 0.85})`);
  grad.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${a * alpha * 0.38})`);
  grad.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, ${a * alpha * 0.12})`);
  grad.addColorStop(1, "rgba(0,0,0,0)");

  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function getEmotionAuraColors(emotion: EmotionKind): string[] {
  return CLASSIC_AURA_COLORS[emotion];
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getGradientAuraColors(gradient: UiGradient): string[] {
  const from = hexToRgba(gradient.from, 0.82);
  const to = hexToRgba(gradient.to, 0.76);
  return [from, to, from, to, to];
}

export interface DrawAuraOptions {
  uiGradient: UiGradient | null;
  recording?: boolean;
  emotion?: EmotionKind;
  overlayMode?: string;
  timeMs?: number;
}

/** Aura-photography style: soft multi-zone radial glow anchored to subject. */
export function drawSubjectEdgeAura(
  ctx: CanvasRenderingContext2D,
  mask: SegmentationMask,
  cw: number,
  ch: number,
  colors: string[],
  options: DrawAuraOptions = { uiGradient: null }
): void {
  if (cw <= 0 || ch <= 0 || colors.length === 0) return;

  const {
    uiGradient = null,
    recording = false,
    emotion = "neutral",
    overlayMode = "auto",
    timeMs = performance.now(),
  } = options;

  let zones = STATIC_LAYOUT;
  let drawColors = colors;

  if (shouldAnimateAura(overlayMode)) {
    const frame = getAuraAnimationFrame(emotion, timeMs);
    drawColors = frame.colors;
    zones = frame.zones;
  }

  const anchor = subjectAnchorFromMask(mask, cw, ch);
  const strength = uiGradient ? scaledUiGradientOpacity() : scaledAuraOpacity();
  const blurPx = recording ? 22 : 32;
  const scale = Math.max(anchor.bw, anchor.bh);

  ctx.save();
  ctx.globalCompositeOperation =
    overlayBlendMode() === "normal" ? "source-over" : "screen";

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]!;
    const color = drawColors[i % drawColors.length]!;
    const cx = anchor.cx + (zone.nx - 0.5) * anchor.bw;
    const cy = anchor.cy + (zone.ny - 0.5) * anchor.bh;
    const radius = zone.radius * scale;

    ctx.save();
    ctx.filter = `blur(${blurPx + i * 4}px)`;
    ctx.globalAlpha = strength * (0.92 - i * 0.04);
    drawSoftRadialBlob(ctx, cx, cy, radius, color, 1);
    ctx.restore();
  }

  if (isOverlayFullCover()) {
    const cx = anchor.cx;
    const cy = anchor.cy + anchor.bh * 0.06;
    ctx.save();
    ctx.filter = `blur(${blurPx * 1.4}px)`;
    ctx.globalAlpha = strength * 0.65;
    drawSoftRadialBlob(
      ctx,
      cx,
      cy,
      scale * 0.95,
      drawColors[3] ?? drawColors[0]!,
      1
    );
    ctx.restore();
  }

  ctx.restore();

  // #region agent log
  if (Math.floor(timeMs / 2000) !== Math.floor((timeMs - 16) / 2000)) {
    fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'edgeAura.ts:drawSubjectEdgeAura',message:'animated aura frame',data:{emotion,overlayMode,colors:drawColors.slice(0,3),zone0:zones[0],animated:shouldAnimateAura(overlayMode),timeMs:Math.round(timeMs)},timestamp:Date.now(),hypothesisId:'H-aura-animate',runId:'aura-animate-v1'})}).catch(()=>{});
  }
  // #endregion
}
