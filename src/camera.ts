export type CameraFacing = "user" | "environment";

const DEFAULT_FACING: CameraFacing = "user";

let currentFacing: CameraFacing = DEFAULT_FACING;

function buildConstraints(facing: CameraFacing): MediaStreamConstraints {
  return {
    video: {
      facingMode: facing,
      width: { ideal: 960 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  };
}

export function getCameraFacing(): CameraFacing {
  return currentFacing;
}

export function shouldMirrorCamera(): boolean {
  return currentFacing === "user";
}

export function isMobileLikeDevice(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches &&
    window.matchMedia("(max-width: 900px)").matches
  );
}

export async function hasMultipleCameras(): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput").length > 1;
}

export async function startCamera(
  video: HTMLVideoElement,
  facing: CameraFacing = currentFacing
): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Camera access is not supported (requires HTTPS or localhost)."
    );
  }
  currentFacing = facing;
  const stream = await navigator.mediaDevices.getUserMedia(
    buildConstraints(facing)
  );
  video.srcObject = stream;
  await video.play();
}

export async function switchCamera(
  video: HTMLVideoElement
): Promise<CameraFacing> {
  const next: CameraFacing =
    currentFacing === "user" ? "environment" : "user";
  disposeCamera(video);
  await startCamera(video, next);
  return next;
}

export function disposeCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject;
  video.srcObject = null;
  if (stream && "getTracks" in stream) {
    for (const t of stream.getTracks()) {
      t.stop();
    }
  }
}
