CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE PUBLICATION supabase_realtime;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE FUNCTION public.get_signed_request_wallet_address()
RETURNS text LANGUAGE sql STABLE
AS $$ SELECT coalesce(current_setting('test.signed_stage_wallet', true), ''); $$;

\ir ../../supabase/migrations/20260202080422_e795f1e7-33e0-493f-871a-60db529bddbe.sql

CREATE FUNCTION public.is_signed_stage_host(p_space_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.audio_spaces
    WHERE id = p_space_id AND lower(host_wallet_address) = public.get_signed_request_wallet_address()
  );
$$;
