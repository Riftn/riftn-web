CREATE OR REPLACE FUNCTION public.notify_feature_request_vote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.vote_type IS DISTINCT FROM 1 THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.vote_type IS NOT DISTINCT FROM NEW.vote_type THEN RETURN NEW; END IF;

  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, actor_username, type, content, reference_id, reference_title
  )
  SELECT fr.author_wallet_address, NEW.wallet_address, NULL, 'feature_request_like', '', fr.id::text, fr.title
  FROM public.feature_requests fr
  WHERE fr.id = NEW.feature_request_id
    AND lower(fr.author_wallet_address) <> lower(NEW.wallet_address);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_feature_request_vote_notify ON public.feature_request_votes;
CREATE TRIGGER on_feature_request_vote_notify
  AFTER INSERT OR UPDATE OF vote_type ON public.feature_request_votes
  FOR EACH ROW EXECUTE FUNCTION public.notify_feature_request_vote();

CREATE OR REPLACE FUNCTION public.notify_feature_request_comment_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.reaction = 'dislike' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.reaction IS DISTINCT FROM 'dislike' THEN RETURN NEW; END IF;

  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content, reference_id, reference_title, reference_comment_id
  )
  SELECT lower(c.wallet_address), lower(NEW.wallet_address), 'feature_request_comment_like',
         LEFT(c.content, 100), fr.id::text, fr.title, c.id::text
  FROM public.feature_request_comments c
  JOIN public.feature_requests fr ON fr.id = c.feature_request_id
  WHERE c.id = NEW.comment_id
    AND lower(c.wallet_address) <> lower(NEW.wallet_address)
    AND (TG_OP = 'UPDATE' OR NOT EXISTS (
      SELECT 1 FROM public.custom_notifications n
      WHERE n.type = 'feature_request_comment_like'
        AND n.reference_comment_id = c.id::text
        AND lower(n.actor_address) = lower(NEW.wallet_address)
    ));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_feature_request_comment_like ON public.feature_request_comment_reactions;
CREATE TRIGGER on_feature_request_comment_like
  AFTER INSERT OR UPDATE OF reaction ON public.feature_request_comment_reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_feature_request_comment_like();
