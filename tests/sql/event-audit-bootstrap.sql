CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA net;
CREATE TABLE net._http_response (id bigint primary key, status_code integer, content text);
CREATE SEQUENCE net.requests;
CREATE FUNCTION net.http_post(url text, timeout_milliseconds integer, headers jsonb, body jsonb)
RETURNS bigint LANGUAGE sql AS $$ SELECT nextval('net.requests'); $$;
CREATE FUNCTION public.get_signed_request_wallet_address() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT current_setting('test.wallet', true); $$;
CREATE FUNCTION public.get_request_wallet_address() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT public.get_signed_request_wallet_address(); $$;
CREATE TABLE public.communities(id uuid PRIMARY KEY);
CREATE PUBLICATION supabase_realtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
\ir ../../supabase/migrations/20260406052211_0f50f7c5-3830-449a-be2c-b8737634ef92.sql
\ir ../../supabase/migrations/20260406060945_731194b3-f827-4360-aa8e-366cc298596a.sql
\ir ../../supabase/migrations/20260406065459_6310528d-5eb2-4853-83b6-041b43abf628.sql
ALTER TABLE public.community_events ADD COLUMN is_private boolean DEFAULT false;
