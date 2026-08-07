import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { rpc, getCurrentUser } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getCurrentUser }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ rpc })),
}));

import { listUsers } from "./admin";

describe("listUsers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("按状态调用全量用户 RPC 并映射管理字段", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin-1" });
    rpc.mockResolvedValue({
      data: [
        {
          id: "user-1",
          username: "Alice",
          public_id: "U-1",
          credits: 3,
          status: "APPROVED",
          is_admin: false,
          registration_ip: "127.0.0.1",
          same_ip_count: 2,
          created_at: "2026-08-07T00:00:00Z",
        },
      ],
      error: null,
    });

    await expect(listUsers("APPROVED")).resolves.toEqual([
      {
        id: "user-1",
        username: "Alice",
        publicId: "U-1",
        credits: 3,
        status: "APPROVED",
        isAdmin: false,
        registrationIp: "127.0.0.1",
        sameIpCount: 2,
        createdAt: "2026-08-07T00:00:00Z",
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("list_users", {
      p_admin: "admin-1",
      p_status: "APPROVED",
    });
  });
});
