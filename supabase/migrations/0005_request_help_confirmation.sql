-- 求助助力确认与信用托管。
-- REQUEST: 发布者先托管 1 点，助力者在发布者主动确认或 24 小时自动确认后获得 1 点。

alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts
  add constraint posts_status_check
  check (status in ('OPEN', 'CLAIMED', 'PENDING_CONFIRM', 'COMPLETED', 'EXPIRED'));

alter table public.posts
  add column if not exists request_credit_status text
    check (request_credit_status in ('HELD', 'SETTLED', 'REFUNDED')),
  add column if not exists closure_reason text
    check (closure_reason in ('DELISTED', 'TIMEOUT')),
  add column if not exists updated_at timestamptz not null default now();

-- 线上确认没有旧 REQUEST 数据；该回填仅让空测试库/开发库能重复应用约束。
update public.posts
set request_credit_status = 'REFUNDED'
where type = 'REQUEST' and request_credit_status is null;

alter table public.posts drop constraint if exists posts_request_credit_shape;
alter table public.posts add constraint posts_request_credit_shape check (
  (type = 'GIVE' and request_credit_status is null)
  or (type = 'REQUEST' and request_credit_status is not null)
);

alter table public.credit_ledger drop constraint if exists credit_ledger_reason_check;
alter table public.credit_ledger add constraint credit_ledger_reason_check
  check (reason in (
    'SEED',
    'EARN_CLAIMED',
    'SPEND_CLAIM',
    'REFUND',
    'ESCROW_REQUEST',
    'EARN_HELP_CONFIRMED',
    'REFUND_REQUEST'
  ));

create table public.request_help_attempts (
  id                    uuid primary key default gen_random_uuid(),
  post_id               uuid not null references public.posts (id) on delete cascade,
  helper_id             uuid not null references public.profiles (id) on delete cascade,
  status                text not null check (status in ('PENDING', 'REJECTED', 'COMPLETED')),
  helped_at             timestamptz not null default now(),
  confirmation_deadline timestamptz not null,
  resolved_at           timestamptz,
  confirmation_method   text check (confirmation_method in ('MANUAL', 'AUTO')),
  unique (post_id, helper_id),
  constraint request_help_resolution_shape check (
    (status = 'COMPLETED' and resolved_at is not null and confirmation_method is not null)
    or (status = 'REJECTED' and resolved_at is not null and confirmation_method is null)
    or (status = 'PENDING' and resolved_at is null and confirmation_method is null)
  )
);

create unique index if not exists request_help_one_pending_per_post
  on public.request_help_attempts (post_id) where status = 'PENDING';
create index if not exists request_help_helper_history
  on public.request_help_attempts (helper_id, helped_at desc);
create index if not exists request_help_due
  on public.request_help_attempts (confirmation_deadline) where status = 'PENDING';

alter table public.request_help_attempts enable row level security;

