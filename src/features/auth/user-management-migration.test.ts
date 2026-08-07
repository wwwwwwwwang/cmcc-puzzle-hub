import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0007_user_management.sql"),
  "utf8",
);

describe("用户管理迁移", () => {
  it("增加封禁状态与管理员 RPC", () => {
    expect(migration).toContain("'BANNED'");
    expect(migration).toContain("create or replace function public.list_users");
    expect(migration).toContain("create or replace function public.ban_user");
    expect(migration).toContain("create or replace function public.unban_user");
    expect(migration).toContain("SELF_FORBIDDEN");
    expect(migration).toContain("ADMIN_TARGET_FORBIDDEN");
  });

  it("封禁时处理未完成帖子并清理活跃去重记录", () => {
    expect(migration).toContain("REFUND_REQUEST");
    expect(migration).toContain("request_help_attempts");
    expect(migration).toContain("status = 'REJECTED'");
    expect(migration).toContain("delete from public.active_payload_hashes");
    expect(migration).toContain("p.status <> 'BANNED'");
  });
});
