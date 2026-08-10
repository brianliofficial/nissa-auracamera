import type { AuraBlobConfig } from "./emotions/auraOverlay";
import { readAuraBlobColors } from "./emotions/auraOverlay";
import type { EmotionKind } from "./emotions/detectEmotion";
import { AURA_PRESETS } from "./emotions/auraOverlay";
import { readActiveUiGradient, uiGradientCss } from "./emotions/uiGradients";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function timestampFilename(): string {
  const d = new Date();
  return `emotion-mirror-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
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
  const radius = (blob.size / 100) * Math.max(w, h) * 0.55;
  const [r, g, b, a] = parseRgba(blob.color);

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${Math.min(1, a * 1.1)})`);
  grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${a * 0.75})`);
  grad.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, ${a * 0.25})`);
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
  blobs: AuraBlobConfig[]
): void {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const blob of blobs) {
    drawAuraBlob(ctx, w, h, blob);
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
  cssGradient: string
): void {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = cssGradient;
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
  video: HTMLVideoElement,
  overlayEl: HTMLElement,
  emotion: EmotionKind,
  stageEl?: HTMLElement
): boolean {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw <= 0 || vh <= 0) return false;

  const cw = stageEl?.clientWidth || video.clientWidth;
  const ch = stageEl?.clientHeight || video.clientHeight;
  if (cw <= 0 || ch <= 0) return false;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  const rect = coverVideoRect(vw, vh, cw, ch);
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(
    video,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    -rect.dx - rect.dw,
    rect.dy,
    rect.dw,
    rect.dh
  );
  ctx.restore();

  const uiGrad = readActiveUiGradient(overlayEl);
  if (uiGrad) {
    drawUiGradientOverlay(ctx, cw, ch, uiGradientCss(uiGrad));
  } else {
    const auraLayer = overlayEl.querySelector(".aura-layer");
    const blobs =
      auraLayer instanceof HTMLElement &&
      readAuraBlobColors(auraLayer).length > 0
        ? readAuraBlobColors(auraLayer)
        : AURA_PRESETS[emotion].blobs;
    drawAuraOverlay(ctx, cw, ch, blobs);
  }

  // #region agent log
  fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'screenshot.ts:paintFreezeFrame',message:'freeze painted',data:{vw,vh,cw,ch,canvasW:canvas.width,canvasH:canvas.height},timestamp:Date.now(),hypothesisId:'H-freeze',runId:'post-fix'})}).catch(()=>{});
  // #endregion

  return canvas.width > 0 && canvas.height > 0;
}

export async function captureEmotionJpeg(
  video: HTMLVideoElement,
  overlayEl: HTMLElement,
  emotion: EmotionKind
): Promise<void> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw <= 0 || vh <= 0) {
    throw new Error("Video is not ready yet.");
  }

  const { sx, sy, size } = squareCropRect(vw, vh);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const outSize = Math.round(size * dpr);

  const canvas = document.createElement("canvas");
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context.");

  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, size, size, -outSize, 0, outSize, outSize);
  ctx.restore();

  const uiGrad = readActiveUiGradient(overlayEl);
  if (uiGrad) {
    drawUiGradientOverlay(ctx, outSize, outSize, uiGradientCss(uiGrad));
  } else {
    const auraLayer = overlayEl.querySelector(".aura-layer");
    const blobs =
      auraLayer instanceof HTMLElement &&
      readAuraBlobColors(auraLayer).length > 0
        ? readAuraBlobColors(auraLayer)
        : AURA_PRESETS[emotion].blobs;
    drawAuraOverlay(ctx, outSize, outSize, blobs);
  }

  // #region agent log
  fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'screenshot.ts:capture',message:'square jpg captured',data:{vw,vh,sx,sy,size,outSize},timestamp:Date.now(),hypothesisId:'H-crop'})}).catch(()=>{});
  // #endregion

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPEG export failed."))),
      "image/jpeg",
      0.92
    );
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = timestampFilename();
  a.click();
  URL.revokeObjectURL(url);
}
