import type { EmotionKind } from "./emotions/detectEmotion";
import { getUiGradient, type UiGradient } from "./emotions/uiGradients";
import {
  drawSubjectEdgeAura,
  getEmotionAuraColors,
  getGradientAuraColors,
} from "./edgeAura";
import type { CaptureOverlayMode, FrameSource } from "./screenshot";
import { coverVideoRect } from "./screenshot";
import type { SegmentationMask } from "./segmentation";
import {
  buildCenterSubjectMask,
  maskCoverage,
} from "./segmentation";

export interface ComposeAuraOptions {
  source: FrameSource;
  overlayMode: CaptureOverlayMode;
  emotion: EmotionKind;
  cw: number;
  ch: number;
  mask: SegmentationMask | null;
  recording?: boolean;
  timeMs?: number;
}

function resolveMask(
  mask: SegmentationMask | null,
  cw: number,
  ch: number
): SegmentationMask {
  if (mask && maskCoverage(mask) > 0.01) {
    return mask;
  }
  return buildCenterSubjectMask(
    Math.max(32, Math.round(cw * 0.25)),
    Math.max(32, Math.round(ch * 0.25))
  );
}

function resolvePalette(
  emotion: EmotionKind,
  overlayMode: CaptureOverlayMode
): { colors: string[]; uiGradient: UiGradient | null } {
  if (overlayMode !== "auto") {
    const g = getUiGradient(overlayMode);
    if (g) {
      return { colors: getGradientAuraColors(g), uiGradient: g };
    }
  }
  return {
    colors: getEmotionAuraColors(emotion),
    uiGradient: null,
  };
}

function ensureCanvasSize(
  canvas: HTMLCanvasElement,
  cw: number,
  ch: number
): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.round(cw * dpr);
  const targetH = Math.round(ch * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context.");

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return ctx;
}

/** Draw base frame + subject edge aura onto target canvas. */
export function composeAuraFrame(
  canvas: HTMLCanvasElement,
  options: ComposeAuraOptions
): boolean {
  const { source, overlayMode, emotion, cw, ch, mask, recording, timeMs } =
    options;
  if (source.width <= 0 || source.height <= 0 || cw <= 0 || ch <= 0) {
    return false;
  }

  const ctx = ensureCanvasSize(canvas, cw, ch);
  ctx.clearRect(0, 0, cw, ch);

  const rect = coverVideoRect(source.width, source.height, cw, ch);
  source.drawCover(ctx, cw, ch, rect);

  const subjectMask = resolveMask(mask, cw, ch);
  const { colors, uiGradient } = resolvePalette(emotion, overlayMode);

  drawSubjectEdgeAura(ctx, subjectMask, cw, ch, colors, {
    uiGradient,
    recording,
    emotion,
    overlayMode,
    timeMs,
  });

  return true;
}

/** Draw only edge aura layer (for live preview canvas). */
export function paintAuraOverlayOnly(
  canvas: HTMLCanvasElement,
  cw: number,
  ch: number,
  mask: SegmentationMask | null,
  emotion: EmotionKind,
  overlayMode: CaptureOverlayMode,
  timeMs = performance.now()
): void {
  if (cw <= 0 || ch <= 0) return;

  const ctx = ensureCanvasSize(canvas, cw, ch);
  ctx.clearRect(0, 0, cw, ch);

  const subjectMask = resolveMask(mask, cw, ch);
  const { colors, uiGradient } = resolvePalette(emotion, overlayMode);

  drawSubjectEdgeAura(ctx, subjectMask, cw, ch, colors, {
    uiGradient,
    emotion,
    overlayMode,
    timeMs,
  });
}
