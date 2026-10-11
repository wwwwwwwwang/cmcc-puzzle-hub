-- 账户活动汇总在数据库内一次完成，避免账户页每 30 秒发起四次独立查询。

create or replace function public.get_account_activity()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'pendingConfirmationCount', (
      select count(*)
      from public.posts
      where publisher_id = auth.uid()
        and status = 'PENDING_CONFIRM'
    ),
    'pendingHelpCount', (
      select count(*)
      from public.request_help_attempts
      where helper_id = auth.uid()
        and status = 'PENDING'
    ),
    'version', coalesce(
      greatest(
        (
          select updated_at
          from public.posts
          where publisher_id = auth.uid()
          order by updated_at desc
          limit 1
        ),
        (
          select coalesce(resolved_at, helped_at)
          from public.request_help_attempts
          where helper_id = auth.uid()
          order by coalesce(resolved_at, helped_at) desc
          limit 1
        )
      )::text,
      '0'
    )
  );
$$;

revoke all on function public.get_account_activity()
  from public, anon, authenticated;
grant execute on function public.get_account_activity() to authenticated;
