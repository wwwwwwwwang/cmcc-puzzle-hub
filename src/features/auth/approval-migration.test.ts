import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsPath = resolve(process.cwd(), "supabase/migrations");

describe("用户审核信用迁移", () => {
  it("审核首次通过固定增加 3 点信用并记录种子流水", async () => {
    const migrationNames = (await readdir(migrationsPath))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const migrationSql = await Promise.all(
      migrationNames.map(async (name) => ({
        name,
        sql: await readFile(resolve(migrationsPath, name), "utf8"),
      })),
    );
    const approvalMigration = migrationSql
      .filter(({ sql }) => sql.includes("create or replace function public.approve_user"))
      .at(-1);

    expect(approvalMigration).toBeDefined();
    expect(approvalMigration?.sql).toContain("seed integer := 3;");
    expect(approvalMigration?.sql).toContain("values (p_target, seed, 'SEED')");
    expect(approvalMigration?.sql).toContain("if v_status = 'APPROVED'");
  });
});
