import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  signInWithPassword,
  signUp: supabaseSignUp,
  signOut: supabaseSignOut,
  profileMaybeSingle,
  adminUpdate,
  checkRegistrationRateLimit,
  headersGet,
} = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  profileMaybeSingle: vi.fn(),
  adminUpdate: vi.fn(),
  checkRegistrationRateLimit: vi.fn(),
  headersGet: vi.fn(() => "1.2.3.4"),
}));

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: headersGet })),
}));

// profiles().select().eq().single() 链
function profileChain() {
  return {
    select: () => ({ eq: () => ({ single: profileMaybeSingle }) }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      signInWithPassword,
      signUp: supabaseSignUp,
      signOut: supabaseSignOut,
    },
    from: () => profileChain(),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: () => ({ update: () => ({ eq: adminUpdate }) }),
  })),
}));

vi.mock("@/features/posts/server/rate-limit", () => ({
  checkRegistrationRateLimit,
}));

import { signIn, signOut, signUp } from "./actions";

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("signIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersGet.mockReturnValue("1.2.3.4");
  });

  it("非法用户名/短密码返回字段错误,不调用 Supabase", async () => {
    const state = await signIn({}, form({ username: "!", password: "123" }));
    expect(state.fieldErrors?.username).toBeTruthy();
    expect(state.fieldErrors?.password).toBeTruthy();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("凭证错误返回不泄露账号是否存在的统一文案", async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { message: "x" } });
    const state = await signIn({}, form({ username: "alice", password: "password123" }));
    expect(state.error).toBe("用户名或密码不正确");
  });

  it("已通过审核登录成功后重定向", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    profileMaybeSingle.mockResolvedValue({ data: { status: "APPROVED" } });
    await expect(
      signIn({}, form({ username: "alice", password: "password123", redirect: "/me" })),
    ).rejects.toThrow("REDIRECT:/me");
  });

  it("待审核用户登录被登出并提示", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    profileMaybeSingle.mockResolvedValue({ data: { status: "PENDING" } });
    const state = await signIn({}, form({ username: "alice", password: "password123" }));
    expect(state.error).toMatch(/待审核/);
    expect(supabaseSignOut).toHaveBeenCalled();
  });

  it("封禁用户登录被登出并提示封禁原因", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    profileMaybeSingle.mockResolvedValue({ data: { status: "BANNED" } });
    const state = await signIn({}, form({ username: "alice", password: "password123" }));
    expect(state.error).toMatch(/封禁/);
    expect(supabaseSignOut).toHaveBeenCalled();
  });

  it("已拒绝用户登录被登出并显示具体原因", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    profileMaybeSingle.mockResolvedValue({
      data: {
        status: "REJECTED",
        rejection_reason: "微信群昵称与用户名不一致",
      },
    });

    const state = await signIn({}, form({ username: "alice", password: "password123" }));

    expect(state.error).toBe("该账号审核未通过：微信群昵称与用户名不一致");
    expect(supabaseSignOut).toHaveBeenCalled();
  });

  it("已拒绝用户缺少原因时使用通用提示", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    profileMaybeSingle.mockResolvedValue({
      data: { status: "REJECTED", rejection_reason: null },
    });

    const state = await signIn({}, form({ username: "alice", password: "password123" }));

    expect(state.error).toBe("该账号审核未通过，请联系管理员确认");
    expect(supabaseSignOut).toHaveBeenCalled();
  });

  it("拒绝开放重定向,回退首页", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    profileMaybeSingle.mockResolvedValue({ data: { status: "APPROVED" } });
    await expect(
      signIn({}, form({ username: "alice", password: "password123", redirect: "//evil.com" })),
    ).rejects.toThrow("REDIRECT:/");
  });
});

describe("signUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersGet.mockReturnValue("1.2.3.4");
    checkRegistrationRateLimit.mockResolvedValue({ success: true, reset: 0 });
  });

  it("注册成功返回待审核提示,不建立会话", async () => {
    supabaseSignUp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    adminUpdate.mockResolvedValue({ error: null });
    const state = await signUp({}, form({ username: "alice", password: "password123" }));
    expect(state.error).toMatch(/待审核/);
    expect(supabaseSignOut).toHaveBeenCalled();
  });

  it("重名注册失败归一化为占用提示", async () => {
    supabaseSignUp.mockResolvedValue({ data: {}, error: { message: "duplicate" } });
    const state = await signUp({}, form({ username: "alice", password: "password123" }));
    expect(state.error).toMatch(/已被占用/);
  });

  it("IP 注册超限被拒,不调用 signUp", async () => {
    checkRegistrationRateLimit.mockResolvedValue({ success: false, reset: 0 });
    const state = await signUp({}, form({ username: "alice", password: "password123" }));
    expect(state.error).toMatch(/注册过于频繁/);
    expect(supabaseSignUp).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("登出后重定向首页", async () => {
    await expect(signOut()).rejects.toThrow("REDIRECT:/");
  });
});
