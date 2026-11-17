-- Searches are counted through increment_ticker_search (security definer).
-- Visitors no longer write the counter table directly.
DROP POLICY IF EXISTS "Anyone can insert ticker searches" ON public.ticker_searches;
DROP POLICY IF EXISTS "Anyone can update ticker searches" ON public.ticker_searches;
