import "./styles.css";
import { disposeCamera, startCamera } from "./camera";
import { createFaceDetector } from "./detectors";
import {
  applyAuraPreset,
  ensureAuraLayer,
  getAuraSwatch,
  setAuraLayerVisible,
} from "./emotions/auraOverlay";
import {
  classifyEmotion,
  createBrowMotionTracker,
  createEmotionSmoother,
  createMouthMotionTracker,
  type EmotionKind,
  type EmotionState,
} from "./emotions/detectEmotion";
import { createNeutralGradientController } from "./emotions/neutralGradient";
import {
  applyUiGradientLayer,
  ensureUiGradientLayer,
  getUiGradient,
  UI_GRADIENTS,
  uiGradientCss,
} from "./emotions/uiGradients";
import {
  captureEmotionJpeg,
  createImageFrameSource,
  createVideoFrameSource,
  paintFreezeFrame,
  type FrameSource,
} from "./screenshot";
import { playShutterSound } from "./shutterSound";
import {
  createEmotionVideoRecorder,
  downloadVideoBlob,
  type EmotionVideoRecorder,
} from "./videoRecorder";

type OverlayMode = "auto" | string;
type SourceMode = "camera" | "upload";
type DockView = "live" | "review";
type ReviewKind = "photo" | "video" | null;

const LONG_PRESS_MS = 500;

const AUTO_GRADIENT_PREVIEW =
  "linear-gradient(135deg, #6366f1 0%, #ec4899 100%)";

function applyOverlay(
  overlay: HTMLElement,
  auraLayer: HTMLElement,
  uiGradientLayer: HTMLElement,
  emotion: EmotionKind,
  overlayMode: OverlayMode,
  neutralGradient: ReturnType<typeof createNeutralGradientController>,
  animateNeutral = true
): void {
  overlay.classList.remove("is-angry", "is-sad", "is-happy", "is-neutral");
  overlay.classList.add(`is-${emotion}`);

  if (overlayMode !== "auto") {
    neutralGradient.stop();
    const g = getUiGradient(overlayMode);
    applyUiGradientLayer(uiGradientLayer, g ?? null);
    setAuraLayerVisible(auraLayer, false);
    return;
  }

  applyUiGradientLayer(uiGradientLayer, null);
  setAuraLayerVisible(auraLayer, true);

  if (emotion === "neutral") {
    if (animateNeutral) {
      neutralGradient.start(auraLayer);
    } else {
      neutralGradient.stop();
      applyAuraPreset(auraLayer, "neutral");
    }
  } else {
    neutralGradient.stop();
    applyAuraPreset(auraLayer, emotion);
  }
}

function updatePanel(
  card: HTMLElement,
  labelEn: HTMLElement,
  labelZh: HTMLElement,
  swatch: HTMLElement,
  emotion: EmotionState,
  overlayMode: OverlayMode
): void {
  card.className = `emotion-inline emotion-${emotion.kind}`;
  labelEn.textContent = emotion.labelEn;
  labelZh.textContent = emotion.labelZh;
  if (overlayMode !== "auto") {
    const g = getUiGradient(overlayMode);
    swatch.style.background = g ? uiGradientCss(g) : getAuraSwatch(emotion.kind);
  } else {
    swatch.style.background = getAuraSwatch(emotion.kind);
  }
}

