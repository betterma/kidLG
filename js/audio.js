let volume = 1;
let unlocked = false;

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v) || 0));
  localStorage.setItem("kidlg:volume", String(volume));
}

export function getVolume() {
  const saved = localStorage.getItem("kidlg:volume");
  if (saved != null) volume = Number(saved);
  return volume;
}

export function unlockAudio() {
  unlocked = true;
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function speakLetter(letter) {
  if (!window.speechSynthesis || volume <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(letter);
    u.lang = "en-US";
    u.rate = 0.85;
    u.pitch = 1.05;
    u.volume = volume;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

async function playFile(src) {
  return new Promise((resolve) => {
    const audio = new Audio(src);
    audio.volume = volume;
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

export async function playGlyphRepeat(glyph, times, opts) {
  const n = Math.max(1, times || 1);
  for (let i = 0; i < n; i++) {
    await playGlyph(glyph, opts);
    await wait(180);
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
    g.gain.exponentialRampToValueAtTime(0.08 * volume, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.start(t);
    o.stop(t + 0.2);
  } catch {
    /* ignore */
  }
}
