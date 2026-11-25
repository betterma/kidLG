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
import { showLoading, hideLoading, withLoading } from "./loading.js";
import { checkoutStages } from "./purchase.js";

const app = document.getElementById("app");
let config = null;
let stages = [];
let levelPacks = {};

const WORLD_ROUTE = {
  "world.letters": { hash: "#/letters", pack: "letters" },
  "world.pinyin": { hash: "#/world/pinyin", pack: "pinyin" },
  "world.hanzi": { hash: "#/world/hanzi", pack: "hanzi" },
  "world.words": { hash: "#/world/words", pack: "words" },
  "world.phrases": { hash: "#/world/phrases", pack: "phrases" },
};

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
  const meta = levelPacks.letters;
  if (meta?.groups?.length) return meta.groups;
  const legacy = meta?.letters || "abcdefghijklmnopqrstuvwxyz";
  return [{ id: "lower", title: "小写字母", letters: legacy }];
}

function closeModal() {
  document.getElementById("app-modal")?.remove();
}

function openModal(html) {
  closeModal();
  const wrap = document.createElement("div");
  wrap.id = "app-modal";
  wrap.className = "app-modal";
  wrap.innerHTML = `<div class="app-modal-backdrop" data-close></div><div class="app-modal-panel">${html}</div>`;
  document.body.appendChild(wrap);
  wrap.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });
  return wrap;
}

async function afterRedeemSuccess(entitlements) {
  try {
    const remote = await pullProgress();
    if (remote) saveProgress(mergeProgress(getProgress(), remote));
  } catch {
    /* ignore */
  }
  const snap = getProgress();
  snap.codeHash = entitlements.codeHash;
  saveProgress(snap);
}

function unlockedNames(e) {
  if (!e?.stages?.length) return "";
  const map = Object.fromEntries(stages.map((s) => [s.stageId, s.name]));
  return e.stages.map((id) => map[id] || id).join("、");
}

