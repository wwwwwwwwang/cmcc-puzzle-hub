-- 用户管理：全量用户查询、可逆封禁，以及封禁时的未完成帖子收敛。

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'BANNED'));

alter table public.posts drop constraint if exists posts_closure_reason_check;
alter table public.posts
  add constraint posts_closure_reason_check
  check (closure_reason in ('DELISTED', 'TIMEOUT', 'BANNED'));

create or replace function public.list_users(p_admin uuid, p_status text default null)
returns table (
  id               uuid,
  username         text,
  public_id        text,
  credits          integer,
  status           text,
  is_admin         boolean,
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
    p.credits,
    p.status,
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
  order by
    case p.status
      when 'PENDING' then 1
      when 'BANNED' then 2
      when 'APPROVED' then 3
      else 4
    end,
    p.created_at desc;
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
  v_affected integer := 0;
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

  return jsonb_build_object(
    'status', 'BANNED',
    'idempotent', false,
    'affectedPosts', v_affected
  );
end;
$$;

create or replace function public.unban_user(p_target uuid, p_admin uuid)
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
  if v_target.status <> 'BANNED' then
    return jsonb_build_object('status', 'INVALID_STATUS');
  end if;

  update public.profiles set status = 'APPROVED' where id = p_target;
  return jsonb_build_object('status', 'APPROVED');
end;
$$;

-- 审核操作不能绕过封禁，也不能修改管理员账号。
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
  from public.profiles where id = p_target for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if v_is_admin then
    return jsonb_build_object('status', 'ADMIN_TARGET_FORBIDDEN');
  end if;
  if v_status = 'BANNED' then
    return jsonb_build_object('status', 'INVALID_STATUS');
  end if;
  if v_status = 'APPROVED' then
    return jsonb_build_object('status', 'ALREADY_APPROVED');
  end if;

  update public.profiles set status = 'APPROVED', credits = credits + seed
  where id = p_target;
  insert into public.credit_ledger (user_id, delta, reason)
  values (p_target, seed, 'SEED');

  return jsonb_build_object('status', 'APPROVED');
end;
$$;

create or replace function public.reject_user(p_target uuid, p_admin uuid)
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

  select * into v_target from public.profiles where id = p_target for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if v_target.is_admin then
    return jsonb_build_object('status', 'ADMIN_TARGET_FORBIDDEN');
  end if;
  if v_target.status = 'BANNED' then
    return jsonb_build_object('status', 'INVALID_STATUS');
  end if;

  update public.profiles set status = 'REJECTED' where id = p_target;
  return jsonb_build_object('status', 'REJECTED');
end;
$$;

-- 大厅隐藏被封禁发布者的帖子，解封后未过期的重新开放求助可再次显示。
create or replace function public.list_hall_posts(
  p_type              text default null,
  p_discount          smallint default null,
  p_piece_number      smallint default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid default null,
  p_limit             integer default 20
)
returns table (
  id                      uuid,
  publisher_public_id     text,
  type                    text,
  discount                smallint,
  piece_number            smallint,
  available_payload_kinds text[],
  created_at              timestamptz,
  expires_at              timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    post.id,
    p.public_id,
    post.type,
    post.discount,
    post.piece_number,
    post.available_payload_kinds,
    post.created_at,
    post.expires_at
  from public.posts post
  join public.profiles p on p.id = post.publisher_id
  where post.status = 'OPEN'
    and p.status <> 'BANNED'
    and post.expires_at > now()
    and (p_type is null or post.type = p_type)
    and (p_discount is null or post.discount = p_discount)
    and (p_piece_number is null or post.piece_number = p_piece_number)
    and (
      p_cursor_created_at is null
      or post.created_at < p_cursor_created_at
      or (post.created_at = p_cursor_created_at and post.id < p_cursor_id)
    )
  order by post.created_at desc, post.id desc
  limit least(greatest(p_limit, 1), 21);
$$;

-- 竞态保护：帖子被列出后若发布者被封禁，领取/助力也会被拒绝。
create or replace function public.assert_post_publisher_active(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts post
    join public.profiles p on p.id = post.publisher_id
    where post.id = p_post_id and p.status <> 'BANNED'
  );
$$;

grant execute on function public.list_users(uuid, text) to authenticated;
grant execute on function public.ban_user(uuid, uuid) to authenticated;
grant execute on function public.unban_user(uuid, uuid) to authenticated;
grant execute on function public.assert_post_publisher_active(uuid) to authenticated;

create or replace function public.claim_post(
  p_post_id uuid,
  p_claimant uuid,
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

  if p_allow_earn then
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

grant execute on function public.claim_post(uuid, uuid, boolean) to authenticated;
grant execute on function public.help_request_post(uuid, uuid) to authenticated;
