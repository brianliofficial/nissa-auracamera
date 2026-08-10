import { AURA_PRESETS, type AuraBlobConfig } from "./auraOverlay";

function randomHue(): number {
  return Math.floor(Math.random() * 360);
}

function hsla(h: number, s: number, l: number, a: number): string {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

function pickNeutralColors(): string[] {
  const base = randomHue();
  return [
    hsla(base, 88, 55, 0.78),
    hsla((base + 75 + Math.floor(Math.random() * 30)) % 360, 85, 52, 0.75),
    hsla((base + 140 + Math.floor(Math.random() * 40)) % 360, 86, 50, 0.72),
    hsla((base + 200 + Math.floor(Math.random() * 35)) % 360, 82, 54, 0.7),
    hsla((base + 280 + Math.floor(Math.random() * 45)) % 360, 90, 58, 0.8),
    hsla((base + 320 + Math.floor(Math.random() * 25)) % 360, 78, 50, 0.68),
  ];
}

export interface NeutralGradientController {
  start(layer: HTMLElement): void;
  stop(): void;
}

export function createNeutralGradientController(
  intervalMs = 2000
): NeutralGradientController {
  let rafId = 0;
  let lastSwitch = 0;
  let targetLayer: HTMLElement | null = null;
  let colors = pickNeutralColors();

  const apply = (): void => {
    if (!targetLayer) return;
    const preset = AURA_PRESETS.neutral;
    const blobEls = targetLayer.querySelectorAll<HTMLElement>(".aura-blob");

    blobEls.forEach((el, i) => {
      const blob = preset.blobs[i];
      if (!blob) return;
      el.style.opacity = "1";
      el.style.setProperty("--blob-x", `${blob.x}%`);
      el.style.setProperty("--blob-y", `${blob.y}%`);
      el.style.setProperty("--blob-size", `${blob.size}%`);
      el.style.setProperty("--blob-color", colors[i] ?? colors[0]!);
    });
  };

  const tick = (now: number): void => {
    if (!targetLayer) return;
    if (now - lastSwitch >= intervalMs) {
      lastSwitch = now;
      colors = pickNeutralColors();
      apply();
    }
    rafId = requestAnimationFrame(tick);
  };

  return {
    start(layer: HTMLElement) {
      targetLayer = layer;
      lastSwitch = performance.now();
      colors = pickNeutralColors();
      apply();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(rafId);
      targetLayer = null;
    },
  };
}

export type { AuraBlobConfig };
