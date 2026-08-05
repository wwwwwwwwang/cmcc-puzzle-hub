-- 用户名登录 + 人工审核。身份 = 微信群成员(改群昵称与 username 一致后 @管理员审核)。
-- 邮箱是内部合成占位(username 归一化后哈希),用户永不接触。

alter table public.profiles
  add column if not exists username        text,
  add column if not exists status          text not null default 'PENDING'
                                              check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  add column if not exists is_admin         boolean not null default false,
  add column if not exists registration_ip  text;

-- 用户名唯一(归一化后:小写)。存储时已归一化,故直接唯一约束。
create unique index if not exists profiles_username_key on public.profiles (username);
create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_registration_ip_idx on public.profiles (registration_ip);

-- 重写:注册时建 PENDING 档案,从 auth metadata 取 username / 注册 IP;
-- **种子信用不在此发放**,改为审核通过时发放。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_username text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  meta_ip       text := nullif(trim(new.raw_user_meta_data ->> 'registration_ip'), '');
  pub_id text := 'U-' || upper(substr(replace(new.id::text, '-', ''), 1, 16));
begin
  insert into public.profiles (id, public_id, username, status, registration_ip, credits)
  values (new.id, pub_id, meta_username, 'PENDING', meta_ip, 0);
  return new;
end;
$$;

-- 审核通过:仅管理员可调用;置 APPROVED 并发放种子信用(幂等:已 APPROVED 不重复发)。
create or replace function public.approve_user(p_target uuid, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  seed integer := coalesce(nullif(current_setting('app.seed_credits', true), '')::int, 1);
  v_status text;
begin
  if not exists (select 1 from public.profiles where id = p_admin and is_admin) then
    return jsonb_build_object('status', 'FORBIDDEN');
  end if;

  select status into v_status from public.profiles where id = p_target for update;
  if v_status is null then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if v_status = 'APPROVED' then
    return jsonb_build_object('status', 'ALREADY_APPROVED');
  end if;

  update public.profiles set status = 'APPROVED', credits = credits + seed
    where id = p_target;
  if seed > 0 then
    insert into public.credit_ledger (user_id, delta, reason)
    values (p_target, seed, 'SEED');
  end if;

  return jsonb_build_object('status', 'APPROVED');
end;
$$;

-- 拒绝:仅管理员可调用。
create or replace function public.reject_user(p_target uuid, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = p_admin and is_admin) then
    return jsonb_build_object('status', 'FORBIDDEN');
  end if;
  update public.profiles set status = 'REJECTED' where id = p_target;
  return jsonb_build_object('status', 'REJECTED');
end;
$$;

-- 列出待审核用户(仅管理员);附带「同注册 IP 的账号数」用于 /admin 标黄。
create or replace function public.list_pending_users(p_admin uuid)
returns table (
  id               uuid,
  username         text,
  public_id        text,
  registration_ip  text,
  same_ip_count    bigint,
  created_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.public_id,
    p.registration_ip,
    (select count(*) from public.profiles q where q.registration_ip is not null
       and q.registration_ip = p.registration_ip) as same_ip_count,
    p.created_at
  from public.profiles p
  where p.status = 'PENDING'
    and exists (select 1 from public.profiles a where a.id = p_admin and a.is_admin)
  order by p.created_at asc;
$$;

grant execute on function public.approve_user(uuid, uuid) to authenticated;
grant execute on function public.reject_user(uuid, uuid) to authenticated;
grant execute on function public.list_pending_users(uuid) to authenticated;
