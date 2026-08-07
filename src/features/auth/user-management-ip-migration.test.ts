import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0009_user_management_ip_filter.sql"),
  "utf8",
);

describe("用户管理 IP 筛选迁移", () => {
  it("支持按注册 IP 过滤并保留分页总数", () => {
    expect(migration).toContain("p_registration_ip text default null");
    expect(migration).toContain("p.registration_ip = p_registration_ip");
    expect(migration).toContain("count(*) over()");
    expect(migration).toContain("public.list_users(uuid, text, text, text, integer, integer)");
  });
});
