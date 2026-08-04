import "server-only";

import { createHmac } from "node:crypto";

export function hashVisitorId(
  visitorId: string,
  secret = process.env.DEVICE_HASH_SECRET,
) {
  if (!secret?.trim()) {
    throw new Error("DEVICE_HASH_SECRET must be configured");
  }

  const normalizedVisitorId = visitorId.trim();

  if (!normalizedVisitorId) {
    throw new Error("visitorId must not be empty");
  }

  return createHmac("sha256", secret)
    .update(normalizedVisitorId)
    .digest("hex");
}
