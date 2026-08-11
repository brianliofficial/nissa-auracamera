import type { EmotionKind } from "./detectEmotion";
import { overlayBlendMode, scaledAuraOpacity } from "../overlayOpacity";

export interface AuraBlobConfig {
  x: number;
  y: number;
  size: number;
  color: string;
}

export interface AuraPreset {
  blobs: AuraBlobConfig[];
}

/** Intensified aura — higher alpha for stronger color wash. */
export const AURA_PRESETS: Record<EmotionKind, AuraPreset> = {
  neutral: {
    blobs: [
      { x: 50, y: 8, size: 75, color: "rgba(30, 120, 255, 0.82)" },
      { x: 18, y: 22, size: 60, color: "rgba(220, 60, 200, 0.78)" },
      { x: 55, y: 42, size: 92, color: "rgba(255, 90, 40, 0.75)" },
      { x: 82, y: 38, size: 65, color: "rgba(255, 50, 80, 0.72)" },
      { x: 48, y: 68, size: 55, color: "rgba(180, 255, 60, 0.85)" },
      { x: 28, y: 82, size: 48, color: "rgba(120, 80, 255, 0.68)" },
    ],
  },
  angry: {
    blobs: [
      { x: 50, y: 10, size: 72, color: "rgba(200, 20, 40, 0.85)" },
      { x: 20, y: 28, size: 58, color: "rgba(255, 40, 100, 0.78)" },
      { x: 52, y: 45, size: 95, color: "rgba(255, 60, 0, 0.82)" },
      { x: 80, y: 40, size: 62, color: "rgba(230, 30, 0, 0.8)" },
      { x: 50, y: 70, size: 52, color: "rgba(255, 140, 20, 0.72)" },
      { x: 30, y: 78, size: 46, color: "rgba(255, 80, 30, 0.68)" },
    ],
  },
  sad: {
    blobs: [
      { x: 50, y: 8, size: 78, color: "rgba(20, 80, 255, 0.82)" },
      { x: 15, y: 25, size: 62, color: "rgba(100, 50, 230, 0.78)" },
      { x: 55, y: 45, size: 88, color: "rgba(40, 100, 255, 0.75)" },
      { x: 85, y: 35, size: 58, color: "rgba(140, 70, 255, 0.72)" },
      { x: 45, y: 72, size: 54, color: "rgba(60, 110, 255, 0.7)" },
      { x: 25, y: 85, size: 48, color: "rgba(50, 30, 200, 0.65)" },
    ],
  },
  happy: {
    blobs: [
      { x: 50, y: 10, size: 68, color: "rgba(255, 220, 30, 0.82)" },
      { x: 22, y: 30, size: 56, color: "rgba(255, 240, 80, 0.78)" },
      { x: 52, y: 44, size: 88, color: "rgba(255, 190, 0, 0.8)" },
      { x: 78, y: 38, size: 60, color: "rgba(100, 255, 70, 0.75)" },
      { x: 48, y: 68, size: 58, color: "rgba(140, 255, 40, 0.85)" },
      { x: 32, y: 80, size: 50, color: "rgba(60, 230, 90, 0.72)" },
    ],
  },
};

export function applyAuraPreset(
  layer: HTMLElement,
  kind: EmotionKind
): void {
  const preset = AURA_PRESETS[kind];
  const blobEls = layer.querySelectorAll<HTMLElement>(".aura-blob");

  blobEls.forEach((el, i) => {
    const blob = preset.blobs[i];
    if (!blob) {
      el.style.opacity = "0";
      return;
    }
    el.style.opacity = "1";
    el.style.setProperty("--blob-x", `${blob.x}%`);
    el.style.setProperty("--blob-y", `${blob.y}%`);
    el.style.setProperty("--blob-size", `${blob.size}%`);
    el.style.setProperty("--blob-color", blob.color);
  });
}

export function getAuraSwatch(kind: EmotionKind): string {
  const blobs = AURA_PRESETS[kind].blobs;
  return blobs
    .slice(0, 4)
    .map(
      (b) =>
        `radial-gradient(circle at ${b.x}% ${b.y}%, ${b.color} 0%, transparent 70%)`
    )
    .join(", ");
}

function blobCssVar(el: HTMLElement, name: string, fallback: number): number {
  const inline = parseFloat(el.style.getPropertyValue(name));
  if (Number.isFinite(inline)) return inline;
  const computed = parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isFinite(computed) ? computed : fallback;
}

export function readAuraBlobColors(layer: HTMLElement): AuraBlobConfig[] {
  const blobEls = layer.querySelectorAll<HTMLElement>(".aura-blob");
  const result: AuraBlobConfig[] = [];

  blobEls.forEach((el) => {
    const computed = getComputedStyle(el);
    if (el.style.opacity === "0" || computed.opacity === "0") return;

    const x = blobCssVar(el, "--blob-x", 50);
    const y = blobCssVar(el, "--blob-y", 50);
    const size = blobCssVar(el, "--blob-size", 50);
    const color = computed.backgroundColor;
    if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") {
      return;
    }
    result.push({ x, y, size, color });
  });

  return result;
}

export function ensureAuraLayer(overlay: HTMLElement): HTMLElement {
  let layer = overlay.querySelector<HTMLElement>(".aura-layer");
  if (layer) return layer;

  layer = document.createElement("div");
  layer.className = "aura-layer";
  layer.setAttribute("aria-hidden", "true");

  for (let i = 0; i < 6; i++) {
    const blob = document.createElement("span");
    blob.className = "aura-blob";
    blob.dataset.blob = String(i);
    layer.appendChild(blob);
  }

  overlay.appendChild(layer);
  return layer;
}

export function setAuraLayerVisible(layer: HTMLElement, visible: boolean): void {
  layer.style.opacity = visible ? String(scaledAuraOpacity()) : "0";
  layer.style.mixBlendMode = overlayBlendMode();
}
