import type { EmotionKind } from "./emotions/detectEmotion";
import { createVideoFrameSource, paintRecordingFrame, type CaptureOverlayMode } from "./screenshot";
import { getOverlayStrength } from "./overlayOpacity";

export const RECORD_DURATION_MS = 30_000;

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "video/webm";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function videoFilename(mimeType: string): string {
  const d = new Date();
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  return `emotion-mirror-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}

export function downloadVideoBlob(blob: Blob, mimeType: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = videoFilename(mimeType);
  a.click();
  URL.revokeObjectURL(url);
}

export interface EmotionVideoRecorder {
  start(): Promise<void>;
  stop(): Promise<Blob | null>;
  isActive(): boolean;
}

export function createEmotionVideoRecorder(options: {
  video: HTMLVideoElement;
  overlayEl: HTMLElement;
  stageEl: HTMLElement;
  getEmotion: () => EmotionKind;
  getOverlayMode: () => CaptureOverlayMode;
  onProgress?: (remainingSec: number, progress: number) => void;
  onMaxDuration?: (blob: Blob) => void;
}): EmotionVideoRecorder {
  const canvas = document.createElement("canvas");
  let recorder: MediaRecorder | null = null;
  let mimeType = "video/webm";
  let chunks: Blob[] = [];
  let rafId = 0;
  let progressTimer = 0;
  let maxDurationTimer = 0;
  let active = false;
  let frameCount = 0;
  let lastFrameLogAt = 0;
  let lastPaintMs = 0;

  const paintFrame = (): void => {
    if (!active) return;
    const t0 = performance.now();
    const source = createVideoFrameSource(options.video);
    paintRecordingFrame(
      canvas,
      source,
      options.overlayEl,
      options.getEmotion(),
      options.getOverlayMode(),
      options.stageEl
    );
    lastPaintMs = performance.now() - t0;
    frameCount += 1;

    const now = performance.now();
    if (now - lastFrameLogAt >= 1000) {
      lastFrameLogAt = now;
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'videoRecorder.ts:paintFrame',message:'recording frame stats',data:{frameCount,paintMs:lastPaintMs,sliderPercent:getOverlayStrength(),emotion:options.getEmotion(),overlayMode:options.getOverlayMode()},timestamp:Date.now(),hypothesisId:'H-record-perf',runId:'record-smooth-v1'})}).catch(()=>{});
      // #endregion
    }

    rafId = requestAnimationFrame(paintFrame);
  };

  const clearTimers = (): void => {
    cancelAnimationFrame(rafId);
    window.clearTimeout(progressTimer);
    window.clearTimeout(maxDurationTimer);
    rafId = 0;
    progressTimer = 0;
    maxDurationTimer = 0;
  };

  const finish = (): Promise<Blob | null> => {
    if (!active && !recorder) return Promise.resolve(null);
    active = false;
    clearTimers();

    return new Promise((resolve) => {
      if (!recorder || recorder.state === "inactive") {
        recorder = null;
        resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : null);
        return;
      }

      recorder.addEventListener(
        "stop",
        () => {
          const blob = chunks.length ? new Blob(chunks, { type: mimeType }) : null;
          recorder = null;
          resolve(blob);
        },
        { once: true }
      );
      recorder.stop();
    });
  };

  return {
    isActive: () => active,

    async start(): Promise<void> {
      if (active) return;

      const source = createVideoFrameSource(options.video);
      if (source.width <= 0 || source.height <= 0) {
        throw new Error("Camera is not ready / 鏡頭尚未就緒");
      }

      paintRecordingFrame(
        canvas,
        source,
        options.overlayEl,
        options.getEmotion(),
        options.getOverlayMode(),
        options.stageEl
      );
      if (canvas.width <= 0 || canvas.height <= 0) {
        throw new Error("Could not prepare recorder / 無法開始錄影");
      }

      if (typeof MediaRecorder === "undefined") {
        throw new Error("Recording not supported / 此瀏覽器不支援錄影");
      }

      mimeType = pickMimeType();
      chunks = [];
      active = true;

      const stream = canvas.captureStream(0);
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2_500_000,
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.start(250);

      const startedAt = performance.now();
      const tickProgress = (): void => {
        if (!active) return;
        const elapsed = performance.now() - startedAt;
        const progress = Math.min(1, elapsed / RECORD_DURATION_MS);
        const remainingSec = Math.max(0, Math.ceil((RECORD_DURATION_MS - elapsed) / 1000));
        options.onProgress?.(remainingSec, progress);
        if (elapsed >= RECORD_DURATION_MS) return;
        progressTimer = window.setTimeout(tickProgress, 100);
      };
      tickProgress();

      paintFrame();

      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'videoRecorder.ts:start',message:'recording started',data:{mimeType,canvasW:canvas.width,canvasH:canvas.height,durationMs:RECORD_DURATION_MS},timestamp:Date.now(),hypothesisId:'H-record',runId:'post-fix'})}).catch(()=>{});
      // #endregion

      maxDurationTimer = window.setTimeout(() => {
        void finish().then((blob) => {
          // #region agent log
          fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'videoRecorder.ts:finish',message:'recording max duration reached',data:{blobSize:blob?.size??0,mimeType},timestamp:Date.now(),hypothesisId:'H-record',runId:'post-fix'})}).catch(()=>{});
          // #endregion
          if (blob && blob.size > 0) options.onMaxDuration?.(blob);
        });
      }, RECORD_DURATION_MS);
    },

    stop(): Promise<Blob | null> {
      return finish().then((blob) => {
        // #region agent log
        fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'videoRecorder.ts:stop',message:'recording stopped manually',data:{blobSize:blob?.size??0,mimeType},timestamp:Date.now(),hypothesisId:'H-record',runId:'post-fix'})}).catch(()=>{});
        // #endregion
        return blob;
      });
    },
  };
}
