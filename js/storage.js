const PREFIX = "kidlg:";

export function getDeviceId() {
  const key = PREFIX + "deviceId";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function removeKey(key) {
  localStorage.removeItem(PREFIX + key);
}
