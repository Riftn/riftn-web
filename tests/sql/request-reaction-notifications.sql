BEGIN;

CREATE TABLE public.feature_requests (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  author_wallet_address text NOT NULL,
  author_username text,
  author_avatar text
);
CREATE TABLE public.feature_request_comments (
  id uuid PRIMARY KEY,
  feature_request_id uuid NOT NULL REFERENCES public.feature_requests,
  parent_id uuid REFERENCES public.feature_request_comments,
  wallet_address text NOT NULL,
  content text NOT NULL,
  username text,
  avatar text
);
CREATE TABLE public.feature_request_votes (
  feature_request_id uuid NOT NULL REFERENCES public.feature_requests,
  wallet_address text NOT NULL,
  vote_type integer NOT NULL,
  PRIMARY KEY (feature_request_id, wallet_address)
);
CREATE TABLE public.feature_request_comment_reactions (
  comment_id uuid NOT NULL REFERENCES public.feature_request_comments,
  wallet_address text NOT NULL,
  reaction text NOT NULL,
  PRIMARY KEY (comment_id, wallet_address)
);
CREATE TABLE public.custom_notifications (
  recipient_address text NOT NULL,
  actor_address text NOT NULL,
  actor_username text,
  actor_avatar text,
  type text NOT NULL,
  content text NOT NULL,
  reference_id text,
  reference_title text,
  reference_comment_id text
);

\ir ../../supabase/migrations/20261101210000_feature_request_watchers.sql
\ir ../../supabase/migrations/20261127110000_request_reaction_notifications.sql

CREATE TRIGGER on_feature_request_comment_notify
  AFTER INSERT ON public.feature_request_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_feature_request_comment();

DO $$
DECLARE
  req uuid := gen_random_uuid();
  root uuid := gen_random_uuid();
  mention uuid := gen_random_uuid();
  answer uuid := gen_random_uuid();
  recipients text[];
BEGIN
  INSERT INTO public.feature_requests (id, title, description, author_wallet_address)
  VALUES (req, 'Test request', '', 'author');
  INSERT INTO public.feature_request_comments (id, feature_request_id, parent_id, wallet_address, content)
  VALUES (root, req, NULL, 'root-owner', 'Thread'),
         (mention, req, root, 'nested-author', '@assistant Any update?'),
         (answer, req, mention, 'assistant', 'Here is an update.');

  SELECT array_agg(recipient_address || ':' || type ORDER BY recipient_address) INTO recipients
  FROM public.custom_notifications
  WHERE reference_comment_id = answer::text AND type IN ('feature_request_reply', 'feature_request_comment');
  IF recipients IS DISTINCT FROM ARRAY['author:feature_request_comment', 'nested-author:feature_request_reply'] THEN
    RAISE EXCEPTION 'The assistant reply should notify the nested commenter and request author once each';
  END IF;

  INSERT INTO public.feature_request_votes VALUES (req, 'voter', -1), (req, 'author', -1);
  INSERT INTO public.feature_request_comment_reactions VALUES (mention, 'voter', 'dislike'), (mention, 'nested-author', 'dislike');
  IF EXISTS (SELECT 1 FROM public.custom_notifications WHERE type IN ('feature_request_like', 'feature_request_comment_like')) THEN
    RAISE EXCEPTION 'Dislikes should not notify anyone';
  END IF;

  INSERT INTO public.feature_request_votes VALUES (req, 'voter', 1), (req, 'author', 1)
  ON CONFLICT (feature_request_id, wallet_address) DO UPDATE SET vote_type = EXCLUDED.vote_type;
  INSERT INTO public.feature_request_comment_reactions VALUES (mention, 'voter', 'like'), (mention, 'nested-author', 'like')
  ON CONFLICT (comment_id, wallet_address) DO UPDATE SET reaction = EXCLUDED.reaction;
  UPDATE public.feature_request_votes SET vote_type = 1 WHERE feature_request_id = req;
  UPDATE public.feature_request_comment_reactions SET reaction = 'love' WHERE comment_id = mention;

  SELECT array_agg(recipient_address || ':' || type ORDER BY recipient_address) INTO recipients
  FROM public.custom_notifications WHERE type IN ('feature_request_like', 'feature_request_comment_like');
  IF recipients IS DISTINCT FROM ARRAY['author:feature_request_like', 'nested-author:feature_request_comment_like'] THEN
    RAISE EXCEPTION 'Dislike-to-like switches should notify other authors once and retries should do nothing';
  END IF;

  INSERT INTO public.feature_request_votes VALUES (req, 'new-voter', 1);
  INSERT INTO public.feature_request_comment_reactions VALUES (mention, 'new-voter', 'like');
  DELETE FROM public.feature_request_comment_reactions WHERE comment_id = mention AND wallet_address = 'new-voter';
  INSERT INTO public.feature_request_comment_reactions VALUES (mention, 'new-voter', 'like');
  IF (SELECT count(*) FROM public.custom_notifications WHERE actor_address = 'new-voter' AND type = 'feature_request_like') <> 1
     OR (SELECT count(*) FROM public.custom_notifications WHERE actor_address = 'new-voter' AND type = 'feature_request_comment_like') <> 1 THEN
    RAISE EXCEPTION 'New likes should still notify and reinserting a comment like should stay deduplicated';
  END IF;
END;
$$;

ROLLBACK;
