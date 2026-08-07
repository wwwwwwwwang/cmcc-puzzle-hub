import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0008_user_management_pagination.sql"),
  "utf8",
);

describe("用户管理分页迁移", () => {
  it("支持用户名搜索、分页偏移和总数返回", () => {
    expect(migration).toContain("p_search text default null");
    expect(migration).toMatch(/p_limit\s+integer default 20/);
    expect(migration).toMatch(/p_offset\s+integer default 0/);
    expect(migration).toContain("count(*) over()");
    expect(migration).toContain("lower(coalesce(p.username, '')");
    expect(migration).toContain("offset greatest(p_offset, 0)");
  });
});
