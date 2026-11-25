/**
 * 内容 JSON：线上直读仓库 main（改 JSON push 即可生效，不必跑 Pages）。
 * 本地开发仍读同域 ./data/。远程失败时回退到 Pages 包内旧 data/。
 */

export function resolveDataBase(config) {
  const dataCfg = config?.data || {};
  const mode = dataCfg.source || "auto";
  const remote = normalizeBase(
    dataCfg.remoteBase || "https://raw.githubusercontent.com/betterma/kidLG/main/"
  );

  if (mode === "local") return { base: "./", remote: false };
  if (mode === "remote") return { base: remote, remote: true };

  const host = typeof location !== "undefined" ? location.hostname : "";
  const isLocal =
    !host ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".local");

  if (isLocal) return { base: "./", remote: false };
  return { base: remote, remote: true };
}

function normalizeBase(base) {
  return base.endsWith("/") ? base : `${base}/`;
}

export function dataUrl(base, relativePath) {
  const rel = String(relativePath || "").replace(/^\.\//, "");
  if (base === "./") return rel;
  return `${base}${rel}`;
}

export async function loadJsonFrom(url, { noStore = false } = {}) {
  const res = await fetch(url, noStore ? { cache: "no-store" } : undefined);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return res.json();
}

/** 优先远程（线上），失败则回退本地相对路径 */
export async function loadDataJson(config, relativePath) {
  const { base, remote } = resolveDataBase(config);
  const primary = dataUrl(base, relativePath);
  try {
    return await loadJsonFrom(primary, { noStore: remote });
  } catch (err) {
    if (!remote) throw err;
    const fallback = dataUrl("./", relativePath);
    return loadJsonFrom(fallback);
  }
}
