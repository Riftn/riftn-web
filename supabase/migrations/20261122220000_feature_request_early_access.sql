-- Early access for the person who asked (Requests 4dbc2296).
--
-- When a new feature ships, the person who posted the request can get it a
-- day before everyone else. The code wraps the feature in
-- useEarlyAccess('<request id>', '<latest public date>'), and the board owners
-- start the head start when they mark the request Shipped:
--
--   update public.feature_requests
--      set status = 'shipped', early_access_until = now() + interval '24 hours'
--    where id = '<request id>';
--
-- Until early_access_until passes, only the poster (and the board owners, to
-- test) sees the feature. NULL means no head start: the feature is for
-- everyone as soon as it is out. Only the owners or server code can set it.
-- NOTE: git-pushed migrations don't reliably auto-apply; run against prod via SQL.

ALTER TABLE public.feature_requests
  ADD COLUMN IF NOT EXISTS early_access_until timestamptz;

CREATE OR REPLACE FUNCTION public.guard_feature_request_early_access()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IN ('anon', 'authenticated')
       AND NOT public.is_feature_request_status_editor() THEN
      NEW.early_access_until := NULL;
    END IF;
  ELSIF NEW.early_access_until IS DISTINCT FROM OLD.early_access_until
     AND current_user IN ('anon', 'authenticated')
     AND NOT public.is_feature_request_status_editor() THEN
    NEW.early_access_until := OLD.early_access_until;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_feature_request_early_access ON public.feature_requests;
CREATE TRIGGER guard_feature_request_early_access
  BEFORE INSERT OR UPDATE ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_feature_request_early_access();

NOTIFY pgrst, 'reload schema';
