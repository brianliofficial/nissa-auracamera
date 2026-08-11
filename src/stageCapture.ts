import { toCanvas } from "html-to-image";
import {
  getOverlayStrength,
  isOverlayFullCover,
  overlayBlendMode,
  scaledAuraOpacity,
  scaledUiGradientOpacity,
} from "./overlayOpacity";
import { blobFromReviewCanvas } from "./sharePhoto";

const UI_ONLY_CLASSES = new Set([
  "stage-toolbar",
  "stage-title",
  "emotion-status",
  "shutter-dock",
  "cam-placeholder",
  "capture-flash",
  "recorded-playback",
]);

function shouldIncludeNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return true;
  if (
    node.classList.contains("capture-freeze") &&
    !node.classList.contains("is-visible")
  ) {
    return false;
  }
  for (const cls of UI_ONLY_CLASSES) {
    if (node.classList.contains(cls)) return false;
  }
  return true;
}

/** Snapshot the live stage (video/photo + CSS overlay) exactly as rendered. */
export async function captureLiveStage(stageEl: HTMLElement): Promise<HTMLCanvasElement> {
  const rect = stageEl.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (w <= 0 || h <= 0) {
    throw new Error("Stage is not ready / 畫面尚未就緒");
  }

  const canvas = await toCanvas(stageEl, {
    width: w,
    height: h,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    cacheBust: true,
    filter: shouldIncludeNode,
  });

  // #region agent log
  fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'stageCapture.ts:captureLiveStage',message:'live stage captured',data:{w,h,canvasW:canvas.width,canvasH:canvas.height,sliderPercent:getOverlayStrength(),fullCover:isOverlayFullCover(),blendMode:overlayBlendMode(),auraAlpha:scaledAuraOpacity(),uiAlpha:scaledUiGradientOpacity()},timestamp:Date.now(),hypothesisId:'H-live-capture',runId:'live-stage-v1'})}).catch(()=>{});
  // #endregion

  return canvas;
}

export function blitCanvas(
  target: HTMLCanvasElement,
  source: HTMLCanvasElement
): boolean {
  if (source.width <= 0 || source.height <= 0) return false;
  target.width = source.width;
  target.height = source.height;
  const ctx = target.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(source, 0, 0);
  return true;
}

export async function captureLiveStageBlob(stageEl: HTMLElement): Promise<Blob> {
  const canvas = await captureLiveStage(stageEl);
  return blobFromReviewCanvas(canvas);
}
