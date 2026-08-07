-- 已拒绝账号保留注册信息，记录用户可见原因，并支持恢复待审核后重新审核。

alter table public.profiles
  add column if not exists rejection_reason text,
  add column if not exists rejected_at timestamptz;

update public.profiles
set
  rejection_reason = coalesce(
    nullif(trim(rejection_reason), ''),
    '审核未通过，请联系管理员确认'
  ),
  rejected_at = coalesce(rejected_at, now())
where status = 'REJECTED';

alter table public.profiles
  drop constraint if exists profiles_rejection_reason_length_check;
alter table public.profiles
  add constraint profiles_rejection_reason_length_check
  check (
    rejection_reason is null
    or char_length(trim(rejection_reason)) between 1 and 200
  );

-- 返回当前拒绝信息，保留状态、用户名、注册 IP 筛选和分页。
drop function if exists public.list_users(uuid, text, text, text, integer, integer);

create or replace function public.list_users(
  p_admin           uuid,
  p_status          text default null,
  p_search          text default null,
  p_registration_ip text default null,
  p_limit           integer default 20,
  p_offset          integer default 0
)
returns table (
  id                uuid,
  username          text,
  public_id         text,
  credits           integer,
  status            text,
  rejection_reason  text,
  rejected_at       timestamptz,
  is_admin          boolean,
  registration_ip   text,
  same_ip_count     bigint,
  created_at        timestamptz,
  total_count       bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select
      p.id,
      p.username,
      p.public_id,
      p.credits,
      p.status,
      p.rejection_reason,
      p.rejected_at,
      p.is_admin,
      p.registration_ip,
      (
        select count(*)
        from public.profiles q
        where q.registration_ip is not null
          and q.registration_ip = p.registration_ip
      ) as same_ip_count,
      p.created_at
    from public.profiles p
    where exists (
      select 1 from public.profiles a where a.id = p_admin and a.is_admin
    )
      and (p_status is null or p.status = p_status)
      and (
        nullif(trim(p_search), '') is null
        or lower(coalesce(p.username, '')) like '%' || lower(trim(p_search)) || '%'
      )
      and (
        nullif(trim(p_registration_ip), '') is null
        or p.registration_ip = p_registration_ip
      )
  )
  select
    f.id,
    f.username,
    f.public_id,
    f.credits,
    f.status,
    f.rejection_reason,
    f.rejected_at,
    f.is_admin,
    f.registration_ip,
    f.same_ip_count,
    f.created_at,
    count(*) over() as total_count
  from filtered f
  order by
    case f.status
      when 'PENDING' then 1
      when 'BANNED' then 2
      when 'APPROVED' then 3
      else 4
    end,
    f.created_at desc
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
$$;

-- 审核通过只接受待审核用户；已通过用户保持幂等，不重复发放信用。
create or replace function public.approve_user(p_target uuid, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  seed integer := 3;
  v_status text;
  v_is_admin boolean;
begin
  if not exists (select 1 from public.profiles where id = p_admin and is_admin) then
    return jsonb_build_object('status', 'FORBIDDEN');
  end if;

  select status, is_admin into v_status, v_is_admin
  from public.profiles
  where id = p_target
  for update;

  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if v_is_admin then
    return jsonb_build_object('status', 'ADMIN_TARGET_FORBIDDEN');
  end if;
  if v_status = 'APPROVED' then
    return jsonb_build_object('status', 'ALREADY_APPROVED');
  end if;
  if v_status <> 'PENDING' then
    return jsonb_build_object('status', 'INVALID_STATUS');
  end if;

  update public.profiles
  set
    status = 'APPROVED',
    credits = credits + seed,
    rejection_reason = null,
    rejected_at = null
  where id = p_target;

  insert into public.credit_ledger (user_id, delta, reason)
  values (p_target, seed, 'SEED');

  return jsonb_build_object('status', 'APPROVED');
end;
$$;

drop function if exists public.reject_user(uuid, uuid);

create or replace function public.reject_user(
  p_target uuid,
  p_admin uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
begin
  if not exists (select 1 from public.profiles where id = p_admin and is_admin) then
    return jsonb_build_object('status', 'FORBIDDEN');
  end if;
  if nullif(trim(p_reason), '') is null or char_length(trim(p_reason)) > 200 then
    return jsonb_build_object('status', 'INVALID_REASON');
  end if;

  select * into v_target
  from public.profiles
  where id = p_target
  for update;

  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if v_target.is_admin then
    return jsonb_build_object('status', 'ADMIN_TARGET_FORBIDDEN');
  end if;
  if v_target.status <> 'PENDING' then
    return jsonb_build_object('status', 'INVALID_STATUS');
  end if;

  update public.profiles
  set
    status = 'REJECTED',
    rejection_reason = trim(p_reason),
    rejected_at = now()
  where id = p_target;

  return jsonb_build_object('status', 'REJECTED');
end;
$$;

create or replace function public.reopen_user_review(
  p_target uuid,
  p_admin uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
begin
  if not exists (select 1 from public.profiles where id = p_admin and is_admin) then
    return jsonb_build_object('status', 'FORBIDDEN');
  end if;

  select * into v_target
  from public.profiles
  where id = p_target
  for update;

  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if v_target.is_admin then
    return jsonb_build_object('status', 'ADMIN_TARGET_FORBIDDEN');
  end if;
  if v_target.status <> 'REJECTED' then
    return jsonb_build_object('status', 'INVALID_STATUS');
  end if;

  update public.profiles
  set
    status = 'PENDING',
    rejection_reason = null,
    rejected_at = null
  where id = p_target;

  return jsonb_build_object('status', 'PENDING');
end;
$$;

grant execute on function public.list_users(uuid, text, text, text, integer, integer) to authenticated;
grant execute on function public.approve_user(uuid, uuid) to authenticated;
grant execute on function public.reject_user(uuid, uuid, text) to authenticated;
grant execute on function public.reopen_user_review(uuid, uuid) to authenticated;
