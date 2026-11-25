import { getVolume, setVolume, unlockAudio } from "./audio.js";
import { canAccessStage, getEntitlements, redeemCode, isActivated } from "./entitlement.js";
import { getLevelProgress, getProgress, mergeProgress, saveProgress } from "./progress.js";
import { setSyncConfig, pullProgress } from "./sync.js";
import { mountFitIn } from "./fitin.js";
import { loadDataJson, loadJsonFrom, resolveDataBase } from "./dataUrl.js";

const app = document.getElementById("app");
let config = null;
let stages = [];
let codes = [];
let lettersMeta = null;

function parseRoute() {
  const raw = (location.hash || "#/").replace(/^#/, "") || "/";
  const [pathPart] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  return { parts };
}

function shell(content, { showBack = false, backHash = "#/" } = {}) {
  return `
    <header class="topbar">
      <a class="brand" href="#/">${config?.appName || "KidLG"}</a>
      <div class="topbar-actions">
        ${showBack ? `<a class="btn btn-ghost" href="${backHash}">返回</a>` : ""}
        <a class="btn btn-ghost" href="#/settings">设置</a>
      </div>
    </header>
    <main class="screen">${content}</main>
  `;
}

function renderMap() {
  const nodes = [...stages]
    .filter((s) => s.listed)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((stage) => {
      const open = canAccessStage(stage);
      const price =
        stage.access === "free"
          ? "免费"
          : stage.priceYuan != null
            ? `¥${stage.priceYuan}`
            : "即将开放";
      const badge = open
        ? `<span class="badge">可进入</span>`
        : `<span class="badge badge-lock">🔒 ${price}</span>`;
      const sub =
        stage.access === "free"
          ? "免费开放"
          : open
            ? "已解锁"
            : "需要激活码";

      if (stage.stageId === "world.letters" && open) {
        return `
          <button type="button" class="world-node" data-go="#/letters">
            <span class="dot">A</span>
            <span class="meta"><strong>${stage.name}</strong><span>${sub}</span></span>
            ${badge}
          </button>
        `;
      }

      return `
        <button type="button" class="world-node ${open ? "" : "is-locked"}" data-locked="${open ? "0" : "1"}" data-stage="${stage.stageId}">
          <span class="dot">${open ? "✓" : "🔒"}</span>
          <span class="meta"><strong>${stage.name}</strong><span>${sub}</span></span>
          ${badge}
        </button>
      `;
    })
    .join("");

  app.innerHTML = shell(`
    <h1 class="hero-title">一起拼字母、认汉字</h1>
    <p class="hero-sub">点进世界开始玩吧</p>
    <div class="world-path">${nodes}</div>
  `);

  app.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", () => {
      location.hash = el.getAttribute("data-go");
    });
  });

  app.querySelectorAll(".world-node[data-locked]").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.getAttribute("data-locked") === "1") location.hash = "#/settings";
    });
  });
}

function renderLetters() {
  const letters = (lettersMeta?.letters || "abcdefghijklmnopqrstuvwxyz").split("");
  const chips = letters
    .map((ch) => {
      const id = `letters-${ch}`;
      const p = getLevelProgress(id);
      return `
        <button type="button" class="letter-chip ${p.cleared ? "is-cleared" : ""}" data-letter="${ch}">
          ${ch}
          ${p.cleared ? `<span class="star">★</span>` : ""}
        </button>
      `;
    })
    .join("");

  app.innerHTML = shell(
    `
    <h1 class="hero-title">英文字母世界</h1>
    <p class="hero-sub">拖进木墙缺口就算过关</p>
    <div class="letter-grid">${chips}</div>
  `,
    { showBack: true, backHash: "#/" }
  );

  app.querySelectorAll("[data-letter]").forEach((el) => {
    el.addEventListener("click", () => {
      location.hash = `#/play/letters/${el.getAttribute("data-letter")}`;
    });
  });
}

