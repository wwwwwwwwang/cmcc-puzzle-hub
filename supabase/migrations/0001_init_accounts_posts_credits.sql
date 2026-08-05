-- 用户账号与「赠一领一」信用制:表结构
-- 依赖:pgcrypto(gen_random_uuid)在 Supabase 默认可用。

-- 用户档案:与 auth.users 一对一,持有对外公开 ID 与信用余额。
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  public_id   text not null unique,
  credits     integer not null default 0 check (credits >= 0),
  created_at  timestamptz not null default now()
);

-- 拼图帖子:取代 Redis 帖子 + 有序集合索引 + 领取回执。
create table if not exists public.posts (
  id                      uuid primary key default gen_random_uuid(),
  publisher_id            uuid not null references public.profiles (id) on delete cascade,
  type                    text not null check (type in ('GIVE', 'REQUEST')),
  discount                smallint not null check (discount in (95, 90, 80)),
  piece_number            smallint not null check (piece_number >= 1),
  payloads                jsonb not null,
  available_payload_kinds text[] not null,
  status                  text not null default 'OPEN'
                            check (status in ('OPEN', 'CLAIMED', 'EXPIRED')),
  claimant_id             uuid references public.profiles (id),
  created_at              timestamptz not null default now(),
  expires_at              timestamptz not null,
  claimed_at              timestamptz,
  constraint posts_piece_within_discount check (
    piece_number <= case discount when 95 then 4 when 90 then 6 else 9 end
  )
);

-- 大厅列表主排序键(keyset 游标用 created_at + id)。
create index if not exists posts_hall_order_idx
  on public.posts (created_at desc, id desc);
-- 按类型/折扣筛选,仅 OPEN 帖参与大厅。
create index if not exists posts_open_filter_idx
  on public.posts (type, discount, created_at desc)
  where status = 'OPEN';
create index if not exists posts_publisher_idx on public.posts (publisher_id);
create index if not exists posts_claimant_idx on public.posts (claimant_id);
-- 过期清理扫描。
create index if not exists posts_expiry_idx
  on public.posts (expires_at)
  where status = 'OPEN';

-- 全局去重键:同一 payload hash 在活跃期内唯一。取代 Redis dedupe 键。
create table if not exists public.active_payload_hashes (
  hash     text primary key,
  post_id  uuid not null references public.posts (id) on delete cascade
);

-- 信用流水:不可变审计,与余额变动同事务写入。
create table if not exists public.credit_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  delta       integer not null,
  reason      text not null
                check (reason in ('SEED', 'EARN_CLAIMED', 'SPEND_CLAIM', 'REFUND')),
  post_id     uuid references public.posts (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists credit_ledger_user_idx
  on public.credit_ledger (user_id, created_at desc);
