-- Historical follower ranks must pass through follower-rankings, which
-- checks the current visibility of each ranked account before returning it.
ALTER POLICY "Leaderboard cache is publicly readable" ON public.leaderboard_cache
  USING (sort_mode <> 'followers');
