import { isActivated, getEntitlements } from "./entitlement.js";

let timer = null;
let configRef = { enabled: false, endpoint: "" };

export function setSyncConfig(syncConfig) {
  configRef = syncConfig || { enabled: false, endpoint: "" };
}

export function isSyncEnabled() {
  return !!(configRef.enabled && configRef.endpoint);
}

/**
 * 激活后静默同步进度。无 endpoint 时仅为预留（不报错）。
 */
export function queueSyncIfActivated(snapshot) {
  if (!isActivated()) return;
  if (!isSyncEnabled()) return;

  clearTimeout(timer);
  timer = setTimeout(() => {
    pushProgress(snapshot).catch(() => {
      /* 静默失败 */
    });
  }, 2500);
}

async function pushProgress(snapshot) {
  const e = getEntitlements();
  if (!e?.codeHash) return;
  const body = {
    ...snapshot,
    codeHash: e.codeHash,
  };
  await fetch(configRef.endpoint.replace(/\/$/, "") + "/progress", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function pullProgress() {
  if (!isSyncEnabled()) return null;
  const e = getEntitlements();
  if (!e?.codeHash) return null;
  const res = await fetch(
    `${configRef.endpoint.replace(/\/$/, "")}/progress/${encodeURIComponent(e.codeHash)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.progress || data;
}

/** 清除云端进度；无中转时返回 false（表示未真正清云） */
export async function clearRemoteProgress(codeHash) {
  if (!isSyncEnabled()) return false;
  const hash = codeHash || getEntitlements()?.codeHash;
  if (!hash) return false;

  const base = configRef.endpoint.replace(/\/$/, "");
  const empty = {
    codeHash: hash,
    deviceId: "",
    updatedAt: new Date().toISOString(),
    levels: {},
  };

  let res = await fetch(`${base}/progress/${encodeURIComponent(hash)}`, {
    method: "DELETE",
  }).catch(() => null);

  if (!res || !res.ok) {
    res = await fetch(`${base}/progress`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(empty),
    });
  }
  return !!(res && res.ok);
}
