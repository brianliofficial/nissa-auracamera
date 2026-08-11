import type { EmotionKind } from "./emotions/detectEmotion";
import { composeAuraFrame } from "./auraCompositor";
import type { CaptureOverlayMode } from "./screenshot";
import { createVideoFrameSource } from "./screenshot";
import type { SegmentationMask } from "./segmentation";
import { getOverlayStrength } from "./overlayOpacity";

export const RECORD_DURATION_MS = 30_000;
const RECORD_FPS = 30;

function pickMimeType(): string {
  const candidates = [
    "video/mp4",
    "video/mp4;codecs=avc1",
    "video/mp4;codecs=h264",
    "video/quicktime",
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

/** User-facing export is always `.mov` (MP4/H.264 when supported). */
export function videoFilename(_mimeType?: string): string {
  const d = new Date();
  return `nissa-love-you-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.mov`;
}

export function downloadVideoBlob(blob: Blob, _mimeType?: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = videoFilename();
  a.click();
  URL.revokeObjectURL(url);
}

export interface EmotionVideoRecorder {
  start(): Promise<void>;
  stop(): Promise<Blob | null>;
  isActive(): boolean;
}

type CanvasCaptureTrack = MediaStreamTrack & { requestFrame?: () => void };

export function createEmotionVideoRecorder(options: {
  video: HTMLVideoElement;
  stageEl: HTMLElement;
  getEmotion: () => EmotionKind;
  getOverlayMode: () => CaptureOverlayMode;
  getMask: (timestampMs: number) => SegmentationMask | null;
  onProgress?: (remainingSec: number, progress: number) => void;
  onMaxDuration?: (blob: Blob) => void;
}): EmotionVideoRecorder {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;opacity:0";
  options.stageEl.appendChild(canvas);

  let recorder: MediaRecorder | null = null;
  let captureTrack: CanvasCaptureTrack | null = null;
  let mimeType = "video/webm";
  let chunks: Blob[] = [];
  let rafId = 0;
  let progressTimer = 0;
  let maxDurationTimer = 0;
  let active = false;
  let stopping = false;
  let frameCount = 0;
  let lastFrameLogAt = 0;
  let lastPaintMs = 0;
  let startedAt = 0;

  const requestCaptureFrame = (): void => {
    captureTrack?.requestFrame?.();
  };

  const paintFrame = (timestampMs: number): void => {
    if (!active && !stopping) return;
    const t0 = performance.now();
    const cw = options.stageEl.clientWidth;
    const ch = options.stageEl.clientHeight;
    const source = createVideoFrameSource(options.video);

    composeAuraFrame(canvas, {
      source,
      overlayMode: options.getOverlayMode(),
      emotion: options.getEmotion(),
      cw,
      ch,
      mask: options.getMask(timestampMs),
      recording: true,
      timeMs: timestampMs,
    });

    requestCaptureFrame();
    lastPaintMs = performance.now() - t0;
    frameCount += 1;

    const now = performance.now();
    if (now - lastFrameLogAt >= 1000) {
      lastFrameLogAt = now;
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'videoRecorder.ts:paintFrame',message:'recording frame stats',data:{frameCount,paintMs:lastPaintMs,sliderPercent:getOverlayStrength(),emotion:options.getEmotion(),overlayMode:options.getOverlayMode(),hasRequestFrame:typeof captureTrack?.requestFrame==='function'},timestamp:Date.now(),hypothesisId:'H-record-edge',runId:'video-remake-v1'})}).catch(()=>{});
      // #endregion
    }

    if (active) {
      rafId = requestAnimationFrame(() => paintFrame(performance.now()));
    }
  };

  const clearTimers = (): void => {
    cancelAnimationFrame(rafId);
    window.clearTimeout(progressTimer);
    window.clearTimeout(maxDurationTimer);
    rafId = 0;
    progressTimer = 0;
    maxDurationTimer = 0;
  };

  const teardownCanvas = (): void => {
    canvas.remove();
  };

  const finish = (): Promise<Blob | null> => {
    if (!active && !recorder && !stopping) return Promise.resolve(null);

    stopping = true;
    active = false;
    clearTimers();

    return new Promise((resolve) => {
      if (!recorder || recorder.state === "inactive") {
        recorder = null;
        captureTrack = null;
        stopping = false;
        teardownCanvas();
        const blob = chunks.length ? new Blob(chunks, { type: mimeType }) : null;
        // #region agent log
        fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'videoRecorder.ts:finish',message:'recorder inactive finish',data:{chunkCount:chunks.length,blobSize:blob?.size??0,mimeType,frameCount,durationMs:startedAt?Math.round(performance.now()-startedAt):0},timestamp:Date.now(),hypothesisId:'H-record-blob',runId:'video-remake-v1'})}).catch(()=>{});
        // #endregion
        resolve(blob);
        return;
      }

      recorder.addEventListener(
        "stop",
        () => {
          const blob = chunks.length ? new Blob(chunks, { type: mimeType }) : null;
          recorder = null;
          captureTrack = null;
          stopping = false;
          teardownCanvas();
          // #region agent log
          fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'videoRecorder.ts:finish',message:'recorder stopped',data:{chunkCount:chunks.length,blobSize:blob?.size??0,mimeType,frameCount,durationMs:startedAt?Math.round(performance.now()-startedAt):0},timestamp:Date.now(),hypothesisId:'H-record-blob',runId:'video-remake-v1'})}).catch(()=>{});
          // #endregion
          resolve(blob);
        },
        { once: true }
      );

      try {
        if (recorder.state === "recording") {
          recorder.requestData();
        }
      } catch {
        /* ignore */
      }
      paintFrame(performance.now());
      requestCaptureFrame();
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

      const cw = options.stageEl.clientWidth;
      const ch = options.stageEl.clientHeight;
      composeAuraFrame(canvas, {
        source,
        overlayMode: options.getOverlayMode(),
        emotion: options.getEmotion(),
        cw,
        ch,
        mask: options.getMask(performance.now()),
        recording: true,
        timeMs: performance.now(),
      });

      if (canvas.width <= 0 || canvas.height <= 0) {
        throw new Error("Could not prepare recorder / 無法開始錄影");
      }

      if (typeof MediaRecorder === "undefined") {
        throw new Error("Recording not supported / 此瀏覽器不支援錄影");
      }

      mimeType = pickMimeType();
      chunks = [];
      active = true;
      stopping = false;
      frameCount = 0;
      startedAt = performance.now();

      const stream = canvas.captureStream(RECORD_FPS);
      captureTrack = stream.getVideoTracks()[0] ?? null;
      requestCaptureFrame();

      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4_000_000,
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.start(500);

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

      paintFrame(performance.now());

      maxDurationTimer = window.setTimeout(() => {
        void finish().then((blob) => {
          if (blob && blob.size > 0) options.onMaxDuration?.(blob);
        });
      }, RECORD_DURATION_MS);
    },

    stop(): Promise<Blob | null> {
      return finish();
    },
  };
}
