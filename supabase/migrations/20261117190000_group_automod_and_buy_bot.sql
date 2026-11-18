-- Group auto-mod and per-token buy bot
-- ====================================
-- 1. Settings: one private row per community (`community_bot_settings`), read
--    and written only through two RPCs that need an owner or admin. Kept off the
--    public `communities` row so spammers cannot read a group's banned words.
-- 2. Auto-mod: a BEFORE INSERT/UPDATE trigger on community_chat_messages that
--    runs next to community_chat_guard (it does not replace it). Checks banned
--    words, links, floods and repeats for ordinary members, on new lines and on
--    edits. It also stops members posting lines typed as bot output
--    (buy_alert / admin_response / system), which used to be open to anyone.
-- 3. Buy bot: every group with a linked token on a supported EVM chain gets buy
--    alerts. Runs fully inside the database: pg_cron ticks every minute, pg_net
--    asks the chain's public RPC for Transfer logs out of the pair and
--    DexScreener for the price, and the next tick turns the answers into
--    alerts. Blocks are never skipped (a feed that falls behind catches up in
--    2,000-block steps) and a unique index makes a repeated tx a no-op.

-- ─── 1. Settings ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_bot_settings (
  community_id uuid PRIMARY KEY REFERENCES public.communities(id) ON DELETE CASCADE,
  automod      jsonb NOT NULL DEFAULT '{}'::jsonb,
  buy_bot      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   text
);
ALTER TABLE public.community_bot_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_bot_settings FROM anon, authenticated;

-- Defaults filled in and every value clamped, so the trigger never has to
-- trust what was stored.
CREATE OR REPLACE FUNCTION public.community_automod_resolve(_raw jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r     jsonb := coalesce(_raw, '{}'::jsonb);
  words text[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT w ORDER BY w), '{}')
    INTO words
    FROM (
      SELECT left(btrim(lower(x)), 60) AS w
        FROM jsonb_array_elements_text(
               CASE WHEN jsonb_typeof(r -> 'banned_words') = 'array' THEN r -> 'banned_words' ELSE '[]'::jsonb END
             ) AS x
       LIMIT 500
    ) s
   WHERE w <> '';

  RETURN jsonb_build_object(
    'enabled',        coalesce((r ->> 'enabled')::boolean, false),
    'banned_words',   to_jsonb(words),
    'block_links',    coalesce((r ->> 'block_links')::boolean, false),
    'flood_enabled',  coalesce((r ->> 'flood_enabled')::boolean, true),
    'flood_max',      least(greatest(coalesce((r ->> 'flood_max')::int, 5), 2), 50),
    'flood_seconds',  least(greatest(coalesce((r ->> 'flood_seconds')::int, 10), 5), 600),
    'block_repeats',  coalesce((r ->> 'block_repeats')::boolean, true)
  );
EXCEPTION WHEN others THEN
  RETURN public.community_automod_resolve('{}'::jsonb);
END;
$$;

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
    'min_usd', least(greatest(coalesce((r ->> 'min_usd')::numeric, 50), 0), 1000000)
  );
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('enabled', true, 'min_usd', 50);
END;
$$;

