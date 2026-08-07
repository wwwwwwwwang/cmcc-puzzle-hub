-- 仅二维码发布与永久去重：同一二维码业务身份整个活动周期只能发布一次。

create table if not exists public.puzzle_identity_registry (
  identity_hash text primary key,
  first_post_id uuid references public.posts (id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.puzzle_identity_registry enable row level security;

revoke all on table public.puzzle_identity_registry
  from public, anon, authenticated;

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
  identity_hash text;
  v_credits integer;
begin
  if jsonb_typeof(p_payloads) <> 'object' then
    raise exception 'INVALID_PUBLISH_PAYLOAD' using errcode = '22023';
  end if;

  if p_kinds is distinct from array['URL']::text[]
    or cardinality(p_hashes) <> 1
    or jsonb_typeof(p_payloads -> 'url') <> 'string'
    or nullif(trim(p_payloads ->> 'url'), '') is null
    or exists (
      select 1
      from jsonb_object_keys(p_payloads) as payload_key
      where payload_key <> 'url'
    )
  then
    raise exception 'INVALID_PUBLISH_PAYLOAD' using errcode = '22023';
  end if;

  identity_hash := p_hashes[1];

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

  insert into public.puzzle_identity_registry (identity_hash, first_post_id)
  values (identity_hash, new_id);

  insert into public.active_payload_hashes (hash, post_id)
  values (identity_hash, new_id);

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
exception when unique_violation then
  return jsonb_build_object('status', 'DUPLICATE_POST');
end;
$$;

revoke all on function public.publish_post(
  uuid, text, smallint, smallint, jsonb, text[], text[], timestamptz
) from public, anon, authenticated;

grant execute on function public.publish_post(
  uuid, text, smallint, smallint, jsonb, text[], text[], timestamptz
) to service_role;

