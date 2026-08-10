let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

/** Short synthetic camera shutter click (no external asset). */
export async function playShutterSound(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  const t0 = ctx.currentTime;

  const burst = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  burst.buffer = buffer;

  const burstFilter = ctx.createBiquadFilter();
  burstFilter.type = "highpass";
  burstFilter.frequency.value = 900;

  const burstGain = ctx.createGain();
  burstGain.gain.setValueAtTime(0.55, t0);
  burstGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);

  burst.connect(burstFilter);
  burstFilter.connect(burstGain);
  burstGain.connect(ctx.destination);
  burst.start(t0);
  burst.stop(t0 + 0.07);

  const click = ctx.createOscillator();
  click.type = "square";
  click.frequency.setValueAtTime(1800, t0);
  click.frequency.exponentialRampToValueAtTime(400, t0 + 0.04);

  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.12, t0);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);

  click.connect(clickGain);
  clickGain.connect(ctx.destination);
  click.start(t0);
  click.stop(t0 + 0.05);
}
