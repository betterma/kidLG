import { getDeviceId, loadJson, saveJson } from "./storage.js";

const KEY = "entitlements";
const CONSUMED_KEY = "consumedCodes";

export function getEntitlements() {
  return loadJson(KEY, null);
}

export function isActivated() {
  const e = getEntitlements();
  return !!(e && e.status === "active" && !isExpired(e.expireAt));
}

function getConsumedCodes() {
  const list = loadJson(CONSUMED_KEY, []);
  return Array.isArray(list) ? list.map((c) => String(c).toUpperCase()) : [];
}

function markConsumed(code) {
  const normalized = String(code).trim().toUpperCase();
  const list = getConsumedCodes();
  if (!list.includes(normalized)) {
    list.push(normalized);
    saveJson(CONSUMED_KEY, list);
  }
}

function computeExpireAt(validity, fromDate = new Date()) {
  if (!validity || validity.type === "lifetime") return null;
  if (validity.type === "fixed_date") return validity.until;
  if (validity.type === "days_from_activate") {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + (validity.days || 0));
    return d.toISOString();
  }
  return null;
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

/**
 * 激活码一次性：兑换成功后记入本机已用列表，同一浏览器不可再兑。
 * 跨设备全局作废需后端；静态站阶段以本机作废为准。
 */
export async function redeemCode(rawCode, codesList) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, message: "请输入激活码" };

  if (getConsumedCodes().includes(code)) {
    return { ok: false, message: "激活码已使用" };
  }

  const found = (codesList || []).find((c) => String(c.code).toUpperCase() === code);
  if (!found) return { ok: false, message: "激活码无效" };
  if (found.status === "revoked" || found.status === "used") {
    return { ok: false, message: "激活码已作废" };
  }

  const now = new Date();
  let expireAt = found.expireAt;
  if (!expireAt) expireAt = computeExpireAt(found.validity, now);
  if (found.status === "expired" || isExpired(expireAt)) {
    return { ok: false, message: "激活码已过期" };
  }

  const existing = getEntitlements();
  const mergedStages = new Set([...(existing?.stages || []), ...(found.stages || [])]);

  const entitlements = {
    code: found.code,
    stages: [...mergedStages],
    expireAt,
    deviceId: getDeviceId(),
    status: "active",
    codeHash: await hashCode(found.code),
  };

  markConsumed(found.code);
  saveJson(KEY, entitlements);
  return { ok: true, entitlements, message: "开通成功" };
}

/** 仅按免费世界 / 已开通世界门禁，无全开模式 */
export function canAccessStage(stage) {
  if (!stage) return false;
  if (stage.access === "free") return true;
  const e = getEntitlements();
  if (!e || e.status !== "active") return false;
  if (isExpired(e.expireAt)) return false;
  return (e.stages || []).includes(stage.stageId);
}
