import { randomUUID } from "node:crypto";

import { helpRequestPost } from "@/features/posts/server/post-repository";
import { checkClaimRateLimit } from "@/features/posts/server/rate-limit";
import { getApprovedUser } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return jsonError("INVALID_INPUT", 400);

  const user = await getApprovedUser();
  if (!user) return jsonError("UNAUTHENTICATED", 401);

  try {
    const rate = await checkClaimRateLimit(user.id, clientIp(request));
    if (!rate.success) {
      const retryAfter = Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000));
      return jsonError("RATE_LIMITED", 429, { "Retry-After": String(retryAfter) });
    }

    const result = await helpRequestPost(id, user.id);
    switch (result.status) {
      case "HELPED":
        return Response.json(
          {
            payloads: result.payloads,
            idempotent: result.idempotent,
            confirmationDeadline: result.confirmationDeadline,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      case "SELF_HELP_FORBIDDEN":
        return jsonError("SELF_HELP_FORBIDDEN", 403);
      case "ALREADY_HELPED":
      case "HELP_RETRY_FORBIDDEN":
        return jsonError(result.status, 409);
      case "EXPIRED":
        return jsonError("EXPIRED", 404);
      case "INVALID_POST_TYPE":
        return jsonError("INVALID_POST_TYPE", 400);
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
