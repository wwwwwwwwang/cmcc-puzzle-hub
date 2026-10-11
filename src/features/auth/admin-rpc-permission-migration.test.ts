import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/0014_admin_rpc_service_role_only.sql",
  ),
  "utf8",
);

const adminFunctions = [
  "approve_user(uuid, uuid)",
  "reject_user(uuid, uuid, text)",
  "reopen_user_review(uuid, uuid)",
  "ban_user(uuid, uuid)",
  "unban_user(uuid, uuid)",
  "list_users(uuid, text, text, text, integer, integer)",
  "list_pending_users(uuid)",
] as const;

describe("管理员 RPC 权限收回迁移", () => {
  it("撤销客户端对管理员 RPC 的执行权限", () => {
    for (const signature of adminFunctions) {
      expect(migration).toContain(
        `revoke all on function public.${signature}`,
      );
    }

    expect(migration.match(/from public, anon, authenticated;/g)).toHaveLength(
      adminFunctions.length,
    );
  });

  it("只把管理员 RPC 执行权限授予 service_role", () => {
    for (const signature of adminFunctions) {
      expect(migration).toContain(
        `grant execute on function public.${signature} to service_role;`,
      );
    }
  });
});
