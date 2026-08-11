export type SharePlatform =
  | "system"
  | "instagram"
  | "line"
  | "facebook"
  | "x"
  | "whatsapp";

export interface SharePlatformOption {
  id: SharePlatform;
  label: string;
  shortLabel: string;
  accent: string;
}

export const SHARE_PLATFORMS: SharePlatformOption[] = [
  { id: "instagram", label: "Instagram", shortLabel: "IG", accent: "#E1306C" },
  { id: "line", label: "LINE", shortLabel: "LINE", accent: "#06C755" },
  { id: "facebook", label: "Facebook", shortLabel: "FB", accent: "#1877F2" },
  { id: "x", label: "X", shortLabel: "X", accent: "#111827" },
  { id: "whatsapp", label: "WhatsApp", shortLabel: "WA", accent: "#25D366" },
  { id: "system", label: "More / 更多", shortLabel: "···", accent: "#6366f1" },
];

const SHARE_TEXT = "nissa's auracamera ✨";

export const PHOTO_WATERMARK_TEXT = "nissa's auracamera";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function reviewPhotoFilename(): string {
  const d = new Date();
  return `nissa-love-you-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
}

export function blobFromReviewCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("JPEG export failed / 無法匯出照片")),
      "image/jpeg",
      0.97
    );
  });
}

export function downloadPhotoBlob(blob: Blob, filename = reviewPhotoFilename()): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function drawPhotoWatermark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  const padX = Math.max(w * 0.04, 10);
  const padY = Math.max(h * 0.04, 10);
  const fontSize = Math.max(13, Math.min(w * 0.038, h * 0.028, 26));

  ctx.save();
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = fontSize * 0.35;
  ctx.shadowOffsetY = fontSize * 0.06;
  ctx.fillStyle = "rgba(248, 250, 252, 0.82)";
  ctx.fillText(PHOTO_WATERMARK_TEXT, padX, padY);
  ctx.restore();
}

export async function applyWatermarkToBlob(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context.");

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  drawPhotoWatermark(ctx, bitmap.width, bitmap.height);

  // #region agent log
  fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'sharePhoto.ts:applyWatermarkToBlob',message:'share watermark applied',data:{width:bitmap.width,height:bitmap.height,text:PHOTO_WATERMARK_TEXT},timestamp:Date.now(),hypothesisId:'H-watermark-share',runId:'overlay-consistency'})}).catch(()=>{});
  // #endregion

  return blobFromReviewCanvas(canvas);
}

function canShareFile(file: File): boolean {
  if (typeof navigator.share !== "function") return false;
  return !navigator.canShare || navigator.canShare({ files: [file] });
}

async function shareFileNative(file: File, text: string): Promise<boolean> {
  if (!canShareFile(file)) return false;
  await navigator.share({ files: [file], text, title: text });
  return true;
}

function downloadBlob(blob: Blob, filename: string): void {
  downloadPhotoBlob(blob, filename);
}

export async function shareReviewPhoto(
  blob: Blob,
  platform: SharePlatform
): Promise<"shared" | "opened" | "downloaded"> {
  const filename = reviewPhotoFilename();
  const file = new File([blob], filename, { type: "image/jpeg" });
  const pageUrl = window.location.href;

  const preferNativeFileShare =
    platform === "system" ||
    platform === "instagram" ||
    platform === "line" ||
    platform === "whatsapp";

  if (preferNativeFileShare && (await shareFileNative(file, SHARE_TEXT))) {
    return "shared";
  }

  switch (platform) {
    case "line":
      if (await shareFileNative(file, SHARE_TEXT)) return "shared";
      window.open(
        `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(pageUrl)}`,
        "_blank",
        "noopener,noreferrer"
      );
      downloadBlob(blob, filename);
      return "downloaded";

    case "instagram":
      if (await shareFileNative(file, SHARE_TEXT)) return "shared";
      downloadBlob(blob, filename);
      return "downloaded";

    case "facebook":
      if (await shareFileNative(file, SHARE_TEXT)) return "shared";
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
        "_blank",
        "noopener,noreferrer"
      );
      downloadBlob(blob, filename);
      return "downloaded";

    case "x":
      if (await shareFileNative(file, SHARE_TEXT)) return "shared";
      window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${SHARE_TEXT} ${pageUrl}`)}`,
        "_blank",
        "noopener,noreferrer"
      );
      downloadBlob(blob, filename);
      return "downloaded";

    case "whatsapp":
      if (await shareFileNative(file, SHARE_TEXT)) return "shared";
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${pageUrl}`)}`,
        "_blank",
        "noopener,noreferrer"
      );
      downloadBlob(blob, filename);
      return "downloaded";

    case "system":
    default:
      if (await shareFileNative(file, SHARE_TEXT)) return "shared";
      downloadBlob(blob, filename);
      return "downloaded";
  }
}
