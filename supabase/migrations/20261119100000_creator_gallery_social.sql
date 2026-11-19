-- Public generations have their own discussion identity. Private libraries stay private.
ALTER TABLE public.creator_public_posters
  ADD COLUMN owner_wallet text,
  ADD COLUMN title text NOT NULL DEFAULT '',
  ADD COLUMN width integer CHECK (width > 0 AND width <= 65536),
  ADD COLUMN height integer CHECK (height > 0 AND height <= 65536);

CREATE TABLE public.creator_gallery_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES public.creator_public_posters(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  username text,
  avatar text,
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 4000),
  parent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (id, generation_id),
  FOREIGN KEY (parent_id, generation_id) REFERENCES public.creator_gallery_comments(id, generation_id)
);
CREATE INDEX creator_gallery_comments_thread ON public.creator_gallery_comments(generation_id, created_at, id);
CREATE TABLE public.creator_gallery_reactions (
  generation_id uuid NOT NULL REFERENCES public.creator_public_posters(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('like','love','respect','hot','hundred','lol','sad','cry','poo','dislike')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(generation_id, wallet_address)
);
CREATE TABLE public.creator_gallery_comment_reactions (
  comment_id uuid NOT NULL REFERENCES public.creator_gallery_comments(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('like','love','respect','hot','hundred','lol','sad','cry','poo','dislike')),
  PRIMARY KEY(comment_id, wallet_address)
);
CREATE TABLE public.creator_gallery_saves (
  generation_id uuid NOT NULL REFERENCES public.creator_public_posters(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  PRIMARY KEY(generation_id, wallet_address)
);
ALTER TABLE public.creator_gallery_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_gallery_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_gallery_comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_gallery_saves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_gallery_comments, public.creator_gallery_reactions, public.creator_gallery_comment_reactions, public.creator_gallery_saves FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.creator_gallery_comments, public.creator_gallery_reactions, public.creator_gallery_comment_reactions, public.creator_gallery_saves TO service_role;

CREATE FUNCTION public.creator_gallery_read(p_id uuid DEFAULT NULL, p_offset integer DEFAULT 0, p_limit integer DEFAULT 40)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE viewer text := public.get_signed_request_wallet_address(); result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO result FROM (
    SELECT p.id, p.image_url, NULL::text AS video_url, p.created_at, p.owner_wallet, p.title, p.width, p.height,
      (SELECT count(*) FROM creator_gallery_reactions r WHERE r.generation_id=p.id AND r.reaction<>'dislike') AS likes,
      (SELECT count(*) FROM creator_gallery_reactions r WHERE r.generation_id=p.id AND r.reaction='dislike') AS dislikes,
      (SELECT count(*) FROM creator_gallery_comments c WHERE c.generation_id=p.id) AS comments,
      (SELECT r.reaction FROM creator_gallery_reactions r WHERE r.generation_id=p.id AND r.wallet_address=viewer) AS my_reaction,
      EXISTS(SELECT 1 FROM creator_gallery_saves s WHERE s.generation_id=p.id AND s.wallet_address=viewer) AS saved
    FROM creator_public_posters p WHERE p_id IS NULL OR p.id=p_id
    ORDER BY p.created_at DESC, p.id
    LIMIT least(greatest(p_limit,1),100) OFFSET greatest(p_offset,0)
  ) g;
  RETURN result;
END $$;

CREATE FUNCTION public.creator_gallery_discussion(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'comments', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at,c.id) FROM creator_gallery_comments c WHERE c.generation_id=p_id),'[]'::jsonb),
    'reactions', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM creator_gallery_comment_reactions r JOIN creator_gallery_comments c ON c.id=r.comment_id WHERE c.generation_id=p_id),'[]'::jsonb)
  );
$$;

