-- Tip records are written by the tip-record edge function only.
--
-- The insert policy let a browser write any row whose sender column matched
-- its wallet header: the amount, receiver, post and comment were unchecked,
-- so a row could claim a tip that never happened. The function writes with
-- the service role (which bypasses RLS) from the API's own payment record, so
-- no client write policy is needed at all. Reads stay public.
ALTER TABLE public.tip_records ADD COLUMN IF NOT EXISTS token_id text;
ALTER TABLE public.tip_records ADD COLUMN IF NOT EXISTS comment_id text;

-- Every policy that is not a plain read goes, whatever it was named.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tip_records' AND cmd <> 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.tip_records', p.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Anyone can view tips" ON public.tip_records;
CREATE POLICY "Anyone can view tips" ON public.tip_records FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tip_records FROM anon, authenticated;
