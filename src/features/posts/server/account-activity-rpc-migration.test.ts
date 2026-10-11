import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/0015_account_activity_rpc.sql",
  ),
  "utf8",
);

describe("账户活动 RPC 迁移", () => {
  it("一次返回待确认数、待助力数和版本号", () => {
    expect(migration).toContain("create or replace function public.get_account_activity()");
    expect(migration).toContain("'pendingConfirmationCount'");
    expect(migration).toContain("'pendingHelpCount'");
    expect(migration).toContain("'version'");
  });

  it("使用调用者身份并只授予 authenticated", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain(
      "revoke all on function public.get_account_activity()",
    );
    expect(migration).toContain(
      "grant execute on function public.get_account_activity() to authenticated;",
    );
  });
});
