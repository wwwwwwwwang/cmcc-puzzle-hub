-- 审核通过固定发放 3 点信用,避免配置为 0 导致新用户无法参与领取。
-- 已 APPROVED 用户保持幂等,不会重复发放。
create or replace function public.approve_user(p_target uuid, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  seed integer := 3;
  v_status text;
begin
  if not exists (select 1 from public.profiles where id = p_admin and is_admin) then
    return jsonb_build_object('status', 'FORBIDDEN');
  end if;

  select status into v_status from public.profiles where id = p_target for update;
  if v_status is null then
    return jsonb_build_object('status', 'NOT_FOUND');
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

grant execute on function public.approve_user(uuid, uuid) to authenticated;
