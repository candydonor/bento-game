export type Sound = 'select' | 'delivery' | 'complete' | 'win' | 'lose';

const musicUrl = new URL('../assets/audio/bento-garden.m4a', import.meta.url).href;

const melodies: Record<Sound, { notes: number[]; interval: number; duration: number; volume: number }> = {
  select: { notes: [480], interval: .06, duration: .08, volume: .035 },
  delivery: { notes: [587, 740], interval: .045, duration: .1, volume: .035 },
  complete: { notes: [659, 880, 1047], interval: .065, duration: .18, volume: .04 },
  win: { notes: [523, 659, 784, 1047], interval: .09, duration: .28, volume: .05 },
  lose: { notes: [440, 349, 294], interval: .1, duration: .22, volume: .04 },
};

export function createAudio(initiallyEnabled: boolean) {
  let context: AudioContext | undefined;
  let enabled = initiallyEnabled;
  const voices = new Set<OscillatorNode>();
  let musicRequested = false;
  let musicBuffer: AudioBuffer | undefined;
  let musicLoad: Promise<void> | undefined;
  let musicSource: AudioBufferSourceNode | undefined;
  let musicGain: GainNode | undefined;
  let musicOffset = 0;
  let musicStartedAt = 0;

  function unlock() {
    if (!enabled) return;
    try {
      const Constructor = window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) return;
      context ??= new Constructor();
      if (context.state !== 'running') void context.resume().then(updateMusic).catch(() => {});
      else updateMusic();
    } catch {
      // The game remains playable if Web Audio is unavailable.
    }
  }

  function updateMusic() {
    const audio = context;
    if (!enabled || !musicRequested || !audio) {
      if (musicSource && audio && musicBuffer) {
        musicOffset = (musicOffset + audio.currentTime - musicStartedAt) % musicBuffer.duration;
        musicSource.stop();
        musicSource.disconnect();
        musicSource = undefined;
      }
      return;
    }

    if (!musicBuffer) {
      musicLoad ??= fetch(musicUrl)
        .then(response => {
          if (!response.ok) throw new Error('Background track is unavailable');
          return response.arrayBuffer();
        })
        .then(bytes => audio.decodeAudioData(bytes))
        .then(buffer => {
          musicBuffer = buffer;
          updateMusic();
        })
        .catch(() => {
          musicLoad = undefined;
        });
      return;
    }
    if (musicSource || audio.state !== 'running') return;

    if (!musicGain) {
      musicGain = audio.createGain();
      musicGain.gain.value = .32;
      musicGain.connect(audio.destination);
    }
    const source = audio.createBufferSource();
    source.buffer = musicBuffer;
    source.loop = true;
    source.connect(musicGain);
    musicStartedAt = audio.currentTime;
    source.start(0, musicOffset);
    musicSource = source;
  }

  function resumeMusic() {
    musicRequested = true;
    unlock();
    updateMusic();
  }

  function pauseMusic() {
    musicRequested = false;
    updateMusic();
  }

  function stopMusic() {
    pauseMusic();
    musicOffset = 0;
  }

  function play(sound: Sound) {
    if (!enabled || !context || context.state !== 'running') return;

    const audio = context;
    const cue = melodies[sound];
    const start = audio.currentTime;
    cue.notes.forEach((frequency, index) => {
      const time = start + index * cue.interval;
      const note = audio.createOscillator();
      const gain = audio.createGain();
      note.type = 'sine';
      note.frequency.setValueAtTime(frequency, time);
      gain.gain.setValueAtTime(.001, time);
      gain.gain.exponentialRampToValueAtTime(cue.volume, time + .015);
      gain.gain.exponentialRampToValueAtTime(.001, time + cue.duration);
      note.connect(gain).connect(audio.destination);
      voices.add(note);
      note.onended = () => {
        voices.delete(note);
        note.disconnect();
        gain.disconnect();
      };
      note.start(time);
      note.stop(time + cue.duration + .01);
    });
  }

  function silence() {
    for (const note of voices) {
      note.stop();
      note.disconnect();
    }
    voices.clear();
  }

  function setEnabled(value: boolean) {
    enabled = value;
    if (enabled) unlock();
    else {
      silence();
      updateMusic();
    }
  }

  return { play, silence, setEnabled, resumeMusic, pauseMusic, stopMusic };
}
