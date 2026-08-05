import "server-only";

const DEVICE_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function toPublicDeviceId(deviceHash: string) {
  if (!DEVICE_HASH_PATTERN.test(deviceHash)) {
    throw new Error("Invalid device hash");
  }

  return `U-${deviceHash.slice(0, 16).toUpperCase()}`;
}
