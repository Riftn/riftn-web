\set ON_ERROR_STOP on
CREATE FUNCTION public.get_signed_request_wallet_address() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('test.wallet', true),'') $$;
CREATE TABLE public.custom_notifications(id uuid DEFAULT gen_random_uuid(), recipient_address text,actor_address text,actor_username text,actor_avatar text,type text,content text,reference_id text,reference_title text,reference_comment_id text);
\ir ../../supabase/migrations/20261119100000_creator_gallery_social.sql
INSERT INTO creator_public_posters(id,image_url,owner_wallet) VALUES
('10000000-0000-0000-0000-000000000001','https://example.com/storage/v1/object/public/creator-public-posters/a.png','owner'),
('10000000-0000-0000-0000-000000000002','https://example.com/storage/v1/object/public/creator-public-posters/b.png','other');
DO $$ BEGIN
  PERFORM creator_gallery_write('10000000-0000-0000-0000-000000000001','react','{"reaction":"like"}');
  RAISE EXCEPTION 'unsigned write accepted';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SET ROLE anon;
SELECT set_config('test.wallet','viewer',false);
SELECT creator_gallery_write('10000000-0000-0000-0000-000000000001','react','{"reaction":"like"}');
SELECT creator_gallery_write('10000000-0000-0000-0000-000000000001','react','{"reaction":"love"}');
SELECT creator_gallery_write('10000000-0000-0000-0000-000000000001','comment','{"content":"First comment"}') AS first_comment \gset
SELECT creator_gallery_write('10000000-0000-0000-0000-000000000001','save','{"saved":true}');
DO $$ BEGIN
  IF (creator_gallery_read('10000000-0000-0000-0000-000000000001')->0->>'likes')::int<>1 THEN RAISE EXCEPTION 'duplicate reaction'; END IF;
  IF creator_gallery_read('10000000-0000-0000-0000-000000000001')->0->>'my_reaction'<>'love' THEN RAISE EXCEPTION 'viewer reaction missing'; END IF;
  IF NOT (creator_gallery_read('10000000-0000-0000-0000-000000000001')->0->>'saved')::boolean THEN RAISE EXCEPTION 'save missing'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM custom_notifications WHERE type='generation_like')<>1 THEN RAISE EXCEPTION 'duplicate notification'; END IF;
  IF (SELECT count(*) FROM custom_notifications WHERE type='generation_comment' AND recipient_address='owner')<>1 THEN RAISE EXCEPTION 'owner not notified'; END IF;
END $$;
SELECT set_config('test.wallet','second',false);
SET ROLE anon;
SELECT creator_gallery_write('10000000-0000-0000-0000-000000000001','comment',jsonb_build_object('content','Reply','parent_id',(:'first_comment'::jsonb)->>'id'));
DO $$ DECLARE target uuid; BEGIN
  target := (creator_gallery_discussion('10000000-0000-0000-0000-000000000001')->'comments'->0->>'id')::uuid;
  BEGIN
    PERFORM creator_gallery_write('10000000-0000-0000-0000-000000000001','edit',jsonb_build_object('comment_id',target,'content','stolen'));
    RAISE EXCEPTION 'foreign edit accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM creator_gallery_write('10000000-0000-0000-0000-000000000002','comment',jsonb_build_object('parent_id',target,'content','cross generation'));
    RAISE EXCEPTION 'foreign parent accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    PERFORM creator_gallery_write('10000000-0000-0000-0000-000000000001','react','{"reaction":"invented"}');
    RAISE EXCEPTION 'invalid reaction accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF (creator_gallery_read('10000000-0000-0000-0000-000000000001')->0->>'saved')::boolean THEN RAISE EXCEPTION 'save leaked to another viewer'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM custom_notifications WHERE type='generation_reply' AND recipient_address='viewer')<>1 THEN RAISE EXCEPTION 'reply not notified'; END IF;
END $$;
