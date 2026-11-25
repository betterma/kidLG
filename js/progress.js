import { getDeviceId, loadJson, saveJson, removeKey } from "./storage.js";
import { queueSyncIfActivated, clearRemoteProgress } from "./sync.js";

const KEY = "progress";

function emptySnapshot() {
  return {
    codeHash: null,
    deviceId: getDeviceId(),
    updatedAt: new Date().toISOString(),
    levels: {},
  };
}

export function getProgress() {
  return loadJson(KEY, emptySnapshot());
}

export function saveProgress(snapshot) {
  snapshot.deviceId = getDeviceId();
  snapshot.updatedAt = new Date().toISOString();
  saveJson(KEY, snapshot);
  queueSyncIfActivated(snapshot);
  return snapshot;
}

export function getLevelProgress(levelId) {
  return getProgress().levels[levelId] || { stars: 0, cleared: false, attempts: 0 };
}

export function recordAttempt(levelId) {
  const snap = getProgress();
  const cur = snap.levels[levelId] || { stars: 0, cleared: false, attempts: 0 };
  cur.attempts += 1;
  snap.levels[levelId] = cur;
  return saveProgress(snap);
}

export function recordClear(levelId, stars = 1) {
  const snap = getProgress();
  const cur = snap.levels[levelId] || { stars: 0, cleared: false, attempts: 0 };
  cur.cleared = true;
  cur.stars = Math.max(cur.stars || 0, stars);
  snap.levels[levelId] = cur;
  return saveProgress(snap);
}

export function mergeProgress(localSnap, remoteSnap) {
  if (!remoteSnap) return localSnap;
  const out = emptySnapshot();
  out.codeHash = remoteSnap.codeHash || localSnap.codeHash || null;
  const ids = new Set([
    ...Object.keys(localSnap.levels || {}),
    ...Object.keys(remoteSnap.levels || {}),
  ]);
  for (const id of ids) {
    const a = localSnap.levels?.[id];
    const b = remoteSnap.levels?.[id];
    if (!a) out.levels[id] = { ...b };
    else if (!b) out.levels[id] = { ...a };
    else {
      out.levels[id] = {
        cleared: !!(a.cleared || b.cleared),
        stars: Math.max(a.stars || 0, b.stars || 0),
        attempts: (a.attempts || 0) + (b.attempts || 0),
      };
    }
  }
  const ta = Date.parse(localSnap.updatedAt || 0) || 0;
  const tb = Date.parse(remoteSnap.updatedAt || 0) || 0;
  out.updatedAt = new Date(Math.max(ta, tb) || Date.now()).toISOString();
  return out;
}

/**
 * 未激活：只清本地。
 * 已激活：清本地，并尽量清云端（有同步中转时）。
 */
export async function clearAllProgress({ activated, codeHash } = {}) {
  removeKey(KEY);
  let remoteCleared = false;
  let remoteAttempted = false;
  if (activated) {
    remoteAttempted = true;
    try {
      remoteCleared = await clearRemoteProgress(codeHash);
    } catch {
      remoteCleared = false;
    }
  }
  return { remoteAttempted, remoteCleared };
}
