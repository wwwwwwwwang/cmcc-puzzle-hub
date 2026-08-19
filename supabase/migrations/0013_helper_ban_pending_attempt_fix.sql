-- 修复:被封禁用户作为助力者的 PENDING 助力仍会被 sync_request_maintenance 自动确认加分。
-- 1. sync_request_maintenance 只对 APPROVED 助力者自动确认,避免给被封禁/被拒用户发放积分。
-- 2. ban_user 封禁时主动 REJECT 该用户作为 helper 的 PENDING 助力:未过期帖子回 OPEN,
--    过期帖子退款发布者并置 EXPIRED,与 resolve_request_help 的拒绝分支保持一致。

create or replace function public.sync_request_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt record;
  v_post record;
  v_auto_count integer := 0;
  v_refund_count integer := 0;
  v_give_expired_count integer := 0;
begin
  for v_attempt in
    select a.id, a.post_id, a.helper_id
    from public.request_help_attempts a
    join public.posts p on p.id = a.post_id
    join public.profiles h on h.id = a.helper_id
    where a.status = 'PENDING'
      and a.confirmation_deadline <= now()
      and p.status = 'PENDING_CONFIRM'
      and p.request_credit_status = 'HELD'
      and h.status = 'APPROVED'
    for update of a, p skip locked
  loop
    update public.request_help_attempts
    set status = 'COMPLETED', resolved_at = now(), confirmation_method = 'AUTO'
    where id = v_attempt.id and status = 'PENDING';
    update public.posts
    set status = 'COMPLETED', request_credit_status = 'SETTLED', updated_at = now()
    where id = v_attempt.post_id and request_credit_status = 'HELD';
    update public.profiles set credits = credits + 1 where id = v_attempt.helper_id;
    insert into public.credit_ledger (user_id, delta, reason, post_id)
    values (v_attempt.helper_id, 1, 'EARN_HELP_CONFIRMED', v_attempt.post_id);
    delete from public.active_payload_hashes where post_id = v_attempt.post_id;
    v_auto_count := v_auto_count + 1;
  end loop;

  for v_post in
    select id, publisher_id
    from public.posts
    where type = 'REQUEST'
      and status = 'OPEN'
      and request_credit_status = 'HELD'
      and expires_at <= now()
    for update skip locked
  loop
    update public.profiles set credits = credits + 1 where id = v_post.publisher_id;
    insert into public.credit_ledger (user_id, delta, reason, post_id)
    values (v_post.publisher_id, 1, 'REFUND_REQUEST', v_post.id);
    update public.posts
    set status = 'EXPIRED', request_credit_status = 'REFUNDED',
        closure_reason = 'TIMEOUT', updated_at = now()
    where id = v_post.id and request_credit_status = 'HELD';
    delete from public.active_payload_hashes where post_id = v_post.id;
    v_refund_count := v_refund_count + 1;
  end loop;

  for v_post in
    select id
    from public.posts
    where type = 'GIVE' and status = 'OPEN' and expires_at <= now()
    for update skip locked
  loop
    update public.posts set status = 'EXPIRED', updated_at = now() where id = v_post.id;
    delete from public.active_payload_hashes where post_id = v_post.id;
    v_give_expired_count := v_give_expired_count + 1;
  end loop;

  return jsonb_build_object(
    'autoConfirmed', v_auto_count,
    'requestRefunded', v_refund_count,
    'giveExpired', v_give_expired_count
  );
end;
$$;

create or replace function public.ban_user(p_target uuid, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_post public.posts%rowtype;
  v_attempt record;
  v_affected integer := 0;
  v_affected_help integer := 0;
begin
  if not exists (select 1 from public.profiles where id = p_admin and is_admin) then
    return jsonb_build_object('status', 'FORBIDDEN');
  end if;
  if p_target = p_admin then
    return jsonb_build_object('status', 'SELF_FORBIDDEN');
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
  if v_target.status = 'BANNED' then
    return jsonb_build_object('status', 'BANNED', 'idempotent', true);
  end if;

  update public.profiles set status = 'BANNED' where id = p_target;

  for v_post in
    select *
    from public.posts
    where publisher_id = p_target
      and status in ('OPEN', 'PENDING_CONFIRM')
    for update
  loop
    if v_post.status = 'PENDING_CONFIRM' then
      update public.request_help_attempts
      set status = 'REJECTED', resolved_at = now()
      where post_id = v_post.id and status = 'PENDING';

      if v_post.expires_at > now() then
        update public.posts
        set status = 'OPEN', updated_at = now()
        where id = v_post.id;
      else
        if v_post.request_credit_status = 'HELD' then
          update public.profiles set credits = credits + 1 where id = p_target;
          insert into public.credit_ledger (user_id, delta, reason, post_id)
          values (p_target, 1, 'REFUND_REQUEST', v_post.id);
        end if;
        update public.posts
        set status = 'EXPIRED', request_credit_status = 'REFUNDED',
            closure_reason = 'BANNED', updated_at = now()
        where id = v_post.id;
        delete from public.active_payload_hashes where post_id = v_post.id;
      end if;
    else
      if v_post.type = 'REQUEST' and v_post.request_credit_status = 'HELD' then
        update public.profiles set credits = credits + 1 where id = p_target;
        insert into public.credit_ledger (user_id, delta, reason, post_id)
        values (p_target, 1, 'REFUND_REQUEST', v_post.id);
      end if;
      update public.posts
      set status = 'EXPIRED',
          request_credit_status = case
            when type = 'REQUEST' then 'REFUNDED'
            else request_credit_status
          end,
          closure_reason = 'BANNED',
          updated_at = now()
      where id = v_post.id;
      delete from public.active_payload_hashes where post_id = v_post.id;
    end if;
    v_affected := v_affected + 1;
  end loop;

  -- 该用户作为助力者的 PENDING 助力一并拒绝:未过期帖子回 OPEN 供他人领取,
  -- 过期帖子退款发布者并置 EXPIRED,防止被 sync_request_maintenance 自动确认加分。
  for v_attempt in
    select a.id, a.post_id, p.expires_at, p.publisher_id
    from public.request_help_attempts a
    join public.posts p on p.id = a.post_id
    where a.helper_id = p_target
      and a.status = 'PENDING'
      and p.status = 'PENDING_CONFIRM'
    for update of a, p skip locked
  loop
    update public.request_help_attempts
    set status = 'REJECTED', resolved_at = now()
    where id = v_attempt.id and status = 'PENDING';

    if v_attempt.expires_at > now() then
      update public.posts
      set status = 'OPEN', updated_at = now()
      where id = v_attempt.post_id and status = 'PENDING_CONFIRM';
    else
      update public.profiles set credits = credits + 1
      where id = v_attempt.publisher_id;
      insert into public.credit_ledger (user_id, delta, reason, post_id)
      values (v_attempt.publisher_id, 1, 'REFUND_REQUEST', v_attempt.post_id);
      update public.posts
      set status = 'EXPIRED', request_credit_status = 'REFUNDED',
          closure_reason = 'TIMEOUT', updated_at = now()
      where id = v_attempt.post_id and request_credit_status = 'HELD';
      delete from public.active_payload_hashes where post_id = v_attempt.post_id;
    end if;
    v_affected_help := v_affected_help + 1;
  end loop;

  return jsonb_build_object(
    'status', 'BANNED',
    'idempotent', false,
    'affectedPosts', v_affected,
    'affectedHelpAttempts', v_affected_help
  );
end;
$$;
