export type SirenLevel = {
  active: boolean;
  level: number;
};

export function createSirenAudio() {
  const context = new window.AudioContext();
  const master = context.createGain();
  const proximity = context.createGain();
  const dryMix = context.createGain();
  const noiseMix = context.createGain();
  const lowPass = context.createBiquadFilter();
  const oscillator = context.createOscillator();
  const secondOscillator = context.createOscillator();
  const noise = context.createBufferSource();
  const shimmer = context.createOscillator();
  const shimmerDepth = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 220;
  secondOscillator.type = "triangle";
  secondOscillator.frequency.value = 223;
  secondOscillator.detune.value = 7;
  lowPass.type = "lowpass";
  lowPass.frequency.value = 700;
  lowPass.Q.value = 0.5;
  dryMix.gain.value = 0.2;
  noiseMix.gain.value = 0.035;
  proximity.gain.value = 0;
  master.gain.value = 0.4;

  const noiseBuffer = context.createBuffer(
    1,
    context.sampleRate * 2,
    context.sampleRate,
  );
  const samples = noiseBuffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }
  noise.buffer = noiseBuffer;
  noise.loop = true;

  oscillator.connect(dryMix);
  secondOscillator.connect(dryMix);
  noise.connect(lowPass);
  lowPass.connect(noiseMix);
  dryMix.connect(proximity);
  noiseMix.connect(proximity);
  proximity.connect(master);
  master.connect(context.destination);

  shimmer.type = "sine";
  shimmer.frequency.value = 0.55;
  shimmerDepth.gain.value = 4;
  shimmer.connect(shimmerDepth);
  shimmerDepth.connect(oscillator.detune);
  shimmerDepth.connect(secondOscillator.detune);

  oscillator.start();
  secondOscillator.start();
  noise.start();
  shimmer.start();

  let destroyed = false;
  let muted = false;
  let outputVolume = 0.4;

  const setParam = (
    param: AudioParam,
    value: number,
    timeConstant = 0.35,
  ) => {
    param.setTargetAtTime(value, context.currentTime, timeConstant);
  };

  return {
    context,
    async unlock() {
      if (destroyed) return;
      if (context.state === "suspended") await context.resume();
      const silentBuffer = context.createBuffer(1, 1, context.sampleRate);
      const silentSource = context.createBufferSource();
      silentSource.buffer = silentBuffer;
      silentSource.connect(context.destination);
      silentSource.start();
      silentSource.stop(context.currentTime + 0.01);
    },
    async resume() {
      if (destroyed || context.state === "closed") return false;
      try {
        if (context.state === "suspended") await context.resume();
        return context.state === "running";
      } catch {
        return false;
      }
    },
    setProximity(
      distanceM: number | null,
      radiusM: number,
      volume: number,
      isMuted: boolean,
    ): SirenLevel {
      muted = isMuted;
      outputVolume = Math.max(0, Math.min(1, volume));
      const distance = distanceM ?? Number.POSITIVE_INFINITY;
      const insideAudioRange = distance <= 100;
      const radius = Math.max(1, radiusM);
      const progress = insideAudioRange
        ? distance <= radius
          ? 1
          : Math.max(0, Math.min(1, (100 - distance) / Math.max(1, 100 - radius)))
        : 0;
      const eased = progress * progress * (3 - 2 * progress);
      const gain = insideAudioRange ? 0.05 + eased * 0.95 : 0;

      setParam(proximity.gain, muted ? 0 : gain);
      setParam(master.gain, outputVolume);
      setParam(oscillator.frequency, 220 + eased * 660);
      setParam(secondOscillator.frequency, 223 + eased * 660);
      setParam(lowPass.frequency, 600 + eased * 4400);
      setParam(shimmer.frequency, 0.25 + eased * 2.75);

      return {
        active: insideAudioRange && !muted && outputVolume > 0,
        level: insideAudioRange && !muted && outputVolume > 0 ? Math.round(eased * 5) : 0,
      };
    },
    async playChime() {
      if (muted || outputVolume === 0) return;
      if (!(await this.resume())) return;
      const notes = [660, 880, 1174];
      const start = context.currentTime;
      notes.forEach((frequency, index) => {
        const tone = context.createOscillator();
        const envelope = context.createGain();
        const at = start + index * 0.09;
        tone.type = "sine";
        tone.frequency.value = frequency;
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(0.22, at + 0.025);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
        tone.connect(envelope);
        envelope.connect(master);
        tone.start(at);
        tone.stop(at + 0.44);
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const source of [oscillator, secondOscillator, noise, shimmer]) {
        try {
          source.stop();
        } catch {
          // A source may already have stopped during page teardown.
        }
      }
      if (context.state !== "closed") void context.close();
    },
  };
}

export type SirenAudioEngine = ReturnType<typeof createSirenAudio>;
