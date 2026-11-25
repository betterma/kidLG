let unlocked = false;

export function unlockAudio() {
  unlocked = true;
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function speakLetter(letter) {
  if (!window.speechSynthesis) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(String(letter).toLowerCase());
    u.lang = "en-US";
    u.rate = 0.85;
    u.pitch = 1.05;
    u.volume = 1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

async function playFile(src) {
  return new Promise((resolve) => {
    const audio = new Audio(src);
    audio.volume = 1;
    audio.onended = () => resolve(true);
    audio.onerror = () => resolve(false);
    audio.play().catch(() => resolve(false));
  });
}

export async function playGlyph(glyph, { preferFiles = true, speechFallback = true } = {}) {
  if (!unlocked) unlockAudio();
  const letter = String(glyph || "").toLowerCase();
  if (preferFiles) {
    const ok = await playFile(`assets/audio/letters/${letter}.mp3`);
    if (ok) return;
  }
  if (speechFallback) await speakLetter(letter);
}

export function playPop() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 660;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.start(t);
    o.stop(t + 0.2);
  } catch {
    /* ignore */
  }
}
