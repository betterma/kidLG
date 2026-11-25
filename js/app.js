import { getVolume, setVolume, unlockAudio } from "./audio.js";
import { canAccessStage, getEntitlements, redeemCode, clearEntitlements, isActivated } from "./entitlement.js";
import { getLevelProgress, getProgress, mergeProgress, saveProgress } from "./progress.js";
import { setSyncConfig, pullProgress } from "./sync.js";
import { mountFitIn } from "./fitin.js";
import { loadDataJson, loadJsonFrom, resolveDataBase } from "./dataUrl.js";

const app = document.getElementById("app");
let config = null;
let stages = [];
let codes = [];
let lettersMeta = null;
let dataSourceLabel = "";

function edition() {
  return config?.edition || "owner";
}

function parseRoute() {
  const raw = (location.hash || "#/").replace(/^#/, "") || "/";
  const [pathPart, query = ""] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  return { parts, query };
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
      const open = canAccessStage(stage, edition());
      const price =
        stage.access === "free"
          ? "免费体验"
          : stage.priceYuan != null
            ? `¥${stage.priceYuan}`
            : "即将开放";
      const badge = open
        ? `<span class="badge">可进入</span>`
        : `<span class="badge badge-lock">🔒 ${price}</span>`;
      const sub =
        stage.access === "free"
          ? "整座世界免费开放"
          : open
            ? "已解锁"
            : edition() === "owner"
              ? "Owner 可进"
              : "输入激活码后可玩";

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
    <p class="hero-sub">点进世界开始玩。当前模式：<strong>${edition()}</strong>${isActivated() ? " · 已激活" : ""}</p>
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
    <p class="hero-sub">木墙缺口 · 拖进去就算过关</p>
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
  if (!canAccessStage(stage, edition())) {
    location.hash = "#/settings";
    return;
  }

  app.innerHTML = shell(
    `
    <div class="play-header">
      <h1 class="hero-title">字母 ${ch}</h1>
      <p class="hero-sub">木墙上的缺口在等你</p>
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
    successRepeat: config?.audio?.successRepeat ?? 3,
    audioOpts: {
      preferFiles: config?.audio?.preferFiles !== false,
      speechFallback: config?.audio?.speechFallback !== false,
    },
  });
}

function renderSettings() {
  const e = getEntitlements();
  const vol = getVolume();
  const syncOn = !!(config?.sync?.enabled && config?.sync?.endpoint);

  app.innerHTML = shell(
    `
    <h1 class="hero-title">设置</h1>
    <div class="settings-card">
      <h2>声音</h2>
      <div class="settings-row">
        <span>音量</span>
        <input id="vol" type="range" min="0" max="1" step="0.05" value="${vol}" />
      </div>
      <p class="muted">首次点击字母时会开启发音（也可使用系统朗读）。</p>
    </div>

    <div class="settings-card">
      <h2>发行模式</h2>
      <p>当前：<strong>${edition()}</strong>（改 <code>config.json</code> 的 <code>edition</code>）</p>
      <p class="muted">owner = 全开；retail = 按 stages 与激活码门禁。</p>
    </div>

    <div class="settings-card" ${edition() === "owner" ? 'style="opacity:.85"' : ""}>
      <h2>激活码</h2>
      <p class="muted">演示码：DEMO-PINYIN-0001 或 DEMO-ALL-0001</p>
      <input id="code-input" type="text" placeholder="输入激活码" value="" autocomplete="off" />
      <div class="settings-row" style="margin-top:12px">
        <button type="button" class="btn btn-primary" id="redeem-btn">兑换</button>
        <button type="button" class="btn btn-ghost" id="clear-ent">清除本机激活</button>
      </div>
      <p id="redeem-msg" class="muted" style="margin-top:10px">
        ${
          e
            ? `已激活：${e.code} · 世界 ${e.stages.join(", ")}`
            : "未激活：进度仅保存在本机浏览器"
        }
      </p>
      <p class="muted">激活后进度仍写本机；若配置了同步中转，会静默备份到 GitHub。</p>
      <p class="muted">同步中转：${syncOn ? "已配置" : "未启用（预留接口）"}</p>
      <p class="muted">内容 JSON 来源：${dataSourceLabel || "—"}（改 data/*.json 推 main 即可，不必等 Pages）</p>
    </div>

    <div class="settings-card">
      <h2>本机进度</h2>
      <p class="muted">已记录关卡数：${Object.keys(getProgress().levels || {}).length}</p>
      <button type="button" class="btn btn-ghost" id="reset-progress">清除本机进度</button>
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
    }
  });

  app.querySelector("#clear-ent").addEventListener("click", () => {
    clearEntitlements();
    location.reload();
  });

  app.querySelector("#reset-progress").addEventListener("click", () => {
    localStorage.removeItem("kidlg:progress");
    location.reload();
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
    const resolved = resolveDataBase(config);
    dataSourceLabel = resolved.remote ? `远程 ${resolved.base}` : "本地 ./";
    [stages, codes, lettersMeta] = await Promise.all([
      loadDataJson(config, "data/stages.json"),
      loadDataJson(config, "data/codes.json"),
      loadDataJson(config, "data/levels/letters.json"),
    ]);
  } catch (err) {
    app.innerHTML = `<main class="screen"><h1>加载失败</h1><p>${err.message}</p><p class="muted">若用本地文件打开，请改用本地静态服务器或 GitHub Pages。</p></main>`;
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