CREATE FUNCTION public.creator_gallery_write(p_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  viewer text := public.get_signed_request_wallet_address();
  owner text; generation_title text; target uuid; parent uuid; recipient text; changed integer;
  body text := btrim(coalesce(p_data->>'content','')); reaction text := p_data->>'reaction';
  name text := left(p_data->>'username',100); avatar_path text := left(p_data->>'avatar',1000);
BEGIN
  IF coalesce(viewer,'')='' THEN RAISE EXCEPTION 'Sign in to continue' USING ERRCODE='42501'; END IF;
  SELECT owner_wallet,title INTO owner,generation_title FROM creator_public_posters WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Generation not found'; END IF;
  -- Serialise one viewer's mutations, including the comment rate limit.
  PERFORM pg_advisory_xact_lock(hashtextextended('creator-gallery:'||viewer,0));
  IF p_action='react' THEN
    IF reaction IS NULL THEN
      DELETE FROM creator_gallery_reactions WHERE generation_id=p_id AND wallet_address=viewer;
    ELSE
      INSERT INTO creator_gallery_reactions(generation_id,wallet_address,reaction) VALUES(p_id,viewer,reaction)
      ON CONFLICT(generation_id,wallet_address) DO UPDATE SET reaction=excluded.reaction;
      IF owner IS NOT NULL AND owner<>viewer AND NOT EXISTS(
        SELECT 1 FROM custom_notifications WHERE type='generation_like' AND actor_address=viewer AND reference_id=p_id::text
      ) THEN
        INSERT INTO custom_notifications(recipient_address,actor_address,actor_username,actor_avatar,type,content,reference_id,reference_title)
        VALUES(owner,viewer,name,avatar_path,'generation_like','Reacted to your generation',p_id::text,generation_title);
      END IF;
    END IF;
  ELSIF p_action='save' THEN
    IF coalesce((p_data->>'saved')::boolean,false) THEN
      INSERT INTO creator_gallery_saves VALUES(p_id,viewer) ON CONFLICT DO NOTHING;
    ELSE DELETE FROM creator_gallery_saves WHERE generation_id=p_id AND wallet_address=viewer; END IF;
  ELSIF p_action='comment' THEN
    IF (SELECT count(*) FROM creator_gallery_comments WHERE wallet_address=viewer AND created_at>now()-interval '1 minute')>=10 THEN
      RAISE EXCEPTION 'Please wait before commenting again';
    END IF;
    parent := (p_data->>'parent_id')::uuid;
    INSERT INTO creator_gallery_comments(generation_id,wallet_address,username,avatar,content,parent_id)
    VALUES(p_id,viewer,name,avatar_path,body,parent) RETURNING id INTO target;
    IF owner IS NOT NULL AND owner<>viewer THEN
      INSERT INTO custom_notifications(recipient_address,actor_address,actor_username,actor_avatar,type,content,reference_id,reference_title,reference_comment_id)
      VALUES(owner,viewer,name,avatar_path,'generation_comment',left(body,100),p_id::text,generation_title,target::text);
    END IF;
    SELECT wallet_address INTO recipient FROM creator_gallery_comments WHERE id=parent AND generation_id=p_id;
    IF recipient IS NOT NULL AND recipient<>viewer AND recipient IS DISTINCT FROM owner THEN
      INSERT INTO custom_notifications(recipient_address,actor_address,actor_username,actor_avatar,type,content,reference_id,reference_title,reference_comment_id)
      VALUES(recipient,viewer,name,avatar_path,'generation_reply',left(body,100),p_id::text,generation_title,target::text);
    END IF;
  ELSIF p_action IN ('edit','delete','comment_react') THEN
    target := (p_data->>'comment_id')::uuid;
    SELECT wallet_address INTO recipient FROM creator_gallery_comments WHERE id=target AND generation_id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Comment not found'; END IF;
    IF p_action IN ('edit','delete') AND recipient<>viewer THEN RAISE EXCEPTION 'Not your comment' USING ERRCODE='42501'; END IF;
    IF p_action='edit' THEN UPDATE creator_gallery_comments SET content=body,updated_at=now() WHERE id=target;
    ELSIF p_action='delete' THEN
      -- Preserve other people's replies when the author removes their text.
      UPDATE creator_gallery_comments SET content='[deleted]',username=NULL,avatar=NULL,updated_at=now() WHERE id=target;
    ELSIF reaction IS NULL THEN DELETE FROM creator_gallery_comment_reactions WHERE comment_id=target AND wallet_address=viewer;
    ELSE
      INSERT INTO creator_gallery_comment_reactions VALUES(target,viewer,reaction)
      ON CONFLICT(comment_id,wallet_address) DO UPDATE SET reaction=excluded.reaction;
      IF recipient<>viewer AND NOT EXISTS(SELECT 1 FROM custom_notifications WHERE type='generation_comment_like' AND actor_address=viewer AND reference_comment_id=target::text) THEN
        INSERT INTO custom_notifications(recipient_address,actor_address,actor_username,actor_avatar,type,content,reference_id,reference_title,reference_comment_id)
        VALUES(recipient,viewer,name,avatar_path,'generation_comment_like','Reacted to your comment',p_id::text,generation_title,target::text);
      END IF;
    END IF;
  ELSE RAISE EXCEPTION 'Unknown gallery action'; END IF;
  RETURN jsonb_build_object('id',target);
END $$;
REVOKE ALL ON FUNCTION public.creator_gallery_read(uuid,integer,integer), public.creator_gallery_discussion(uuid), public.creator_gallery_write(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creator_gallery_read(uuid,integer,integer), public.creator_gallery_discussion(uuid), public.creator_gallery_write(uuid,text,jsonb) TO anon, authenticated, service_role;

-- The twenty published banner originals retain their measured dimensions.
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Tidal Relic', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/01-tidal-relic.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Pressure Cast', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/02-pressure-cast.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Salt Monument', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/03-salt-monument.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Night Current', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/04-night-current.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Soft Impact', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/05-soft-impact.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Glacial Core', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/06-glacial-core.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Afterburn', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/07-afterburn.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Living Ruin', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/08-living-ruin.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Paper Gravity', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/09-paper-gravity.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Orbital Foundry', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/10-orbital-foundry.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Mercury Tide', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/01-mercury-tide.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Glass Vault', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/02-glass-vault.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Terminal Stone', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/03-terminal-stone.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Chrome Drape', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/04-chrome-drape.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Rain Window', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/05-rain-window.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Ascii Alloy', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/06-ascii-alloy.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Black Ice', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/07-black-ice.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Silver Fossil', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/08-silver-fossil.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Digital Fog', width=2172, height=724 WHERE id=md5('riftn-banner-20261118/09-digital-fog.png')::uuid;
UPDATE public.creator_public_posters SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64', title='Liquid Marble', width=2170, height=725 WHERE id=md5('riftn-banner-20261118/10-liquid-marble.png')::uuid;
