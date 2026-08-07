import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/0011_rejected_user_review.sql",
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

describe("已拒绝用户重新审核迁移", () => {
  it("保存并回填用户可见的拒绝原因", () => {
    expect(migration).toContain("rejection_reason");
    expect(migration).toContain("rejected_at");
    expect(migration).toContain("审核未通过，请联系管理员确认");
    expect(migration).toContain("char_length(trim(rejection_reason)) between 1 and 200");
  });

  it("拒绝只接受待审核用户和合法原因", () => {
    expect(migration).toContain("create or replace function public.reject_user(");
    expect(migration).toContain("p_reason text");
    expect(migration).toContain("v_target.status <> 'PENDING'");
    expect(migration).toContain("nullif(trim(p_reason), '')");
    expect(migration).toContain("char_length(trim(p_reason)) > 200");
    expect(migration).toContain("rejection_reason = trim(p_reason)");
  });

  it("恢复待审核清空拒绝信息且不修改信用", () => {
    const reopenFunction = migration.match(
      /create or replace function public\.reopen_user_review[\s\S]*?\$\$;/,
    )?.[0];

    expect(reopenFunction).toBeDefined();
    expect(reopenFunction).toContain("v_target.status <> 'REJECTED'");
    expect(reopenFunction).toContain("status = 'PENDING'");
    expect(reopenFunction).toContain("rejection_reason = null");
    expect(reopenFunction).toContain("rejected_at = null");
    expect(reopenFunction).not.toContain("credit_ledger");
    expect(reopenFunction).not.toContain("credits =");
  });

  it("审核通过仅允许待审核状态并继续幂等处理已通过用户", () => {
    const approveFunction = migration.match(
      /create or replace function public\.approve_user[\s\S]*?\$\$;/,
    )?.[0];

    expect(approveFunction).toBeDefined();
    expect(approveFunction).toContain("if v_status = 'APPROVED'");
    expect(approveFunction).toContain("if v_status <> 'PENDING'");
    expect(approveFunction).toContain("seed integer := 3;");
    expect(approveFunction).toContain("values (p_target, seed, 'SEED')");
  });

  it("用户列表返回当前拒绝信息并保留分页过滤参数", () => {
    expect(migration).toContain("drop function if exists public.list_users(uuid, text, text, text, integer, integer)");
    expect(migration).toContain("p_registration_ip text default null");
    expect(migration).toContain("rejection_reason text");
    expect(migration).toContain("rejected_at timestamptz");
    expect(migration).toContain("count(*) over() as total_count");
  });
});
