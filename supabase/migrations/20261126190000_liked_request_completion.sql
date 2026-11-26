CREATE TABLE public.liked_request_completion_preferences (
  wallet_address text PRIMARY KEY,
  enabled boolean NOT NULL,
  CHECK (wallet_address = lower(wallet_address))
);

ALTER TABLE public.liked_request_completion_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.liked_request_completion_preferences FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_liked_request_completion_preference()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  wallet text := public.get_signed_request_wallet_address();
BEGIN
  IF COALESCE(wallet, '') = '' THEN
    RAISE EXCEPTION 'A verified wallet session is required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT enabled FROM public.liked_request_completion_preferences WHERE wallet_address = wallet
  ), false);
END;
$$;

CREATE FUNCTION public.set_liked_request_completion_preference(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  wallet text := public.get_signed_request_wallet_address();
BEGIN
  IF COALESCE(wallet, '') = '' THEN
    RAISE EXCEPTION 'A verified wallet session is required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.liked_request_completion_preferences (wallet_address, enabled)
  VALUES (wallet, p_enabled)
  ON CONFLICT (wallet_address) DO UPDATE SET enabled = EXCLUDED.enabled;

  RETURN p_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.get_liked_request_completion_preference() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_liked_request_completion_preference(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_liked_request_completion_preference() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_liked_request_completion_preference(boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_feature_request_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  editor text := lower(COALESCE(NULLIF(public.get_signed_request_wallet_address(), ''), NEW.author_wallet_address));
  is_complete boolean := NEW.status IN ('completed', 'shipped');
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NOT is_complete AND NEW.status <> 'in_progress' THEN RETURN NEW; END IF;
  IF is_complete AND OLD.status IN ('completed', 'shipped') THEN RETURN NEW; END IF;

  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content, reference_id, reference_title
  ) VALUES (
    lower(NEW.author_wallet_address), editor, 'feature_request_status',
    CASE WHEN is_complete THEN 'shipped' ELSE 'in_progress' END, NEW.id::text, NEW.title
  );

  IF is_complete THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    )
    SELECT DISTINCT prefs.wallet_address, editor, 'feature_request_status',
           'shipped_liked', NEW.id::text, NEW.title
    FROM public.feature_request_votes v
    JOIN public.liked_request_completion_preferences prefs
      ON prefs.wallet_address = lower(v.wallet_address) AND prefs.enabled
    WHERE v.feature_request_id = NEW.id
      AND v.vote_type = 1
      AND prefs.wallet_address <> lower(NEW.author_wallet_address);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
