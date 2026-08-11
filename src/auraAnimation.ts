import type { EmotionKind } from "./emotions/detectEmotion";

export interface AuraPhotoZone {
  nx: number;
  ny: number;
  radius: number;
}

export interface AuraAnimationFrame {
  colors: string[];
  zones: AuraPhotoZone[];
}

const BASE_LAYOUT: AuraPhotoZone[] = [
  { nx: 0.5, ny: -0.1, radius: 0.62 },
  { nx: 0.14, ny: 0.06, radius: 0.48 },
  { nx: 0.86, ny: 0.06, radius: 0.44 },
  { nx: 0.5, ny: 0.36, radius: 0.88 },
  { nx: 0.5, ny: 0.56, radius: 0.42 },
];

/** Neutral / Auto — full-spectrum aura photography cycle. */
const NEUTRAL_CYCLE = [
  "rgba(28, 95, 255, 0.80)",
  "rgba(210, 45, 195, 0.74)",
  "rgba(0, 205, 255, 0.68)",
  "rgba(255, 92, 32, 0.76)",
  "rgba(205, 255, 55, 0.90)",
  "rgba(255, 100, 180, 0.72)",
  "rgba(130, 55, 220, 0.74)",
];

/** Happy — yellow → orange → pink. */
const HAPPY_CYCLE = [
  "rgba(255, 230, 60, 0.82)",
  "rgba(255, 155, 35, 0.80)",
  "rgba(255, 105, 175, 0.78)",
];

/** Sad — blue → deep green → purple. */
const SAD_CYCLE = [
  "rgba(25, 95, 255, 0.80)",
  "rgba(18, 115, 85, 0.76)",
  "rgba(115, 45, 210, 0.74)",
];

const ANGRY_CYCLE = [
  "rgba(200, 25, 45, 0.80)",
  "rgba(255, 55, 20, 0.78)",
  "rgba(255, 120, 0, 0.76)",
];

const EMOTION_CYCLES: Record<EmotionKind, string[]> = {
  neutral: NEUTRAL_CYCLE,
  happy: HAPPY_CYCLE,
  sad: SAD_CYCLE,
  angry: ANGRY_CYCLE,
};

function parseRgba(color: string): [number, number, number, number] {
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
  return [255, 255, 255, 0.5];
}

function lerpRgba(a: string, b: string, t: number): string {
  const [r1, g1, b1, a1] = parseRgba(a);
  const [r2, g2, b2, a2] = parseRgba(b);
  const u = Math.max(0, Math.min(1, t));
  return `rgba(${Math.round(r1 + (r2 - r1) * u)}, ${Math.round(g1 + (g2 - g1) * u)}, ${Math.round(b1 + (b2 - b1) * u)}, ${(a1 + (a2 - a1) * u).toFixed(2)})`;
}

function sampleColorCycle(cycle: string[], phase: number): string {
  if (cycle.length === 0) return "rgba(255,255,255,0.5)";
  if (cycle.length === 1) return cycle[0]!;
  const wrapped = ((phase % cycle.length) + cycle.length) % cycle.length;
  const i = Math.floor(wrapped);
  const j = (i + 1) % cycle.length;
  const localT = wrapped - i;
  return lerpRgba(cycle[i]!, cycle[j]!, localT);
}

/** Continuously drifting zones + cycling colors for live aura. */
export function getAuraAnimationFrame(
  emotion: EmotionKind,
  timeMs: number
): AuraAnimationFrame {
  const t = timeMs * 0.001;
  const cycle = EMOTION_CYCLES[emotion];

  const colorSpeed =
    emotion === "neutral" ? 0.22 : emotion === "happy" ? 0.28 : 0.24;

  const colors = BASE_LAYOUT.map((_, i) =>
    sampleColorCycle(cycle, t * colorSpeed + i * 0.38)
  );

  const zones = BASE_LAYOUT.map((zone, i) => {
    const moveX = Math.sin(t * 0.55 + i * 1.35) * 0.07;
    const moveY = Math.cos(t * 0.48 + i * 1.05) * 0.06;
    const pulse = 1 + Math.sin(t * 0.42 + i * 0.75) * 0.1;
    return {
      nx: zone.nx + moveX,
      ny: zone.ny + moveY,
      radius: zone.radius * pulse,
    };
  });

  return { colors, zones };
}

export function shouldAnimateAura(overlayMode: string): boolean {
  return overlayMode === "auto";
}

export { BASE_LAYOUT as AURA_PHOTO_LAYOUT };
