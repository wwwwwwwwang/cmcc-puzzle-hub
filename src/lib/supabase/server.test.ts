import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => {
      let cached = false;
      let value: unknown;
      return (...args: Parameters<T>) => {
        if (!cached) {
          value = fn(...args);
          cached = true;
        }
        return value;
      };
    },
  };
});

const { createServerClient, cookies } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("next/headers", () => ({ cookies }));

describe("Supabase 服务端会话上下文", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    cookies.mockResolvedValue({
      get: vi.fn(),
      getAll: vi.fn(() => []),
      set: vi.fn(),
    });
  });

  it("同一请求内并发读取身份只调用一次 getUser 和 profile", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "user-1@puzzle.internal",
        },
      },
    });
    const profileQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn().mockResolvedValue({
        data: {
          public_id: "U-TEST",
          username: "测试用户",
          status: "APPROVED",
          is_admin: false,
        },
        error: null,
      }),
    };
    profileQuery.select.mockReturnValue(profileQuery);
    profileQuery.eq.mockReturnValue(profileQuery);
    const from = vi.fn(() => profileQuery);
    createServerClient.mockReturnValue({
      auth: { getUser },
      from,
    });

    const { getApprovedUser, getAuthSession, getCurrentUser } = await import(
      "./server"
    );

    const [currentUser, session, approvedUser] = await Promise.all([
      getCurrentUser(),
      getAuthSession(),
      getApprovedUser(),
    ]);

    expect(currentUser?.id).toBe("user-1");
    expect(session).toMatchObject({
      isAuthenticated: true,
      isApproved: true,
      publicId: "U-TEST",
    });
    expect(approvedUser?.id).toBe("user-1");
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(1);
  });
});
