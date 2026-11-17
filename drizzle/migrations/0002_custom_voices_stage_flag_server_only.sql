create or replace function public.custom_voices_stage_flag_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.is_stage_voice
     and current_user not in ('service_role', 'postgres', 'supabase_admin')
     and (tg_op = 'INSERT' or not coalesce(old.is_stage_voice, false)) then
    new.is_stage_voice := false;
  end if;
  return new;
end;
$$;

drop trigger if exists custom_voices_stage_flag_guard on public.custom_voices;
create trigger custom_voices_stage_flag_guard
  before insert or update of is_stage_voice on public.custom_voices
  for each row execute function public.custom_voices_stage_flag_guard();