function buildGradientDropdown(
  menu: HTMLElement,
  triggerSwatch: HTMLElement,
  triggerName: HTMLElement,
  triggerBtn: HTMLButtonElement,
  onSelect: (mode: OverlayMode) => void
): void {
  menu.innerHTML = "";

  const addItem = (mode: OverlayMode, preview: string, label: string): void => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.dataset.gradientId = mode;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gradient-dropdown-item";
    btn.innerHTML = `<span class="gradient-item-swatch"></span><span class="gradient-item-name"></span>`;
    const swatch = btn.querySelector<HTMLElement>(".gradient-item-swatch")!;
    const name = btn.querySelector<HTMLElement>(".gradient-item-name")!;
    swatch.style.background = preview;
    name.textContent = label;

    btn.addEventListener("click", () => {
      onSelect(mode);
      triggerSwatch.style.background = preview;
      triggerName.textContent = label;
      menu.querySelectorAll(".gradient-dropdown-item").forEach((el) => {
        el.classList.toggle("is-active", el === btn);
      });
      menu.hidden = true;
      triggerBtn.setAttribute("aria-expanded", "false");
    });

    if (mode === "auto") btn.classList.add("is-active");
    li.appendChild(btn);
    menu.appendChild(li);
  };

  addItem("auto", AUTO_GRADIENT_PREVIEW, "Auto / 自動");
  for (const g of UI_GRADIENTS) {
    addItem(g.id, uiGradientCss(g), g.name);
  }

  triggerSwatch.style.background = AUTO_GRADIENT_PREVIEW;
  triggerName.textContent = "Auto / 自動";
}

function flashCapture(flashEl: HTMLElement): void {
  flashEl.classList.add("is-flashing");
  window.setTimeout(() => flashEl.classList.remove("is-flashing"), 280);
}

