-- Group calls in Public Chat.
--
-- Public Chat is the Riftn community's chat, so its call is that community's
-- group room (`group-call-03826b47-...`). Everyone who can talk in Public Chat
-- may talk in the call, not only the community's members; a wallet banned
-- from the community (and not yet expired) may not. agora-token asks this
-- function, so no function deploy is needed.
CREATE OR REPLACE FUNCTION public.is_active_group_member(p_group uuid, p_wallet text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_group = '03826b47-f2ff-4707-b76c-818791a9b632'::uuid THEN
    coalesce(p_wallet, '') ~* '^0x[0-9a-f]{40}$'
    AND NOT EXISTS (
      SELECT 1 FROM public.community_members m
      WHERE m.community_id = p_group
        AND lower(m.wallet_address) = lower(p_wallet)
        AND m.status = 'banned' AND (m.banned_until IS NULL OR m.banned_until > now())
    )
  ELSE EXISTS (
    SELECT 1 FROM public.community_members m
    WHERE m.community_id = p_group
      AND lower(m.wallet_address) = lower(p_wallet)
      AND (m.status = 'active' OR (m.status = 'banned' AND m.banned_until IS NOT NULL AND m.banned_until <= now()))
  ) END;
$$;

-- Nobody is rung for the Public Chat call: people join from the pill. Keep
-- the wider check above from letting anyone ring everyone.
DROP POLICY IF EXISTS call_owner_insert ON public.call_sessions;
CREATE POLICY call_owner_insert ON public.call_sessions FOR INSERT TO anon, authenticated
WITH CHECK (
  lower(caller_address) = nullif(public.get_signed_request_wallet_address(), '')
  AND status = 'ringing'
  AND (group_id IS NULL OR (
    group_id <> '03826b47-f2ff-4707-b76c-818791a9b632'::uuid
    AND public.is_active_group_member(group_id, caller_address)
    AND public.is_active_group_member(group_id, recipient_address)
    AND (coalesce(public.community_role_of(group_id, caller_address), '') = ANY (ARRAY['owner', 'admin'])
      OR public.community_permission(group_id, caller_address, 'start_calls'))
  ))
);
