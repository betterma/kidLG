/**
 * GitHub Token 保险库（浏览器端）
 * - 明文 Token 永不进仓库
 * - 仓库只存 AES-GCM 密文 EMBEDDED_BLOB
 * - 口令正确才解密到 memoryToken，关闭标签页即丢失
 */

const PBKDF2_ITERATIONS = 310000;
const STORAGE_REMEMBER = "kidlg-admin:vault-pass";

/** 用 admin/vault-seal.html 生成后，粘贴到这里 */
export const EMBEDDED_BLOB = "eyJ2IjoxLCJpdGVyIjozMTAwMDAsInNhbHQiOiJzU3czQ25RZnhZWmNqOGZGR0Qwdjl3PT0iLCJpdiI6Im16REVRbmZicDRIdWx3Y2kiLCJjdCI6IktSazF2UTQ5WmJMclArV1hvT0toSDUwT2hZV0dLcnArRjNpU2RNb29TNmZGTncxdWN2YmhLeVczaUN2Yll0QTQ0YTVQcXkyakVNOEFEVGdzdjA2OG9rMmsrM1hUWjBFRFZ5b1dlUlRxL2c0SjhTNkdRQlp0VVF0WU1CU25PSmtqdTdMaXhZRXVuT3N5L2ozbTdnPT0ifQ==";

/** 解锁后仅存在内存；不要写入 localStorage */
export let memoryToken = null;

export function isVaultSealed() {
  return typeof EMBEDDED_BLOB === "string" && EMBEDDED_BLOB.trim().length > 20;
}

export function lockVault() {
  memoryToken = null;
}

export function getMemoryToken() {
  return memoryToken;
}

function b64encode(bytes) {
  let binary = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function b64decode(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * 用口令封装 Token，返回可嵌入仓库的密文字符串
 */
export async function sealToken(token, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token)
  );
  const payload = {
    v: 1,
    iter: PBKDF2_ITERATIONS,
    salt: b64encode(salt),
    iv: b64encode(iv),
    ct: b64encode(new Uint8Array(cipherBuf)),
  };
  return btoa(JSON.stringify(payload));
}

/**
 * 用口令解密 EMBEDDED_BLOB，成功则写入 memoryToken
 */
export async function unlockVault(password, { remember = false } = {}) {
  if (!isVaultSealed()) {
    throw new Error("尚未封存 Token：请先打开 vault-seal.html 生成密文");
  }
  let payload;
  try {
    payload = JSON.parse(atob(EMBEDDED_BLOB.trim()));
  } catch {
    throw new Error("密文损坏，请重新用 vault-seal.html 生成");
  }
  const salt = b64decode(payload.salt);
  const iv = b64decode(payload.iv);
  const ct = b64decode(payload.ct);
  const key = await deriveKey(password, salt);
  try {
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    memoryToken = new TextDecoder().decode(plainBuf);
  } catch {
    throw new Error("口令错误或密文损坏");
  }
  if (remember) localStorage.setItem(STORAGE_REMEMBER, password);
  else localStorage.removeItem(STORAGE_REMEMBER);
  return memoryToken;
}

/** 若勾选过「记住口令」，尝试自动解锁 */
export async function tryAutoUnlock() {
  const saved = localStorage.getItem(STORAGE_REMEMBER);
  if (!saved || !isVaultSealed()) return false;
  try {
    await unlockVault(saved, { remember: true });
    return true;
  } catch {
    localStorage.removeItem(STORAGE_REMEMBER);
    return false;
  }
}

export function clearRememberedPassword() {
  localStorage.removeItem(STORAGE_REMEMBER);
}
