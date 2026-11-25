import { unlockAudio } from "./audio.js";
import { canAccessStage, getEntitlements, redeemCode, isActivated } from "./entitlement.js";
import {
  getLevelProgress,
  getProgress,
  mergeProgress,
  saveProgress,
  clearAllProgress,
} from "./progress.js";
import { setSyncConfig, pullProgress, isSyncEnabled } from "./sync.js";
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

function letterGroups() {
  if (lettersMeta?.groups?.length) return lettersMeta.groups;
  const legacy = lettersMeta?.letters || "abcdefghijklmnopqrstuvwxyz";
  return [{ id: "lower", title: "小写字母", letters: legacy }];
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
        stage.access === "free" ? "免费开放" : open ? "已解锁" : "需要激活码";

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
  const groups = letterGroups();
  const sections = groups
    .map((g) => {
      const chips = String(g.letters || "")
        .split("")
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
      return `
        <section class="letter-section">
          <h2 class="section-title">${g.title}</h2>
          <div class="letter-grid">${chips}</div>
        </section>
      `;
    })
    .join("");

  app.innerHTML = shell(
    `
    <h1 class="hero-title">英文字母世界</h1>
    <p class="hero-sub">小写、大写共 52 关，拖进木墙缺口过关</p>
    ${sections}
  `,
    { showBack: true, backHash: "#/" }
  );

  app.querySelectorAll("[data-letter]").forEach((el) => {
    el.addEventListener("click", () => {
      const ch = el.getAttribute("data-letter");
      location.hash = `#/play/letters/${encodeURIComponent(ch)}`;
    });
  });
}

function renderPlay(letterRaw) {
  const ch = decodeURIComponent(String(letterRaw || "a"));
  if (!/^[a-zA-Z]$/.test(ch)) {
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
  const activated = isActivated();
  const levelCount = Object.keys(getProgress().levels || {}).length;

  app.innerHTML = shell(
    `
    <h1 class="hero-title">设置</h1>

    <div class="settings-card">
      <h2>激活码</h2>
      <p class="muted">开通更多学习世界。每个激活码只能使用一次。</p>
      <input id="code-input" type="text" placeholder="请输入激活码" value="" autocomplete="off" />
      <div class="settings-row" style="margin-top:12px">
        <button type="button" class="btn btn-primary" id="redeem-btn">开通</button>
      </div>
      <p id="redeem-msg" class="muted" style="margin-top:10px">
        ${activated ? `已开通：${unlockedNames(e)}` : "还没有开通付费世界"}
      </p>
    </div>

    <div class="settings-card">
      <h2>学习进度</h2>
      <p class="muted">已记录 ${levelCount} 个关卡记录</p>
      <button type="button" class="btn btn-ghost" id="clear-progress">清除进度</button>
      <p id="clear-msg" class="muted" style="margin-top:10px"></p>
    </div>
  `,
    { showBack: true, backHash: "#/" }
  );

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

  app.querySelector("#clear-progress").addEventListener("click", async () => {
    const ok = window.confirm(
      activated
        ? "确定清除学习进度吗？本机和云端进度都会清除。"
        : "确定清除本机学习进度吗？"
    );
    if (!ok) return;
    const msg = app.querySelector("#clear-msg");
    msg.textContent = "正在清除…";
    const result = await clearAllProgress({
      activated,
      codeHash: e?.codeHash,
    });
    if (activated && isSyncEnabled() && !result.remoteCleared) {
      msg.textContent = "本机进度已清除。云端未能清除，请稍后重试或检查网络。";
      msg.className = "status-bad";
    } else if (activated && !isSyncEnabled()) {
      msg.textContent = "本机进度已清除。";
      msg.className = "status-ok";
    } else {
      msg.textContent = "进度已清除。";
      msg.className = "status-ok";
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
