/** 使用内存中的 Token 读写本仓库文件（Contents API） */

export function parseRepoFromConfig(config) {
  const raw = config?.data?.remoteBase || "";
  // https://raw.githubusercontent.com/betterma/kidLG/main/
  const m = raw.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//);
  if (m) return { owner: m[1], repo: m[2], branch: "main" };
  return { owner: "betterma", repo: "kidLG", branch: "main" };
}

async function gh(token, path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "kidlg-admin",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(data?.message || `GitHub ${res.status}`);
  }
  return data;
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64) {
  const binary = atob(String(b64).replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export async function getRepoJson(token, { owner, repo, branch }, filePath) {
  const data = await gh(
    token,
    `/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`
  );
  return {
    sha: data.sha,
    content: JSON.parse(fromBase64(data.content)),
  };
}

export async function putRepoJson(token, { owner, repo, branch }, filePath, obj, message) {
  let sha = null;
  try {
    const existing = await getRepoJson(token, { owner, repo, branch }, filePath);
    sha = existing.sha;
  } catch {
    sha = null;
  }
  const body = {
    message,
    content: toBase64(JSON.stringify(obj, null, 2) + "\n"),
    branch,
  };
  if (sha) body.sha = sha;
  await gh(token, `/repos/${owner}/${repo}/contents/${filePath}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
