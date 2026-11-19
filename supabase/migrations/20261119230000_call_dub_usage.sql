-- Dubbed voice in calls: the per-minute tab for a listener hearing a one-to-one
-- or group call in their own language.
--
-- Same shape and rules as stage_dub_usage, keyed by the call's room instead of
-- a stage: `dm-call-<call session id>` or `group-call-<group id>`. A separate
-- table rather than a nullable stage column because stage_dub_usage.space_id
-- is a foreign key to audio_spaces and every stage query leans on that.

create table if not exists public.call_dub_usage (
  id uuid primary key default gen_random_uuid(),
  room_key text not null check (room_key ~ '^(dm-call|group-call)-[0-9a-fA-F-]{36}$'),
  wallet_address text not null,
  language text not null,
  minutes integer not null default 0,
  price_dhb_per_min integer not null,
  last_started_at timestamptz,
  settled_at timestamptz,
  settled_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.call_dub_usage enable row level security;

-- One open tab per room and listener; any number of settled ones.
create unique index if not exists call_dub_usage_open_tab_idx
  on public.call_dub_usage (room_key, wallet_address)
  where settled_at is null;

create unique index if not exists call_dub_usage_settled_ref_idx
  on public.call_dub_usage (settled_ref)
  where settled_ref is not null and settled_ref <> 'zero';

create index if not exists call_dub_usage_unsettled_idx
  on public.call_dub_usage (wallet_address)
  where settled_at is null;

create or replace function public.call_dub_tick(
  p_room text,
  p_wallet text,
  p_language text,
  p_price_per_min integer,
  p_start boolean default false
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet text := lower(p_wallet);
  v_minutes integer;
begin
  perform pg_advisory_xact_lock(hashtext('call-dub:' || p_room || ':' || v_wallet));

  update public.call_dub_usage
     set minutes = minutes + 1,
         language = p_language,
         last_started_at = case when p_start then now() else last_started_at end,
         updated_at = now()
   where room_key = p_room
     and wallet_address = v_wallet
     and settled_at is null
  returning minutes into v_minutes;

  if v_minutes is null then
    insert into public.call_dub_usage
      (room_key, wallet_address, language, minutes, price_dhb_per_min, last_started_at)
    values
      (p_room, v_wallet, p_language, case when p_start then 0 else 1 end, p_price_per_min, now())
    returning minutes into v_minutes;
  end if;

  return v_minutes;
end;
$$;

create or replace function public.call_dub_unsettled(p_wallet text)
returns table (room_key text, minutes integer, price_dhb_per_min integer, owed_dhb integer)
language sql
stable
security definer
set search_path = public
as $$
  select u.room_key, u.minutes, u.price_dhb_per_min, (u.minutes * u.price_dhb_per_min)::integer
  from public.call_dub_usage u
  where u.wallet_address = lower(p_wallet) and u.settled_at is null and u.minutes > 0;
$$;

revoke all on function public.call_dub_tick(text, text, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.call_dub_unsettled(text) from public, anon, authenticated;
grant execute on function public.call_dub_tick(text, text, text, integer, boolean) to service_role;
grant execute on function public.call_dub_unsettled(text) to service_role;
