let depth = 0;
let root = null;

function ensureRoot() {
  if (root && document.body.contains(root)) return root;
  root = document.createElement("div");
  root.id = "global-loading";
  root.className = "global-loading";
  root.hidden = true;
  root.innerHTML = `
    <div class="global-loading-card" role="status" aria-live="polite">
      <div class="global-loading-spinner"></div>
      <p class="global-loading-text">加载中…</p>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

export function showLoading(text = "加载中…") {
  depth += 1;
  const el = ensureRoot();
  el.querySelector(".global-loading-text").textContent = text;
  el.hidden = false;
}

export function hideLoading() {
  depth = Math.max(0, depth - 1);
  if (depth === 0 && root) root.hidden = true;
}

export async function withLoading(text, fn) {
  showLoading(text);
  try {
    return await fn();
  } finally {
    hideLoading();
  }
}
