const SLIDER_MAX = 100;

let sliderPercent = 50;

export function setOverlayStrength(percent: number): void {
  sliderPercent = Math.max(0, Math.min(SLIDER_MAX, Math.round(percent)));
}

export function getOverlayStrength(): number {
  return sliderPercent;
}

/** Smooth 0→1 easing — avoids harsh jumps while dragging. */
function easedStrength(): number {
  const t = sliderPercent / SLIDER_MAX;
  return t * t * (3 - 2 * t);
}

export function isOverlayFullCover(): boolean {
  return sliderPercent >= SLIDER_MAX;
}

/** Screen for 0–99%, normal only at 100% for full gradient cover. */
export function overlayBlendMode(): "screen" | "normal" {
  return isOverlayFullCover() ? "normal" : "screen";
}

export function scaledUiGradientOpacity(): number {
  if (isOverlayFullCover()) return 1;
  return easedStrength() * 0.92;
}

export function scaledAuraOpacity(): number {
  if (isOverlayFullCover()) return 1;
  return easedStrength() * 0.9;
}
