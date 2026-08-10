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
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
