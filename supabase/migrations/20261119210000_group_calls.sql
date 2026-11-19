-- Group voice and video calls.
--
-- A group call is the group's own Agora room (`group-call-<community id>`).
-- Ringing reuses call_sessions: the person starting the call writes one
-- ringing row per member, so every installed client's existing ring path
-- (realtime ping, push, incoming screen) works unchanged. The two new columns
-- tell a client the row belongs to a group call and which room to join.
ALTER TABLE public.call_sessions
  ADD COLUMN IF NOT EXISTS group_id uuid,
  ADD COLUMN IF NOT EXISTS group_name text;

CREATE INDEX IF NOT EXISTS call_sessions_group_idx
  ON public.call_sessions (group_id, created_at DESC) WHERE group_id IS NOT NULL;

-- Membership as every group surface already reads it: active, or a ban that has run out.
CREATE OR REPLACE FUNCTION public.is_active_group_member(p_group uuid, p_wallet text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members m
    WHERE m.community_id = p_group
      AND lower(m.wallet_address) = lower(p_wallet)
      AND (m.status = 'active' OR (m.status = 'banned' AND m.banned_until IS NOT NULL AND m.banned_until <= now()))
  );
$$;
REVOKE ALL ON FUNCTION public.is_active_group_member(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_group_member(uuid, text) TO anon, authenticated, service_role;

-- Only a member can ring a group, and only its members.
DROP POLICY IF EXISTS call_owner_insert ON public.call_sessions;
CREATE POLICY call_owner_insert ON public.call_sessions FOR INSERT TO anon, authenticated
WITH CHECK (
  lower(caller_address) = nullif(public.get_signed_request_wallet_address(), '')
  AND status = 'ringing'
  AND (group_id IS NULL OR (
    public.is_active_group_member(group_id, caller_address)
    AND public.is_active_group_member(group_id, recipient_address)
  ))
);

-- The group a ring belongs to is fixed once written, like its parties.
CREATE OR REPLACE FUNCTION public.call_sessions_freeze_parties()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF new.caller_address IS DISTINCT FROM old.caller_address
     OR new.recipient_address IS DISTINCT FROM old.recipient_address
     OR new.call_type IS DISTINCT FROM old.call_type
     OR new.created_at IS DISTINCT FROM old.created_at
     OR new.group_id IS DISTINCT FROM old.group_id
     OR new.group_name IS DISTINCT FROM old.group_name THEN
    RAISE EXCEPTION 'call parties are fixed' USING errcode = '42501';
  END IF;
  RETURN new;
END $function$;
