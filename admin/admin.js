const STORAGE_STAGES = "kidlg-admin:stages";
const STORAGE_CODES = "kidlg-admin:codes";
const STORAGE_ORDERS = "kidlg-admin:orders";
const STORAGE_AUTH = "kidlg-admin:authed";

const app = document.getElementById("app");

let config = null;
let stages = [];
let codes = [];
let orders = [];
let tab = "pricing";
let lastIssued = null;

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`无法加载 ${url}`);
  return res.json();
}

function loadLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function randomChunk(len = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

function generateCode() {
  return `${randomChunk()}-${randomChunk()}-${randomChunk()}`;
}

function paidStages() {
  return stages.filter((s) => s.access === "paid" && s.listed !== false);
}

function stageName(id) {
  return stages.find((s) => s.stageId === id)?.name || id;
}

async function boot() {
  try {
    config = await fetchJson("../config.json");
  } catch (err) {
    app.innerHTML = `<div class="card"><h1>加载失败</h1><p>${err.message}</p></div>`;
    return;
  }

  if (sessionStorage.getItem(STORAGE_AUTH) === "1") {
    await enterApp();
    return;
  }
  renderGate();
}

function renderGate() {
  app.innerHTML = `
    <div class="card gate">
      <h1>KidLG 管理后台</h1>
      <p class="muted">请输入管理口令（在 config.json 的 admin.passphrase）</p>
      <div class="row">
        <label style="flex:1">
          口令
          <input id="pass" type="password" autocomplete="current-password" />
        </label>
      </div>
      <button type="button" class="btn btn-primary" id="login">进入</button>
      <p id="gate-msg" class="msg"></p>
    </div>
  `;
  const go = () => {
    const pass = app.querySelector("#pass").value;
    const expect = config?.admin?.passphrase || "";
    if (!expect || pass !== expect) {
      app.querySelector("#gate-msg").textContent = "口令错误";
      app.querySelector("#gate-msg").className = "msg bad";
      return;
    }
    sessionStorage.setItem(STORAGE_AUTH, "1");
    enterApp();
  };
  app.querySelector("#login").addEventListener("click", go);
  app.querySelector("#pass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });
}

async function enterApp() {
  const draftStages = loadLocal(STORAGE_STAGES, null);
  const draftCodes = loadLocal(STORAGE_CODES, null);
  const draftOrders = loadLocal(STORAGE_ORDERS, []);

  try {
    const [remoteStages, remoteCodes] = await Promise.all([
      fetchJson("../data/stages.json"),
      fetchJson("../data/codes.json"),
    ]);
    stages = draftStages || remoteStages;
    codes = draftCodes || remoteCodes;
    orders = Array.isArray(draftOrders) ? draftOrders : [];
  } catch (err) {
    if (draftStages && draftCodes) {
      stages = draftStages;
      codes = draftCodes;
      orders = Array.isArray(draftOrders) ? draftOrders : [];
    } else {
      app.innerHTML = `<div class="card"><h1>数据加载失败</h1><p>${err.message}</p></div>`;
      return;
    }
  }
  render();
}

function persist() {
  saveLocal(STORAGE_STAGES, stages);
  saveLocal(STORAGE_CODES, codes);
  saveLocal(STORAGE_ORDERS, orders);
}

function render() {
  app.innerHTML = `
    <div class="top">
      <div>
        <h1>KidLG 管理后台</h1>
        <p class="muted">配置费用 · 登记收款 · 生成并分发激活码。导出 JSON 后提交到仓库 data/ 即可生效。</p>
      </div>
      <div class="row">
        <a class="btn btn-ghost" href="../">返回前台</a>
        <button type="button" class="btn btn-ghost" id="logout">退出</button>
      </div>
    </div>
    <div class="tabs">
      <button type="button" class="tab ${tab === "pricing" ? "active" : ""}" data-tab="pricing">费用配置</button>
      <button type="button" class="tab ${tab === "issue" ? "active" : ""}" data-tab="issue">付费发码</button>
      <button type="button" class="tab ${tab === "codes" ? "active" : ""}" data-tab="codes">激活码库</button>
      <button type="button" class="tab ${tab === "orders" ? "active" : ""}" data-tab="orders">订单记录</button>
    </div>
    <div id="panel"></div>
  `;

  app.querySelectorAll("[data-tab]").forEach((el) => {
    el.addEventListener("click", () => {
      tab = el.getAttribute("data-tab");
      render();
    });
  });
  app.querySelector("#logout").addEventListener("click", () => {
    sessionStorage.removeItem(STORAGE_AUTH);
    renderGate();
  });

  const panel = app.querySelector("#panel");
  if (tab === "pricing") renderPricing(panel);
  else if (tab === "issue") renderIssue(panel);
  else if (tab === "codes") renderCodes(panel);
  else renderOrders(panel);
}

function renderPricing(panel) {
  const rows = stages
    .map((s, idx) => {
      const validityType = s.validity?.type || "lifetime";
      const days = s.validity?.days ?? 365;
      return `
        <tr data-idx="${idx}">
          <td><code>${s.stageId}</code></td>
          <td><input data-f="name" type="text" value="${escapeAttr(s.name)}" /></td>
          <td>
            <select data-f="access">
              <option value="free" ${s.access === "free" ? "selected" : ""}>免费</option>
              <option value="paid" ${s.access === "paid" ? "selected" : ""}>收费</option>
            </select>
          </td>
          <td><input data-f="priceYuan" type="number" min="0" step="0.1" value="${s.priceYuan ?? ""}" ${s.access === "free" ? "disabled" : ""} /></td>
          <td>
            <select data-f="validityType">
              <option value="lifetime" ${validityType === "lifetime" ? "selected" : ""}>永久</option>
              <option value="days_from_activate" ${validityType === "days_from_activate" ? "selected" : ""}>激活后N天</option>
            </select>
            <input data-f="validityDays" type="number" min="1" value="${days}" style="margin-top:6px" ${validityType === "lifetime" ? "disabled" : ""} />
          </td>
          <td>
            <label class="check"><input data-f="listed" type="checkbox" ${s.listed ? "checked" : ""} />上架</label>
            <input data-f="sortOrder" type="number" value="${s.sortOrder}" style="margin-top:6px;width:72px" />
          </td>
        </tr>
      `;
    })
    .join("");

  panel.innerHTML = `
    <div class="card">
      <h2>世界费用与上架</h2>
      <p class="muted">字母世界建议保持免费。改完后下载 stages.json，覆盖仓库 data/stages.json 并 push。</p>
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>名称</th><th>类型</th><th>价格(元)</th><th>有效期</th><th>上架/排序</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="row">
        <button type="button" class="btn btn-primary" id="save-stages">保存到浏览器草稿</button>
        <button type="button" class="btn btn-wood" id="dl-stages">下载 stages.json</button>
        <button type="button" class="btn btn-ghost" id="reload-stages">从仓库重新加载</button>
      </div>
      <p id="pricing-msg" class="msg"></p>
    </div>
  `;

  panel.querySelectorAll("tbody tr").forEach((tr) => {
    const idx = Number(tr.getAttribute("data-idx"));
    tr.querySelectorAll("[data-f]").forEach((input) => {
      input.addEventListener("change", () => {
        const f = input.getAttribute("data-f");
        const s = stages[idx];
        if (f === "listed") s.listed = input.checked;
        else if (f === "access") {
          s.access = input.value;
          if (s.access === "free") s.priceYuan = null;
          render();
          tab = "pricing";
        } else if (f === "priceYuan") {
          s.priceYuan = input.value === "" ? null : Number(input.value);
        } else if (f === "sortOrder") s.sortOrder = Number(input.value) || 0;
        else if (f === "name") s.name = input.value.trim();
        else if (f === "validityType") {
          if (input.value === "lifetime") s.validity = { type: "lifetime" };
          else s.validity = { type: "days_from_activate", days: s.validity?.days || 365 };
          render();
          tab = "pricing";
        } else if (f === "validityDays") {
          s.validity = { type: "days_from_activate", days: Number(input.value) || 365 };
        }
      });
    });
  });

  panel.querySelector("#save-stages").addEventListener("click", () => {
    persist();
    setMsg("pricing-msg", "草稿已保存到本机浏览器", true);
  });
  panel.querySelector("#dl-stages").addEventListener("click", () => {
    persist();
    downloadJson("stages.json", stages);
    setMsg("pricing-msg", "已下载。请覆盖 data/stages.json 后 git push。", true);
  });
  panel.querySelector("#reload-stages").addEventListener("click", async () => {
    stages = await fetchJson("../data/stages.json");
    localStorage.removeItem(STORAGE_STAGES);
    render();
  });
}

function renderIssue(panel) {
  const checks = paidStages()
    .map(
      (s) => `
      <label class="check">
        <input type="checkbox" name="stage" value="${s.stageId}" />
        ${s.name}（¥${s.priceYuan ?? "-"}）
      </label>`
    )
    .join("");

  panel.innerHTML = `
    <div class="card">
      <h2>付费登记 → 生成激活码</h2>
      <p class="muted">当前为「登记收款后发码」。微信/支付宝自动回调以后可接到同一生成逻辑。</p>
      <div class="row">
        <label>支付渠道
          <select id="channel">
            <option value="wechat">微信</option>
            <option value="alipay">支付宝</option>
            <option value="offline">线下/对公</option>
            <option value="mock">测试</option>
          </select>
        </label>
        <label>实收金额（元）
          <input id="amount" type="number" min="0" step="0.1" value="" />
        </label>
        <label>生成数量
          <input id="qty" type="number" min="1" max="50" value="1" />
        </label>
      </div>
      <p>开通世界</p>
      <div class="checks">${checks || "<span class='muted'>暂无收费世界上架</span>"}</div>
      <label style="margin-top:12px">备注
        <textarea id="note" placeholder="家长微信 / 订单号等"></textarea>
      </label>
      <div class="row">
        <button type="button" class="btn btn-primary" id="issue-btn">确认收款并生成激活码</button>
        <button type="button" class="btn btn-wood" id="fill-price">按勾选世界合计填金额</button>
      </div>
      <p id="issue-msg" class="msg"></p>
      <div id="issued-box" style="display:none;margin-top:12px">
        <p class="muted">请复制发给用户（一次性）：</p>
        <div class="code-box" id="issued-codes"></div>
        <div class="row">
          <button type="button" class="btn btn-ghost" id="copy-codes">复制激活码</button>
          <button type="button" class="btn btn-wood" id="dl-codes-now">下载 codes.json</button>
        </div>
      </div>
    </div>
  `;

  panel.querySelector("#fill-price").addEventListener("click", () => {
    const selected = [...panel.querySelectorAll('input[name="stage"]:checked')].map((el) => el.value);
    const sum = selected.reduce((acc, id) => {
      const s = stages.find((x) => x.stageId === id);
      return acc + (Number(s?.priceYuan) || 0);
    }, 0);
    panel.querySelector("#amount").value = sum ? String(Math.round(sum * 10) / 10) : "";
  });

  panel.querySelector("#issue-btn").addEventListener("click", () => {
    const selected = [...panel.querySelectorAll('input[name="stage"]:checked')].map((el) => el.value);
    if (!selected.length) {
      setMsg("issue-msg", "请至少选择一个收费世界", false);
      return;
    }
    const qty = Math.max(1, Math.min(50, Number(panel.querySelector("#qty").value) || 1));
    const channel = panel.querySelector("#channel").value;
    const amountYuan = Number(panel.querySelector("#amount").value);
    const note = panel.querySelector("#note").value.trim();
    const validity = mergeValidity(selected);

    const newCodes = [];
    for (let i = 0; i < qty; i++) {
      let code = generateCode();
      while (codes.some((c) => c.code === code) || newCodes.includes(code)) code = generateCode();
      newCodes.push(code);
      codes.unshift({
        code,
        stages: [...selected],
        status: "unused",
        validity,
        activatedAt: null,
        expireAt: null,
        deviceIds: [],
        createdAt: new Date().toISOString(),
        note: note || `via ${channel}`,
        singleUse: true,
      });
    }

    const order = {
      id: `ord_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      channel,
      amountYuan: Number.isFinite(amountYuan) ? amountYuan : null,
      stages: selected,
      codes: newCodes,
      note,
      status: "paid",
    };
    orders.unshift(order);
    lastIssued = newCodes;
    persist();

    panel.querySelector("#issued-box").style.display = "block";
    panel.querySelector("#issued-codes").textContent = newCodes.join("\n");
    setMsg("issue-msg", `已生成 ${newCodes.length} 个激活码，并写入订单与激活码库草稿`, true);
  });

  panel.querySelector("#copy-codes")?.addEventListener("click", async () => {
    const text = lastIssued?.join("\n") || "";
    try {
      await navigator.clipboard.writeText(text);
      setMsg("issue-msg", "已复制到剪贴板", true);
    } catch {
      setMsg("issue-msg", "复制失败，请手动选择复制", false);
    }
  });
  panel.querySelector("#dl-codes-now")?.addEventListener("click", () => {
    downloadJson("codes.json", codes);
    setMsg("issue-msg", "已下载 codes.json，请覆盖 data/codes.json 后 push", true);
  });
}

function mergeValidity(stageIds) {
  const list = stageIds.map((id) => stages.find((s) => s.stageId === id)?.validity).filter(Boolean);
  if (list.some((v) => v.type === "lifetime" || !v.type)) return { type: "lifetime" };
  const days = Math.max(...list.map((v) => v.days || 365));
  return { type: "days_from_activate", days };
}

function renderCodes(panel) {
  const rows = codes
    .slice(0, 200)
    .map((c) => {
      const worlds = (c.stages || []).map(stageName).join("、");
      return `
        <tr>
          <td><code>${c.code}</code></td>
          <td>${worlds}</td>
          <td>${c.status}</td>
          <td>${c.note || ""}</td>
          <td>${(c.createdAt || "").slice(0, 19).replace("T", " ")}</td>
          <td><button type="button" class="btn btn-danger" data-revoke="${c.code}">作废</button></td>
        </tr>`;
    })
    .join("");

  panel.innerHTML = `
    <div class="card">
      <h2>激活码库（草稿 ${codes.length} 条）</h2>
      <div class="row">
        <button type="button" class="btn btn-primary" id="save-codes">保存草稿</button>
        <button type="button" class="btn btn-wood" id="dl-codes">下载 codes.json</button>
        <button type="button" class="btn btn-ghost" id="reload-codes">从仓库重新加载</button>
      </div>
      <p id="codes-msg" class="msg"></p>
      <div style="overflow-x:auto;margin-top:12px">
        <table>
          <thead><tr><th>激活码</th><th>世界</th><th>状态</th><th>备注</th><th>创建时间</th><th></th></tr></thead>
          <tbody>${rows || "<tr><td colspan='6'>暂无</td></tr>"}</tbody>
        </table>
      </div>
    </div>
  `;

  panel.querySelector("#save-codes").addEventListener("click", () => {
    persist();
    setMsg("codes-msg", "草稿已保存", true);
  });
  panel.querySelector("#dl-codes").addEventListener("click", () => {
    persist();
    downloadJson("codes.json", codes);
    setMsg("codes-msg", "已下载，请覆盖 data/codes.json 后 push", true);
  });
  panel.querySelector("#reload-codes").addEventListener("click", async () => {
    codes = await fetchJson("../data/codes.json");
    localStorage.removeItem(STORAGE_CODES);
    render();
  });
  panel.querySelectorAll("[data-revoke]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.getAttribute("data-revoke");
      const item = codes.find((c) => c.code === code);
      if (item) item.status = "revoked";
      persist();
      render();
    });
  });
}

function renderOrders(panel) {
  const rows = orders
    .map((o) => {
      const worlds = (o.stages || []).map(stageName).join("、");
      return `
        <tr>
          <td><code>${o.id}</code></td>
          <td>${o.channel}</td>
          <td>${o.amountYuan ?? "-"}</td>
          <td>${worlds}</td>
          <td><code>${(o.codes || []).join("<br>")}</code></td>
          <td>${o.note || ""}</td>
          <td>${(o.createdAt || "").slice(0, 19).replace("T", " ")}</td>
        </tr>`;
    })
    .join("");

  panel.innerHTML = `
    <div class="card">
      <h2>订单记录（本机草稿 ${orders.length} 条）</h2>
      <p class="muted">订单默认只存在管理员浏览器。可下载备份；正式微信/支付宝对账以后再接服务端。</p>
      <div class="row">
        <button type="button" class="btn btn-wood" id="dl-orders">下载 orders.json</button>
        <button type="button" class="btn btn-danger" id="clear-orders">清空本机订单草稿</button>
      </div>
      <div style="overflow-x:auto;margin-top:12px">
        <table>
          <thead><tr><th>订单号</th><th>渠道</th><th>金额</th><th>世界</th><th>激活码</th><th>备注</th><th>时间</th></tr></thead>
          <tbody>${rows || "<tr><td colspan='7'>暂无订单</td></tr>"}</tbody>
        </table>
      </div>
    </div>
  `;

  panel.querySelector("#dl-orders").addEventListener("click", () => {
    downloadJson("orders.json", orders);
  });
  panel.querySelector("#clear-orders").addEventListener("click", () => {
    if (!confirm("确定清空本机订单草稿？")) return;
    orders = [];
    persist();
    render();
  });
}

function setMsg(id, text, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = ok ? "msg ok" : "msg bad";
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

boot();
