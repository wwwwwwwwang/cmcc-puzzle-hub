import { randomUUID } from "node:crypto";

import { hashVisitorId } from "@/features/posts/device/hash";
import { toPublicDeviceId } from "@/features/posts/device/public-id";
import { claimPostInputSchema } from "@/features/posts/domain/schemas";

export async function POST(request: Request) {
  let visitorId: string;
  try {
    visitorId = claimPostInputSchema.parse(await request.json()).visitorId;
  } catch {
    return jsonError("INVALID_INPUT", 400);
  }

  try {
    return Response.json(
      { publicId: toPublicDeviceId(hashVisitorId(visitorId)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error(
      JSON.stringify({ code: "SERVICE_UNAVAILABLE", requestId: randomUUID() }),
    );
    return jsonError("SERVICE_UNAVAILABLE", 503);
  }
}

function jsonError(code: string, status: number) {
  return Response.json(
    { error: { code, message: code } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