-- 使用 SECURITY DEFINER 判定函数避免 posts 与 request_help_attempts 的 RLS 互相递归。
create or replace function public.can_read_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        p.publisher_id = auth.uid()
        or p.claimant_id = auth.uid()
        or exists (
          select 1
          from public.request_help_attempts a
          where a.post_id = p.id and a.helper_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_read_help_attempt(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.request_help_attempts a
    join public.posts p on p.id = a.post_id
    where a.id = p_attempt_id
      and (a.helper_id = auth.uid() or p.publisher_id = auth.uid())
  );
$$;

revoke all on function public.can_read_post(uuid) from public;
revoke all on function public.can_read_help_attempt(uuid) from public;
grant execute on function public.can_read_post(uuid) to authenticated;
grant execute on function public.can_read_help_attempt(uuid) to authenticated;

drop policy if exists posts_select_authenticated on public.posts;
drop policy if exists posts_select_related on public.posts;
create policy posts_select_related on public.posts
  for select using (public.can_read_post(id));

drop policy if exists request_help_select_related on public.request_help_attempts;
create policy request_help_select_related on public.request_help_attempts
  for select using (public.can_read_help_attempt(id));

-- 发布帖子：REQUEST 发布时在同一事务托管发布者 1 点信用。
create or replace function public.publish_post(
  p_publisher     uuid,
  p_type          text,
  p_discount      smallint,
  p_piece_number  smallint,
  p_payloads      jsonb,
  p_kinds         text[],
  p_hashes        text[],
  p_expires_at    timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  h text;
  v_credits integer;
begin
  if p_type = 'REQUEST' then
    select credits into v_credits
    from public.profiles
    where id = p_publisher
    for update;

    if v_credits is null or v_credits < 1 then
      return jsonb_build_object('status', 'INSUFFICIENT_CREDITS');
    end if;
  end if;

  insert into public.posts (
    publisher_id,
    type,
    discount,
    piece_number,
    payloads,
    available_payload_kinds,
    expires_at,
    request_credit_status
  )
  values (
    p_publisher,
    p_type,
    p_discount,
    p_piece_number,
    p_payloads,
    p_kinds,
    p_expires_at,
    case when p_type = 'REQUEST' then 'HELD' else null end
  )
  returning id into new_id;

  begin
    foreach h in array p_hashes loop
      insert into public.active_payload_hashes (hash, post_id) values (h, new_id);
    end loop;
  exception when unique_violation then
    raise sqlstate 'P0001' using message = 'DUPLICATE_POST';
  end;

  if p_type = 'REQUEST' then
    update public.profiles set credits = credits - 1 where id = p_publisher;
    insert into public.credit_ledger (user_id, delta, reason, post_id)
    values (p_publisher, -1, 'ESCROW_REQUEST', new_id);
  end if;

  return jsonb_build_object(
    'status', 'CREATED',
    'post', jsonb_build_object(
      'id', new_id,
      'publisherId', (select public_id from public.profiles where id = p_publisher),
      'type', p_type,
      'discount', p_discount,
      'pieceNumber', p_piece_number,
      'availablePayloadKinds', to_jsonb(p_kinds),
      'createdAt', now(),
      'expiresAt', p_expires_at
    )
  );
exception when sqlstate 'P0001' then
  return jsonb_build_object('status', 'DUPLICATE_POST');
end;
$$;

-- 赠送领取：REQUEST 必须走 help_request_post，不能复用扣领取者信用的旧路径。
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
  v_post          public.posts%rowtype;
  v_credits       integer;
  v_earn_cap      integer := coalesce(nullif(current_setting('app.earn_cap_per_day', true), '')::int, 5);
  v_earned_today  integer;
begin
  select * into v_post from public.posts where id = p_post_id for update;

  if not found then
    return jsonb_build_object('status', 'EXPIRED');
  end if;
  if v_post.type <> 'GIVE' then
    return jsonb_build_object('status', 'INVALID_POST_TYPE');
  end if;
  if v_post.claimant_id = p_claimant then
    return jsonb_build_object(
      'status', 'CLAIMED', 'idempotent', true, 'payloads', v_post.payloads
    );
  end if;
  if v_post.publisher_id = p_claimant then
    return jsonb_build_object('status', 'SELF_CLAIM_FORBIDDEN');
  end if;
  if v_post.status <> 'OPEN' or v_post.claimant_id is not null then
    return jsonb_build_object('status', 'ALREADY_CLAIMED');
  end if;
  if v_post.expires_at <= now() then
    return jsonb_build_object('status', 'EXPIRED');
  end if;

  select credits into v_credits from public.profiles where id = p_claimant for update;
  if v_credits is null or v_credits < 1 then
    return jsonb_build_object('status', 'INSUFFICIENT_CREDITS');
  end if;

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

  return jsonb_build_object(
    'status', 'CLAIMED', 'idempotent', false, 'payloads', v_post.payloads
  );
end;
$$;

-- B 助力求助帖：锁帖后创建唯一待确认记录，不修改 B 信用。
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

  if not found then
    return jsonb_build_object('status', 'EXPIRED');
  end if;
  if v_post.type <> 'REQUEST' then
    return jsonb_build_object('status', 'INVALID_POST_TYPE');
  end if;
  if v_post.publisher_id = p_helper then
    return jsonb_build_object('status', 'SELF_HELP_FORBIDDEN');
  end if;

  select * into v_attempt
  from public.request_help_attempts
  where post_id = p_post_id and helper_id = p_helper;

  if found then
    if v_attempt.status = 'PENDING' and v_post.status = 'PENDING_CONFIRM' then
      return jsonb_build_object(
        'status', 'HELPED',
        'idempotent', true,
        'payloads', v_post.payloads,
        'confirmationDeadline', v_attempt.confirmation_deadline
      );
    end if;
    return jsonb_build_object('status', 'HELP_RETRY_FORBIDDEN');
  end if;

  if v_post.status <> 'OPEN' then
    return jsonb_build_object('status', 'ALREADY_HELPED');
  end if;

  if v_post.expires_at <= now() then
    if v_post.request_credit_status = 'HELD' then
      update public.profiles set credits = credits + 1 where id = v_post.publisher_id;
      insert into public.credit_ledger (user_id, delta, reason, post_id)
      values (v_post.publisher_id, 1, 'REFUND_REQUEST', p_post_id);
    end if;
    update public.posts
    set status = 'EXPIRED', request_credit_status = 'REFUNDED',
        closure_reason = 'TIMEOUT', updated_at = now()
    where id = p_post_id;
    delete from public.active_payload_hashes where post_id = p_post_id;
    return jsonb_build_object('status', 'EXPIRED');
  end if;

  v_deadline := now() + interval '24 hours';
  insert into public.request_help_attempts (
    post_id, helper_id, status, confirmation_deadline
  ) values (
    p_post_id, p_helper, 'PENDING', v_deadline
  );

  update public.posts
  set status = 'PENDING_CONFIRM', updated_at = now()
  where id = p_post_id;

  return jsonb_build_object(
    'status', 'HELPED',
    'idempotent', false,
    'payloads', v_post.payloads,
    'confirmationDeadline', v_deadline
  );
end;
$$;

-- A 主动确认收到或表示未收到。
create or replace function public.resolve_request_help(
  p_post_id uuid,
  p_publisher uuid,
  p_received boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.posts%rowtype;
  v_attempt public.request_help_attempts%rowtype;
begin
  select * into v_post from public.posts where id = p_post_id for update;

  if not found or v_post.type <> 'REQUEST' then
    return jsonb_build_object('status', 'NOT_PENDING');
  end if;
  if v_post.publisher_id <> p_publisher then
    return jsonb_build_object('status', 'FORBIDDEN');
  end if;

  select * into v_attempt
  from public.request_help_attempts
  where post_id = p_post_id and status = 'PENDING'
  for update;

  if not found
    or v_post.status <> 'PENDING_CONFIRM'
    or v_post.request_credit_status <> 'HELD'
  then
    return jsonb_build_object('status', 'NOT_PENDING');
  end if;

  if p_received then
    update public.request_help_attempts
    set status = 'COMPLETED', resolved_at = now(), confirmation_method = 'MANUAL'
    where id = v_attempt.id;
    update public.posts
    set status = 'COMPLETED', request_credit_status = 'SETTLED', updated_at = now()
    where id = p_post_id and request_credit_status = 'HELD';
    update public.profiles set credits = credits + 1 where id = v_attempt.helper_id;
    insert into public.credit_ledger (user_id, delta, reason, post_id)
    values (v_attempt.helper_id, 1, 'EARN_HELP_CONFIRMED', p_post_id);
    delete from public.active_payload_hashes where post_id = p_post_id;
    return jsonb_build_object('status', 'COMPLETED', 'confirmationMethod', 'MANUAL');
  end if;

  update public.request_help_attempts
  set status = 'REJECTED', resolved_at = now()
  where id = v_attempt.id;

  if v_post.expires_at > now() then
    update public.posts set status = 'OPEN', updated_at = now() where id = p_post_id;
    return jsonb_build_object('status', 'REOPENED');
  end if;

  update public.profiles set credits = credits + 1 where id = v_post.publisher_id;
  insert into public.credit_ledger (user_id, delta, reason, post_id)
  values (v_post.publisher_id, 1, 'REFUND_REQUEST', p_post_id);
  update public.posts
  set status = 'EXPIRED', request_credit_status = 'REFUNDED',
      closure_reason = 'TIMEOUT', updated_at = now()
  where id = p_post_id and request_credit_status = 'HELD';
  delete from public.active_payload_hashes where post_id = p_post_id;
  return jsonb_build_object('status', 'EXPIRED');
end;
$$;

-- 主动下架：REQUEST 原子退款并保留结束记录，GIVE 沿用删除语义。
create or replace function public.delist_post(p_post_id uuid, p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.posts%rowtype;
begin
  select * into v_post
  from public.posts
  where id = p_post_id and publisher_id = p_owner
  for update;

  if not found or v_post.status <> 'OPEN' then
    return jsonb_build_object('status', 'NOT_FOUND_OR_NOT_OPEN');
  end if;

  if v_post.type = 'REQUEST' then
    if v_post.request_credit_status <> 'HELD' then
      return jsonb_build_object('status', 'NOT_FOUND_OR_NOT_OPEN');
    end if;
    update public.profiles set credits = credits + 1 where id = p_owner;
    insert into public.credit_ledger (user_id, delta, reason, post_id)
    values (p_owner, 1, 'REFUND_REQUEST', p_post_id);
    update public.posts
    set status = 'EXPIRED', request_credit_status = 'REFUNDED',
        closure_reason = 'DELISTED', updated_at = now()
    where id = p_post_id and request_credit_status = 'HELD';
    delete from public.active_payload_hashes where post_id = p_post_id;
  else
    delete from public.posts where id = p_post_id;
  end if;

  return jsonb_build_object('status', 'DELISTED');
end;
$$;

-- 自动确认、求助退款和赠送过期清理的统一维护入口。
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
    where a.status = 'PENDING'
      and a.confirmation_deadline <= now()
      and p.status = 'PENDING_CONFIRM'
      and p.request_credit_status = 'HELD'
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

create or replace function public.cleanup_expired_posts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.sync_request_maintenance();
  return coalesce((v_result ->> 'requestRefunded')::integer, 0)
    + coalesce((v_result ->> 'giveExpired')::integer, 0);
end;
$$;

-- 写 RPC 只允许 service role；应用层先校验会话，再以管理客户端调用。
revoke all on function public.publish_post(uuid, text, smallint, smallint, jsonb, text[], text[], timestamptz) from public, authenticated;
revoke all on function public.claim_post(uuid, uuid, boolean) from public, authenticated;
revoke all on function public.help_request_post(uuid, uuid) from public, authenticated;
revoke all on function public.resolve_request_help(uuid, uuid, boolean) from public, authenticated;
revoke all on function public.delist_post(uuid, uuid) from public, authenticated;
revoke all on function public.sync_request_maintenance() from public, authenticated;
revoke all on function public.cleanup_expired_posts() from public, authenticated;

grant execute on function public.publish_post(uuid, text, smallint, smallint, jsonb, text[], text[], timestamptz) to service_role;
grant execute on function public.claim_post(uuid, uuid, boolean) to service_role;
grant execute on function public.help_request_post(uuid, uuid) to service_role;
grant execute on function public.resolve_request_help(uuid, uuid, boolean) to service_role;
grant execute on function public.delist_post(uuid, uuid) to service_role;
grant execute on function public.sync_request_maintenance() to service_role;
grant execute on function public.cleanup_expired_posts() to service_role;

-- Supabase Cron 每 5 分钟执行一次；任务名稳定，重复应用迁移时先取消旧任务。
create extension if not exists pg_cron with schema extensions;

do $$
begin
  perform cron.unschedule('cmcc-request-help-maintenance');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'cmcc-request-help-maintenance',
  '*/5 * * * *',
  'select public.sync_request_maintenance()'
);
