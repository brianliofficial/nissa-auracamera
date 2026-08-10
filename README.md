# Emotion Mirror · 情緒鏡像

Webcam app that overlays your video with emotion-driven gradients and lets you save a JPG snapshot.

## Layout

- **Left 80%**: Live webcam + semi-transparent gradient overlay
- **Right 20%**: Emotion status (English + 中文) + Save JPG button

## Emotion overlays

| Emotion | 情緒 | Gradient |
|---------|------|----------|
| Angry | 生氣 | Red → orange (45deg) |
| Sad | 難過 | Blue → purple (45deg) |
| Happy | 開心 | Yellow → green (45deg) |
| Neutral | 中性 | Random colors at 45deg, cycling |

Detection uses MediaPipe Face Landmarker blendshapes in the browser.

## Run

```bash
npm install
npm run dev
```

Use Chrome or Edge on localhost and allow camera access.

## Save JPG

Click **Save JPG / 儲存圖片** to download the current frame with the gradient overlay baked in (mirrored like the preview).
