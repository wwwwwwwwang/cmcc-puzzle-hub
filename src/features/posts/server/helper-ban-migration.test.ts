import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0013_helper_ban_pending_attempt_fix.sql"),
  "utf8",
);

describe("被封禁助力者 PENDING 助力不再自动确认加分迁移", () => {
  it("sync_request_maintenance 仅自动确认 APPROVED 助力者", () => {
    const sync = migration.match(
      /create or replace function public\.sync_request_maintenance[\s\S]*?\$\$;/,
    )?.[0];

    expect(sync).toBeDefined();
    expect(sync).toContain("join public.profiles h on h.id = a.helper_id");
    expect(sync).toContain("h.status = 'APPROVED'");
  });

  it("sync_request_maintenance 保留自动确认加分逻辑", () => {
    const sync = migration.match(
      /create or replace function public\.sync_request_maintenance[\s\S]*?\$\$;/,
    )?.[0];

    expect(sync).toContain("'EARN_HELP_CONFIRMED'");
    expect(sync).toContain("status = 'COMPLETED', resolved_at = now(), confirmation_method = 'AUTO'");
  });

  it("ban_user 主动 REJECT 被封禁者作为 helper 的 PENDING 助力", () => {
    const ban = migration.match(
      /create or replace function public\.ban_user[\s\S]*?\$\$;/,
    )?.[0];

    expect(ban).toBeDefined();
    expect(ban).toContain("a.helper_id = p_target");
    expect(ban).toContain("a.status = 'PENDING'");
    expect(ban).toContain("p.status = 'PENDING_CONFIRM'");
    expect(ban).toContain("set status = 'REJECTED', resolved_at = now()");
  });

  it("ban_user 处理助力拒绝后的帖子状态:未过期回 OPEN,过期退款", () => {
    const ban = migration.match(
      /create or replace function public\.ban_user[\s\S]*?\$\$;/,
    )?.[0];

    expect(ban).toContain("v_attempt.expires_at > now()");
    expect(ban).toContain("set status = 'OPEN', updated_at = now()");
    expect(ban).toContain("set status = 'EXPIRED', request_credit_status = 'REFUNDED'");
    expect(ban).toContain("'REFUND_REQUEST'");
    expect(ban).toContain("'affectedHelpAttempts', v_affected_help");
  });
});
