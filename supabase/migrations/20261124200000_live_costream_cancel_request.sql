-- A viewer can take back an ask the host has not answered yet:
-- guest requested -> left. Everything else is as before.
CREATE OR REPLACE FUNCTION public.guard_live_costream_guest()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  w text;
  is_host boolean;
  room public.live_costreams%ROWTYPE;
BEGIN
  NEW.updated_at := now();
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  w := nullif(public.get_signed_request_wallet_address(), '');
  SELECT * INTO room FROM public.live_costreams c WHERE c.id = NEW.costream_id;
  IF room.id IS NULL OR room.status <> 'active' THEN
    RAISE EXCEPTION 'That co-stream has ended' USING ERRCODE = '42501';
  END IF;
  IF NEW.wallet = room.host_wallet THEN
    RAISE EXCEPTION 'The host is already on screen' USING ERRCODE = '22023';
  END IF;
  is_host := room.host_wallet = w;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('invited', 'requested') THEN
      RAISE EXCEPTION 'A seat starts as an invite or a request' USING ERRCODE = '42501';
    END IF;
    NEW.muted := false;
    -- A guest's stream is theirs to state, never the host's.
    IF is_host THEN NEW.stream_id := NULL; END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.costream_id IS DISTINCT FROM OLD.costream_id
    OR NEW.wallet IS DISTINCT FROM OLD.wallet OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Seat identity is fixed' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF is_host AND NOT (
      (OLD.status = 'requested' AND NEW.status IN ('accepted', 'declined'))
      OR NEW.status = 'removed'
      OR (OLD.status IN ('declined', 'left', 'removed') AND NEW.status = 'invited')
    ) THEN
      RAISE EXCEPTION 'The host cannot make that change' USING ERRCODE = '42501';
    END IF;
    IF NOT is_host AND NOT (
      (OLD.status = 'invited' AND NEW.status IN ('accepted', 'declined'))
      OR (OLD.status = 'accepted' AND NEW.status = 'left')
      OR (OLD.status = 'requested' AND NEW.status = 'left')
      OR (OLD.status IN ('declined', 'left') AND NEW.status = 'requested' AND room.accepting_requests)
    ) THEN
      RAISE EXCEPTION 'You cannot make that change' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'accepted' AND (SELECT count(*) FROM public.live_costream_guests g
      WHERE g.costream_id = NEW.costream_id AND g.status = 'accepted' AND g.id <> NEW.id) >= 3 THEN
      RAISE EXCEPTION 'Three guests are already on screen' USING ERRCODE = '22023';
    END IF;
    -- A fresh seat starts unmuted.
    IF NEW.status IN ('invited', 'requested') THEN NEW.muted := false; END IF;
  END IF;

  IF NOT is_host THEN
    -- Only the host mutes or unmutes.
    NEW.muted := OLD.muted;
  ELSE
    -- The guest's own stream and name are the guest's to state.
    NEW.stream_id := OLD.stream_id;
    NEW.username := OLD.username;
  END IF;
  RETURN NEW;
END $$;
