-- Preserve original receipts for reconciliation. Only the verifier grants entry.
ALTER TABLE public.event_gate_payments
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN log_index integer;
DROP POLICY "Payers can record their own payment" ON public.event_gate_payments;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.event_gate_payments FROM PUBLIC, anon, authenticated;
CREATE UNIQUE INDEX event_gate_verified_log ON public.event_gate_payments(chain_id, lower(tx_hash), log_index)
  WHERE verified_at IS NOT NULL;
CREATE UNIQUE INDEX event_gate_verified_guest ON public.event_gate_payments(event_id, lower(payer_wallet_address))
  WHERE verified_at IS NOT NULL;

-- Each quote has its own on-chain reference and a single submission claim.
-- The high range is distinct from ordinary stream IDs and fits a JS safe integer.
CREATE TABLE public.event_gate_quotes (
  reference bigint GENERATED ALWAYS AS IDENTITY (START WITH 4000000000000000 MAXVALUE 9007199254740991) PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.community_events ON DELETE CASCADE,
  payer text NOT NULL,
  recipient text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  claim uuid,
  submitted_hash text,
  tx_hash text,
  request_id bigint,
  requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, payer)
);
ALTER TABLE public.event_gate_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_gate_quotes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.event_gate_quotes TO service_role;

CREATE FUNCTION public.can_read_event_chat(p_event uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT FROM public.community_events e WHERE e.id = p_event AND (
      lower(e.creator_wallet_address) = nullif(public.get_signed_request_wallet_address(), '')
      OR ((NOT coalesce(e.is_private, false) OR EXISTS (
        SELECT FROM public.community_event_rsvps r WHERE r.event_id = e.id
        AND lower(r.wallet_address) = nullif(public.get_signed_request_wallet_address(), '') AND r.status IN ('approved','going')
      )) AND (e.gate_fee <= 0 OR EXISTS (
        SELECT FROM public.event_gate_payments p WHERE p.event_id = e.id AND p.verified_at IS NOT NULL
        AND lower(p.payer_wallet_address) = nullif(public.get_signed_request_wallet_address(), '')
      )))
    )
  );
$$;
DROP POLICY "Anyone can view event chat messages" ON public.event_chat_messages;
CREATE POLICY event_chat_read ON public.event_chat_messages FOR SELECT USING (public.can_read_event_chat(event_id));
-- Apply admission to all writes, including author edits and deletes.
CREATE POLICY event_chat_admission ON public.event_chat_messages AS RESTRICTIVE FOR ALL
  USING (public.can_read_event_chat(event_id)) WITH CHECK (public.can_read_event_chat(event_id));
ALTER POLICY "Users can send event chat messages" ON public.event_chat_messages WITH CHECK (
  lower(wallet_address) = nullif(public.get_signed_request_wallet_address(), '') AND reactions = '{}'::jsonb
);
REVOKE UPDATE, TRUNCATE ON public.event_chat_messages FROM PUBLIC, anon, authenticated;
GRANT UPDATE(content) ON public.event_chat_messages TO anon, authenticated;

