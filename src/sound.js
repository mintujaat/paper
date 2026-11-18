export function isSoundEnabled() {
  try { return localStorage.getItem("yaadpage_sound") !== "0"; } catch { return true; }
}

export function setSoundEnabled(val) {
  try { localStorage.setItem("yaadpage_sound", val ? "1" : "0"); } catch {}
}

export function playResultSound(accuracy = 0) {
  if (!isSoundEnabled()) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Choose unique melody based on score accuracy
    const notes = accuracy >= 70
      ? [523.25, 659.25, 783.99, 1046.5] // Triumphant C5-E5-G5-C6 fanfare
      : accuracy >= 40
        ? [440, 554.37, 659.25]          // Pleasant A4-C#5-E5 chime
        : [392, 440, 493.88];            // Gentle encouraging G4-A4-B4 tone

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = accuracy >= 70 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.16, now + idx * 0.11 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.45);
    });
  } catch {}
}
