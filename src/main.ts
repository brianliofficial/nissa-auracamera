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
import { captureEmotionJpeg, paintFreezeFrame } from "./screenshot";
import { playShutterSound } from "./shutterSound";

type OverlayMode = "auto" | string;
type ShutterMode = "capture" | "download";

const AUTO_GRADIENT_PREVIEW =
  "linear-gradient(135deg, #6366f1 0%, #ec4899 100%)";

function applyOverlay(
  overlay: HTMLElement,
  auraLayer: HTMLElement,
  uiGradientLayer: HTMLElement,
  emotion: EmotionKind,
  overlayMode: OverlayMode,
  neutralGradient: ReturnType<typeof createNeutralGradientController>
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
    neutralGradient.start(auraLayer);
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
  card.className = `emotion-card emotion-${emotion.kind}`;
  labelEn.textContent = emotion.labelEn;
  labelZh.textContent = emotion.labelZh;
  if (overlayMode !== "auto") {
    const g = getUiGradient(overlayMode);
    swatch.style.background = g ? uiGradientCss(g) : getAuraSwatch(emotion.kind);
  } else {
    swatch.style.background = getAuraSwatch(emotion.kind);
  }
}

function updateScores(
  scoreList: HTMLElement,
  emotion: EmotionState
): void {
  scoreList.innerHTML = "";
  const entries: [string, number | string][] = [
    ["Angry / 生氣", emotion.scores.angry],
    ["Sad / 難過", emotion.scores.sad],
    ["Happy / 開心", emotion.scores.happy],
    ["Mouth Δ / 嘴巴浮動", emotion.debug.mouthDelta.toFixed(3)],
    ["Brow furrow / 皺眉", emotion.debug.browFurrow.toFixed(2)],
    ["Jaw open / 張嘴", emotion.debug.jawOpen.toFixed(2)],
    ["Eye wide / 瞪眼", emotion.debug.eyeWide.toFixed(2)],
  ];
  for (const [label, value] of entries) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = typeof value === "number" ? value.toFixed(2) : value;
    row.append(dt, dd);
    scoreList.appendChild(row);
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

function setShutterMode(
  btn: HTMLButtonElement,
  cameraIcon: Element,
  downloadIcon: Element,
  mode: ShutterMode
): void {
  if (mode === "capture") {
    btn.classList.remove("is-download");
    btn.dataset.mode = "capture";
    btn.setAttribute("aria-label", "Capture photo / 拍照");
    cameraIcon.removeAttribute("hidden");
    downloadIcon.setAttribute("hidden", "");
  } else {
    btn.classList.add("is-download");
    btn.dataset.mode = "download";
    btn.setAttribute("aria-label", "Save photo / 儲存圖片");
    cameraIcon.setAttribute("hidden", "");
    downloadIcon.removeAttribute("hidden");
  }
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
  const scoreList = document.getElementById("score-list");
  const gradientMenu = document.getElementById("gradient-dropdown-menu");
  const gradientTrigger = document.getElementById("gradient-dropdown-trigger");
  const gradientTriggerSwatch = document.getElementById("gradient-trigger-swatch");
  const gradientTriggerName = document.getElementById("gradient-trigger-name");
  const btnShutter = document.getElementById("btn-shutter");
  const shutterCameraIcon = btnShutter?.querySelector(".btn-shutter-icon-camera");
  const shutterDownloadIcon = btnShutter?.querySelector(".btn-shutter-icon-download");
  const captureFlash = document.getElementById("capture-flash");
  const captureFreeze = document.getElementById("capture-freeze");

  if (
    !(msg instanceof HTMLElement) ||
    !(video instanceof HTMLVideoElement) ||
    !(overlay instanceof HTMLElement) ||
    !(videoStage instanceof HTMLElement) ||
    !(emotionCard instanceof HTMLElement) ||
    !(labelEn instanceof HTMLElement) ||
    !(labelZh instanceof HTMLElement) ||
    !(swatch instanceof HTMLElement) ||
    !(scoreList instanceof HTMLElement) ||
    !(gradientMenu instanceof HTMLUListElement) ||
    !(gradientTrigger instanceof HTMLButtonElement) ||
    !(gradientTriggerSwatch instanceof HTMLElement) ||
    !(gradientTriggerName instanceof HTMLElement) ||
    !(btnShutter instanceof HTMLButtonElement) ||
    !(shutterCameraIcon instanceof SVGElement) ||
    !(shutterDownloadIcon instanceof SVGElement) ||
    !(captureFlash instanceof HTMLElement) ||
    !(captureFreeze instanceof HTMLCanvasElement)
  ) {
    // #region agent log
    fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:bootstrap',message:'dom check failed',data:{msg:msg instanceof HTMLElement,video:video instanceof HTMLVideoElement,overlay:overlay instanceof HTMLElement,videoStage:videoStage instanceof HTMLElement,btnShutter:btnShutter instanceof HTMLButtonElement,cameraIcon:shutterCameraIcon instanceof SVGElement,downloadIcon:shutterDownloadIcon instanceof SVGElement,captureFlash:captureFlash instanceof HTMLElement,captureFreeze:captureFreeze instanceof HTMLCanvasElement},timestamp:Date.now(),hypothesisId:'H-dom',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    throw new Error("Page structure is incomplete.");
  }

  const overlayEl = overlay;
  overlayEl.dataset.uiGradient = "auto";
  const auraLayer = ensureAuraLayer(overlayEl);
  const uiGradientLayer = ensureUiGradientLayer(overlayEl);
  const smoother = createEmotionSmoother();
  const mouthTracker = createMouthMotionTracker();
  const neutralGradient = createNeutralGradientController();
  let detector: Awaited<ReturnType<typeof createFaceDetector>> | null = null;
  let cameraActive = false;
  let currentEmotion: EmotionKind = "neutral";
  let overlayMode: OverlayMode = "auto";
  let lastOverlayKey = "";
  let lastLoggedKind: EmotionKind | null = null;
  let shutterMode: ShutterMode = "capture";
  let frameFrozen = false;

  const resumeLivePreview = async (): Promise<boolean> => {
    frameFrozen = false;
    shutterMode = "capture";
    captureFreeze.classList.remove("is-visible");
    videoStage.classList.remove("is-frozen");
    setShutterMode(btnShutter, shutterCameraIcon, shutterDownloadIcon, "capture");

    let playOk = false;
    let restarted = false;
    try {
      await video.play();
      playOk = !video.paused;
    } catch {
      playOk = false;
    }

    if (!playOk) {
      try {
        await startCamera(video);
        playOk = true;
        restarted = true;
      } catch (e) {
        cameraActive = false;
        btnShutter.disabled = true;
        videoStage.classList.remove("is-active");
        msg.textContent =
          e instanceof Error
            ? e.message
            : "Camera resume failed / 鏡頭恢復失敗";
        // #region agent log
        fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:resume',message:'camera resume failed',data:{error:e instanceof Error?e.message:String(e)},timestamp:Date.now(),hypothesisId:'H-resume',runId:'post-fix'})}).catch(()=>{});
        // #endregion
        return false;
      }
    }

    refreshOverlay();
    // #region agent log
    fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:resume',message:'camera resumed',data:{videoPaused:video.paused,videoWidth:video.videoWidth,restarted},timestamp:Date.now(),hypothesisId:'H-resume',runId:'post-fix'})}).catch(()=>{});
    // #endregion
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
      neutralGradient
    );
  }

  function logEmotionIfChanged(emotion: EmotionState): void {
    if (emotion.kind === lastLoggedKind) return;
    lastLoggedKind = emotion.kind;
    // #region agent log
    fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:emotion',message:'emotion changed',data:{kind:emotion.kind,mouthDelta:emotion.debug.mouthDelta,browFurrow:emotion.debug.browFurrow,jawOpen:emotion.debug.jawOpen,eyeWide:emotion.debug.eyeWide,scores:emotion.scores,overlayMode},timestamp:Date.now(),hypothesisId:'H-emotion'})}).catch(()=>{});
    // #endregion
  }

  buildGradientDropdown(
    gradientMenu,
    gradientTriggerSwatch,
    gradientTriggerName,
    gradientTrigger,
    (mode) => {
      overlayMode = mode;
      overlayEl.dataset.uiGradient = mode;
      refreshOverlay();
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:gradient',message:'gradient selected',data:{mode},timestamp:Date.now(),hypothesisId:'H-gradient'})}).catch(()=>{});
      // #endregion
    }
  );

  gradientTrigger.addEventListener("click", () => {
    const open = gradientMenu.hidden;
    gradientMenu.hidden = !open;
    gradientTrigger.setAttribute("aria-expanded", open ? "true" : "false");
  });

  document.addEventListener("click", (e) => {
    if (
      !gradientMenu.hidden &&
      e.target instanceof Node &&
      !gradientTrigger.contains(e.target) &&
      !gradientMenu.contains(e.target)
    ) {
      gradientMenu.hidden = true;
      gradientTrigger.setAttribute("aria-expanded", "false");
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

  updatePanel(emotionCard, labelEn, labelZh, swatch, {
    kind: "neutral",
    labelEn: "Neutral",
    labelZh: "中性",
    scores: { angry: 0, sad: 0, happy: 0 },
    debug: { mouthDelta: 0, browDown: 0, browFurrow: 0, jawOpen: 0, eyeWide: 0 },
  }, overlayMode);

  btnShutter.addEventListener("click", async () => {
    // #region agent log
    fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:shutter',message:'shutter click',data:{cameraActive,shutterMode,disabled:btnShutter.disabled,frameFrozen},timestamp:Date.now(),hypothesisId:'H-shutter',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    if (!cameraActive) return;

    if (shutterMode === "capture") {
      await playShutterSound();
      flashCapture(captureFlash);
      const painted = paintFreezeFrame(
        captureFreeze,
        video,
        overlayEl,
        currentEmotion,
        videoStage
      );
      if (!painted) {
        msg.textContent = "Capture failed / 拍照失敗，請再試一次";
        // #region agent log
        fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:shutter',message:'freeze paint failed',data:{videoWidth:video.videoWidth,videoHeight:video.videoHeight,stageW:videoStage.clientWidth,stageH:videoStage.clientHeight},timestamp:Date.now(),hypothesisId:'H-freeze',runId:'post-fix'})}).catch(()=>{});
        // #endregion
        return;
      }
      captureFreeze.classList.add("is-visible");
      frameFrozen = true;
      neutralGradient.stop();
      video.pause();
      videoStage.classList.add("is-frozen");
      shutterMode = "download";
      setShutterMode(btnShutter, shutterCameraIcon, shutterDownloadIcon, "download");
      msg.textContent = "Ready to save / 可以儲存了";
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:shutter',message:'capture armed',data:{shutterMode:'download',videoPaused:video.paused,frameFrozen,freezeVisible:captureFreeze.classList.contains('is-visible')},timestamp:Date.now(),hypothesisId:'H-shutter',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      return;
    }

    msg.textContent = "Saving JPG… / 儲存中…";
    try {
      await captureEmotionJpeg(video, overlayEl, currentEmotion);
      msg.textContent = "Saved! / 已儲存至下載資料夾";
      await resumeLivePreview();
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:shutter',message:'photo saved',data:{emotion:currentEmotion},timestamp:Date.now(),hypothesisId:'H-shutter'})}).catch(()=>{});
      // #endregion
    } catch (e) {
      msg.textContent =
        e instanceof Error ? e.message : "Save failed / 儲存失敗";
    }
  });

  const startApp = async (): Promise<void> => {
    msg.textContent = "Loading face model… / 載入臉部模型中…";

    try {
      await startCamera(video);
      videoStage.classList.add("is-active");
      cameraActive = true;
      btnShutter.disabled = false;
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:startApp',message:'camera started',data:{videoWidth:video.videoWidth,videoHeight:video.videoHeight,paused:video.paused},timestamp:Date.now(),hypothesisId:'H-camera',runId:'post-fix'})}).catch(()=>{});
      // #endregion

      detector = await createFaceDetector();
      msg.textContent = "Camera active / 鏡頭已開啟";

      const loop = (): void => {
        if (frameFrozen) {
          requestAnimationFrame(loop);
          return;
        }

        if (!detector || video.videoWidth <= 0) {
          requestAnimationFrame(loop);
          return;
        }

        const nowMs = performance.now();
        const faceRes = detector.face.detectForVideo(video, nowMs);
        const blend = faceRes.faceBlendshapes[0];

        if (!blend || faceRes.faceLandmarks.length === 0) {
          smoother.reset();
          mouthTracker.reset();
          syncOverlay("neutral");
          const neutral: EmotionState = {
            kind: "neutral",
            labelEn: "Neutral",
            labelZh: "中性",
            scores: { angry: 0, sad: 0, happy: 0 },
            debug: { mouthDelta: 0, browDown: 0, browFurrow: 0, jawOpen: 0, eyeWide: 0 },
          };
          updatePanel(emotionCard, labelEn, labelZh, swatch, neutral, overlayMode);
          updateScores(scoreList, neutral);
        } else {
          const landmarks = faceRes.faceLandmarks[0]!;
          const raw = classifyEmotion(blend, landmarks, mouthTracker);
          const emotion = smoother.update(raw);
          syncOverlay(emotion.kind);
          logEmotionIfChanged(emotion);
          updatePanel(emotionCard, labelEn, labelZh, swatch, emotion, overlayMode);
          updateScores(scoreList, emotion);
        }

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      videoStage.classList.remove("is-active");
      cameraActive = false;
      btnShutter.disabled = true;
      msg.textContent =
        e instanceof Error
          ? e.message
          : "Could not start. Allow camera access / 請允許鏡頭權限";
      // #region agent log
      fetch('http://127.0.0.1:7381/ingest/21087eab-2b32-46f5-a111-0c3fa4b16ead',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'477950'},body:JSON.stringify({sessionId:'477950',location:'main.ts:startApp',message:'camera start failed',data:{error:e instanceof Error?e.message:String(e)},timestamp:Date.now(),hypothesisId:'H-camera',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      disposeCamera(video);
      detector?.close();
      smoother.reset();
      mouthTracker.reset();
    }
  }

  void startApp();
}

void bootstrap();
