import { isActivated, getEntitlements } from "./entitlement.js";

let timer = null;
let configRef = { enabled: false, endpoint: "" };

export function setSyncConfig(syncConfig) {
  configRef = syncConfig || { enabled: false, endpoint: "" };
}

/**
 * 激活后静默同步进度。无 endpoint 时仅为预留（不报错）。
 */
export function queueSyncIfActivated(snapshot) {
  if (!isActivated()) return;
  if (!configRef.enabled || !configRef.endpoint) return;

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
  if (!configRef.enabled || !configRef.endpoint) return null;
  const e = getEntitlements();
  if (!e?.codeHash) return null;
  const res = await fetch(
    `${configRef.endpoint.replace(/\/$/, "")}/progress/${encodeURIComponent(e.codeHash)}`
  );
  if (!res.ok) return null;
  return res.json();
}
