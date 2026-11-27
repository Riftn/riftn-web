\set ON_ERROR_STOP on
INSERT INTO community_events (id,creator_wallet_address,title,starts_at,is_private,gate_fee) VALUES
 ('00000000-0000-4000-8000-000000000001','0x1111111111111111111111111111111111111111','Paid private event',now(),true,1.25),
 ('00000000-0000-4000-8000-000000000002','0x1111111111111111111111111111111111111111','Open event',now(),false,0);
INSERT INTO event_chat_messages(id,event_id,wallet_address,content) VALUES
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','0x1111111111111111111111111111111111111111','Welcome');
SET ROLE anon;
SET test.wallet = '';
DO $$ BEGIN
  ASSERT public.can_read_event_chat('00000000-0000-4000-8000-000000000002');
  ASSERT (SELECT count(*) FROM event_chat_messages) = 0;
  ASSERT NOT has_table_privilege('anon','event_gate_payments','INSERT');
  ASSERT NOT has_column_privilege('anon','event_chat_messages','reactions','UPDATE');
END $$;
SET test.wallet = '0x1111111111111111111111111111111111111111';
DO $$ BEGIN ASSERT (SELECT count(*) FROM event_chat_messages) = 1; END $$;
RESET ROLE;
INSERT INTO community_event_rsvps(event_id,wallet_address,status)
VALUES ('00000000-0000-4000-8000-000000000001','0x2222222222222222222222222222222222222222','pending');
SET ROLE anon;
SET test.wallet = '0x2222222222222222222222222222222222222222';
DO $$ BEGIN ASSERT (public.event_gate_checkout('00000000-0000-4000-8000-000000000001','prepare',gen_random_uuid()) ? 'error'); END $$;
RESET ROLE;
UPDATE community_event_rsvps SET status='approved';
SET ROLE anon;
DO $$
DECLARE
  e uuid := '00000000-0000-4000-8000-000000000001';
  c uuid := gen_random_uuid();
BEGIN
  ASSERT NOT public.can_read_event_chat(e);
  ASSERT (public.event_gate_checkout(e,'prepare',c)->>'canSubmit')::boolean;
  ASSERT NOT (public.event_gate_checkout(e,'prepare',gen_random_uuid())->>'canSubmit')::boolean;
  ASSERT public.event_gate_checkout(e,'confirm',c,'0x'||repeat('a',64)) ? 'pending';
END $$;
RESET ROLE;
-- Supply a confirmed Base receipt as the pg_net test transport's response.
INSERT INTO net._http_response SELECT q.request_id, 200, jsonb_build_array(
  jsonb_build_object('id',1,'result',jsonb_build_object('status','0x1','blockNumber','0x10','transactionHash',q.tx_hash,'logs',jsonb_build_array(
    jsonb_build_object('address','0x4fa30daef50c6dc8593470750f3c721ca3275581','logIndex','0x4','topics',jsonb_build_array('0x4ff91ce3b258f9359e335147491470b83c6592a3d0bbe868db980071b67b3db3'),
      'data','0x'||lpad(to_hex(q.reference),64,'0')||lpad(to_hex(1250000000000000000::bigint),64,'0')||repeat('0',64)
      ||lpad(substr(q.payer,3),64,'0')||lpad(substr(q.recipient,3),64,'0')||lpad('d20ab1015f6a2de4a6fddebab270113f689c2f7c',64,'0')||repeat('0',64))))),
  '{"id":2,"result":"0x12"}'::jsonb,'{"id":3,"result":"0x2105"}'::jsonb)::text
FROM event_gate_quotes q;
SET ROLE anon;
DO $$
DECLARE
  e uuid := '00000000-0000-4000-8000-000000000001';
  m uuid := '00000000-0000-4000-8000-000000000003';
BEGIN
  ASSERT public.event_gate_checkout(e,'confirm',gen_random_uuid(),'0x'||repeat('a',64)) ? 'paid';
  ASSERT public.event_gate_checkout(e,'confirm',gen_random_uuid(),'0x'||repeat('a',64)) ? 'paid';
  ASSERT (SELECT count(*) FROM event_gate_payments) = 1;
  ASSERT public.can_read_event_chat(e);
  PERFORM public.set_event_chat_reaction(e,m,'👍',true);
  PERFORM public.set_event_chat_reaction(e,m,'👍',true);
  ASSERT (SELECT jsonb_array_length(reactions->'👍') FROM event_chat_messages WHERE id=m) = 1;
  PERFORM public.set_event_chat_reaction(e,m,'👍',false);
  ASSERT (SELECT reactions FROM event_chat_messages WHERE id=m) = '{}';
END $$;
