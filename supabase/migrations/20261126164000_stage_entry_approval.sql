ALTER TABLE public.audio_spaces
  ADD COLUMN entry_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN topic text CHECK (topic IN ('general', 'crypto', 'sports', 'gaming', 'technology'));

CREATE TABLE public.stage_entry_requests (
  space_id uuid NOT NULL REFERENCES public.audio_spaces(id) ON DELETE CASCADE,
  wallet_address text NOT NULL CHECK (wallet_address ~ '^0x[0-9a-f]{40}$'),
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  PRIMARY KEY (space_id, wallet_address)
);

ALTER TABLE public.stage_entry_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stage_entry_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stage_entry_requests TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_entry_requests TO service_role;

CREATE POLICY stage_entry_request_parties_read ON public.stage_entry_requests
  FOR SELECT TO anon, authenticated
  USING (
    wallet_address = (SELECT public.get_signed_request_wallet_address())
    OR public.is_signed_stage_host(space_id)
  );

CREATE FUNCTION public.stage_entry_allowed(p_space_id uuid, p_wallet text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT NOT s.entry_locked
      OR lower(s.host_wallet_address) = p_wallet
      OR EXISTS (
        SELECT 1 FROM public.stage_entry_requests AS r
        WHERE r.space_id = s.id AND r.wallet_address = p_wallet AND r.approved_at IS NOT NULL
      )
    FROM public.audio_spaces AS s WHERE s.id = p_space_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.stage_entry_allowed(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_entry_allowed(uuid, text) TO service_role;

CREATE FUNCTION public.can_take_stage_seat(p_space_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.stage_entry_allowed(p_space_id, public.get_signed_request_wallet_address());
$$;

REVOKE ALL ON FUNCTION public.can_take_stage_seat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_take_stage_seat(uuid) TO anon, authenticated;

CREATE POLICY stage_entry_seat_insert ON public.space_participants
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (public.can_take_stage_seat(space_id));

CREATE FUNCTION public.request_stage_entry(p_space_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  caller text := nullif(public.get_signed_request_wallet_address(), '');
  stage public.audio_spaces%ROWTYPE;
BEGIN
  SELECT * INTO stage FROM public.audio_spaces WHERE id = p_space_id FOR SHARE;
  IF NOT FOUND OR stage.status <> 'live' THEN
    RETURN 'closed';
  END IF;
  IF NOT stage.entry_locked THEN
    RETURN 'allowed';
  END IF;
  IF caller IS NULL THEN
    RETURN 'sign_in';
  END IF;
  IF public.stage_entry_allowed(stage.id, caller) THEN
    RETURN 'allowed';
  END IF;
  INSERT INTO public.stage_entry_requests (space_id, wallet_address)
  VALUES (stage.id, caller)
  ON CONFLICT DO NOTHING;
  IF public.stage_entry_allowed(stage.id, caller) THEN
    RETURN 'allowed';
  END IF;
  RETURN 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.request_stage_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_stage_entry(uuid) TO anon, authenticated;

CREATE FUNCTION public.approve_stage_entry(p_space_id uuid, p_wallet text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  caller text := nullif(public.get_signed_request_wallet_address(), '');
BEGIN
  PERFORM 1 FROM public.audio_spaces
  WHERE id = p_space_id AND status = 'live' AND entry_locked
    AND lower(host_wallet_address) = caller
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.stage_entry_requests SET approved_at = now()
  WHERE space_id = p_space_id AND wallet_address = lower(p_wallet) AND approved_at IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_stage_entry(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_stage_entry(uuid, text) TO anon, authenticated;

CREATE INDEX stage_entry_pending_by_room
  ON public.stage_entry_requests (space_id, requested_at)
  WHERE approved_at IS NULL;

NOTIFY pgrst, 'reload schema';