-- Owners and admins only. Returns resolved settings plus whether the linked
-- token can be watched, so the settings screen can say why it is not.
CREATE OR REPLACE FUNCTION public.community_get_bot_settings(_community_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w text;
  s public.community_bot_settings%ROWTYPE;
  c public.communities%ROWTYPE;
BEGIN
  w := public.get_request_wallet_address();
  IF coalesce(public.community_role_of(_community_id, w), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'permission_denied:bot_settings' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.community_bot_settings WHERE community_id = _community_id;
  SELECT * INTO c FROM public.communities WHERE id = _community_id;
  RETURN jsonb_build_object(
    'automod', public.community_automod_resolve(s.automod),
    'buy_bot', public.community_buy_bot_resolve(s.buy_bot),
    'token', jsonb_build_object(
      'symbol',    c.ticker_symbol,
      'chain_id',  c.ticker_chain_id,
      'address',   c.ticker_contract_address,
      'pair',      c.ticker_pair_address,
      'supported', public.community_buy_bot_rpc(c.ticker_chain_id) IS NOT NULL
                   AND coalesce(c.ticker_pair_address, '') ~* '^0x[0-9a-f]{40}$'
                   AND coalesce(c.ticker_contract_address, '') ~* '^0x[0-9a-f]{40}$'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.community_update_bot_settings(_community_id uuid, _patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w   text;
  cur public.community_bot_settings%ROWTYPE;
BEGIN
  w := public.get_request_wallet_address();
  IF coalesce(public.community_role_of(_community_id, w), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'permission_denied:bot_settings' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO cur FROM public.community_bot_settings WHERE community_id = _community_id;

  INSERT INTO public.community_bot_settings AS t (community_id, automod, buy_bot, updated_at, updated_by)
  VALUES (
    _community_id,
    public.community_automod_resolve(coalesce(cur.automod, '{}'::jsonb) || coalesce(_patch -> 'automod', '{}'::jsonb)),
    public.community_buy_bot_resolve(coalesce(cur.buy_bot, '{}'::jsonb) || coalesce(_patch -> 'buy_bot', '{}'::jsonb)),
    now(), lower(w)
  )
  ON CONFLICT (community_id) DO UPDATE
    SET automod = EXCLUDED.automod, buy_bot = EXCLUDED.buy_bot,
        updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

  -- The log keeps which switches moved, never the word list itself.
  PERFORM public.community_log(_community_id, w, 'update_bot_settings', NULL, NULL,
    jsonb_strip_nulls(jsonb_build_object(
      'automod', CASE WHEN _patch ? 'automod' THEN (_patch -> 'automod') - 'banned_words' END,
      'banned_words_changed', CASE WHEN coalesce(_patch -> 'automod', '{}'::jsonb) ? 'banned_words' THEN true END,
      'buy_bot', _patch -> 'buy_bot'
    )));

  RETURN public.community_get_bot_settings(_community_id);
END;
$$;

REVOKE ALL ON FUNCTION public.community_get_bot_settings(uuid) FROM public;
REVOKE ALL ON FUNCTION public.community_update_bot_settings(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.community_get_bot_settings(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_update_bot_settings(uuid, jsonb) TO anon, authenticated;

-- ─── 2. Auto-mod ─────────────────────────────────────────────────────────────

-- Lowercased words with any run of single letters glued back together, so
-- "s.c.a.m", "s c a m" and "S-C-A-M" all read as "scam". Padded with spaces so
-- a whole-word test is a plain position() check.
CREATE OR REPLACE FUNCTION public.community_automod_words(_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  tok    text;
  buf    text := '';
  out    text[] := '{}';
BEGIN
  FOREACH tok IN ARRAY regexp_split_to_array(lower(coalesce(_text, '')), '[^[:alnum:]]+') LOOP
    CONTINUE WHEN tok = '';
    IF char_length(tok) = 1 THEN
      buf := buf || tok;
    ELSE
      IF buf <> '' THEN out := out || buf; buf := ''; END IF;
      out := out || tok;
    END IF;
  END LOOP;
  IF buf <> '' THEN out := out || buf; END IF;
  RETURN ' ' || array_to_string(out, ' ') || ' ';
END;
$$;

-- Only the glued runs of single letters, e.g. "a s.c.a.m" -> " ascam ". A
-- banned word inside one of these was spelled out letter by letter.
CREATE OR REPLACE FUNCTION public.community_automod_runs(_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  tok text;
  buf text := '';
  out text := ' ';
BEGIN
  FOREACH tok IN ARRAY regexp_split_to_array(lower(coalesce(_text, '')), '[^[:alnum:]]+') LOOP
    CONTINUE WHEN tok = '';
    IF char_length(tok) = 1 THEN
      buf := buf || tok;
    ELSE
      IF char_length(buf) > 1 THEN out := out || buf || ' '; END IF;
      buf := '';
    END IF;
  END LOOP;
  IF char_length(buf) > 1 THEN out := out || buf || ' '; END IF;
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_automod_banned(_text text, _words jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  hay   text := public.community_automod_words(_text);
  plain text := ' ' || array_to_string(regexp_split_to_array(lower(coalesce(_text, '')), '[^[:alnum:]]+'), ' ') || ' ';
  runs  text := public.community_automod_runs(_text);
  w     text;
  needle text;
BEGIN
  FOR w IN SELECT jsonb_array_elements_text(coalesce(_words, '[]'::jsonb)) LOOP
    needle := btrim(public.community_automod_words(w));
    CONTINUE WHEN needle = '';
    IF position(' ' || needle || ' ' IN hay) > 0
       OR position(' ' || needle || ' ' IN plain) > 0
       OR (char_length(needle) >= 3 AND position(' ' IN needle) = 0 AND position(needle IN runs) > 0) THEN
      RETURN w;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- Off-site links. Riftn's own domains stay allowed.
CREATE OR REPLACE FUNCTION public.community_automod_has_link(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
           lower(coalesce(_text, '')),
           '(https?://)?(www\.)?([a-z0-9-]+\.)*(riftn\.com|dehub\.io|dehub\.net)(/[^[:space:]]*)?',
           ' ', 'g'
         ) ~ '(https?://|www\.|\mt\.me/|\mdiscord\.(gg|com)/|\m[a-z0-9-]{2,}\.(com|io|xyz|net|org|gg|app|me|co|link|ly|ru|cc|to|finance|money|fun|site|online|live|tv|club|vip|pro|top|info|biz|ai)\M)';
$$;

CREATE OR REPLACE FUNCTION public.community_chat_automod()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w      text;
  rnk    text;
  cfg    jsonb;
  hit    text;
  recent integer;
  norm   text;
BEGIN
  -- The bots and the moderation RPCs write here as the service role or with
  -- the privileged flag; they are not members and are not filtered.
  IF public.community_privileged()
     OR coalesce(current_setting('role', true), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.message_type IN ('buy_alert', 'admin_response', 'system') THEN
    RAISE EXCEPTION 'message_type_reserved' USING ERRCODE = '42501';
  END IF;

  -- Only the author's own text changes are filtered on UPDATE (reactions,
  -- pins and the rest never touch content).
  IF TG_OP = 'UPDATE' AND NEW.content IS NOT DISTINCT FROM OLD.content THEN
    RETURN NEW;
  END IF;

  w := lower(coalesce(public.get_request_wallet_address(), ''));
  rnk := coalesce(public.community_role_of(NEW.community_id, w), 'member');
  IF rnk IN ('owner', 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT public.community_automod_resolve(automod) INTO cfg
    FROM public.community_bot_settings WHERE community_id = NEW.community_id;
  IF cfg IS NULL OR (cfg ->> 'enabled')::boolean IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  hit := public.community_automod_banned(NEW.content, cfg -> 'banned_words');
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'automod_banned_word' USING ERRCODE = '42501';
  END IF;

  IF (cfg ->> 'block_links')::boolean AND public.community_automod_has_link(NEW.content) THEN
    RAISE EXCEPTION 'automod_links' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF (cfg ->> 'flood_enabled')::boolean THEN
      SELECT count(*) INTO recent
        FROM public.community_chat_messages
       WHERE community_id = NEW.community_id
         AND wallet_address = w
         AND created_at > now() - make_interval(secs => (cfg ->> 'flood_seconds')::int);
      IF recent >= (cfg ->> 'flood_max')::int THEN
        RAISE EXCEPTION 'automod_flood:%', (cfg ->> 'flood_seconds')::int USING ERRCODE = '53400';
      END IF;
    END IF;

    norm := btrim(public.community_automod_words(NEW.content));
    IF (cfg ->> 'block_repeats')::boolean AND char_length(norm) >= 3 AND EXISTS (
      SELECT 1 FROM (
        SELECT content FROM public.community_chat_messages
         WHERE community_id = NEW.community_id
           AND wallet_address = w
           AND created_at > now() - interval '10 minutes'
         ORDER BY created_at DESC
         LIMIT 3
      ) last3
      WHERE btrim(public.community_automod_words(last3.content)) = norm
    ) THEN
      RAISE EXCEPTION 'automod_repeat' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_chat_automod_trigger ON public.community_chat_messages;
CREATE TRIGGER community_chat_automod_trigger
  BEFORE INSERT OR UPDATE ON public.community_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.community_chat_automod();

-- The holder gate checked every sender, bots included, so buy alerts and AI
-- Admin replies could never land in a holder-only group. Same rule, with the
-- service role and the privileged flag let through like community_chat_guard.
CREATE OR REPLACE FUNCTION public.community_holder_chat_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate TEXT;
  role TEXT;
BEGIN
  IF public.community_privileged()
     OR coalesce(current_setting('role', true), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  SELECT holder_gate_token INTO gate FROM public.communities WHERE id = NEW.community_id;
  IF gate IS NULL THEN
    RETURN NEW;
  END IF;
  role := public.community_role_of(NEW.community_id, NEW.wallet_address);
  IF role IN ('owner', 'admin') THEN
    RETURN NEW;
  END IF;
  IF NOT public.community_holder_ok(NEW.community_id, NEW.wallet_address, NULL) THEN
    RAISE EXCEPTION 'holder_gate_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 3. Buy bot ──────────────────────────────────────────────────────────────

-- DexScreener chain id -> public RPC. NULL = not watched (Solana, unknown).
CREATE OR REPLACE FUNCTION public.community_buy_bot_rpc(_chain text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(_chain, ''))
    WHEN 'base'      THEN 'https://base-rpc.publicnode.com'
    WHEN 'ethereum'  THEN 'https://ethereum-rpc.publicnode.com'
    WHEN 'bsc'       THEN 'https://bsc-rpc.publicnode.com'
    WHEN 'arbitrum'  THEN 'https://arbitrum-one-rpc.publicnode.com'
    WHEN 'polygon'   THEN 'https://polygon-bor-rpc.publicnode.com'
    WHEN 'optimism'  THEN 'https://optimism-rpc.publicnode.com'
    WHEN 'avalanche' THEN 'https://avalanche-c-chain-rpc.publicnode.com'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.community_hex_to_numeric(_hex text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  h   text := lower(regexp_replace(coalesce(_hex, ''), '^0x', ''));
  n   numeric := 0;
  i   integer;
BEGIN
  IF h = '' OR h !~ '^[0-9a-f]+$' THEN RETURN 0; END IF;
  FOR i IN 1..char_length(h) LOOP
    n := n * 16 + position(substr(h, i, 1) IN '0123456789abcdef') - 1;
  END LOOP;
  RETURN n;
END;
$$;

-- One row per watched pair; any number of groups can share it.
CREATE TABLE IF NOT EXISTS public.community_buy_bot_feeds (
  feed          text PRIMARY KEY,              -- chain:pair
  chain_id      text NOT NULL,
  token_address text NOT NULL,
  pair_address  text NOT NULL,
  symbol        text,
  decimals      integer,
  last_block    bigint NOT NULL DEFAULT 0,
  head_block    bigint NOT NULL DEFAULT 0,
  price_usd     numeric,
  market_cap    numeric,
  price_at      timestamptz,
  rpc_request   bigint,
  rpc_sent_at   timestamptz,
  rpc_to_block  bigint,
  price_request bigint,
  last_error    text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.community_buy_bot_feeds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_buy_bot_feeds FROM anon, authenticated;

-- A repeated tx for the same group is a no-op, however the tick overlaps.
CREATE UNIQUE INDEX IF NOT EXISTS community_chat_buy_alert_once
  ON public.community_chat_messages (community_id, ((content::jsonb) ->> 'txHash'))
  WHERE message_type = 'buy_alert';

CREATE OR REPLACE FUNCTION public.community_buy_bot_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  TRANSFER constant text := '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  STEP     constant bigint := 2000;
  f        public.community_buy_bot_feeds%ROWTYPE;
  resp     record;
  body     jsonb;
  item     jsonb;
  logs     jsonb;
  head     bigint;
  maxlog   bigint;
  pair     jsonb;
  buys     record;
  grp      record;
  amount   numeric;
  usd      numeric;
  payload  jsonb;
  posted   integer := 0;
  to_block bigint;
  to_hex   text;
  reqs     jsonb;
  rpc      text;
BEGIN
  PERFORM set_config('dehub.community_privileged', '1', true);

  -- a) Sync feeds with the groups that have a watchable token linked.
  INSERT INTO public.community_buy_bot_feeds (feed, chain_id, token_address, pair_address, symbol)
  SELECT DISTINCT ON (lower(c.ticker_chain_id) || ':' || lower(c.ticker_pair_address))
         lower(c.ticker_chain_id) || ':' || lower(c.ticker_pair_address),
         lower(c.ticker_chain_id), lower(c.ticker_contract_address), lower(c.ticker_pair_address),
         c.ticker_symbol
    FROM public.communities c
   WHERE public.community_buy_bot_rpc(c.ticker_chain_id) IS NOT NULL
     AND c.ticker_pair_address ~* '^0x[0-9a-f]{40}$'
     AND c.ticker_contract_address ~* '^0x[0-9a-f]{40}$'
  ON CONFLICT (feed) DO NOTHING;

  DELETE FROM public.community_buy_bot_feeds f0
   WHERE NOT EXISTS (
     SELECT 1 FROM public.communities c
      WHERE lower(c.ticker_chain_id) = f0.chain_id
        AND lower(c.ticker_pair_address) = f0.pair_address
        AND lower(c.ticker_contract_address) = f0.token_address);

  FOR f IN SELECT * FROM public.community_buy_bot_feeds LOOP
    -- b) Price answer from the previous tick.
    IF f.price_request IS NOT NULL THEN
      SELECT * INTO resp FROM net._http_response WHERE id = f.price_request;
      IF FOUND THEN
        BEGIN
          pair := (resp.content::jsonb) -> 'pairs' -> 0;
          IF pair IS NULL THEN pair := (resp.content::jsonb) -> 'pair'; END IF;
          IF pair IS NOT NULL AND lower(pair -> 'baseToken' ->> 'address') = f.token_address THEN
            f.price_usd  := nullif(pair ->> 'priceUsd', '')::numeric;
            f.market_cap := coalesce(nullif(pair ->> 'marketCap', '')::numeric, nullif(pair ->> 'fdv', '')::numeric);
            f.symbol     := coalesce(pair -> 'baseToken' ->> 'symbol', f.symbol);
            f.price_at   := now();
          END IF;
        EXCEPTION WHEN others THEN
          f.last_error := 'price: ' || SQLERRM;
        END;
        f.price_request := NULL;
      ELSIF f.rpc_sent_at < now() - interval '3 minutes' THEN
        f.price_request := NULL;
      END IF;
    END IF;

    -- c) Chain answer from the previous tick.
    IF f.rpc_request IS NOT NULL THEN
      SELECT * INTO resp FROM net._http_response WHERE id = f.rpc_request;
      IF FOUND THEN
        BEGIN
          body := resp.content::jsonb;
          head := NULL; logs := NULL;
          FOR item IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(body) = 'array' THEN body ELSE jsonb_build_array(body) END) LOOP
            IF item ->> 'id' = '1' AND item ? 'result' THEN head := public.community_hex_to_numeric(item ->> 'result')::bigint; END IF;
            IF item ->> 'id' = '2' THEN
              IF item ? 'error' THEN f.last_error := 'logs: ' || left(item ->> 'error', 300); END IF;
              logs := item -> 'result';
            END IF;
            IF item ->> 'id' = '3' AND item ? 'result' THEN
              f.decimals := least(public.community_hex_to_numeric(item ->> 'result'), 36)::int;
            END IF;
          END LOOP;

          IF head IS NOT NULL THEN f.head_block := greatest(f.head_block, head); END IF;

          IF f.last_block = 0 THEN
            -- New feed: start from now, no backfill of old buys.
            IF head IS NOT NULL THEN f.last_block := head; END IF;
          ELSIF jsonb_typeof(logs) = 'array' AND f.decimals IS NOT NULL AND f.price_usd IS NOT NULL THEN
            maxlog := f.last_block;
            FOR buys IN
              SELECT l ->> 'transactionHash' AS tx,
                     max(public.community_hex_to_numeric(l ->> 'blockNumber'))::bigint AS blk,
                     (array_agg('0x' || right(l -> 'topics' ->> 2, 40)))[1] AS buyer,
                     sum(public.community_hex_to_numeric(l ->> 'data')) AS raw
                FROM jsonb_array_elements(logs) l
               WHERE lower(l -> 'topics' ->> 0) = TRANSFER
                 AND coalesce((l ->> 'removed')::boolean, false) = false
               GROUP BY l ->> 'transactionHash'
            LOOP
              maxlog := greatest(maxlog, buys.blk);
              CONTINUE WHEN buys.tx IS NULL;
              amount := buys.raw / power(10::numeric, f.decimals);
              usd := amount * f.price_usd;
              payload := jsonb_build_object(
                'symbol', f.symbol, 'chainId', f.chain_id, 'tokenAddress', f.token_address,
                'amount', round(amount, 6), 'usd', round(usd, 2),
                'buyerAddress', lower(buys.buyer),
                'shortBuyer', left(buys.buyer, 6) || '...' || right(buys.buyer, 4),
                'txHash', lower(buys.tx), 'blockNumber', buys.blk,
                'priceUsd', f.price_usd, 'marketCapUsd', f.market_cap,
                -- Older app builds read these names.
                'dhbAmount', round(amount, 6), 'dhbUsd', round(usd, 2),
                'ethSpent', 0, 'ethUsd', 0, 'newBalance', 0, 'balanceChangePct', 0);

              FOR grp IN
                SELECT c.id
                  FROM public.communities c
                  LEFT JOIN public.community_bot_settings s ON s.community_id = c.id
                 WHERE lower(c.ticker_chain_id) = f.chain_id
                   AND lower(c.ticker_pair_address) = f.pair_address
                   AND lower(c.ticker_contract_address) = f.token_address
                   AND (public.community_buy_bot_resolve(s.buy_bot) ->> 'enabled')::boolean
                   AND usd >= (public.community_buy_bot_resolve(s.buy_bot) ->> 'min_usd')::numeric
              LOOP
                BEGIN
                  INSERT INTO public.community_chat_messages
                    (community_id, wallet_address, username, display_name, content, message_type, reactions)
                  VALUES
                    (grp.id, '0x000000000000000000000000000000000000dead', 'buy_bot', 'Buy Bot',
                     payload::text, 'buy_alert', '{}'::jsonb)
                  ON CONFLICT (community_id, ((content::jsonb) ->> 'txHash')) WHERE message_type = 'buy_alert'
                  DO NOTHING;
                  IF FOUND THEN posted := posted + 1; END IF;
                EXCEPTION WHEN others THEN
                  -- One group refusing the line must not stall the feed for the rest.
                  f.last_error := 'post ' || grp.id || ': ' || SQLERRM;
                END;
              END LOOP;
            END LOOP;
            -- Logs came back for the asked range: it is done.
            f.last_block := greatest(maxlog, coalesce(f.rpc_to_block, f.head_block));
            f.last_error := NULL;
          END IF;
        EXCEPTION WHEN others THEN
          f.last_error := 'rpc: ' || SQLERRM;
        END;
        f.rpc_request := NULL;
      ELSIF f.rpc_sent_at < now() - interval '3 minutes' THEN
        f.rpc_request := NULL;   -- lost; ask again for the same range
      END IF;
    END IF;

    -- d) Ask again (one request in flight per feed).
    IF f.rpc_request IS NULL THEN
      rpc := public.community_buy_bot_rpc(f.chain_id);
      reqs := jsonb_build_array(jsonb_build_object('jsonrpc', '2.0', 'id', 1, 'method', 'eth_blockNumber', 'params', '[]'::jsonb));
      IF f.decimals IS NULL THEN
        reqs := reqs || jsonb_build_object('jsonrpc', '2.0', 'id', 3, 'method', 'eth_call',
          'params', jsonb_build_array(jsonb_build_object('to', f.token_address, 'data', '0x313ce567'), 'latest'));
      END IF;
      f.rpc_to_block := NULL;
      IF f.last_block > 0 THEN
        IF f.head_block - f.last_block > STEP THEN
          to_block := f.last_block + STEP;
          to_hex := '0x' || to_hex(to_block);
          f.rpc_to_block := to_block;
        ELSE
          to_hex := 'latest';
        END IF;
        reqs := reqs || jsonb_build_object('jsonrpc', '2.0', 'id', 2, 'method', 'eth_getLogs',
          'params', jsonb_build_array(jsonb_build_object(
            'address', f.token_address,
            'fromBlock', '0x' || to_hex(f.last_block + 1),
            'toBlock', to_hex,
            'topics', jsonb_build_array(TRANSFER, '0x' || lpad(substr(f.pair_address, 3), 64, '0')))));
      END IF;
      f.rpc_request := net.http_post(url := rpc, body := reqs,
        headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 20000);
      f.rpc_sent_at := now();
    END IF;

    IF f.price_request IS NULL AND (f.price_at IS NULL OR f.price_at < now() - interval '50 seconds') THEN
      f.price_request := net.http_get(
        url := 'https://api.dexscreener.com/latest/dex/pairs/' || f.chain_id || '/' || f.pair_address,
        timeout_milliseconds := 15000);
    END IF;

    UPDATE public.community_buy_bot_feeds SET
      symbol = f.symbol, decimals = f.decimals, last_block = f.last_block, head_block = f.head_block,
      price_usd = f.price_usd, market_cap = f.market_cap, price_at = f.price_at,
      rpc_request = f.rpc_request, rpc_sent_at = f.rpc_sent_at, rpc_to_block = f.rpc_to_block,
      price_request = f.price_request, last_error = f.last_error, updated_at = now()
     WHERE feed = f.feed;
  END LOOP;

  PERFORM set_config('dehub.community_privileged', '0', true);
  RETURN jsonb_build_object('posted', posted);
END;
$$;
REVOKE ALL ON FUNCTION public.community_buy_bot_tick() FROM public, anon, authenticated;

DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'community-buy-bot') THEN
    PERFORM cron.unschedule('community-buy-bot');
  END IF;
  PERFORM cron.schedule('community-buy-bot', '* * * * *', 'SELECT public.community_buy_bot_tick()');
END $schedule$;
