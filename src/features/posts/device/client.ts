export const DEVICE_STORAGE_KEY = "cmcc-puzzle-device-id";

export type VisitorIdLoader = () => Promise<string>;

let inFlightVisitorId: Promise<string> | null = null;

async function defaultLoader() {
  const FingerprintJS = await import("@fingerprintjs/fingerprintjs");
  const agent = await FingerprintJS.load();
  const result = await agent.get();

  return result.visitorId;
}

export async function getPersistentVisitorId(
  loader: VisitorIdLoader = defaultLoader,
) {
  const cachedVisitorId = localStorage.getItem(DEVICE_STORAGE_KEY);

  if (cachedVisitorId?.trim()) {
    return cachedVisitorId;
  }

  if (inFlightVisitorId) {
    return inFlightVisitorId;
  }

  const request = (async () => {
    const visitorId = await loader();

    if (!visitorId.trim()) {
      throw new Error("Fingerprint loader returned an empty visitorId");
    }

    localStorage.setItem(DEVICE_STORAGE_KEY, visitorId);
    return visitorId;
  })();

  inFlightVisitorId = request;

  try {
    return await request;
  } finally {
    if (inFlightVisitorId === request) {
      inFlightVisitorId = null;
    }
  }
}
