import { randomUUID } from "node:crypto";

import { claimPost } from "@/features/posts/server/post-repository";
import { checkClaimRateLimit } from "@/features/posts/server/rate-limit";
import { getApprovedUser } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return jsonError("INVALID_INPUT", 400);
  }

  const user = await getApprovedUser();
  if (!user) return jsonError("UNAUTHENTICATED", 401);

  const ip = clientIp(request);

  try {
    const rate = await checkClaimRateLimit(user.id, ip);
    if (!rate.success) {
      const retryAfter = Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000));
      return jsonError("RATE_LIMITED", 429, { "Retry-After": String(retryAfter) });
    }

    // 领取人与发布者不同 IP/设备的判断由 DB 端结合封顶决定;此处始终允许赚取,
    // 具体是否加分交给 claim_post 的当日封顶与类型判断。共享 IP 的粗判可后续增强。
    const result = await claimPost(id, user.id, true);
    switch (result.status) {
      case "CLAIMED":
        return Response.json(
          { payloads: result.payloads, idempotent: result.idempotent },
          { headers: { "Cache-Control": "no-store" } },
        );
      case "SELF_CLAIM_FORBIDDEN":
        return jsonError("SELF_CLAIM_FORBIDDEN", 403);
      case "ALREADY_CLAIMED":
        return jsonError("ALREADY_CLAIMED", 409);
      case "EXPIRED":
        return jsonError("EXPIRED", 404);
      case "INSUFFICIENT_CREDITS":
        return jsonError("INSUFFICIENT_CREDITS", 402);
    }
  } catch {
    console.error(
      JSON.stringify({ code: "SERVICE_UNAVAILABLE", requestId: randomUUID() }),
    );
    return jsonError("SERVICE_UNAVAILABLE", 503);
  }
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function jsonError(code: string, status: number, headers?: Record<string, string>) {
  return Response.json(
    { error: { code, message: code } },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}
