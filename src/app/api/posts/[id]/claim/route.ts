import { hashVisitorId } from "@/features/posts/device/hash";
import { claimPost } from "@/features/posts/server/post-repository";
import { claimPostInputSchema } from "@/features/posts/domain/schemas";
import { parsePostId } from "@/features/posts/server/keys";
import { randomUUID } from "node:crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!parsePostId(id)) {
    return jsonError("INVALID_INPUT", 400);
  }

  let visitorId: string;
  try {
    visitorId = claimPostInputSchema.parse(await request.json()).visitorId;
  } catch {
    return jsonError("INVALID_INPUT", 400);
  }

  try {
    const result = await claimPost(id, hashVisitorId(visitorId));
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
      case "INVALID_POST_ID":
        return jsonError("INVALID_INPUT", 400);
    }
  } catch {
    console.error(JSON.stringify({ code: "SERVICE_UNAVAILABLE", requestId: randomUUID() }));
    return jsonError("SERVICE_UNAVAILABLE", 503);
  }
}

function jsonError(code: string, status: number) {
  return Response.json(
    { error: { code, message: code } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
