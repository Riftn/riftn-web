BEGIN;

INSERT INTO public.audio_spaces (id, channel_name, title, host_wallet_address) VALUES
  ('00000000-0000-0000-0000-000000000001', 'stage_test', 'Stage', '0x1111111111111111111111111111111111111111');
GRANT SELECT ON public.audio_spaces, public.space_participants TO anon;
GRANT UPDATE ON public.audio_spaces TO anon;
GRANT INSERT ON public.space_participants TO anon;

-- Model the production owner-update and seat-owner INSERT policies.
DROP POLICY "Host can update their space" ON public.audio_spaces;
CREATE POLICY stage_owner_update ON public.audio_spaces FOR UPDATE
  USING (public.is_signed_stage_host(id));
DROP POLICY "Anyone can join as participant" ON public.space_participants;
CREATE POLICY seat_owner_insert ON public.space_participants FOR INSERT
  WITH CHECK (lower(wallet_address) = public.get_signed_request_wallet_address());

SET LOCAL ROLE anon;
DO $$
DECLARE
  room constant uuid := '00000000-0000-0000-0000-000000000001';
  host constant text := '0x1111111111111111111111111111111111111111';
  visitor constant text := '0x2222222222222222222222222222222222222222';
  outsider constant text := '0x3333333333333333333333333333333333333333';
BEGIN
  ASSERT public.request_stage_entry(room) = 'allowed', 'guests may enter open stages';
  PERFORM set_config('test.signed_stage_wallet', host, true);
  UPDATE public.audio_spaces SET entry_locked = true WHERE id = room;
  ASSERT FOUND, 'host can lock entry';
  ASSERT public.request_stage_entry(room) = 'allowed', 'host can re-enter';

  PERFORM set_config('test.signed_stage_wallet', '', true);
  ASSERT public.request_stage_entry(room) = 'sign_in', 'locked stages require sign-in';

  PERFORM set_config('test.signed_stage_wallet', visitor, true);
  ASSERT public.request_stage_entry(room) = 'pending', 'new authenticated visitor requires approval';
  ASSERT public.request_stage_entry(room) = 'pending', 'retrying does not create another request';
  ASSERT (SELECT count(*) = 1 FROM public.stage_entry_requests WHERE space_id = room), 'request is unique';
  UPDATE public.audio_spaces SET entry_locked = false WHERE id = room;
  ASSERT NOT FOUND, 'visitor cannot unlock';
  ASSERT NOT public.approve_stage_entry(room, visitor), 'visitor cannot self-approve';
  BEGIN
    INSERT INTO public.space_participants (space_id, wallet_address) VALUES (room, visitor);
    RAISE EXCEPTION 'pending visitor unexpectedly got a seat';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM set_config('test.signed_stage_wallet', outsider, true);
  ASSERT (SELECT count(*) = 0 FROM public.stage_entry_requests WHERE space_id = room), 'another visitor cannot read the request';

  PERFORM set_config('test.signed_stage_wallet', host, true);
  ASSERT (SELECT count(*) = 1 FROM public.stage_entry_requests WHERE space_id = room), 'host can read the request';
  ASSERT public.approve_stage_entry(room, visitor), 'host can approve';
  PERFORM set_config('test.signed_stage_wallet', visitor, true);
  ASSERT public.request_stage_entry(room) = 'allowed', 'approved visitor can join';
  INSERT INTO public.space_participants (space_id, wallet_address) VALUES (room, visitor);

  PERFORM set_config('test.signed_stage_wallet', host, true);
  UPDATE public.audio_spaces SET entry_locked = false WHERE id = room;
  ASSERT FOUND, 'host can reopen the stage';
  PERFORM set_config('test.signed_stage_wallet', '', true);
  ASSERT public.request_stage_entry(room) = 'allowed', 'guests can enter again after unlocking';
END;
$$;
ROLLBACK;
