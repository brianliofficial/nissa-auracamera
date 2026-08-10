import type { AuraBlobConfig } from "./emotions/auraOverlay";
import { readAuraBlobColors } from "./emotions/auraOverlay";
import type { EmotionKind } from "./emotions/detectEmotion";
import { AURA_PRESETS } from "./emotions/auraOverlay";
import {
  getOverlayStrength,
  isOverlayFullCover,
  overlayBlendMode,
  scaledAuraOpacity,
  scaledUiGradientOpacity,
} from "./overlayOpacity";
import { getUiGradient, readActiveUiGradient, type UiGradient } from "./emotions/uiGradients";
import { reviewPhotoFilename } from "./sharePhoto";
import { shouldMirrorCamera } from "./camera";

export type CaptureOverlayMode = "auto" | string;

export interface FrameSource {
  width: number;
  height: number;
  mirror: boolean;
  drawCover(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    rect: ReturnType<typeof coverVideoRect>
  ): void;
  drawSquare(
    ctx: CanvasRenderingContext2D,
    outSize: number,
    crop: ReturnType<typeof squareCropRect>
  ): void;
}

export function createVideoFrameSource(video: HTMLVideoElement): FrameSource {
  const mirror = shouldMirrorCamera();
  return {
    width: video.videoWidth,
    height: video.videoHeight,
    mirror,
    drawCover(ctx, _cw, _ch, rect) {
      ctx.save();
      if (mirror) ctx.scale(-1, 1);
      ctx.drawImage(
        video,
        rect.sx,
        rect.sy,
        rect.sw,
        rect.sh,
        mirror ? -rect.dx - rect.dw : rect.dx,
        rect.dy,
        rect.dw,
        rect.dh
      );
      ctx.restore();
    },
    drawSquare(ctx, outSize, crop) {
      ctx.save();
      if (mirror) ctx.scale(-1, 1);
      ctx.drawImage(
        video,
        crop.sx,
        crop.sy,
        crop.size,
        crop.size,
        mirror ? -outSize : 0,
        0,
        outSize,
        outSize
      );
      ctx.restore();
    },
  };
}

export function createImageFrameSource(img: HTMLImageElement): FrameSource {
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    mirror: false,
    drawCover(ctx, _cw, _ch, rect) {
      ctx.drawImage(
        img,
        rect.sx,
        rect.sy,
        rect.sw,
        rect.sh,
        rect.dx,
        rect.dy,
        rect.dw,
        rect.dh
      );
    },
    drawSquare(ctx, outSize, crop) {
      ctx.drawImage(
        img,
        crop.sx,
        crop.sy,
        crop.size,
        crop.size,
        0,
        0,
        outSize,
        outSize
      );
    },
  };
}

function resolveUiGradient(
  overlayEl: HTMLElement,
  overlayMode: CaptureOverlayMode
): UiGradient | null {
  if (overlayMode !== "auto") {
    return getUiGradient(overlayMode) ?? null;
  }
  return readActiveUiGradient(overlayEl);
}

function drawOverlayOnCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  overlayEl: HTMLElement,
  emotion: EmotionKind,
  overlayMode: CaptureOverlayMode
): "ui-gradient" | "aura" {
  const uiGrad = resolveUiGradient(overlayEl, overlayMode);
  if (uiGrad) {
    drawUiGradientOverlay(ctx, w, h, uiGrad);
    return "ui-gradient";
  }
  const auraLayer = overlayEl.querySelector(".aura-layer");
  const blobs =
    auraLayer instanceof HTMLElement &&
    readAuraBlobColors(auraLayer).length > 0
      ? readAuraBlobColors(auraLayer)
      : AURA_PRESETS[emotion].blobs;
  drawAuraOverlay(ctx, w, h, blobs, emotion);
  return "aura";
}

const AURA_LAYER_INSET = 0.12;

function auraBlurPx(emotion: EmotionKind, h: number): number {
  const base = emotion === "neutral" ? 38 : 48;
  const refH = Math.max(window.innerHeight, 1);
  return base * (h / refH);
}

function parseRgba(color: string): [number, number, number, number] {
  const hsla = color.match(
    /hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)/i
  );
  if (hsla) {
    const h = Number(hsla[1]) / 360;
    const s = Number(hsla[2]) / 100;
    const l = Number(hsla[3]) / 100;
    const a = hsla[4] !== undefined ? Number(hsla[4]) : 1;
    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
      a,
    ];
  }

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

  return [255, 255, 255, 0.4];
}

