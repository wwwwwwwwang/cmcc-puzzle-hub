import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/0016_performance_indexes.sql",
  ),
  "utf8",
);

describe("性能索引迁移", () => {
  it("覆盖账户帖子、领取、待确认和待助力查询", () => {
    expect(migration).toContain("posts_publisher_created_id_idx");
    expect(migration).toContain("posts_claimant_claimed_id_idx");
    expect(migration).toContain("posts_pending_confirmation_idx");
    expect(migration).toContain("request_help_pending_helper_idx");
  });

  it("覆盖管理员筛选和大厅拼图筛选", () => {
    expect(migration).toContain("profiles_status_created_idx");
    expect(migration).toContain("posts_hall_piece_idx");
    expect(migration).toContain("where status = 'OPEN'");
  });
});
