-- "Delete for me" in group, channel and community chats.
-- A hidden row only ever removes the message from the person who hid it;
-- everyone else still sees it. Deleting for everyone stays
-- community_delete_message (your own line, or a moderator).
CREATE TABLE IF NOT EXISTS public.community_chat_hidden_messages (
  wallet_address text NOT NULL,
  message_id uuid NOT NULL REFERENCES public.community_chat_messages(id) ON DELETE CASCADE,
  community_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, message_id)
);
CREATE INDEX IF NOT EXISTS idx_community_chat_hidden_by_room
  ON public.community_chat_hidden_messages (wallet_address, community_id);

-- Only reachable through the two functions below.
ALTER TABLE public.community_chat_hidden_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_chat_hidden_messages FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.community_hide_message(_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor text := lower(coalesce(public.get_signed_request_wallet_address(), ''));
  room uuid;
BEGIN
  IF actor = '' THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT m.community_id INTO room FROM public.community_chat_messages m WHERE m.id = _message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.community_chat_hidden_messages (wallet_address, message_id, community_id)
  VALUES (actor, _message_id, room)
  ON CONFLICT (wallet_address, message_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_hidden_message_ids(_community_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(h.message_id), '{}'::uuid[])
    FROM public.community_chat_hidden_messages h
   WHERE h.community_id = _community_id
     AND h.wallet_address = lower(coalesce(public.get_signed_request_wallet_address(), ''));
$$;

REVOKE ALL ON FUNCTION public.community_hide_message(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_hidden_message_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_hide_message(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_hidden_message_ids(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
