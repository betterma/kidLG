import { playGlyph, playPop, unlockAudio } from "./audio.js";
import { recordAttempt, recordClear } from "./progress.js";

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function mountFitIn(
  root,
  {
    glyph,
    levelId,
    snapDistance = 56,
    audioOpts = {},
    backHash = "#/",
    nextHash = null,
    successTitle = "太棒了！",
    successText = "",
  }
) {
  const display = String(glyph);
  const longGlyph = display.length > 1;
  root.innerHTML = `
    <div class="play-wrap">
      <div class="play-toolbar">
        <p class="play-hint" data-hint>拖进缺口就过关啦</p>
        <button type="button" class="btn-speaker" data-speaker aria-label="听发音">🔊</button>
      </div>
      <div class="wood-stage" data-stage>
        <div class="slot ${longGlyph ? "is-wide" : ""}" data-slot>
          <span class="slot-glyph" data-len="${display.length}">${display}</span>
        </div>
        <div class="piece ${longGlyph ? "is-wide" : ""}" data-piece>
          <span class="piece-glyph" data-len="${display.length}">${display}</span>
        </div>
        <div class="confetti-layer" data-confetti></div>
        <div class="success-overlay" data-success>
          <div class="success-card">
            <h2>${successTitle}</h2>
            <p>${successText || `认识「${display}」`}</p>
            <div class="success-actions">
              <button type="button" class="btn btn-wood" data-again>再玩一次</button>
              ${nextHash ? `<button type="button" class="btn btn-primary" data-next>下一关</button>` : ""}
              <button type="button" class="btn btn-ghost" data-back>返回列表</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const stage = root.querySelector("[data-stage]");
  const slot = root.querySelector("[data-slot]");
  const piece = root.querySelector("[data-piece]");
  const hint = root.querySelector("[data-hint]");
  const success = root.querySelector("[data-success]");
  const confetti = root.querySelector("[data-confetti]");
  const speaker = root.querySelector("[data-speaker]");

  let dragging = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let home = { left: 0.2, top: 0.7 };
  let slotPos = { left: 0.5, top: 0.28 };
  let cleared = false;
  let missCount = 0;

  function stageRect() {
    return stage.getBoundingClientRect();
  }

  function effectiveSnap() {
    const w = stageRect().width || 320;
    const scaled = snapDistance * (w / 420);
    return Math.max(44, Math.min(96, scaled));
  }

  function setSlotRatio(leftRatio, topRatio) {
    slotPos = { left: leftRatio, top: topRatio };
    slot.style.left = `${leftRatio * 100}%`;
    slot.style.top = `${topRatio * 100}%`;
    slot.style.transform = "translate(-50%, -50%)";
  }

  function setPieceRatio(leftRatio, topRatio) {
    home = { left: leftRatio, top: topRatio };
    const r = stageRect();
    const pw = piece.offsetWidth;
    const ph = piece.offsetHeight;
    const maxL = Math.max(0, r.width - pw);
    const maxT = Math.max(0, r.height - ph);
    const left = Math.min(maxL, Math.max(0, leftRatio * r.width));
    const top = Math.min(maxT, Math.max(0, topRatio * r.height));
    piece.style.left = `${left}px`;
    piece.style.top = `${top}px`;
    piece.style.bottom = "auto";
  }

  function pieceCenter() {
    const pr = piece.getBoundingClientRect();
    return { x: pr.left + pr.width / 2, y: pr.top + pr.height / 2 };
  }

  function slotCenter() {
    const sr = slot.getBoundingClientRect();
    return { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 };
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function randomizeLayout() {
    const st = stageRect();
    if (st.width < 40 || st.height < 40) return;

    const slotW = slot.offsetWidth / st.width;
    const slotH = slot.offsetHeight / st.height;
    const pieceW = piece.offsetWidth / st.width;
    const pieceH = piece.offsetHeight / st.height;

    const sLeft = rand(0.22 + slotW / 2, 0.78 - slotW / 2);
    const sTop = rand(0.18 + slotH / 2, 0.48);
    setSlotRatio(sLeft, sTop);

    let pLeft;
    let pTop;
    let tries = 0;
    do {
      pLeft = rand(0.04, Math.max(0.05, 1 - pieceW - 0.04));
      pTop = rand(0.52, Math.max(0.53, 1 - pieceH - 0.04));
      tries += 1;
    } while (
      tries < 24 &&
      Math.hypot(pLeft + pieceW / 2 - sLeft, pTop + pieceH / 2 - sTop) < 0.38
    );

    setPieceRatio(pLeft, pTop);
  }

  function dockToSlot() {
    const sr = slot.getBoundingClientRect();
    const st = stageRect();
    const left = sr.left - st.left + (sr.width - piece.offsetWidth) / 2;
    const top = sr.top - st.top + (sr.height - piece.offsetHeight) / 2;
    piece.style.left = `${left}px`;
    piece.style.top = `${top}px`;
    piece.style.bottom = "auto";
    piece.classList.add("is-docked");
    slot.classList.add("is-filled");
    slot.classList.remove("is-hot");
  }

  function spawnConfetti() {
    confetti.innerHTML = "";
    const colors = ["#f2c14e", "#7bc47f", "#f07167", "#5b8def", "#f4a261", "#e9c46a"];
    for (let i = 0; i < 36; i++) {
      const el = document.createElement("span");
      el.className = "confetti";
      el.style.left = `${Math.random() * 100}%`;
      el.style.background = colors[i % colors.length];
      el.style.animationDelay = `${Math.random() * 0.35}s`;
      el.style.transform = `rotate(${Math.random() * 180}deg)`;
      confetti.appendChild(el);
    }
  }

  function onSuccess() {
    if (cleared) return;
    cleared = true;
    recordClear(levelId, 1);
    dockToSlot();
    playPop();
    hint.textContent = "拼好啦！";
    spawnConfetti();
    success.classList.add("is-on");
  }

  function onPointerDown(e) {
    if (cleared || dragging) return;
    unlockAudio();
    dragging = true;
    pointerId = e.pointerId;
    piece.classList.add("is-dragging");
    document.body.classList.add("is-dragging-piece");
    try {
      piece.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const pr = piece.getBoundingClientRect();
    const st = stageRect();
    startX = e.clientX;
    startY = e.clientY;
    originLeft = pr.left - st.left;
    originTop = pr.top - st.top;
    playGlyph(display, audioOpts);
    recordAttempt(levelId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging || cleared) return;
    if (pointerId != null && e.pointerId !== pointerId) return;
    const st = stageRect();
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let left = originLeft + dx;
    let top = originTop + dy;
    left = Math.max(0, Math.min(st.width - piece.offsetWidth, left));
    top = Math.max(0, Math.min(st.height - piece.offsetHeight, top));
    piece.style.left = `${left}px`;
    piece.style.top = `${top}px`;
    piece.style.bottom = "auto";
    const snap = effectiveSnap();
    slot.classList.toggle("is-hot", dist(pieceCenter(), slotCenter()) <= snap * 1.35);
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (!dragging || cleared) return;
    if (pointerId != null && e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    piece.classList.remove("is-dragging");
    document.body.classList.remove("is-dragging-piece");
    const snap = effectiveSnap();
    if (dist(pieceCenter(), slotCenter()) <= snap) {
      onSuccess();
      return;
    }
    missCount += 1;
    setPieceRatio(home.left, home.top);
    slot.classList.remove("is-hot");
    hint.textContent = missCount >= 2 ? "拖到缺口里松手～" : "再靠近一点再松手";
  }

  function onResize() {
    if (cleared) {
      dockToSlot();
      return;
    }
    if (!dragging) {
      setSlotRatio(slotPos.left, slotPos.top);
      setPieceRatio(home.left, home.top);
    }
  }

  speaker.addEventListener("click", () => {
    unlockAudio();
    playGlyph(display, audioOpts);
  });

  piece.addEventListener("pointerdown", onPointerDown);
  piece.addEventListener("pointermove", onPointerMove);
  piece.addEventListener("pointerup", onPointerUp);
  piece.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  const againBtn = root.querySelector("[data-again]");
  const nextBtn = root.querySelector("[data-next]");
  const backBtn = root.querySelector("[data-back]");

  againBtn.addEventListener("click", () => {
    cleanup();
    location.hash = `${location.hash.split("?")[0]}?r=${Date.now()}`;
  });
  nextBtn?.addEventListener("click", () => {
    cleanup();
    location.hash = nextHash;
  });
  backBtn.addEventListener("click", () => {
    cleanup();
    location.hash = backHash;
  });

  function cleanup() {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
    document.body.classList.remove("is-dragging-piece");
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => randomizeLayout());
  });
}
