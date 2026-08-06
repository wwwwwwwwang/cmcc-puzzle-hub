import { describe, expect, it } from "vitest";

import { getE2eAuthSession } from "./e2e-auth";

const validEnvironment = {
  nodeEnv: "test",
  authToken: "test-secret",
};

describe("getE2eAuthSession", () => {
  it("缺少服务端令牌时不启用测试会话", () => {
    expect(
      getE2eAuthSession("test-secret", {
        nodeEnv: "test",
      }),
    ).toBeNull();
  });

  it("缺少或携带错误请求令牌时不启用测试会话", () => {
    expect(getE2eAuthSession(undefined, validEnvironment)).toBeNull();
    expect(
      getE2eAuthSession("wrong-secret", validEnvironment),
    ).toBeNull();
  });

  it("生产环境始终禁用测试会话", () => {
    expect(
      getE2eAuthSession("test-secret", {
        nodeEnv: "production",
        authToken: "test-secret",
      }),
    ).toBeNull();
  });

  it("非生产环境令牌匹配时返回固定已审核普通用户", () => {
    expect(
      getE2eAuthSession("test-secret", validEnvironment),
    ).toEqual({
      isAuthenticated: true,
      isApproved: true,
      isAdmin: false,
      publicId: "U-0123456789ABCDEF",
      username: "e2e-user",
    });
  });
});
