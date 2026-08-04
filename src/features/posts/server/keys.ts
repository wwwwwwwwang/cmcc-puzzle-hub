import { randomUUID as nodeRandomUUID } from "node:crypto";

import type { Discount, PostType } from "../domain/types";

function withPrefix(key: string, prefix?: string) {
  return prefix ? `${prefix}:${key}` : key;
}

export function postKey(id: string, prefix?: string) {
  return withPrefix(`post:${id}`, prefix);
}

export function dedupeKey(hash: string, prefix?: string) {
  return withPrefix(`dedupe:${hash}`, prefix);
}

export function claimKey(id: string, prefix?: string) {
  return withPrefix(`claim:${id}`, prefix);
}

export function allIndexKey(prefix?: string) {
  return withPrefix("hall:posts", prefix);
}

export function typeIndexKey(type: PostType, prefix?: string) {
  return withPrefix(`hall:type:${type}`, prefix);
}

export function discountIndexKey(discount: Discount, prefix?: string) {
  return withPrefix(`hall:discount:${discount}`, prefix);
}

export function typeDiscountIndexKey(
  type: PostType,
  discount: Discount,
  prefix?: string,
) {
  return withPrefix(`hall:type:${type}:discount:${discount}`, prefix);
}

export function createPostId(
  expiresAtMillis: number,
  randomUUID: () => string = nodeRandomUUID,
) {
  return `p_${expiresAtMillis}_${randomUUID()}`;
}

const POST_ID_PATTERN =
  /^p_(\d{13})_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function parsePostId(id: string) {
  const match = POST_ID_PATTERN.exec(id);
  if (!match) return null;

  const expiresAtMillis = Number(match[1]);
  if (!Number.isSafeInteger(expiresAtMillis)) return null;

  return { expiresAtMillis };
}
