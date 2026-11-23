-- Governance: multiple choice proposals
-- =====================================
-- A proposal used to be a yes/no question only. An author can now list two to
-- six answers instead, and each voter picks one of them.
--
--   · `governance_proposals.options` holds the answers. NULL keeps the
--     proposal a plain yes/no vote, so every existing row is unchanged.
--   · `governance_votes.option_index` is the answer a vote went to (0-based).
--     A multiple choice vote is stored with vote_type = 1, so like_count and
--     vote_count stay "total weight cast" and the board's sort, the author's
--     vote notification and the verdict tabs keep working without a branch.
--   · `governance_proposals.option_tallies` is the per-answer result,
--     [{"weight": n, "voters": n}, ...] in the same order as `options`,
--     re-summed by the vote trigger like the other counts.
--
-- Idempotent: safe to run more than once.

ALTER TABLE public.governance_proposals
  ADD COLUMN IF NOT EXISTS options text[],
  ADD COLUMN IF NOT EXISTS option_tallies jsonb;

ALTER TABLE public.governance_votes
  ADD COLUMN IF NOT EXISTS option_index smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'governance_proposals_options_count') THEN
    ALTER TABLE public.governance_proposals
      ADD CONSTRAINT governance_proposals_options_count
      CHECK (options IS NULL OR cardinality(options) BETWEEN 2 AND 6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'governance_votes_option_index_range') THEN
    ALTER TABLE public.governance_votes
      ADD CONSTRAINT governance_votes_option_index_range
      CHECK (option_index IS NULL OR option_index BETWEEN 0 AND 5);
  END IF;
END $$;

-- ── Tallies ──────────────────────────────────────────────────────────────
-- Same re-sum as before, plus the per-answer result on multiple choice rows.
CREATE OR REPLACE FUNCTION public.update_governance_vote_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN target_id := OLD.proposal_id;
  ELSE target_id := NEW.proposal_id;
  END IF;

  UPDATE public.governance_proposals p
  SET
    vote_count = COALESCE((SELECT SUM(vote_type * vote_weight) FROM public.governance_votes WHERE proposal_id = target_id), 0),
    like_count = COALESCE((SELECT SUM(vote_weight) FROM public.governance_votes WHERE proposal_id = target_id AND vote_type = 1), 0),
    dislike_count = COALESCE((SELECT SUM(vote_weight) FROM public.governance_votes WHERE proposal_id = target_id AND vote_type = -1), 0),
    option_tallies = CASE
      WHEN p.options IS NULL THEN NULL
      ELSE (
        SELECT jsonb_agg(
                 jsonb_build_object('weight', COALESCE(t.weight, 0), 'voters', COALESCE(t.voters, 0))
                 ORDER BY i.idx
               )
        FROM generate_series(0, cardinality(p.options) - 1) AS i(idx)
        LEFT JOIN (
          SELECT v.option_index, SUM(v.vote_weight) AS weight, COUNT(*) AS voters
          FROM public.governance_votes v
          WHERE v.proposal_id = target_id AND v.option_index IS NOT NULL
          GROUP BY v.option_index
        ) t ON t.option_index = i.idx
      )
    END
  WHERE p.id = target_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- ── Authors can't rewrite the answers ────────────────────────────────────
-- Changing an answer after people voted on it would move their votes onto
-- something they never picked. Same guard as before, extended.
CREATE OR REPLACE FUNCTION public.guard_governance_proposal_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.vote_count IS DISTINCT FROM OLD.vote_count
     OR NEW.like_count IS DISTINCT FROM OLD.like_count
     OR NEW.dislike_count IS DISTINCT FROM OLD.dislike_count
     OR NEW.comment_count IS DISTINCT FROM OLD.comment_count
     OR NEW.author_wallet_address IS DISTINCT FROM OLD.author_wallet_address
     OR NEW.voting_ends_at IS DISTINCT FROM OLD.voting_ends_at
     OR NEW.fee_tx_hash IS DISTINCT FROM OLD.fee_tx_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.media_url IS DISTINCT FROM OLD.media_url
     OR NEW.media_type IS DISTINCT FROM OLD.media_type
     OR NEW.proposal_number IS DISTINCT FROM OLD.proposal_number
     OR NEW.options IS DISTINCT FROM OLD.options
     OR NEW.option_tallies IS DISTINCT FROM OLD.option_tallies
  THEN
    RAISE EXCEPTION 'Only the title and description of a proposal can be edited.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$fn$;

-- ── Closing a vote ───────────────────────────────────────────────────────
-- Yes/no: passes on a weighted majority (unchanged). Multiple choice: passes
-- when one answer is strictly ahead of every other; a tie or no votes is
-- "rejected" (no result). Both still need ten distinct voters.
CREATE OR REPLACE FUNCTION public.resolve_due_governance_proposals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  quorum CONSTANT integer := 10;
  resolved integer;
BEGIN
  WITH due AS (
    SELECT p.id,
           CASE
             WHEN p.options IS NULL THEN p.like_count > p.dislike_count
             ELSE COALESCE((
               SELECT w[1] > 0 AND w[1] > COALESCE(w[2], 0)
               FROM (
                 SELECT array_agg((e->>'weight')::numeric ORDER BY (e->>'weight')::numeric DESC) AS w
                 FROM jsonb_array_elements(COALESCE(p.option_tallies, '[]'::jsonb)) e
               ) ranked
             ), false)
           END AS majority,
           (SELECT COUNT(DISTINCT v.wallet_address) FROM public.governance_votes v
             WHERE v.proposal_id = p.id) >= quorum AS has_quorum
    FROM public.governance_proposals p
    WHERE p.status = 'open'
      AND p.voting_ends_at IS NOT NULL
      AND p.voting_ends_at <= now()
  ), updated AS (
    UPDATE public.governance_proposals p
    SET status = CASE WHEN due.majority AND due.has_quorum THEN 'passed' ELSE 'rejected' END
    FROM due
    WHERE p.id = due.id
    RETURNING p.id
  )
  SELECT COUNT(*) INTO resolved FROM updated;

  RETURN resolved;
END;
$fn$;

REVOKE ALL ON FUNCTION public.resolve_due_governance_proposals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_due_governance_proposals() FROM anon;
REVOKE ALL ON FUNCTION public.resolve_due_governance_proposals() FROM authenticated;

NOTIFY pgrst, 'reload schema';
