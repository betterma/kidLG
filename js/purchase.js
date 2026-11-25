import { getDeviceId } from "./storage.js";

function endpoint(config) {
  return (config?.license?.endpoint || config?.sync?.endpoint || "").replace(/\/$/, "");
}

/**
 * 用户侧购买（当前 mock：登记并生成激活码写入 GitHub codes.json）
 * 以后接微信/支付宝时，只替换下单与支付确认，发码逻辑可复用。
 */
export async function checkoutStages(config, stageIds, { channel = "mock" } = {}) {
  const base = endpoint(config);
  if (!base) {
    return { ok: false, message: "购买服务未配置" };
  }
  const res = await fetch(`${base}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stageIds,
      channel,
      deviceId: getDeviceId(),
      mock: true,
    }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    return { ok: false, message: "购买服务异常" };
  }
  if (!res.ok || !data?.ok) {
    return { ok: false, message: data?.message || "购买失败" };
  }
  return data;
}
