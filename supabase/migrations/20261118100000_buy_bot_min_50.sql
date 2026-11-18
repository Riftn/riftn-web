-- Buy bot: the smallest buy a group can post is $50. Admins pick any size from
-- $50 up; anything lower that was saved or sent reads as $50.
CREATE OR REPLACE FUNCTION public.community_buy_bot_resolve(_raw jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r jsonb := coalesce(_raw, '{}'::jsonb);
BEGIN
  RETURN jsonb_build_object(
    'enabled', coalesce((r ->> 'enabled')::boolean, true),
    'min_usd', least(greatest(coalesce((r ->> 'min_usd')::numeric, 50), 50), 1000000)
  );
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('enabled', true, 'min_usd', 50);
END;
$$;

UPDATE public.community_bot_settings
   SET buy_bot = public.community_buy_bot_resolve(buy_bot)
 WHERE coalesce((buy_bot ->> 'min_usd')::numeric, 50) < 50;