function showPurchaseModal(stage) {
  const price = stage.priceYuan != null ? `¥${stage.priceYuan}` : "";
  const modal = openModal(`
    <h2>${stage.name}</h2>
    <p class="muted">开通后即可游玩本世界全部关卡。演示环境支持一键模拟支付并自动开通。</p>
    <p class="price-tag">${price}</p>
    <div class="success-actions" style="margin-top:16px">
      <button type="button" class="btn btn-primary" data-buy>立即购买</button>
      <button type="button" class="btn btn-wood" data-have-code>我有激活码</button>
      <button type="button" class="btn btn-ghost" data-close>取消</button>
    </div>
    <p class="muted modal-msg" data-msg></p>
  `);

  modal.querySelector("[data-have-code]").addEventListener("click", () => {
    closeModal();
    location.hash = "#/settings";
  });

  modal.querySelector("[data-buy]").addEventListener("click", async () => {
    const msg = modal.querySelector("[data-msg]");
    msg.textContent = "";
    const buyBtn = modal.querySelector("[data-buy]");
    buyBtn.disabled = true;
    try {
      const result = await withLoading("正在支付并生成激活码…", () =>
        checkoutStages(config, [stage.stageId], { channel: "mock" })
      );
      if (!result.ok) {
        msg.textContent = result.message;
        msg.className = "muted modal-msg status-bad";
        buyBtn.disabled = false;
        return;
      }

      msg.textContent = `已生成激活码：${result.code}，正在自动开通…`;
      msg.className = "muted modal-msg";

      const redeemed = await withLoading("正在开通…", () => redeemCode(result.code, null, config));
      if (!redeemed.ok) {
        msg.innerHTML = `激活码 <strong>${result.code}</strong> 已生成，请复制后到设置里开通。<br>${redeemed.message}`;
        msg.className = "muted modal-msg status-bad";
        buyBtn.disabled = false;
        return;
      }

      await afterRedeemSuccess(redeemed.entitlements);
      msg.textContent = `开通成功！已解锁：${unlockedNames(redeemed.entitlements)}`;
      msg.className = "muted modal-msg status-ok";
      setTimeout(() => {
        closeModal();
        const route = WORLD_ROUTE[stage.stageId];
        location.hash = route?.hash || "#/";
      }, 700);
    } catch (err) {
      msg.textContent = err.message || "购买失败";
      msg.className = "muted modal-msg status-bad";
      buyBtn.disabled = false;
    }
  });
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
        stage.access === "free" ? "免费开放" : open ? "已解锁" : "点此开通";
      const route = WORLD_ROUTE[stage.stageId];
      const go = route?.hash || "#/";

      return `
        <button type="button" class="world-node ${open ? "" : "is-locked"}"
          data-open="${open ? "1" : "0"}"
          data-stage="${stage.stageId}"
          data-go="${go}">
          <span class="dot">${open ? (stage.stageId === "world.letters" ? "A" : "✓") : "🔒"}</span>
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

  app.querySelectorAll(".world-node").forEach((el) => {
    el.addEventListener("click", () => {
      const stageId = el.getAttribute("data-stage");
      const stage = stages.find((s) => s.stageId === stageId);
      const open = el.getAttribute("data-open") === "1";
      if (!stage) return;
      if (open) {
        location.hash = el.getAttribute("data-go");
        return;
      }
      showPurchaseModal(stage);
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

function renderWorldHub(packKey) {
  const pack = levelPacks[packKey];
  const stage = stages.find((s) => s.stageId === pack?.stageId);
  if (!pack || !stage) {
    location.hash = "#/";
    return;
  }
  if (!canAccessStage(stage)) {
    showPurchaseModal(stage);
    return;
  }

  const chips = (pack.items || [])
    .map((item) => {
      const id = `${pack.groupId}-${item.id}`;
      const p = getLevelProgress(id);
      return `
        <button type="button" class="letter-chip ${p.cleared ? "is-cleared" : ""}" data-item="${item.id}">
          ${item.glyph}
          ${p.cleared ? `<span class="star">★</span>` : ""}
        </button>
      `;
    })
    .join("");

  app.innerHTML = shell(
    `
    <h1 class="hero-title">${pack.title || stage.name}</h1>
    <p class="hero-sub">共 ${(pack.items || []).length} 关，拖进缺口过关</p>
    <div class="letter-grid">${chips}</div>
  `,
    { showBack: true, backHash: "#/" }
  );

  app.querySelectorAll("[data-item]").forEach((el) => {
    el.addEventListener("click", () => {
      location.hash = `#/play/${packKey}/${encodeURIComponent(el.getAttribute("data-item"))}`;
    });
  });
}

function renderPlayLetters(letterRaw) {
  const ch = decodeURIComponent(String(letterRaw || "a"));
  if (!/^[a-zA-Z]$/.test(ch)) {
    location.hash = "#/letters";
    return;
  }
  const stage = stages.find((s) => s.stageId === "world.letters");
  if (!canAccessStage(stage)) {
    location.hash = "#/";
    return;
  }

  const code = ch.charCodeAt(0);
  let next = null;
  if (code >= 97 && code < 122) next = String.fromCharCode(code + 1);
  else if (code === 122) next = "A";
  else if (code >= 65 && code < 90) next = String.fromCharCode(code + 1);

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
    backHash: "#/letters",
    nextHash: next ? `#/play/letters/${encodeURIComponent(next)}` : null,
    audioOpts: {
      preferFiles: config?.audio?.preferFiles !== false,
      speechFallback: config?.audio?.speechFallback !== false,
      speakLang: "en-US",
    },
  });
}

