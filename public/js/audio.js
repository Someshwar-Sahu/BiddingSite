/**
 * Web Audio API Sound Engine
 * Synthesizes subtle alerts with zero external audio files.
 */
let isMuted = false;
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

export function playChime(freq = 600, duration = 0.15) {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Audio autoplay restrictions before user interaction
  }
}

export function initMuteButton(buttonId = 'mute-btn') {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  btn.addEventListener('click', () => {
    isMuted = !isMuted;
    btn.innerText = isMuted ? '🔇' : '🔊';
  });
}