CREATE FUNCTION public.set_event_chat_reaction(p_event uuid, p_message uuid, p_emoji text, p_add boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  wallet text := nullif(public.get_signed_request_wallet_address(), '');
  reactions_map jsonb;
  members jsonb;
BEGIN
  IF wallet IS NULL OR wallet = '' OR NOT public.can_read_event_chat(p_event) THEN
    RAISE insufficient_privilege;
  END IF;
  IF p_emoji IS NULL OR length(p_emoji) NOT BETWEEN 1 AND 64 OR p_add IS NULL THEN
    RAISE invalid_parameter_value;
  END IF;
  SELECT coalesce(reactions, '{}') INTO STRICT reactions_map FROM public.event_chat_messages
    WHERE id = p_message AND event_id = p_event FOR UPDATE;
  members := coalesce(reactions_map -> p_emoji, '[]'::jsonb) - wallet;
  IF p_add THEN members := members || jsonb_build_array(wallet); END IF;
  UPDATE public.event_chat_messages SET reactions = CASE WHEN members = '[]'::jsonb
    THEN reactions_map - p_emoji ELSE jsonb_set(reactions_map, ARRAY[p_emoji], members) END
    WHERE id = p_message;
END;
$$;
REVOKE ALL ON FUNCTION public.set_event_chat_reaction(uuid,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_event_chat_reaction(uuid,uuid,text,boolean) TO anon, authenticated;

-- Decode the deployed Base StreamController's SendFunds event. Its seven ABI
-- words are reference, amount, timestamp, payer, payee, token and fund type.
CREATE FUNCTION public.event_gate_log_index(receipt jsonb, q public.event_gate_quotes)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT public.holder_gate_hex_to_numeric(log->>'logIndex')::integer
  FROM jsonb_array_elements(receipt->'logs') log
  CROSS JOIN LATERAL (SELECT lower(log->>'data') AS data) d
  WHERE receipt->>'status' = '0x1'
    AND lower(log->>'address') = '0x4fa30daef50c6dc8593470750f3c721ca3275581'
    AND log->'topics'->>0 = '0x4ff91ce3b258f9359e335147491470b83c6592a3d0bbe868db980071b67b3db3'
    AND length(data) = 450
    AND public.holder_gate_hex_to_numeric(substr(data,3,64)) = q.reference
    AND public.holder_gate_hex_to_numeric(substr(data,67,64)) = q.amount * 1e18::numeric
    AND substr(data,195,64) = lpad(substr(q.payer,3),64,'0')
    AND substr(data,259,64) = lpad(substr(q.recipient,3),64,'0')
    AND substr(data,323,64) = lpad('d20ab1015f6a2de4a6fddebab270113f689c2f7c',64,'0')
    AND substr(data,387,64) = repeat('0',64)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.event_gate_log_index(jsonb, public.event_gate_quotes) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.event_gate_checkout(p_event uuid, p_action text, p_claim uuid, p_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  wallet text := nullif(public.get_signed_request_wallet_address(), '');
  e public.community_events;
  q public.event_gate_quotes;
  h text := lower(btrim(p_hash));
  batch jsonb;
  receipt jsonb;
  height numeric;
  chain text;
  log_id integer;
BEGIN
  IF wallet IS NULL OR p_claim IS NULL THEN RAISE insufficient_privilege; END IF;
  IF EXISTS (SELECT FROM public.event_gate_payments WHERE event_id = p_event AND lower(payer_wallet_address) = wallet AND verified_at IS NOT NULL) THEN
    RETURN '{"paid":true}';
  END IF;
  IF EXISTS (SELECT FROM public.event_gate_payments WHERE event_id = p_event AND lower(payer_wallet_address) = wallet) THEN
    RETURN jsonb_build_object('error', 'Your earlier payment needs receipt review. No second payment is required.');
  END IF;
  IF p_action = 'prepare' THEN
    SELECT * INTO STRICT e FROM public.community_events WHERE id = p_event;
    IF e.gate_fee <= 0 OR lower(e.creator_wallet_address) = wallet THEN RETURN '{"paid":true}'; END IF;
    IF e.is_private AND NOT EXISTS (SELECT FROM public.community_event_rsvps
      WHERE event_id = p_event AND lower(wallet_address) = wallet AND status IN ('approved','going')) THEN
      RETURN jsonb_build_object('error', 'Guest approval is required before payment.');
    END IF;
    INSERT INTO public.event_gate_quotes AS existing (event_id,payer,recipient,amount,claim)
    VALUES (p_event,wallet,lower(e.creator_wallet_address),e.gate_fee,p_claim)
    ON CONFLICT (event_id,payer) DO UPDATE SET claim = excluded.claim, recipient = excluded.recipient, amount = excluded.amount, created_at = now()
      WHERE existing.claim IS NULL;
  END IF;

  SELECT * INTO STRICT q FROM public.event_gate_quotes WHERE event_id = p_event AND payer = wallet FOR UPDATE;
  -- A simultaneous confirmation may have completed while this caller waited.
  IF EXISTS (SELECT FROM public.event_gate_payments WHERE event_id = p_event AND lower(payer_wallet_address) = wallet AND verified_at IS NOT NULL) THEN
    RETURN '{"paid":true}';
  END IF;
  IF p_action = 'prepare' THEN
    RETURN jsonb_build_object('canSubmit', q.claim = p_claim, 'reference', q.reference::text,
      'amount', q.amount, 'recipient', q.recipient, 'hash', q.tx_hash,
      'staleClaim', CASE WHEN q.tx_hash IS NULL AND q.created_at < now() - interval '5 minutes' THEN q.claim END);
  ELSIF p_action = 'check_claim' THEN
    RETURN jsonb_build_object('canSubmit', q.claim = p_claim AND q.tx_hash IS NULL);
  ELSIF p_action = 'release' THEN
    UPDATE public.event_gate_quotes SET claim = NULL WHERE reference = q.reference AND claim = p_claim AND tx_hash IS NULL;
    RETURN '{"released":true}';
  END IF;
  IF p_action NOT IN ('confirm','record') OR h IS NULL OR h !~ '^0x[0-9a-f]{64}$' THEN
    RAISE invalid_parameter_value;
  END IF;
  IF p_action = 'record' THEN
    UPDATE public.event_gate_quotes SET submitted_hash = h, tx_hash = h WHERE reference = q.reference AND claim = p_claim AND tx_hash IS NULL;
    RETURN '{"recorded":true}';
  END IF;

  IF q.tx_hash = h AND q.request_id IS NOT NULL THEN
    BEGIN
      SELECT CASE WHEN status_code = 200 THEN content::jsonb END INTO batch FROM net._http_response WHERE id = q.request_id;
    EXCEPTION WHEN invalid_text_representation THEN
      batch := NULL;
    END;
    IF jsonb_typeof(batch) = 'array' THEN
      SELECT item->'result' INTO receipt FROM jsonb_array_elements(batch) item WHERE item->>'id' = '1';
      SELECT public.holder_gate_hex_to_numeric(item->>'result') INTO height FROM jsonb_array_elements(batch) item WHERE item->>'id' = '2';
      SELECT item->>'result' INTO chain FROM jsonb_array_elements(batch) item WHERE item->>'id' = '3';
      IF chain = '0x2105' AND lower(receipt->>'transactionHash') = h
         AND height >= public.holder_gate_hex_to_numeric(receipt->>'blockNumber') + 2 THEN
        IF receipt->>'status' = '0x0' THEN
          IF q.submitted_hash IS DISTINCT FROM h THEN
            RETURN jsonb_build_object('mismatch', true);
          END IF;
          UPDATE public.event_gate_quotes SET claim = NULL, submitted_hash = NULL, tx_hash = NULL, request_id = NULL WHERE reference = q.reference;
          RETURN '{"reverted":true}';
        END IF;
        log_id := public.event_gate_log_index(receipt, q);
        IF log_id IS NULL THEN RETURN jsonb_build_object('mismatch',true); END IF;
        INSERT INTO public.event_gate_payments(event_id,payer_wallet_address,creator_wallet_address,amount,tx_hash,chain_id,log_index,verified_at)
        VALUES (p_event,wallet,q.recipient,q.amount,h,8453,log_id,now());
        RETURN '{"paid":true}';
      END IF;
    END IF;
  END IF;
  IF q.requested_at IS NULL OR q.requested_at < now() - interval '8 seconds' THEN
    UPDATE public.event_gate_quotes SET tx_hash = h, requested_at = now(), request_id = net.http_post(
      url := 'https://base-rpc.publicnode.com', timeout_milliseconds := 5000,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_array(
        jsonb_build_object('jsonrpc','2.0','id',1,'method','eth_getTransactionReceipt','params',jsonb_build_array(h)),
        '{"jsonrpc":"2.0","id":2,"method":"eth_blockNumber","params":[]}'::jsonb,
        '{"jsonrpc":"2.0","id":3,"method":"eth_chainId","params":[]}'::jsonb
      )) WHERE reference = q.reference;
  END IF;
  RETURN '{"pending":true}';
END;
$$;
REVOKE ALL ON FUNCTION public.event_gate_checkout(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_gate_checkout(uuid,text,uuid,text) TO anon, authenticated;
