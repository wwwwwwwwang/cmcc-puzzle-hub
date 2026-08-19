import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0012_rpc_permission_and_ownership_fix.sql"),
  "utf8",
);

describe("写 RPC 权限与归属修复迁移", () => {
  it("撤销客户端对写 RPC 的执行权限并保留 service role", () => {
    expect(migration).toContain(
      "revoke execute on function public.claim_post(uuid, uuid, boolean)",
    );
    expect(migration).toContain(
      "revoke execute on function public.help_request_post(uuid, uuid)",
    );
    expect(migration).toContain("from public, anon, authenticated;");
    expect(migration).toContain(
      "grant execute on function public.claim_post(uuid, uuid, boolean) to service_role;",
    );
    expect(migration).toContain(
      "grant execute on function public.help_request_post(uuid, uuid) to service_role;",
    );
  });

  it("claim_post 增加归属断言与同注册 IP 不赚取判定", () => {
    const claim = migration.match(
      /create or replace function public\.claim_post[\s\S]*?\$\$;/,
    )?.[0];

    expect(claim).toBeDefined();
    expect(claim).toContain("auth.uid() is not null and auth.uid() <> p_claimant");
    expect(claim).toContain("raise exception 'FORBIDDEN'");
    expect(claim).toContain("cp.registration_ip is not null");
    expect(claim).toContain("cp.registration_ip = pp.registration_ip");
    expect(claim).toContain("p_allow_earn");
  });

  it("help_request_post 增加归属断言", () => {
    const help = migration.match(
      /create or replace function public\.help_request_post[\s\S]*?\$\$;/,
    )?.[0];

    expect(help).toBeDefined();
    expect(help).toContain("auth.uid() is not null and auth.uid() <> p_helper");
    expect(help).toContain("raise exception 'FORBIDDEN'");
  });

  it("hall_posts 视图改为属主执行且不暴露 payloads", () => {
    const view = migration.match(
      /create or replace view public\.hall_posts[\s\S]*?grant select on public\.hall_posts to authenticated;/,
    )?.[0];

    expect(view).toBeDefined();
    expect(view).not.toContain("security_invoker");
    expect(view).not.toContain("payloads");
    expect(view).toContain("publisher_public_id");
  });
});
