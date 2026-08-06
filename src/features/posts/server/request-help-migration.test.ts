import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/0005_request_help_confirmation.sql",
);

describe("request help migration", () => {
  it("定义求助状态、助力记录和信用托管约束", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("'PENDING_CONFIRM'");
    expect(sql).toContain("'COMPLETED'");
    expect(sql).toContain("request_credit_status");
    expect(sql).toContain("create table public.request_help_attempts");
    expect(sql).toContain("unique (post_id, helper_id)");
    expect(sql).toContain("request_help_one_pending_per_post");
    expect(sql).toContain("'ESCROW_REQUEST'");
    expect(sql).toContain("'EARN_HELP_CONFIRMED'");
    expect(sql).toContain("'REFUND_REQUEST'");
  });

  it("定义非递归 RLS、原子 RPC 和定时维护", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("public.can_read_post");
    expect(sql).toContain("public.can_read_help_attempt");
    expect(sql).toContain("public.help_request_post");
    expect(sql).toContain("public.resolve_request_help");
    expect(sql).toContain("public.sync_request_maintenance");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED".toLowerCase());
    expect(sql).toContain("cmcc-request-help-maintenance");
  });
});
