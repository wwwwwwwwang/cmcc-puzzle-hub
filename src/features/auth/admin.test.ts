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

  it("按状态、搜索和分页调用用户 RPC 并映射总数", async () => {
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
          total_count: 21,
        },
      ],
      error: null,
    });

    await expect(listUsers("APPROVED", "Alice", "127.0.0.1", 2, 20)).resolves.toEqual({
      users: [{
        id: "user-1",
        username: "Alice",
        publicId: "U-1",
        credits: 3,
        status: "APPROVED",
        isAdmin: false,
        registrationIp: "127.0.0.1",
        sameIpCount: 2,
        createdAt: "2026-08-07T00:00:00Z",
      }],
      total: 21,
      page: 2,
      pageSize: 20,
    });
    expect(rpc).toHaveBeenCalledWith("list_users", {
      p_admin: "admin-1",
      p_status: "APPROVED",
      p_search: "Alice",
      p_registration_ip: "127.0.0.1",
      p_limit: 20,
      p_offset: 20,
    });
  });
});
