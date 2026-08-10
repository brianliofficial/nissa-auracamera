/** Curated presets from https://uigradients.com */
import {
  overlayBlendMode,
  scaledUiGradientOpacity,
} from "../overlayOpacity";

export interface UiGradient {
  id: string;
  name: string;
  from: string;
  to: string;
  /** CSS angle in degrees */
  angle: number;
}

export const UI_GRADIENTS: UiGradient[] = [
  { id: "behongo", name: "Behongo", from: "#061700", to: "#52c234", angle: 90 },
  { id: "sin-city-red", name: "Sin City Red", from: "#ED213A", to: "#93291E", angle: 135 },
  { id: "sunset", name: "Sunset", from: "#0B486B", to: "#F56217", angle: 135 },
  { id: "purple-love", name: "Purple Love", from: "#CC2B5E", to: "#753A88", angle: 135 },
  { id: "cool-blues", name: "Cool Blues", from: "#2193B0", to: "#6DD5ED", angle: 135 },
  { id: "moonlit-asteroid", name: "Moonlit Asteroid", from: "#0F2027", to: "#203A43", angle: 135 },
  { id: "pink-flavour", name: "Pink Flavour", from: "#800080", to: "#FFC0CB", angle: 135 },
  { id: "orange-fun", name: "Orange Fun", from: "#FF8008", to: "#FFC837", angle: 135 },
  { id: "green-beach", name: "Green Beach", from: "#02AAB0", to: "#00CDAC", angle: 135 },
  { id: "bloody-mary", name: "Bloody Mary", from: "#FF512F", to: "#DD2476", angle: 135 },
  { id: "mango-pulp", name: "Mango Pulp", from: "#F09819", to: "#EDDE5D", angle: 135 },
  { id: "frozen", name: "Frozen", from: "#403B4A", to: "#E7E9BB", angle: 135 },
  { id: "harvey", name: "Harvey", from: "#1F4037", to: "#99F2C8", angle: 135 },
  { id: "vice-city", name: "Vice City", from: "#3494E6", to: "#EC6EAD", angle: 135 },
  { id: "firewatch", name: "Firewatch", from: "#CB356B", to: "#BD3F32", angle: 135 },
  { id: "telegram", name: "Telegram", from: "#1CB5E0", to: "#000851", angle: 135 },
];

export function getUiGradient(id: string): UiGradient | undefined {
  return UI_GRADIENTS.find((g) => g.id === id);
}

export function uiGradientCss(g: UiGradient): string {
  return `linear-gradient(${g.angle}deg, ${g.from} 0%, ${g.to} 100%)`;
}

export function ensureUiGradientLayer(overlay: HTMLElement): HTMLElement {
  let layer = overlay.querySelector<HTMLElement>(".ui-gradient-layer");
  if (layer) return layer;
  layer = document.createElement("div");
  layer.className = "ui-gradient-layer";
  layer.hidden = true;
  overlay.appendChild(layer);
  return layer;
}

export function applyUiGradientLayer(
  layer: HTMLElement,
  gradient: UiGradient | null
): void {
  if (!gradient) {
    layer.hidden = true;
    return;
  }
  layer.hidden = false;
  layer.style.background = uiGradientCss(gradient);
  layer.style.opacity = String(scaledUiGradientOpacity());
  layer.style.mixBlendMode = overlayBlendMode();
}

export function readActiveUiGradient(overlay: HTMLElement): UiGradient | null {
  const id = overlay.dataset.uiGradient;
  if (!id || id === "auto") return null;
  return getUiGradient(id) ?? null;
}
