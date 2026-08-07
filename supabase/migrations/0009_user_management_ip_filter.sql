-- 用户管理支持按注册 IP 筛选，保留用户名搜索、状态筛选与分页。

drop function if exists public.list_users(uuid, text, text, integer, integer);

create or replace function public.list_users(
  p_admin           uuid,
  p_status          text default null,
  p_search          text default null,
  p_registration_ip text default null,
  p_limit           integer default 20,
  p_offset          integer default 0
)
returns table (
  id               uuid,
  username         text,
  public_id        text,
  credits          integer,
  status           text,
  is_admin         boolean,
  registration_ip  text,
  same_ip_count    bigint,
  created_at       timestamptz,
  total_count      bigint
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

grant execute on function public.list_users(uuid, text, text, text, integer, integer) to authenticated;