function renderPlayPack(packKey, itemIdRaw) {
  const pack = levelPacks[packKey];
  const stage = stages.find((s) => s.stageId === pack?.stageId);
  const itemId = decodeURIComponent(String(itemIdRaw || ""));
  const items = pack?.items || [];
  const idx = items.findIndex((it) => it.id === itemId);
  const item = items[idx];
  if (!pack || !stage || !item) {
    location.hash = `#/world/${packKey}`;
    return;
  }
  if (!canAccessStage(stage)) {
    showPurchaseModal(stage);
    return;
  }

  const next = items[idx + 1];
  app.innerHTML = shell(
    `
    <div class="play-header">
      <h1 class="hero-title">${item.label || item.glyph}</h1>
      <p class="hero-sub">拖进木墙缺口</p>
    </div>
    <div id="fitin-root" class="fitin-host"></div>
  `,
    { showBack: true, backHash: `#/world/${packKey}` }
  );
  app.querySelector(".screen")?.classList.add("screen-play");

  mountFitIn(document.getElementById("fitin-root"), {
    glyph: item.glyph,
    levelId: `${pack.groupId}-${item.id}`,
    snapDistance: config?.fitIn?.snapDistance ?? 56,
    backHash: `#/world/${packKey}`,
    nextHash: next ? `#/play/${packKey}/${encodeURIComponent(next.id)}` : null,
    successText: `学会了「${item.glyph}」`,
    audioOpts: {
      preferFiles: false,
      speechFallback: true,
      speakLang: pack.speakLang || "zh-CN",
    },
  });
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
      <p class="muted">也可在地图上点击锁定世界直接购买开通。</p>
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
    const msg = app.querySelector("#redeem-msg");
    const result = await withLoading("正在开通…", () => redeemCode(raw, null, config));
    msg.textContent = result.message;
    msg.className = result.ok ? "status-ok" : "status-bad";
    if (result.ok) {
      await afterRedeemSuccess(result.entitlements);
      msg.textContent = `开通成功：${unlockedNames(result.entitlements)}`;
    }
  });

  app.querySelector("#clear-progress").addEventListener("click", async () => {
    const ok = window.confirm(
      activated ? "确定清除学习进度吗？本机和云端进度都会清除。" : "确定清除本机学习进度吗？"
    );
    if (!ok) return;
    const msg = app.querySelector("#clear-msg");
    await withLoading("正在清除…", async () => {
      const result = await clearAllProgress({ activated, codeHash: e?.codeHash });
      if (activated && isSyncEnabled() && !result.remoteCleared) {
        msg.textContent = "本机进度已清除。云端未能清除，请稍后重试。";
        msg.className = "status-bad";
      } else {
        msg.textContent = "进度已清除。";
        msg.className = "status-ok";
      }
    });
  });
}

function render() {
  closeModal();
  const { parts } = parseRoute();
  const head = parts[0] || "";
  if (!head) return renderMap();
  if (head === "letters") return renderLetters();
  if (head === "settings") return renderSettings();
  if (head === "world" && parts[1]) return renderWorldHub(parts[1]);
  if (head === "play" && parts[1] === "letters") return renderPlayLetters(parts[2]);
  if (head === "play" && parts[1] && parts[2]) return renderPlayPack(parts[1], parts[2]);
  renderMap();
}

async function boot() {
  showLoading("正在加载内容…");
  try {
    config = await loadJsonFrom("config.json");
    resolveDataBase(config);
    const [stagesData, letters, pinyin, hanzi, words, phrases] = await Promise.all([
      loadDataJson(config, "data/stages.json"),
      loadDataJson(config, "data/levels/letters.json"),
      loadDataJson(config, "data/levels/pinyin.json"),
      loadDataJson(config, "data/levels/hanzi.json"),
      loadDataJson(config, "data/levels/words.json"),
      loadDataJson(config, "data/levels/phrases.json"),
    ]);
    stages = stagesData;
    levelPacks = { letters, pinyin, hanzi, words, phrases };
  } catch (err) {
    hideLoading();
    app.innerHTML = `<main class="screen"><h1>加载失败</h1><p>请检查网络后重试</p></main>`;
    console.error(err);
    return;
  }
  hideLoading();

  if (config.license?.endpoint) {
    config.sync = {
      enabled: true,
      endpoint: config.sync?.endpoint || config.license.endpoint,
    };
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