function renderPlay(letter) {
  const ch = String(letter || "a").toLowerCase();
  if (!/^[a-z]$/.test(ch)) {
    location.hash = "#/letters";
    return;
  }
  const stage = stages.find((s) => s.stageId === "world.letters");
  if (!canAccessStage(stage)) {
    location.hash = "#/settings";
    return;
  }

  app.innerHTML = shell(
    `
    <div class="play-header">
      <h1 class="hero-title">字母 ${ch}</h1>
      <p class="hero-sub">把字母放进缺口</p>
    </div>
    <div id="fitin-root" class="fitin-host"></div>
  `,
    { showBack: true, backHash: "#/letters" }
  );
  app.querySelector(".screen")?.classList.add("screen-play");

  mountFitIn(document.getElementById("fitin-root"), {
    glyph: ch,
    levelId: `letters-${ch}`,
    snapDistance: config?.fitIn?.snapDistance ?? 56,
    audioOpts: {
      preferFiles: config?.audio?.preferFiles !== false,
      speechFallback: config?.audio?.speechFallback !== false,
    },
  });
}

function unlockedNames(e) {
  if (!e?.stages?.length) return "";
  const map = Object.fromEntries(stages.map((s) => [s.stageId, s.name]));
  return e.stages.map((id) => map[id] || id).join("、");
}

function renderSettings() {
  const e = getEntitlements();
  const vol = getVolume();

  app.innerHTML = shell(
    `
    <h1 class="hero-title">设置</h1>
    <div class="settings-card">
      <h2>声音</h2>
      <div class="settings-row">
        <span>音量</span>
        <input id="vol" type="range" min="0" max="1" step="0.05" value="${vol}" />
      </div>
    </div>

    <div class="settings-card">
      <h2>激活码</h2>
      <p class="muted">开通更多学习世界。每个激活码只能使用一次。</p>
      <input id="code-input" type="text" placeholder="请输入激活码" value="" autocomplete="off" />
      <div class="settings-row" style="margin-top:12px">
        <button type="button" class="btn btn-primary" id="redeem-btn">开通</button>
      </div>
      <p id="redeem-msg" class="muted" style="margin-top:10px">
        ${
          isActivated()
            ? `已开通：${unlockedNames(e)}`
            : "还没有开通付费世界"
        }
      </p>
    </div>
  `,
    { showBack: true, backHash: "#/" }
  );

  app.querySelector("#vol").addEventListener("input", (ev) => {
    setVolume(ev.target.value);
  });

  app.querySelector("#redeem-btn").addEventListener("click", async () => {
    unlockAudio();
    const raw = app.querySelector("#code-input").value;
    const result = await redeemCode(raw, codes);
    const msg = app.querySelector("#redeem-msg");
    msg.textContent = result.message;
    msg.className = result.ok ? "status-ok" : "status-bad";
    if (result.ok) {
      try {
        const remote = await pullProgress();
        if (remote) saveProgress(mergeProgress(getProgress(), remote));
      } catch {
        /* ignore */
      }
      const snap = getProgress();
      snap.codeHash = result.entitlements.codeHash;
      saveProgress(snap);
      msg.textContent = `开通成功：${unlockedNames(result.entitlements)}`;
    }
  });
}

function render() {
  const { parts } = parseRoute();
  const head = parts[0] || "";
  if (!head) return renderMap();
  if (head === "letters") return renderLetters();
  if (head === "settings") return renderSettings();
  if (head === "play" && parts[1] === "letters") return renderPlay(parts[2]);
  renderMap();
}

async function boot() {
  getVolume();
  try {
    config = await loadJsonFrom("config.json");
    resolveDataBase(config);
    [stages, codes, lettersMeta] = await Promise.all([
      loadDataJson(config, "data/stages.json"),
      loadDataJson(config, "data/codes.json"),
      loadDataJson(config, "data/levels/letters.json"),
    ]);
  } catch (err) {
    app.innerHTML = `<main class="screen"><h1>加载失败</h1><p>请检查网络后重试</p></main>`;
    console.error(err);
    return;
  }
  setSyncConfig(config.sync || {});
  window.addEventListener("hashchange", render);
  document.addEventListener(
    "pointerdown",
    () => {
      unlockAudio();
    },
    { once: true }
  );
  render();
}

boot();
