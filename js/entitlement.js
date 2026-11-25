import { getDeviceId, loadJson, saveJson } from "./storage.js";

const KEY = "entitlements";

export function getEntitlements() {
  return loadJson(KEY, null);
}

export function isActivated() {
  const e = getEntitlements();
  return !!(e && e.status === "active" && !isExpired(e.expireAt));
}

function isExpired(expireAt) {
  if (!expireAt) return false;
  return Date.now() > Date.parse(expireAt);
}

export async function hashCode(code) {
  const normalized = String(code).trim().toUpperCase();
  if (crypto.subtle) {
    const data = new TextEncoder().encode(normalized);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  }
  let h = 0;
  for (let i = 0; i < normalized.length; i++) h = (h * 31 + normalized.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

function licenseEndpoint(config) {
  return (config?.license?.endpoint || config?.sync?.endpoint || "").replace(/\/$/, "");
}

/**
 * 激活必须走 GitHub 中转 API：远程把 codes.json 里该码标为 used。
 * 换浏览器也无法再兑同一码。
 */
export async function redeemCode(rawCode, _codesList, config) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, message: "请输入激活码" };

  const endpoint = licenseEndpoint(config);
  if (!endpoint) {
    return {
      ok: false,
      message: "激活服务未配置，请稍后再试",
    };
  }

  let res;
  try {
    res = await fetch(`${endpoint}/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, deviceId: getDeviceId() }),
    });
  } catch {
    return { ok: false, message: "网络异常，请稍后重试" };
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    return { ok: false, message: "激活服务异常" };
  }

  if (!res.ok || !data?.ok) {
    return { ok: false, message: data?.message || "激活失败" };
  }

  const entitlements = data.entitlements;
  if (!entitlements?.codeHash && entitlements?.code) {
    entitlements.codeHash = await hashCode(entitlements.code);
  }
  entitlements.deviceId = entitlements.deviceId || getDeviceId();
  saveJson(KEY, entitlements);
  return { ok: true, entitlements, message: data.message || "开通成功" };
}

/** 仅按免费世界 / 已开通世界门禁 */
export function canAccessStage(stage) {
  if (!stage) return false;
  if (stage.access === "free") return true;
  const e = getEntitlements();
  if (!e || e.status !== "active") return false;
  if (isExpired(e.expireAt)) return false;
  return (e.stages || []).includes(stage.stageId);
}
