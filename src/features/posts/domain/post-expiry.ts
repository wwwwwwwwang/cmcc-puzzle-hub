const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getPostExpiresAt(now = new Date()) {
  const shanghaiNow = new Date(now.getTime() + SHANGHAI_UTC_OFFSET_MS);
  const nextMonthStartUtc = Date.UTC(
    shanghaiNow.getUTCFullYear(),
    shanghaiNow.getUTCMonth() + 1,
    1,
  );

  return new Date(nextMonthStartUtc - SHANGHAI_UTC_OFFSET_MS);
}