async function bootstrap(): Promise<void> {
  const msg = document.getElementById("msg");
  const video = document.querySelector("video#camera");
  const overlay = document.getElementById("emotion-overlay");
  const videoStage = document.querySelector(".video-stage");
  const emotionCard = document.getElementById("emotion-card");
  const labelEn = document.getElementById("emotion-label-en");
  const labelZh = document.getElementById("emotion-label-zh");
  const swatch = document.getElementById("emotion-swatch");
  const gradientMenu = document.getElementById("gradient-dropdown-menu");
  const gradientTrigger = document.getElementById("gradient-dropdown-trigger");
  const gradientTriggerSwatch = document.getElementById("gradient-trigger-swatch");
  const gradientTriggerName = document.getElementById("gradient-trigger-name");
  const btnShutter = document.getElementById("btn-shutter");
  const btnShutterWrap = document.getElementById("btn-shutter-wrap");
  const shutterIconCamera = document.querySelector(".shutter-icon-camera");
  const shutterIconRecord = document.querySelector(".shutter-icon-record");
  const liveShutter = document.getElementById("live-shutter");
  const reviewShutter = document.getElementById("review-shutter");
  const btnReviewDownload = document.getElementById("btn-review-download");
  const btnReviewCancel = document.getElementById("btn-review-cancel");
  const reviewIconCancel = document.querySelector(".review-icon-cancel");
  const reviewIconDelete = document.querySelector(".review-icon-delete");
  const captureFlash = document.getElementById("capture-flash");
  const captureFreeze = document.getElementById("capture-freeze");
  const recordedPlayback = document.getElementById("recorded-playback");
  const uploadedPhoto = document.getElementById("uploaded-photo");
  const photoUploadInput = document.getElementById("photo-upload-input");
  const btnUploadPhoto = document.getElementById("btn-upload-photo");

  if (
    !(msg instanceof HTMLElement) ||
    !(video instanceof HTMLVideoElement) ||
    !(overlay instanceof HTMLElement) ||
    !(videoStage instanceof HTMLElement) ||
    !(emotionCard instanceof HTMLElement) ||
    !(labelEn instanceof HTMLElement) ||
    !(labelZh instanceof HTMLElement) ||
    !(swatch instanceof HTMLElement) ||
    !(gradientMenu instanceof HTMLUListElement) ||
    !(gradientTrigger instanceof HTMLButtonElement) ||
    !(gradientTriggerSwatch instanceof HTMLElement) ||
    !(gradientTriggerName instanceof HTMLElement) ||
    !(btnShutter instanceof HTMLButtonElement) ||
    !(btnShutterWrap instanceof HTMLElement) ||
    !(shutterIconCamera instanceof SVGElement) ||
    !(shutterIconRecord instanceof SVGElement) ||
    !(liveShutter instanceof HTMLElement) ||
    !(reviewShutter instanceof HTMLElement) ||
    !(btnReviewDownload instanceof HTMLButtonElement) ||
    !(btnReviewCancel instanceof HTMLButtonElement) ||
    !(reviewIconCancel instanceof SVGElement) ||
    !(reviewIconDelete instanceof SVGElement) ||
    !(captureFlash instanceof HTMLElement) ||
    !(captureFreeze instanceof HTMLCanvasElement) ||
    !(recordedPlayback instanceof HTMLVideoElement) ||
    !(uploadedPhoto instanceof HTMLImageElement) ||
    !(photoUploadInput instanceof HTMLInputElement) ||
    !(btnUploadPhoto instanceof HTMLButtonElement)
  ) {
    // #region agent log
    fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:bootstrap',message:'dom check failed',data:{msg:msg instanceof HTMLElement,video:video instanceof HTMLVideoElement,btnShutter:btnShutter instanceof HTMLButtonElement,reviewShutter:reviewShutter instanceof HTMLElement,captureFlash:captureFlash instanceof HTMLElement,captureFreeze:captureFreeze instanceof HTMLCanvasElement},timestamp:Date.now(),hypothesisId:'H-dom',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    throw new Error("Page structure is incomplete.");
  }

  const videoEl = video;
  const msgEl = msg;
  const overlayEl = overlay;
  const videoStageEl = videoStage;
  const emotionCardEl = emotionCard;
  const labelEnEl = labelEn;
  const labelZhEl = labelZh;
  const swatchEl = swatch;
  const gradientMenuEl = gradientMenu;
  const gradientTriggerEl = gradientTrigger;
  const gradientTriggerSwatchEl = gradientTriggerSwatch;
  const gradientTriggerNameEl = gradientTriggerName;
  const btnShutterEl = btnShutter;
  const btnShutterWrapEl = btnShutterWrap;
  const shutterIconCameraEl = shutterIconCamera;
  const shutterIconRecordEl = shutterIconRecord;
  const liveShutterEl = liveShutter;
  const reviewShutterEl = reviewShutter;
  const btnReviewDownloadEl = btnReviewDownload;
  const btnReviewCancelEl = btnReviewCancel;
  const reviewIconCancelEl = reviewIconCancel;
  const reviewIconDeleteEl = reviewIconDelete;
  const captureFlashEl = captureFlash;
  const captureFreezeEl = captureFreeze;
  const recordedPlaybackEl = recordedPlayback;
  const uploadedPhotoEl = uploadedPhoto;
  const photoUploadInputEl = photoUploadInput;
  const btnUploadPhotoEl = btnUploadPhoto;

  overlayEl.dataset.uiGradient = "auto";
  const auraLayer = ensureAuraLayer(overlayEl);
  const uiGradientLayer = ensureUiGradientLayer(overlayEl);
  const smoother = createEmotionSmoother();
  const mouthTracker = createMouthMotionTracker();
  const browTracker = createBrowMotionTracker();
  const neutralGradient = createNeutralGradientController();
  let detector: Awaited<ReturnType<typeof createFaceDetector>> | null = null;
  let cameraActive = false;
  let uploadActive = false;
  let sourceMode: SourceMode = "camera";
  let currentEmotion: EmotionKind = "neutral";
  let overlayMode: OverlayMode = "auto";
  let lastOverlayKey = "";
  let lastLoggedKind: EmotionKind | null = null;
  let frameFrozen = false;
  let isRecording = false;
  let reviewKind: ReviewKind = null;
  let recordedVideoBlob: Blob | null = null;
  let recordedVideoMime = "video/webm";
  let longPressTriggered = false;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let videoRecorder: EmotionVideoRecorder | null = null;
  let recordedPlaybackUrl: string | null = null;
  let activePointerId: number | null = null;
  let finishingRecording = false;

  const clearReviewVideo = (): void => {
    recordedVideoBlob = null;
    recordedVideoMime = "video/webm";
    reviewKind = null;
    if (recordedPlaybackUrl) {
      URL.revokeObjectURL(recordedPlaybackUrl);
      recordedPlaybackUrl = null;
    }
    recordedPlaybackEl.pause();
    recordedPlaybackEl.removeAttribute("src");
    recordedPlaybackEl.hidden = true;
    videoStageEl.classList.remove("is-playback-mode");
    overlayEl.style.visibility = "";
  };

  const setReviewButtons = (kind: ReviewKind): void => {
    const isVideo = kind === "video";
    btnReviewCancelEl.classList.toggle("is-delete", isVideo);
    btnReviewCancelEl.classList.toggle("is-cancel", !isVideo);
    btnReviewCancelEl.setAttribute(
      "aria-label",
      isVideo ? "Delete / 刪除" : "Cancel / 取消"
    );
    if (isVideo) {
      reviewIconCancelEl.setAttribute("hidden", "");
      reviewIconDeleteEl.removeAttribute("hidden");
    } else {
      reviewIconDeleteEl.setAttribute("hidden", "");
      reviewIconCancelEl.removeAttribute("hidden");
    }
  };

  const setRecordingUi = (recording: boolean, progress = 0): void => {
    btnShutterWrapEl.classList.toggle("is-recording", recording);
    btnShutterEl.classList.toggle("is-recording", recording);
    if (recording) {
      shutterIconCameraEl.setAttribute("hidden", "");
      shutterIconRecordEl.removeAttribute("hidden");
    } else {
      shutterIconRecordEl.setAttribute("hidden", "");
      shutterIconCameraEl.removeAttribute("hidden");
    }
    btnShutterWrapEl.style.setProperty("--countdown-progress", String(progress));
  };

  const showVideoReview = (blob: Blob, mimeType: string): void => {
    recordedVideoBlob = blob;
    recordedVideoMime = mimeType;
    reviewKind = "video";

    if (recordedPlaybackUrl) URL.revokeObjectURL(recordedPlaybackUrl);
    recordedPlaybackUrl = URL.createObjectURL(blob);
    recordedPlaybackEl.src = recordedPlaybackUrl;
    recordedPlaybackEl.hidden = false;
    recordedPlaybackEl.loop = true;
    void recordedPlaybackEl.play();

    videoEl.pause();
    overlayEl.style.visibility = "hidden";
    videoStageEl.classList.add("is-playback-mode");
    setReviewButtons("video");
    setShutterDock("review");
    btnShutterEl.disabled = true;
    msgEl.textContent = "Preview / 預覽錄影";
    // #region agent log
    fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:playback',message:'video playback started',data:{blobSize:blob.size,mime:mimeType},timestamp:Date.now(),hypothesisId:'H-playback',runId:'post-fix'})}).catch(()=>{});
    // #endregion
  };

  const exitVideoReview = async (): Promise<void> => {
    setReviewButtons(null);
    btnShutterEl.disabled = false;
    await resumeLivePreview();
    msgEl.textContent = "Camera active / 鏡頭已開啟";
  };

  function captureReady(): boolean {
    return cameraActive || uploadActive;
  }

  const getFrameSource = (): FrameSource => {
    if (sourceMode === "upload") {
      return createImageFrameSource(uploadedPhotoEl);
    }
    return createVideoFrameSource(videoEl);
  };

  const setShutterDock = (view: DockView): void => {
    liveShutterEl.hidden = view !== "live";
    reviewShutterEl.hidden = view !== "review";
  };

  const showUploadMode = (): void => {
    sourceMode = "upload";
    uploadActive = true;
    videoStageEl.classList.add("is-upload-mode");
    uploadedPhotoEl.hidden = false;
    setReviewButtons(null);
    setShutterDock("review");
    neutralGradient.stop();
    refreshOverlay();
    msgEl.textContent = "Photo loaded / 照片已載入";
  };

  const showCameraMode = (): void => {
    sourceMode = "camera";
    uploadActive = false;
    frameFrozen = false;
    clearReviewVideo();
    captureFreezeEl.classList.remove("is-visible");
    videoStageEl.classList.remove("is-frozen");
    videoStageEl.classList.remove("is-upload-mode");
    uploadedPhotoEl.hidden = true;
    uploadedPhotoEl.removeAttribute("src");
    setReviewButtons(null);
    setShutterDock("live");
    if (cameraActive) {
      btnShutterEl.disabled = false;
      void videoEl.play();
    }
    refreshOverlay();
    msgEl.textContent = cameraActive
      ? "Camera active / 鏡頭已開啟"
      : msgEl.textContent;
  };

  const resumeLivePreview = async (): Promise<boolean> => {
    frameFrozen = false;
    clearReviewVideo();
    captureFreezeEl.classList.remove("is-visible");
    videoStageEl.classList.remove("is-frozen");
    setShutterDock("live");

    if (sourceMode === "camera") {
      let playOk = false;
      let restarted = false;
      try {
        await videoEl.play();
        playOk = !videoEl.paused;
      } catch {
        playOk = false;
      }

      if (!playOk) {
        try {
          await startCamera(videoEl);
          playOk = true;
          restarted = true;
          cameraActive = true;
          videoStageEl.classList.add("is-active");
          btnShutterEl.disabled = false;
        } catch (e) {
          cameraActive = false;
          btnShutterEl.disabled = true;
          videoStageEl.classList.remove("is-active");
          msgEl.textContent =
            e instanceof Error
              ? e.message
              : "Camera resume failed / 鏡頭恢復失敗";
          // #region agent log
          fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:resume',message:'camera resume failed',data:{error:e instanceof Error?e.message:String(e)},timestamp:Date.now(),hypothesisId:'H-resume',runId:'post-fix'})}).catch(()=>{});
          // #endregion
          return false;
        }
      }

      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:resume',message:'camera resumed',data:{videoPaused:videoEl.paused,videoWidth:videoEl.videoWidth,restarted},timestamp:Date.now(),hypothesisId:'H-resume',runId:'post-fix'})}).catch(()=>{});
      // #endregion
    }

    refreshOverlay();
    return true;
  };

  function refreshOverlay(): void {
    lastOverlayKey = "";
    syncOverlay(currentEmotion);
  }

  function syncOverlay(emotion: EmotionKind): void {
    const key = `${emotion}:${overlayMode}`;
    if (key === lastOverlayKey) return;
    lastOverlayKey = key;
    currentEmotion = emotion;
    applyOverlay(
      overlayEl,
      auraLayer,
      uiGradientLayer,
      emotion,
      overlayMode,
      neutralGradient,
      sourceMode === "camera"
    );
  }

  function logEmotionIfChanged(emotion: EmotionState): void {
    if (emotion.kind === lastLoggedKind) return;
    lastLoggedKind = emotion.kind;
    // #region agent log
    fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:emotion',message:'emotion changed',data:{kind:emotion.kind,mouthDelta:emotion.debug.mouthDelta,mouthFrown:emotion.debug.mouthFrown,browInnerUp:emotion.debug.browInnerUp,browTwitch:emotion.debug.browTwitch,browFurrow:emotion.debug.browFurrow,jawOpen:emotion.debug.jawOpen,eyeWide:emotion.debug.eyeWide,scores:emotion.scores,overlayMode},timestamp:Date.now(),hypothesisId:'H-emotion'})}).catch(()=>{});
    // #endregion
  }

  buildGradientDropdown(
    gradientMenuEl,
    gradientTriggerSwatchEl,
    gradientTriggerNameEl,
    gradientTriggerEl,
    (mode) => {
      overlayMode = mode;
      overlayEl.dataset.uiGradient = mode;
      refreshOverlay();
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:gradient',message:'gradient selected',data:{mode},timestamp:Date.now(),hypothesisId:'H-gradient'})}).catch(()=>{});
      // #endregion
    }
  );

  gradientTriggerEl.addEventListener("click", () => {
    const open = gradientMenuEl.hidden;
    gradientMenuEl.hidden = !open;
    gradientTriggerEl.setAttribute("aria-expanded", open ? "true" : "false");
  });

  document.addEventListener("click", (e) => {
    if (
      !gradientMenuEl.hidden &&
      e.target instanceof Node &&
      !gradientTriggerEl.contains(e.target) &&
      !gradientMenuEl.contains(e.target)
    ) {
      gradientMenuEl.hidden = true;
      gradientTriggerEl.setAttribute("aria-expanded", "false");
    }
  });

  applyOverlay(
    overlayEl,
    auraLayer,
    uiGradientLayer,
    "neutral",
    overlayMode,
    neutralGradient
  );
  lastOverlayKey = "neutral:auto";

  updatePanel(emotionCardEl, labelEnEl, labelZhEl, swatchEl, {
    kind: "neutral",
    labelEn: "Neutral",
    labelZh: "中性",
    scores: { angry: 0, sad: 0, happy: 0 },
    debug: { mouthDelta: 0, mouthFrown: 0, browDown: 0, browFurrow: 0, browInnerUp: 0, browTwitch: 0, jawOpen: 0, eyeWide: 0 },
  }, overlayMode);

  const capturePhoto = async (): Promise<void> => {
    if (!captureReady() || sourceMode !== "camera" || frameFrozen || isRecording) return;

    await playShutterSound();
    flashCapture(captureFlashEl);
    const painted = paintFreezeFrame(
      captureFreezeEl,
      getFrameSource(),
      overlayEl,
      currentEmotion,
      overlayMode,
      videoStageEl
    );
    if (!painted) {
      msgEl.textContent = "Capture failed / 拍照失敗，請再試一次";
      return;
    }
    captureFreezeEl.classList.add("is-visible");
    frameFrozen = true;
    reviewKind = "photo";
    setReviewButtons("photo");
    neutralGradient.stop();
    videoEl.pause();
    videoStageEl.classList.add("is-frozen");
    setShutterDock("review");
    msgEl.textContent = "Ready to save / 可以儲存了";
  };

  const beginRecording = async (pointerId: number): Promise<void> => {
    if (!captureReady() || sourceMode !== "camera" || frameFrozen || isRecording) return;

    isRecording = true;
    longPressTriggered = true;
    finishingRecording = false;
    activePointerId = pointerId;
    btnShutterEl.setPointerCapture(pointerId);
    btnShutterEl.disabled = true;
    setRecordingUi(true, 0);
    msgEl.textContent = "Recording… release to stop / 錄影中，放開停止";

    videoRecorder = createEmotionVideoRecorder({
      video: videoEl,
      overlayEl,
      stageEl: videoStageEl,
      getEmotion: () => currentEmotion,
      getOverlayMode: () => overlayMode,
      onProgress: (remainingSec, progress) => {
        setRecordingUi(true, progress);
        msgEl.textContent = `Recording ${remainingSec}s / 錄影中 ${remainingSec} 秒`;
      },
      onMaxDuration: (blob) => {
        void finishRecording(blob);
      },
    });

    try {
      await videoRecorder.start();
    } catch (e) {
      isRecording = false;
      longPressTriggered = false;
      activePointerId = null;
      setRecordingUi(false, 0);
      btnShutterEl.disabled = !cameraActive;
      msgEl.textContent =
        e instanceof Error ? e.message : "Recording failed / 錄影失敗";
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:record',message:'recording start error',data:{error:e instanceof Error?e.message:String(e)},timestamp:Date.now(),hypothesisId:'H-record',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      videoRecorder = null;
    }
  };

  const finishRecording = async (maxDurationBlob?: Blob): Promise<void> => {
    if (finishingRecording) return;
    if (!isRecording && !maxDurationBlob) return;

    finishingRecording = true;
    const recorder = videoRecorder;
    videoRecorder = null;

    if (activePointerId !== null && btnShutterEl.hasPointerCapture(activePointerId)) {
      btnShutterEl.releasePointerCapture(activePointerId);
    }
    activePointerId = null;

    let blob = maxDurationBlob ?? null;
    if (!blob && recorder) {
      try {
        blob = await recorder.stop();
      } catch (e) {
        isRecording = false;
        finishingRecording = false;
        longPressTriggered = false;
        setRecordingUi(false, 0);
        btnShutterEl.disabled = !cameraActive;
        msgEl.textContent =
          e instanceof Error ? e.message : "Recording failed / 錄影失敗";
        return;
      }
    }

    isRecording = false;
    finishingRecording = false;
    longPressTriggered = false;
    setRecordingUi(false, 0);

    if (!blob || blob.size === 0) {
      btnShutterEl.disabled = !cameraActive;
      msgEl.textContent = "Recording failed / 錄影失敗";
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:record',message:'recording empty blob',data:{},timestamp:Date.now(),hypothesisId:'H-record',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      return;
    }

    showVideoReview(blob, blob.type || "video/webm");
    // #region agent log
    fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:record',message:'recording ready for review',data:{blobSize:blob.size,mime:blob.type},timestamp:Date.now(),hypothesisId:'H-record',runId:'post-fix'})}).catch(()=>{});
    // #endregion
  };

  const clearLongPressTimer = (): void => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const releasePointerIfHeld = (pointerId: number): void => {
    if (activePointerId === pointerId && btnShutterEl.hasPointerCapture(pointerId)) {
      btnShutterEl.releasePointerCapture(pointerId);
      activePointerId = null;
    }
  };

  btnShutterEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (!captureReady() || sourceMode !== "camera" || frameFrozen || isRecording) return;

    longPressTriggered = false;
    clearLongPressTimer();
    const pointerId = e.pointerId;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      void beginRecording(pointerId);
    }, LONG_PRESS_MS);
  });

  const handlePointerRelease = (e: PointerEvent): void => {
    if (isRecording) {
      void finishRecording();
      return;
    }
    releasePointerIfHeld(e.pointerId);
    if (!longPressTriggered) clearLongPressTimer();
  };

  btnShutterEl.addEventListener("pointerup", handlePointerRelease);
  btnShutterEl.addEventListener("pointercancel", handlePointerRelease);
  btnShutterEl.addEventListener("pointerleave", () => {
    if (isRecording) return;
    if (!longPressTriggered) clearLongPressTimer();
  });

  btnShutterEl.addEventListener("click", async () => {
    // #region agent log
    fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:shutter',message:'shutter click',data:{captureReady:captureReady(),sourceMode,disabled:btnShutterEl.disabled,frameFrozen,isRecording,longPressTriggered},timestamp:Date.now(),hypothesisId:'H-shutter',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    if (longPressTriggered || isRecording) {
      longPressTriggered = false;
      return;
    }
    await capturePhoto();
  });

  btnUploadPhotoEl.addEventListener("click", () => {
    photoUploadInputEl.click();
  });

  btnReviewDownloadEl.addEventListener("click", async () => {
    if (sourceMode === "upload" && !uploadActive) return;
    if (reviewKind === "video" && recordedVideoBlob) {
      msgEl.textContent = "Saving video… / 儲存影片中…";
      try {
        downloadVideoBlob(recordedVideoBlob, recordedVideoMime);
        msgEl.textContent = "Video saved! / 影片已下載";
        // #region agent log
        fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:review',message:'video saved',data:{blobSize:recordedVideoBlob.size,mime:recordedVideoMime},timestamp:Date.now(),hypothesisId:'H-record',runId:'post-fix'})}).catch(()=>{});
        // #endregion
        await exitVideoReview();
      } catch (e) {
        msgEl.textContent =
          e instanceof Error ? e.message : "Save failed / 儲存失敗";
      }
      return;
    }
    if (sourceMode === "camera" && !frameFrozen) return;
    msgEl.textContent = "Saving JPG… / 儲存中…";
    try {
      await captureEmotionJpeg(
        getFrameSource(),
        overlayEl,
        currentEmotion,
        overlayMode,
        videoStageEl
      );
      msgEl.textContent = "Saved! / 已儲存至下載資料夾";
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:review',message:'photo saved',data:{sourceMode,emotion:currentEmotion,overlayMode},timestamp:Date.now(),hypothesisId:'H-shutter',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      if (sourceMode === "camera") {
        await resumeLivePreview();
      }
    } catch (e) {
      msgEl.textContent =
        e instanceof Error ? e.message : "Save failed / 儲存失敗";
    }
  });

  btnReviewCancelEl.addEventListener("click", async () => {
    // #region agent log
    fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:review',message:'review cancelled',data:{sourceMode,frameFrozen,reviewKind},timestamp:Date.now(),hypothesisId:'H-shutter',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    if (sourceMode === "upload") {
      showCameraMode();
      return;
    }
    if (reviewKind === "video") {
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:review',message:'video deleted',data:{},timestamp:Date.now(),hypothesisId:'H-playback',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      await exitVideoReview();
      return;
    }
    if (frameFrozen) {
      await resumeLivePreview();
      msgEl.textContent = "Camera active / 鏡頭已開啟";
    }
  });

  photoUploadInputEl.addEventListener("change", () => {
    const file = photoUploadInputEl.files?.[0];
    photoUploadInputEl.value = "";
    if (!file || !file.type.startsWith("image/")) {
      msgEl.textContent = "Please choose an image / 請選擇圖片";
      return;
    }

    const url = URL.createObjectURL(file);
    uploadedPhotoEl.onload = () => {
      URL.revokeObjectURL(url);
      showUploadMode();
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:upload',message:'photo loaded',data:{width:uploadedPhotoEl.naturalWidth,height:uploadedPhotoEl.naturalHeight,overlayMode},timestamp:Date.now(),hypothesisId:'H-upload',runId:'post-fix'})}).catch(()=>{});
      // #endregion
    };
    uploadedPhotoEl.onerror = () => {
      URL.revokeObjectURL(url);
      msgEl.textContent = "Could not load image / 無法載入圖片";
    };
    uploadedPhotoEl.src = url;
  });

  const startApp = async (): Promise<void> => {
    msgEl.textContent = "Loading face model… / 載入臉部模型中…";

    try {
      await startCamera(videoEl);
      videoStageEl.classList.add("is-active");
      cameraActive = true;
      btnShutterEl.disabled = false;
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:startApp',message:'camera started',data:{videoWidth:videoEl.videoWidth,videoHeight:videoEl.videoHeight,paused:videoEl.paused},timestamp:Date.now(),hypothesisId:'H-camera',runId:'post-fix'})}).catch(()=>{});
      // #endregion

      detector = await createFaceDetector();
      msgEl.textContent = "Camera active / 鏡頭已開啟";

      const loop = (): void => {
        if (frameFrozen || sourceMode === "upload" || reviewKind === "video") {
          requestAnimationFrame(loop);
          return;
        }

        if (!detector || videoEl.videoWidth <= 0) {
          requestAnimationFrame(loop);
          return;
        }

        const nowMs = performance.now();
        const faceRes = detector.face.detectForVideo(videoEl, nowMs);
        const blend = faceRes.faceBlendshapes[0];

        if (!blend || faceRes.faceLandmarks.length === 0) {
          smoother.reset();
          mouthTracker.reset();
          browTracker.reset();
          syncOverlay("neutral");
          const neutral: EmotionState = {
            kind: "neutral",
            labelEn: "Neutral",
            labelZh: "中性",
            scores: { angry: 0, sad: 0, happy: 0 },
            debug: { mouthDelta: 0, mouthFrown: 0, browDown: 0, browFurrow: 0, browInnerUp: 0, browTwitch: 0, jawOpen: 0, eyeWide: 0 },
          };
          updatePanel(emotionCardEl, labelEnEl, labelZhEl, swatchEl, neutral, overlayMode);
        } else {
          const landmarks = faceRes.faceLandmarks[0]!;
          const raw = classifyEmotion(blend, landmarks, mouthTracker, browTracker);
          const emotion = smoother.update(raw);
          syncOverlay(emotion.kind);
          logEmotionIfChanged(emotion);
          updatePanel(emotionCardEl, labelEnEl, labelZhEl, swatchEl, emotion, overlayMode);
        }

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      videoStageEl.classList.remove("is-active");
      cameraActive = false;
      btnShutterEl.disabled = true;
      msgEl.textContent =
        e instanceof Error
          ? e.message
          : "Could not start. Allow camera access / 請允許鏡頭權限";
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:startApp',message:'camera start failed',data:{error:e instanceof Error?e.message:String(e)},timestamp:Date.now(),hypothesisId:'H-camera',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      disposeCamera(videoEl);
      detector?.close();
      smoother.reset();
      mouthTracker.reset();
      browTracker.reset();
    }
  }

  void startApp();
}

void bootstrap();
