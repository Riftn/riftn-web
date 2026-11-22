-- Who may ring a group call.
--
-- Owners and admins always can. Everyone else needs the member right
-- `start_calls` (Permissions tab), which is off unless the group turns it on.
-- Joining a call that is already going is unchanged.

-- Let community_update_settings store the new member right.
DO $do$
DECLARE
  def text;
  patched text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'community_update_settings'
   LIMIT 1;
  IF def IS NULL THEN
    RAISE EXCEPTION 'community_update_settings not found';
  END IF;
  IF position('''start_calls''' IN def) > 0 THEN
    RETURN;
  END IF;
  patched := regexp_replace(def, '''create_events''(\s*)\]', '''create_events'', ''start_calls''\1]');
  IF patched = def THEN
    RAISE EXCEPTION 'community_update_settings whitelist not found';
  END IF;
  EXECUTE patched;
END
$do$;

DROP POLICY IF EXISTS call_owner_insert ON public.call_sessions;
CREATE POLICY call_owner_insert ON public.call_sessions FOR INSERT TO anon, authenticated
WITH CHECK (
  lower(caller_address) = nullif(public.get_signed_request_wallet_address(), '')
  AND status = 'ringing'
  AND (group_id IS NULL OR (
    public.is_active_group_member(group_id, caller_address)
    AND public.is_active_group_member(group_id, recipient_address)
    AND (
      coalesce(public.community_role_of(group_id, caller_address), '') IN ('owner', 'admin')
      OR public.community_permission(group_id, caller_address, 'start_calls')
    )
  ))
);
