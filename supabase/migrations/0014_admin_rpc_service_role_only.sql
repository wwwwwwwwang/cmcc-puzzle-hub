-- 管理员 RPC 只允许服务端 service role 调用。
-- 这些函数把 p_admin 作为参数校验管理员身份，不能暴露给 authenticated 直接调用，
-- 否则调用方可以伪造管理员 UUID 绕过应用层权限校验。

revoke all on function public.approve_user(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reject_user(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.reopen_user_review(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.ban_user(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.unban_user(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.list_users(uuid, text, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.list_pending_users(uuid)
  from public, anon, authenticated;

grant execute on function public.approve_user(uuid, uuid) to service_role;
grant execute on function public.reject_user(uuid, uuid, text) to service_role;
grant execute on function public.reopen_user_review(uuid, uuid) to service_role;
grant execute on function public.ban_user(uuid, uuid) to service_role;
grant execute on function public.unban_user(uuid, uuid) to service_role;
grant execute on function public.list_users(uuid, text, text, text, integer, integer) to service_role;
grant execute on function public.list_pending_users(uuid) to service_role;
