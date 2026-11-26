BEGIN;

CREATE TABLE public.feature_requests (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  status text NOT NULL,
  author_wallet_address text NOT NULL
);
CREATE TABLE public.feature_request_votes (
  feature_request_id uuid NOT NULL,
  wallet_address text NOT NULL,
  vote_type integer NOT NULL
);
CREATE TABLE public.custom_notifications (
  recipient_address text NOT NULL,
  actor_address text NOT NULL,
  type text NOT NULL,
  content text NOT NULL,
  reference_id text NOT NULL,
  reference_title text NOT NULL
);

\ir ../../supabase/migrations/20261126190000_liked_request_completion.sql

CREATE TRIGGER on_feature_request_status
  AFTER UPDATE OF status ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_feature_request_status();

SET LOCAL ROLE anon;
SELECT set_config('test.wallet', '', true);
SELECT set_config('request.headers', '{"x-wallet-address":"opted-in"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.get_liked_request_completion_preference();
    RAISE EXCEPTION 'An unsigned header read a preference';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.set_liked_request_completion_preference(true);
    RAISE EXCEPTION 'An unsigned header saved a preference';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('test.wallet', 'opted-in', true);
  IF public.get_liked_request_completion_preference() IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'The default should be off';
  END IF;
  PERFORM public.set_liked_request_completion_preference(true);
  IF public.get_liked_request_completion_preference() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Opting in did not persist';
  END IF;
  BEGIN
    PERFORM enabled FROM public.liked_request_completion_preferences;
    RAISE EXCEPTION 'The preference table is readable directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('test.wallet', 'opted-out', true);
  IF public.get_liked_request_completion_preference() IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'One account inherited another account preference';
  END IF;
  PERFORM public.set_liked_request_completion_preference(true);
  PERFORM public.set_liked_request_completion_preference(false);
  IF public.get_liked_request_completion_preference() IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Opting out did not persist';
  END IF;

  PERFORM set_config('test.wallet', 'disliked', true);
  PERFORM public.set_liked_request_completion_preference(true);
  PERFORM set_config('test.wallet', 'author', true);
  PERFORM public.set_liked_request_completion_preference(true);
END;
$$;
RESET ROLE;

INSERT INTO public.feature_requests VALUES ('5296cfd6-3f5a-4a57-98ee-95778bfdf131', 'Test request', 'open', 'author');
INSERT INTO public.feature_request_votes (feature_request_id, wallet_address, vote_type)
SELECT id, voter, vote_type FROM public.feature_requests
CROSS JOIN (VALUES ('OPTED-IN', 1), ('opted-in', 1), ('opted-out', 1), ('default-off', 1), ('disliked', -1), ('author', 1)) AS votes(voter, vote_type);

UPDATE public.feature_requests SET status = 'in_progress';
DO $$
BEGIN
  IF (SELECT array_agg(recipient_address || ':' || content ORDER BY recipient_address, content) FROM public.custom_notifications)
     IS DISTINCT FROM ARRAY['author:in_progress'] THEN
    RAISE EXCEPTION 'Only the author should be notified when a request is queued';
  END IF;
END;
$$;

UPDATE public.feature_requests SET status = 'shipped';
UPDATE public.feature_requests SET status = 'shipped';
UPDATE public.feature_requests SET status = 'completed';
DO $$
BEGIN
  IF (SELECT array_agg(recipient_address || ':' || content ORDER BY recipient_address, content) FROM public.custom_notifications)
     IS DISTINCT FROM ARRAY['author:in_progress', 'author:shipped', 'opted-in:shipped_liked'] THEN
    RAISE EXCEPTION 'Completion alerts should go once to the author and each opted-in liker';
  END IF;
  IF EXISTS (SELECT 1 FROM public.custom_notifications WHERE reference_id <> '5296cfd6-3f5a-4a57-98ee-95778bfdf131' OR reference_title <> 'Test request' OR type <> 'feature_request_status') THEN
    RAISE EXCEPTION 'Notifications should retain the request route and type';
  END IF;
END;
$$;

ROLLBACK;
