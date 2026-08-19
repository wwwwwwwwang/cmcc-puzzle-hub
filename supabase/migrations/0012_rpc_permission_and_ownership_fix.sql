-- 安全修复：
-- 1. 撤销 0007 误授给 authenticated 的写 RPC 权限(claim_post / help_request_post 本应只允许 service role)。
-- 2. 在写 RPC 内增加 auth.uid() 归属断言,客户端直调也无法伪造他人身份(纵深防御)。
-- 3. claim_post 由数据库判定同注册 IP 不赚取,修复应用层 p_allow_earn 恒为 true 造成的信用刷取。
-- 4. hall_posts 视图改为以属主身份执行,修复 security_invoker 下 profiles 子查询受 RLS 限制返回 NULL。

-- 权限:写 RPC 只允许 service role;authenticated / anon 均不可执行。
revoke execute on function public.claim_post(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.help_request_post(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.claim_post(uuid, uuid, boolean) to service_role;
grant execute on function public.help_request_post(uuid, uuid) to service_role;

-- 领取:增加归属断言;同注册 IP 视为疑似同一人,不给发布者加分。
create or replace function public.claim_post(
  p_post_id    uuid,
  p_claimant   uuid,
  p_allow_earn boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.posts%rowtype;
  v_credits integer;
  v_earn_cap integer := coalesce(nullif(current_setting('app.earn_cap_per_day', true), '')::int, 5);
  v_earned_today integer;
begin
  -- 归属断言:authenticated 直调必须与参数身份一致;service role 调用时 auth.uid() 为 null,由应用层保证。
  if auth.uid() is not null and auth.uid() <> p_claimant then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;
  if not found then return jsonb_build_object('status', 'EXPIRED'); end if;
  if not public.assert_post_publisher_active(p_post_id) then
    return jsonb_build_object('status', 'EXPIRED');
  end if;
  if v_post.type <> 'GIVE' then return jsonb_build_object('status', 'INVALID_POST_TYPE'); end if;
  if v_post.claimant_id = p_claimant then
    return jsonb_build_object('status', 'CLAIMED', 'idempotent', true, 'payloads', v_post.payloads);
  end if;
  if v_post.publisher_id = p_claimant then return jsonb_build_object('status', 'SELF_CLAIM_FORBIDDEN'); end if;
  if v_post.status <> 'OPEN' or v_post.claimant_id is not null then
    return jsonb_build_object('status', 'ALREADY_CLAIMED');
  end if;
  if v_post.expires_at <= now() then return jsonb_build_object('status', 'EXPIRED'); end if;

  select credits into v_credits from public.profiles where id = p_claimant for update;
  if v_credits is null or v_credits < 1 then return jsonb_build_object('status', 'INSUFFICIENT_CREDITS'); end if;
  update public.profiles set credits = credits - 1 where id = p_claimant;
  insert into public.credit_ledger (user_id, delta, reason, post_id)
  values (p_claimant, -1, 'SPEND_CLAIM', p_post_id);

  if p_allow_earn
    and not exists (
      select 1
      from public.profiles cp
      join public.profiles pp on pp.id = v_post.publisher_id
      where cp.id = p_claimant
        and cp.registration_ip is not null
        and pp.registration_ip is not null
        and cp.registration_ip = pp.registration_ip
    )
  then
    select count(*) into v_earned_today
    from public.credit_ledger
    where user_id = v_post.publisher_id
      and reason = 'EARN_CLAIMED'
      and created_at >= date_trunc('day', now());
    if v_earned_today < v_earn_cap then
      update public.profiles set credits = credits + 1 where id = v_post.publisher_id;
      insert into public.credit_ledger (user_id, delta, reason, post_id)
      values (v_post.publisher_id, 1, 'EARN_CLAIMED', p_post_id);
    end if;
  end if;

  update public.posts
  set status = 'CLAIMED', claimant_id = p_claimant, claimed_at = now(), updated_at = now()
  where id = p_post_id;
  delete from public.active_payload_hashes where post_id = p_post_id;
  return jsonb_build_object('status', 'CLAIMED', 'idempotent', false, 'payloads', v_post.payloads);
end;
$$;

-- 助力:增加归属断言。
create or replace function public.help_request_post(p_post_id uuid, p_helper uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.posts%rowtype;
  v_attempt public.request_help_attempts%rowtype;
  v_deadline timestamptz;
begin
  if auth.uid() is not null and auth.uid() <> p_helper then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;
  if not found then return jsonb_build_object('status', 'EXPIRED'); end if;
  if not public.assert_post_publisher_active(p_post_id) then
    return jsonb_build_object('status', 'EXPIRED');
  end if;
  if v_post.type <> 'REQUEST' then return jsonb_build_object('status', 'INVALID_POST_TYPE'); end if;
  if v_post.publisher_id = p_helper then return jsonb_build_object('status', 'SELF_HELP_FORBIDDEN'); end if;

  select * into v_attempt from public.request_help_attempts
  where post_id = p_post_id and helper_id = p_helper;
  if found then
    if v_attempt.status = 'PENDING' and v_post.status = 'PENDING_CONFIRM' then
      return jsonb_build_object('status', 'HELPED', 'idempotent', true,
        'payloads', v_post.payloads, 'confirmationDeadline', v_attempt.confirmation_deadline);
    end if;
    return jsonb_build_object('status', 'HELP_RETRY_FORBIDDEN');
  end if;
  if v_post.status <> 'OPEN' then return jsonb_build_object('status', 'ALREADY_HELPED'); end if;
  if v_post.expires_at <= now() then
    if v_post.request_credit_status = 'HELD' then
      update public.profiles set credits = credits + 1 where id = v_post.publisher_id;
      insert into public.credit_ledger (user_id, delta, reason, post_id)
      values (v_post.publisher_id, 1, 'REFUND_REQUEST', p_post_id);
    end if;
    update public.posts
    set status = 'EXPIRED', request_credit_status = 'REFUNDED', closure_reason = 'TIMEOUT', updated_at = now()
    where id = p_post_id;
    delete from public.active_payload_hashes where post_id = p_post_id;
    return jsonb_build_object('status', 'EXPIRED');
  end if;

  v_deadline := now() + interval '24 hours';
  insert into public.request_help_attempts (post_id, helper_id, status, confirmation_deadline)
  values (p_post_id, p_helper, 'PENDING', v_deadline);
  update public.posts set status = 'PENDING_CONFIRM', updated_at = now() where id = p_post_id;
  return jsonb_build_object('status', 'HELPED', 'idempotent', false,
    'payloads', v_post.payloads, 'confirmationDeadline', v_deadline);
end;
$$;

-- 大厅安全视图改为以属主身份执行,让 publisher_public_id 子查询不受 profiles RLS 限制;
-- 视图仅暴露安全列,不包含 payloads。
drop view if exists public.hall_posts;

create or replace view public.hall_posts as
  select
    id,
    publisher_id,
    (select public_id from public.profiles p where p.id = posts.publisher_id) as publisher_public_id,
    type,
    discount,
    piece_number,
    available_payload_kinds,
    created_at,
    expires_at
  from public.posts
  where status = 'OPEN' and expires_at > now();

grant select on public.hall_posts to authenticated;
