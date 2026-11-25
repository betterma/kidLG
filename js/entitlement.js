import { getDeviceId, loadJson, saveJson, removeKey } from "./storage.js";

const KEY = "entitlements";

export function getEntitlements() {
  return loadJson(KEY, null);
}

export function isActivated() {
  const e = getEntitlements();
  return !!(e && e.status === "active");
}

export function clearEntitlements() {
  removeKey(KEY);
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

export async function redeemCode(rawCode, codesList) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, message: "请输入激活码" };

  const found = (codesList || []).find((c) => String(c.code).toUpperCase() === code);
  if (!found) return { ok: false, message: "激活码无效" };
  if (found.status === "revoked") return { ok: false, message: "激活码已作废" };

  const now = new Date();
  let expireAt = found.expireAt;
  if (!expireAt) expireAt = computeExpireAt(found.validity, now);
  if (found.status === "expired" || isExpired(expireAt)) {
    return { ok: false, message: "激活码已过期" };
  }

  const entitlements = {
    code: found.code,
    stages: [...(found.stages || [])],
    expireAt,
    deviceId: getDeviceId(),
    status: "active",
    codeHash: await hashCode(found.code),
  };
  saveJson(KEY, entitlements);
  return { ok: true, entitlements, message: "激活成功" };
}

export function canAccessStage(stage, edition) {
  if (edition === "owner") return true;
  if (!stage) return false;
  if (stage.access === "free") return true;
  const e = getEntitlements();
  if (!e || e.status !== "active") return false;
  if (isExpired(e.expireAt)) return false;
  return (e.stages || []).includes(stage.stageId);
}
