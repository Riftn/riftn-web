-- The dub line, and list numbers out of translated captions.
-- Idempotent: every step checks before it changes anything.

-- ============================================================================
-- 1. Redo marker
-- ============================================================================
-- A finished dub whose audio should be made again stays `ready` and keeps
-- playing what it has; `auto-dub` renders it again when the line reaches it
-- and clears the flag when the new audio lands.

ALTER TABLE public.video_dubs ADD COLUMN IF NOT EXISTS needs_redo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_video_dubs_needs_redo
  ON public.video_dubs (updated_at) WHERE needs_redo;

-- ============================================================================
-- 2. Players hear about a finished dub
-- ============================================================================
-- The players follow a row from waiting to ready over realtime and do not
-- poll. The table was taken out of the publication while nothing listened.

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'video_dubs'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.video_dubs;
  END IF;
END $do$;

-- ============================================================================
-- 3. List numbers in stored translations
-- ============================================================================
-- Lines went to the translator numbered and about half the answers kept the
-- numbers, so captions read "1. Hello" / "2. there" and dubs spoke them. The
-- function now strips them; this cleans the rows already stored. A line keeps
-- its number when the original line opens with a digit too. Dubs made from
-- the numbered lines are marked for a redo.

WITH fixed AS (
  SELECT
    tt.transcript_id,
    tt.language,
    (
      SELECT jsonb_agg(
        CASE
          WHEN e.elem ->> 'text' ~ '^\s*\(?\d{1,3}[.):]\s+\S'
           AND coalesce(t.segments -> (e.ord::int - 1) ->> 'text', '') !~ '^\s*\(?\d'
          THEN jsonb_set(e.elem, '{text}', to_jsonb(regexp_replace(e.elem ->> 'text', '^\s*\(?\d{1,3}[.):]\s+', '')))
          ELSE e.elem
        END
        ORDER BY e.ord
      )
      FROM jsonb_array_elements(tt.segments) WITH ORDINALITY AS e(elem, ord)
    ) AS segments,
    CASE
      WHEN tt.summary IS NOT NULL AND coalesce(t.summary, '') !~ '(^|\n)\s*\(?\d{1,3}[.):]\s'
      THEN regexp_replace(tt.summary, '(^|\n)\s*\(?\d{1,3}[.):]\s+', '\1', 'g')
      ELSE tt.summary
    END AS summary,
    CASE
      WHEN jsonb_typeof(tt.chapters) = 'array' AND jsonb_array_length(tt.chapters) > 0 THEN (
        SELECT jsonb_agg(
          CASE
            WHEN c.elem ->> 'title' ~ '^\s*\(?\d{1,3}[.):]\s+\S'
             AND coalesce(t.chapters -> (c.ord::int - 1) ->> 'title', '') !~ '^\s*\(?\d'
            THEN jsonb_set(c.elem, '{title}', to_jsonb(regexp_replace(c.elem ->> 'title', '^\s*\(?\d{1,3}[.):]\s+', '')))
            ELSE c.elem
          END
          ORDER BY c.ord
        )
        FROM jsonb_array_elements(tt.chapters) WITH ORDINALITY AS c(elem, ord)
      )
      ELSE tt.chapters
    END AS chapters
  FROM public.transcript_translations tt
  JOIN public.transcripts t ON t.id = tt.transcript_id
  WHERE tt.status = 'ready'
    AND jsonb_typeof(tt.segments) = 'array'
    AND jsonb_array_length(tt.segments) > 0
    -- Only rows the model numbered: at least half their lines open with one.
    AND (
      SELECT count(*) FILTER (WHERE e ->> 'text' ~ '^\s*\(?\d{1,3}[.):]\s+\S') * 2 >= count(*)
      FROM jsonb_array_elements(tt.segments) AS e
    )
),
changed AS (
  UPDATE public.transcript_translations tt
  SET segments = f.segments, summary = f.summary, chapters = f.chapters
  FROM fixed f
  WHERE tt.transcript_id = f.transcript_id
    AND tt.language = f.language
    AND tt.segments IS DISTINCT FROM f.segments
  RETURNING tt.transcript_id, tt.language
)
UPDATE public.video_dubs d
SET needs_redo = true, attempts = 0
FROM changed c
WHERE d.transcript_id = c.transcript_id
  AND d.language = c.language
  AND d.status = 'ready';

-- ============================================================================
-- 4. Keep the line moving
-- ============================================================================
-- The worker's own report sends it the next dub. This call covers the gaps:
-- a worker restart, or a line that filled while the worker sat idle. It only
-- moves dubs already in line and never opens new ones, so the paused sweep
-- stays paused.

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron')
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-dub-drain') THEN
    PERFORM cron.schedule(
      'auto-dub-drain',
      '*/10 * * * *',
      $$
      select net.http_post(
        url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/auto-dub',
        headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I"}'::jsonb,
        body := '{"action":"drain"}'::jsonb,
        timeout_milliseconds := 30000
      );
      $$
    );
  END IF;
END $do$;
