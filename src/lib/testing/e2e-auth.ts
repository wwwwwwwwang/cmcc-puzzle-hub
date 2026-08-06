export const E2E_AUTH_COOKIE = "cmcc-e2e-auth";
export const E2E_PUBLIC_ID = "U-0123456789ABCDEF";

type E2eAuthEnvironment = {
  nodeEnv?: string;
  authToken?: string;
};

const E2E_SESSION = {
  isAuthenticated: true,
  isApproved: true,
  isAdmin: false,
  publicId: E2E_PUBLIC_ID,
  username: "e2e-user",
} as const;

export function getE2eAuthSession(
  requestToken: string | undefined,
  environment: E2eAuthEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    authToken: process.env.E2E_TEST_AUTH_TOKEN,
  },
) {
  if (environment.nodeEnv === "production" || !environment.authToken) {
    return null;
  }

  if (requestToken !== environment.authToken) {
    return null;
  }

  return E2E_SESSION;
}
