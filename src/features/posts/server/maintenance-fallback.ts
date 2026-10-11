import "server-only";

import { getRedis } from "./redis";
import { syncRequestMaintenance } from "./post-repository";

const FALLBACK_KEY = "maintenance:request-help:read-fallback";
const FALLBACK_TTL_SECONDS = 5 * 60;

/**
 * Cron 短暂失败时提供有界兜底：全局每 5 分钟最多一个请求执行维护。
 * 兜底失败不阻塞账户活动读取。
 */
export async function runMaintenanceFallback() {
  try {
    const acquired = await getRedis().set(FALLBACK_KEY, "1", {
      nx: true,
      ex: FALLBACK_TTL_SECONDS,
    });
    if (acquired !== "OK") return;
    await syncRequestMaintenance();
  } catch {
    // 维护兜底是 best-effort；正常 Cron 仍负责最终一致性。
  }
}