function drawAuraBlob(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  blob: AuraBlobConfig
): void {
  const cx = (blob.x / 100) * w;
  const cy = (blob.y / 100) * h;
  const radius = (blob.size / 100) * Math.max(w, h) * 0.62;
  const [r, g, b, a] = parseRgba(blob.color);

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${Math.min(1, a * 1.15)})`);
  grad.addColorStop(0.28, `rgba(${r}, ${g}, ${b}, ${a * 0.92})`);
  grad.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${a * 0.55})`);
  grad.addColorStop(0.78, `rgba(${r}, ${g}, ${b}, ${a * 0.22})`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawAuraOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  blobs: AuraBlobConfig[],
  emotion: EmotionKind
): void {
  const inset = AURA_LAYER_INSET;
  const padX = w * inset;
  const padY = h * inset;
  const drawW = w + padX * 2;
  const drawH = h + padY * 2;
  const blur = auraBlurPx(emotion, h);

  ctx.save();
  ctx.translate(-padX, -padY);
  ctx.globalCompositeOperation = overlayBlendMode() === "normal" ? "source-over" : "screen";
  ctx.globalAlpha = scaledAuraOpacity();
  ctx.filter = `blur(${blur}px)`;
  for (const blob of blobs) {
    drawAuraBlob(ctx, drawW, drawH, blob);
  }
  if (isOverlayFullCover()) {
    ctx.globalAlpha = 1;
    ctx.filter = `blur(${blur * 1.85}px)`;
    for (const blob of blobs) {
      drawAuraBlob(ctx, drawW, drawH, blob);
    }
  }
  ctx.restore();
}

/** Center 1:1 square crop from video frame (16:16 aspect = square). */
function squareCropRect(vw: number, vh: number): {
  sx: number;
  sy: number;
  size: number;
} {
  const size = Math.min(vw, vh);
  return {
    sx: (vw - size) / 2,
    sy: (vh - size) / 2,
    size,
  };
}

function drawUiGradientOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  gradient: UiGradient
): void {
  const angleRad = ((gradient.angle - 90) * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  const length = Math.hypot(w, h);
  const x0 = cx - (Math.cos(angleRad) * length) / 2;
  const y0 = cy - (Math.sin(angleRad) * length) / 2;
  const x1 = cx + (Math.cos(angleRad) * length) / 2;
  const y1 = cy + (Math.sin(angleRad) * length) / 2;

  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, gradient.from);
  grad.addColorStop(1, gradient.to);

  ctx.save();
  ctx.globalCompositeOperation = overlayBlendMode() === "normal" ? "source-over" : "screen";
  ctx.globalAlpha = scaledUiGradientOpacity();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function coverVideoRect(
  vw: number,
  vh: number,
  cw: number,
  ch: number
): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number } {
  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  return { sx: 0, sy: 0, sw: vw, sh: vh, dx, dy, dw, dh };
}

/** Paint the visible preview (cover fit) for on-screen freeze. */
export function paintFreezeFrame(
  canvas: HTMLCanvasElement,
  source: FrameSource,
  overlayEl: HTMLElement,
  emotion: EmotionKind,
  overlayMode: CaptureOverlayMode,
  stageEl?: HTMLElement
): boolean {
  const vw = source.width;
  const vh = source.height;
  if (vw <= 0 || vh <= 0) return false;

  const cw = stageEl?.clientWidth ?? 0;
  const ch = stageEl?.clientHeight ?? 0;
  if (cw <= 0 || ch <= 0) return false;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  const rect = coverVideoRect(vw, vh, cw, ch);
  source.drawCover(ctx, cw, ch, rect);
  const overlayType = drawOverlayOnCanvas(ctx, cw, ch, overlayEl, emotion, overlayMode);

  // #region agent log
  fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'screenshot.ts:paintFreezeFrame',message:'freeze painted',data:{vw,vh,cw,ch,emotion,overlayMode,overlayType,sliderPercent:getOverlayStrength(),fullCover:isOverlayFullCover(),blendMode:overlayBlendMode(),uiGradientAlpha:overlayType==='ui-gradient'?scaledUiGradientOpacity():null,auraAlpha:overlayType==='aura'?scaledAuraOpacity():null,blurPx:overlayType==='aura'?auraBlurPx(emotion,ch):0,canvasW:canvas.width,canvasH:canvas.height,mirror:source.mirror},timestamp:Date.now(),hypothesisId:'H-opacity-full',runId:'vertical-slider-fullcover'})}).catch(()=>{});
  // #endregion

  return canvas.width > 0 && canvas.height > 0;
}

export async function captureEmotionJpeg(
  source: FrameSource,
  overlayEl: HTMLElement,
  emotion: EmotionKind,
  overlayMode: CaptureOverlayMode,
  stageEl?: HTMLElement
): Promise<void> {
  const vw = source.width;
  const vh = source.height;
  if (vw <= 0 || vh <= 0) {
    throw new Error("Image is not ready yet.");
  }

  const cw = stageEl?.clientWidth ?? vw;
  const ch = stageEl?.clientHeight ?? vh;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context.");

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const rect = coverVideoRect(vw, vh, cw, ch);
  source.drawCover(ctx, cw, ch, rect);
  const overlayType = drawOverlayOnCanvas(ctx, cw, ch, overlayEl, emotion, overlayMode);

  // #region agent log
  fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'screenshot.ts:capture',message:'jpg captured',data:{vw,vh,cw,ch,overlayMode,overlayType,canvasW:canvas.width,canvasH:canvas.height},timestamp:Date.now(),hypothesisId:'H-capture-intensity',runId:'post-fix'})}).catch(()=>{});
  // #endregion

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPEG export failed."))),
      "image/jpeg",
      0.97
    );
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = reviewPhotoFilename();
  a.click();
  URL.revokeObjectURL(url);
}
