ALTER TABLE public.user_display_preferences
  ADD COLUMN IF NOT EXISTS stories_enabled boolean NOT NULL DEFAULT true;
