-- 账户页、管理员列表和大厅筛选的读路径索引。

create index if not exists posts_publisher_created_id_idx
  on public.posts (publisher_id, created_at desc, id desc);

create index if not exists posts_claimant_claimed_id_idx
  on public.posts (claimant_id, claimed_at desc, id desc)
  where type = 'GIVE';

create index if not exists posts_pending_confirmation_idx
  on public.posts (publisher_id)
  where status = 'PENDING_CONFIRM';

create index if not exists request_help_pending_helper_idx
  on public.request_help_attempts (helper_id)
  where status = 'PENDING';

create index if not exists profiles_status_created_idx
  on public.profiles (status, created_at desc);

create index if not exists posts_hall_piece_idx
  on public.posts (discount, piece_number, created_at desc, id desc)
  where status = 'OPEN';
