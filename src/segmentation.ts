import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";

const TASKS_PKG_VERSION = "0.10.35";
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_PKG_VERSION}/wasm`;

const SELFIE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

export interface SegmentationMask {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface SubjectSegmenter {
  segmentVideo(
    video: HTMLVideoElement,
    timestampMs: number
  ): SegmentationMask | null;
  segmentImage(
    source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    width: number,
    height: number
  ): SegmentationMask | null;
  close(): void;
}

function maskFromResult(
  data: Uint8Array,
  width: number,
  height: number
): SegmentationMask {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) {
    out[i] = data[i]! > 0 ? 255 : 0;
  }
  return { data: out, width, height };
}

/** Fallback silhouette when segmentation finds no subject (e.g. animals). */
export function buildCenterSubjectMask(
  width: number,
  height: number
): SegmentationMask {
  const data = new Uint8Array(width * height);
  const cx = width * 0.5;
  const cy = height * 0.46;
  const rx = width * 0.28;
  const ry = height * 0.42;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) {
        data[y * width + x] = 255;
      }
    }
  }
  return { data, width, height };
}

export function maskCoverage(mask: SegmentationMask): number {
  let hits = 0;
  for (let i = 0; i < mask.data.length; i++) {
    if (mask.data[i]! > 128) hits += 1;
  }
  return hits / mask.data.length;
}

async function createSegmenterWithDelegate(
  delegate: "GPU" | "CPU",
  wasm: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
): Promise<SubjectSegmenter> {
  const segmenter = await ImageSegmenter.createFromOptions(wasm, {
    baseOptions: {
      modelAssetPath: SELFIE_MODEL,
      delegate,
    },
    runningMode: "VIDEO",
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  });

  let imageMode = false;

  return {
    segmentVideo(video, timestampMs) {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) return null;
      if (imageMode) {
        segmenter.setOptions({ runningMode: "VIDEO" });
        imageMode = false;
      }
      const result = segmenter.segmentForVideo(video, timestampMs);
      const categoryMask = result.categoryMask;
      if (!categoryMask) return null;
      return maskFromResult(
        categoryMask.getAsUint8Array(),
        categoryMask.width,
        categoryMask.height
      );
    },

    segmentImage(source, width, height) {
      if (width <= 0 || height <= 0) return null;
      if (!imageMode) {
        segmenter.setOptions({ runningMode: "IMAGE" });
        imageMode = true;
      }
      const result = segmenter.segment(source);
      const categoryMask = result.categoryMask;
      if (!categoryMask) return null;
      return maskFromResult(
        categoryMask.getAsUint8Array(),
        categoryMask.width,
        categoryMask.height
      );
    },

    close() {
      segmenter.close();
    },
  };
}

export async function createSubjectSegmenter(): Promise<SubjectSegmenter> {
  const wasm = await FilesetResolver.forVisionTasks(WASM_ROOT);
  try {
    return await createSegmenterWithDelegate("GPU", wasm);
  } catch (err) {
    console.warn("[AuraCamera] Segmenter GPU unavailable, using CPU.", err);
    return await createSegmenterWithDelegate("CPU", wasm);
  }
}
