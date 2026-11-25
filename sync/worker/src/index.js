/**
 * KidLG API — 数据落在 GitHub 仓库，本 Worker 只做带密钥的读写中转。
 * 浏览器绝不持有 GITHUB_TOKEN。
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if ((path === "/" || path === "") && request.method === "GET") {
        return json({
          ok: true,
          service: "kidlg-api",
          routes: ["/health", "POST /redeem", "PUT /progress", "GET|DELETE /progress/:hash"],
        });
      }
      if (path === "/health" && request.method === "GET") {
        return json({ ok: true });
      }
      if (path === "/redeem" && request.method === "POST") {
        return json(await redeem(request, env));
      }
      if (path === "/progress" && request.method === "PUT") {
        return json(await putProgress(request, env));
      }
      if (path.startsWith("/progress/") && request.method === "GET") {
        const hash = decodeURIComponent(path.slice("/progress/".length));
        return json(await getProgress(hash, env));
      }
      if (path.startsWith("/progress/") && request.method === "DELETE") {
        const hash = decodeURIComponent(path.slice("/progress/".length));
        return json(await deleteProgress(hash, env));
      }
      return json({ ok: false, message: "not found" }, 404);
    } catch (err) {
      return json({ ok: false, message: err.message || "server error" }, 500);
    }
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function cfg(env) {
  const token = env.GITHUB_TOKEN;
  if (!token) throw new Error("缺少 GITHUB_TOKEN");
  return {
    token,
    owner: env.GITHUB_OWNER || "betterma",
    repo: env.GITHUB_REPO || "kidLG",
    branch: env.GITHUB_BRANCH || "main",
    codesPath: env.CODES_PATH || "data/codes.json",
    progressDir: env.PROGRESS_DIR || "data/progress",
  };
}

async function gh(env, path, init = {}) {
  const { token } = cfg(env);
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "kidlg-api",
      "X-GitHub-Api-Version": "2022-11-28",
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
    const msg = data?.message || text || res.statusText;
    throw new Error(`GitHub API ${res.status}: ${msg}`);
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
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function getFile(env, filePath) {
  const c = cfg(env);
  const data = await gh(
    env,
    `/repos/${c.owner}/${c.repo}/contents/${filePath}?ref=${encodeURIComponent(c.branch)}`
  );
  const content = JSON.parse(fromBase64(data.content));
  return { sha: data.sha, content, path: filePath };
}

async function putFile(env, filePath, contentObj, sha, message) {
  const c = cfg(env);
  const body = {
    message,
    content: toBase64(JSON.stringify(contentObj, null, 2) + "\n"),
    branch: c.branch,
  };
  if (sha) body.sha = sha;
  return gh(env, `/repos/${c.owner}/${c.repo}/contents/${filePath}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

async function deleteFile(env, filePath, sha, message) {
  const c = cfg(env);
  return gh(env, `/repos/${c.owner}/${c.repo}/contents/${filePath}`, {
    method: "DELETE",
    body: JSON.stringify({ message, sha, branch: c.branch }),
  });
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

async function hashCode(code) {
  const normalized = String(code).trim().toUpperCase();
  const data = new TextEncoder().encode(normalized);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

async function redeem(request, env) {
  const c = cfg(env);
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();
  const deviceId = String(body.deviceId || "").trim();
  if (!code) return { ok: false, message: "请输入激活码" };

  // 乐观锁重试，防止两台设备同时兑同一码
  for (let attempt = 0; attempt < 3; attempt++) {
    const file = await getFile(env, c.codesPath);
    const list = Array.isArray(file.content) ? file.content : [];
    const idx = list.findIndex((item) => String(item.code).toUpperCase() === code);
    if (idx < 0) return { ok: false, message: "激活码无效" };

    const found = list[idx];
    if (found.status === "used" || found.status === "revoked") {
      return { ok: false, message: "激活码已使用" };
    }
    if (found.status === "expired") {
      return { ok: false, message: "激活码已过期" };
    }

    const now = new Date();
    let expireAt = found.expireAt || computeExpireAt(found.validity, now);
    if (expireAt && Date.now() > Date.parse(expireAt)) {
      return { ok: false, message: "激活码已过期" };
    }

    const deviceIds = Array.isArray(found.deviceIds) ? [...found.deviceIds] : [];
    if (deviceId && !deviceIds.includes(deviceId)) deviceIds.push(deviceId);

    list[idx] = {
      ...found,
      status: "used",
      activatedAt: now.toISOString(),
      expireAt,
      deviceIds,
    };

    try {
      await putFile(
        env,
        c.codesPath,
        list,
        file.sha,
        `chore(license): consume ${code}`
      );
    } catch (err) {
      if (String(err.message).includes("409") || String(err.message).includes("sha")) {
        continue;
      }
      throw err;
    }

    const entitlements = {
      code: found.code,
      stages: [...(found.stages || [])],
      expireAt,
      deviceId,
      status: "active",
      codeHash: await hashCode(found.code),
    };
    return { ok: true, message: "开通成功", entitlements };
  }
  return { ok: false, message: "系统繁忙，请重试" };
}

async function putProgress(request, env) {
  const c = cfg(env);
  const body = await request.json();
  const hash = body.codeHash;
  if (!hash) return { ok: false, message: "缺少 codeHash" };
  const path = `${c.progressDir}/${hash}.json`;
  let sha = null;
  try {
    const existing = await getFile(env, path);
    sha = existing.sha;
  } catch {
    sha = null;
  }
  await putFile(env, path, body, sha, `chore(progress): sync ${hash}`);
  return { ok: true };
}

async function getProgress(hash, env) {
  const c = cfg(env);
  const path = `${c.progressDir}/${hash}.json`;
  try {
    const file = await getFile(env, path);
    return { ok: true, progress: file.content };
  } catch {
    return { ok: false, progress: null };
  }
}

async function deleteProgress(hash, env) {
  const c = cfg(env);
  const path = `${c.progressDir}/${hash}.json`;
  try {
    const file = await getFile(env, path);
    await deleteFile(env, path, file.sha, `chore(progress): clear ${hash}`);
    return { ok: true };
  } catch {
    // 无文件也算清除成功
    return { ok: true };
  }
}
