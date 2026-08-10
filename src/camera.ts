const DEFAULT_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: "user",
    width: { ideal: 960 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
  audio: false,
};

export async function startCamera(video: HTMLVideoElement): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Camera access is not supported (requires HTTPS or localhost)."
    );
  }
  const stream = await navigator.mediaDevices.getUserMedia(
    DEFAULT_CONSTRAINTS
  );
  video.srcObject = stream;
  await video.play();
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
