import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/** Keep in sync with `package.json` → `@mediapipe/tasks-vision` (CDN wasm path). */
const TASKS_PKG_VERSION = "0.10.35";
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_PKG_VERSION}/wasm`;

const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export interface FaceDetector {
  face: FaceLandmarker;
  close(): void;
}

async function createWithDelegate(
  delegate: "GPU" | "CPU",
  wasm: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
): Promise<FaceDetector> {
  const face = await FaceLandmarker.createFromOptions(wasm, {
    baseOptions: {
      modelAssetPath: FACE_MODEL,
      delegate,
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });

  return {
    face,
    close() {
      face.close();
    },
  };
}

/** GPU delegate when supported; falls back to CPU if WebGL delegation fails. */
export async function createFaceDetector(): Promise<FaceDetector> {
  const wasm = await FilesetResolver.forVisionTasks(WASM_ROOT);
  try {
    return await createWithDelegate("GPU", wasm);
  } catch (err) {
    console.warn(
      "[EmotionMirror] GPU delegate unavailable, falling back to CPU.",
      err
    );
    return await createWithDelegate("CPU", wasm);
  }
}
