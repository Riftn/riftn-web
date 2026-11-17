-- A voice saved from the app is always an ordinary voice. The paid stage
-- voice flag is only ever set by the stage-voice-clone function after payment
-- (the trigger from 20261117100000 already forces it off), and the insert rule
-- now says so too.
drop policy if exists "Users can insert own voices" on public.custom_voices;
create policy "Users can insert own voices"
  on public.custom_voices for insert
  with check (
    lower(wallet_address) = lower(public.get_request_wallet_address())
    and coalesce(is_stage_voice, false) = false
  );