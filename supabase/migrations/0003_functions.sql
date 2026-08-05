-- 原子函数:并发正确性与信用变动的唯一真相源(取代 Redis Lua 脚本)。
-- 所有函数以 SECURITY DEFINER 运行,内部自行做归属校验。

-- 配置项(可用 ALTER DATABASE ... SET app.xxx 覆盖;此处给默认)。
-- app.seed_credits: 新用户种子信用;app.earn_cap_per_day: 每日赚取封顶。

-- 新用户注册 → 建 profiles 行 + 发放种子信用 + 记流水。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seed integer := coalesce(nullif(current_setting('app.seed_credits', true), '')::int, 1);
  pub_id text := 'U-' || upper(substr(replace(new.id::text, '-', ''), 1, 16));
begin
  insert into public.profiles (id, public_id, credits)
  values (new.id, pub_id, seed);

  if seed > 0 then
    insert into public.credit_ledger (user_id, delta, reason)
    values (new.id, seed, 'SEED');
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 发布帖子:同事务去重(active_payload_hashes 唯一约束)+ 插入帖子。
-- 返回 jsonb:{ status: 'CREATED', post: {...} } 或 { status: 'DUPLICATE_POST' }。
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
begin
  insert into public.posts (
    publisher_id, type, discount, piece_number,
    payloads, available_payload_kinds, expires_at
  )
  values (
    p_publisher, p_type, p_discount, p_piece_number,
    p_payloads, p_kinds, p_expires_at
  )
  returning id into new_id;

  begin
    foreach h in array p_hashes loop
      insert into public.active_payload_hashes (hash, post_id) values (h, new_id);
    end loop;
  exception when unique_violation then
    -- 任一来源在活跃期内已存在 → 整事务回滚,视为重复发布。
    raise sqlstate 'P0001' using message = 'DUPLICATE_POST';
  end;

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

-- 领取帖子:单事务内完成「锁帖 → 校验 → 扣领取人1分 → GIVE 发布者+1(受封顶)→ 下架 → 清去重」。
-- p_allow_earn 由应用层判定(领取人与发布者不同 IP/设备时为 true)。
-- 返回 jsonb 状态:CLAIMED / SELF_CLAIM_FORBIDDEN / ALREADY_CLAIMED / EXPIRED / INSUFFICIENT_CREDITS。
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

  -- 幂等:同一领取人重复领取,直接回放 payloads。
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

  -- 扣领取人 1 分(余额约束由 profiles.credits >= 0 check 与显式判断共同保证)。
  select credits into v_credits from public.profiles where id = p_claimant for update;
  if v_credits is null or v_credits < 1 then
    return jsonb_build_object('status', 'INSUFFICIENT_CREDITS');
  end if;

  update public.profiles set credits = credits - 1 where id = p_claimant;
  insert into public.credit_ledger (user_id, delta, reason, post_id)
  values (p_claimant, -1, 'SPEND_CLAIM', p_post_id);

  -- 仅 GIVE 帖、且允许赚取、且未超当日封顶,才给发布者 +1。
  if v_post.type = 'GIVE' and p_allow_earn then
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
    set status = 'CLAIMED', claimant_id = p_claimant, claimed_at = now()
    where id = p_post_id;
  delete from public.active_payload_hashes where post_id = p_post_id;

  return jsonb_build_object(
    'status', 'CLAIMED', 'idempotent', false, 'payloads', v_post.payloads
  );
end;
$$;

-- 用户主动下架自己未被领取的帖子。
create or replace function public.delist_post(p_post_id uuid, p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.posts
    where id = p_post_id and publisher_id = p_owner and status = 'OPEN';
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return jsonb_build_object('status', 'NOT_FOUND_OR_NOT_OPEN');
  end if;
  return jsonb_build_object('status', 'DELISTED');
end;
$$;

-- 过期清理(供 Cron 调用):OPEN 且过期 → EXPIRED,并清去重行。
create or replace function public.cleanup_expired_posts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.posts set status = 'EXPIRED'
      where status = 'OPEN' and expires_at <= now()
      returning id
  )
  delete from public.active_payload_hashes
    where post_id in (select id from expired);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 大厅列表:keyset 分页(created_at desc, id desc)。在 SQL 内完成游标比较,
-- 避免在 PostgREST 层用 or() 拼 ISO 时间戳带来的转义脆弱性。仅返回安全列。
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
    p.id,
    pr.public_id,
    p.type,
    p.discount,
    p.piece_number,
    p.available_payload_kinds,
    p.created_at,
    p.expires_at
  from public.posts p
  join public.profiles pr on pr.id = p.publisher_id
  where p.status = 'OPEN'
    and p.expires_at > now()
    and (p_type is null or p.type = p_type)
    and (p_discount is null or p.discount = p_discount)
    and (p_piece_number is null or p.piece_number = p_piece_number)
    and (
      p_cursor_created_at is null
      or p.created_at < p_cursor_created_at
      or (p.created_at = p_cursor_created_at and p.id < p_cursor_id)
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 21);
$$;

-- 授予 authenticated 执行权限(service role 默认可执行)。
grant execute on function public.publish_post(uuid, text, smallint, smallint, jsonb, text[], text[], timestamptz) to authenticated;
grant execute on function public.list_hall_posts(text, smallint, smallint, timestamptz, uuid, integer) to authenticated;
grant execute on function public.claim_post(uuid, uuid, boolean) to authenticated;
grant execute on function public.delist_post(uuid, uuid) to authenticated;
