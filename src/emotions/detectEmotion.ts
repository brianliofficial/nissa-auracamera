import type {
  Classifications,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export type EmotionKind = "angry" | "sad" | "happy" | "neutral";

export interface EmotionState {
  kind: EmotionKind;
  labelEn: string;
  labelZh: string;
  scores: {
    angry: number;
    sad: number;
    happy: number;
  };
  debug: {
    mouthDelta: number;
    browDown: number;
    browFurrow: number;
    jawOpen: number;
    eyeWide: number;
  };
}

const LABELS: Record<
  EmotionKind,
  { labelEn: string; labelZh: string }
> = {
  angry: { labelEn: "Angry", labelZh: "生氣" },
  sad: { labelEn: "Sad", labelZh: "難過" },
  happy: { labelEn: "Happy", labelZh: "開心" },
  neutral: { labelEn: "Neutral", labelZh: "中性" },
};

const FOREHEAD = 10;
const CHIN = 152;
const UPPER_LIP = 13;
const LOWER_LIP = 14;
const LEFT_BROW_INNER = 66;
const RIGHT_BROW_INNER = 296;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function blendScore(
  blendshapes: Classifications | undefined,
  name: string
): number {
  if (!blendshapes) return 0;
  const hit = blendshapes.categories.find((c) => c.categoryName === name);
  return hit?.score ?? 0;
}

function avgScore(
  blendshapes: Classifications | undefined,
  names: string[]
): number {
  if (!names.length) return 0;
  let sum = 0;
  for (const name of names) {
    sum += blendScore(blendshapes, name);
  }
  return sum / names.length;
}

export interface MouthMotionTracker {
  update(landmarks: NormalizedLandmark[]): number;
  reset(): void;
}

/** Tracks mouth vertical shift vs face baseline. Positive = mouth moved up (happy). */
export function createMouthMotionTracker(): MouthMotionTracker {
  let baseline: number | null = null;
  let smoothedDelta = 0;

  return {
    update(landmarks: NormalizedLandmark[]): number {
      const upper = landmarks[UPPER_LIP];
      const lower = landmarks[LOWER_LIP];
      const forehead = landmarks[FOREHEAD];
      const chin = landmarks[CHIN];
      if (!upper || !lower || !forehead || !chin) return smoothedDelta;

      const mouthY = (upper.y + lower.y) / 2;
      const faceHeight = Math.max(0.01, chin.y - forehead.y);
      const ratio = (mouthY - forehead.y) / faceHeight;

      if (baseline === null) {
        baseline = ratio;
        return 0;
      }

      // y grows downward — mouth up => ratio shrinks => delta positive
      const rawDelta = baseline - ratio;
      smoothedDelta += (rawDelta - smoothedDelta) * 0.2;
      baseline += (ratio - baseline) * 0.015;
      return smoothedDelta;
    },
    reset() {
      baseline = null;
      smoothedDelta = 0;
    },
  };
}

function browFurrowScore(
  blendshapes: Classifications | undefined,
  landmarks: NormalizedLandmark[]
): number {
  const browDown = avgScore(blendshapes, [
    "browDownLeft",
    "browDownRight",
  ]);
  const leftInner = landmarks[LEFT_BROW_INNER];
  const rightInner = landmarks[RIGHT_BROW_INNER];
  const leftCheek = landmarks[LEFT_CHEEK];
  const rightCheek = landmarks[RIGHT_CHEEK];

  let proximity = 0;
  if (leftInner && rightInner && leftCheek && rightCheek) {
    const innerGap = dist(leftInner, rightInner);
    const faceWidth = dist(leftCheek, rightCheek);
    if (faceWidth > 0.01) {
      proximity = Math.max(0, Math.min(1, 1 - innerGap / (faceWidth * 0.38)));
    }
  }

  return Math.min(1, browDown * 0.65 + proximity * 0.35);
}

export function classifyEmotion(
  blendshapes: Classifications | undefined,
  landmarks: NormalizedLandmark[] | undefined,
  mouthTracker: MouthMotionTracker
): EmotionState {
  const mouthDelta =
    landmarks?.length ? mouthTracker.update(landmarks) : 0;

  const browDown = avgScore(blendshapes, [
    "browDownLeft",
    "browDownRight",
  ]);
  const browFurrow = landmarks?.length
    ? browFurrowScore(blendshapes, landmarks)
    : browDown;

  const mouthSmile = avgScore(blendshapes, [
    "mouthSmileLeft",
    "mouthSmileRight",
  ]);
  const mouthFrown = avgScore(blendshapes, [
    "mouthFrownLeft",
    "mouthFrownRight",
  ]);
  const jawOpen = blendScore(blendshapes, "jawOpen");
  const eyeWide = avgScore(blendshapes, ["eyeWideLeft", "eyeWideRight"]);
  const noseSneer = avgScore(blendshapes, [
    "noseSneerLeft",
    "noseSneerRight",
  ]);

  const mouthUpSignal = Math.max(0, mouthDelta * 12 + mouthSmile * 0.35);
  const mouthDownSignal = Math.max(0, -mouthDelta * 12 + mouthFrown * 0.35);

  // Angry: furrowed brows + shouting (jaw open) + wide intense eyes, not smiling
  const shoutAngry = jawOpen > 0.32 && mouthSmile < 0.35;
  const angryScore = Math.min(
    1,
    browFurrow * 0.4 +
      browDown * 0.2 +
      jawOpen * 0.22 +
      eyeWide * 0.1 +
      noseSneer * 0.08 +
      (shoutAngry ? 0.15 : 0)
  );
  const sadScore = Math.min(1, mouthDownSignal * 0.7 + mouthFrown * 0.3);
  const happyScore = Math.min(1, mouthUpSignal * 0.7 + mouthSmile * 0.3);

  const scores = { angry: angryScore, sad: sadScore, happy: happyScore };

  let kind: EmotionKind = "neutral";
  const isAngryFace =
    angryScore > 0.38 &&
    browFurrow > 0.32 &&
    (jawOpen > 0.28 || browDown > 0.35) &&
    mouthSmile < 0.4;

  if (isAngryFace && angryScore >= sadScore && angryScore >= happyScore) {
    kind = "angry";
  } else if (mouthDelta > 0.018 && happyScore >= sadScore && happyScore > 0.28) {
    kind = "happy";
  } else if (mouthDelta < -0.018 && sadScore >= happyScore && sadScore > 0.28) {
    kind = "sad";
  } else if (happyScore > 0.38 && happyScore >= sadScore) {
    kind = "happy";
  } else if (sadScore > 0.35 && sadScore >= happyScore) {
    kind = "sad";
  }

  const labels = LABELS[kind];
  return {
    kind,
    labelEn: labels.labelEn,
    labelZh: labels.labelZh,
    scores,
    debug: { mouthDelta, browDown, browFurrow, jawOpen, eyeWide },
  };
}

/** EMA smoother to reduce overlay flicker between frames. */
export function createEmotionSmoother(alpha = 0.18) {
  let angry = 0;
  let sad = 0;
  let happy = 0;
  let mouthDelta = 0;
  let browDown = 0;
  let browFurrow = 0;
  let jawOpen = 0;
  let eyeWide = 0;

  return {
    update(raw: EmotionState): EmotionState {
      angry += (raw.scores.angry - angry) * alpha;
      sad += (raw.scores.sad - sad) * alpha;
      happy += (raw.scores.happy - happy) * alpha;
      mouthDelta += (raw.debug.mouthDelta - mouthDelta) * alpha;
      browDown += (raw.debug.browDown - browDown) * alpha;
      browFurrow += (raw.debug.browFurrow - browFurrow) * alpha;
      jawOpen += (raw.debug.jawOpen - jawOpen) * alpha;
      eyeWide += (raw.debug.eyeWide - eyeWide) * alpha;

      const smoothed: EmotionState = {
        kind: "neutral",
        labelEn: LABELS.neutral.labelEn,
        labelZh: LABELS.neutral.labelZh,
        scores: { angry, sad, happy },
        debug: { mouthDelta, browDown, browFurrow, jawOpen, eyeWide },
      };

      const isAngryFace =
        angry > 0.38 &&
        browFurrow > 0.32 &&
        (jawOpen > 0.28 || browDown > 0.35);

      if (isAngryFace && angry >= sad && angry >= happy) {
        smoothed.kind = "angry";
      } else if (mouthDelta > 0.018 && happy >= sad && happy > 0.28) {
        smoothed.kind = "happy";
      } else if (mouthDelta < -0.018 && sad >= happy && sad > 0.28) {
        smoothed.kind = "sad";
      } else if (happy > 0.38 && happy >= sad) {
        smoothed.kind = "happy";
      } else if (sad > 0.35 && sad >= happy) {
        smoothed.kind = "sad";
      }

      const labels = LABELS[smoothed.kind];
      smoothed.labelEn = labels.labelEn;
      smoothed.labelZh = labels.labelZh;
      return smoothed;
    },
    reset() {
      angry = 0;
      sad = 0;
      happy = 0;
      mouthDelta = 0;
      browDown = 0;
      browFurrow = 0;
      jawOpen = 0;
      eyeWide = 0;
    },
  };
}
