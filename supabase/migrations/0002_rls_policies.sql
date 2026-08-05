-- 行级安全(RLS):账号是信用主键;payloads/credits 只经 SECURITY DEFINER 函数变更。

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.active_payload_hashes enable row level security;
alter table public.credit_ledger enable row level security;

-- profiles:本人可读自己的档案。credits 不开放任何客户端写入(仅函数可改)。
create policy profiles_select_self on public.profiles
  for select using (auth.uid() = id);

-- posts:登录用户可读帖子行,但 payloads 通过下方受限视图从大厅剔除;
-- payloads 仅由 claim_post 函数返回给发布者/领取者。
create policy posts_select_authenticated on public.posts
  for select using (auth.role() = 'authenticated');

-- 写入一律经函数(SECURITY DEFINER 以表属主身份绕过 RLS),不给客户端直接 DML 策略。

-- active_payload_hashes:客户端无策略 = 不可读写。

-- credit_ledger:本人只读自己的流水。
create policy credit_ledger_select_self on public.credit_ledger
  for select using (auth.uid() = user_id);

-- 大厅安全视图:只暴露非敏感列,绝不含 payloads。
create or replace view public.hall_posts
with (security_invoker = true) as
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
