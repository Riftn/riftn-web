-- Add metadata columns to direct_messages for efficiency
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS sender_username TEXT;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS sender_display_name TEXT;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS sender_avatar_url TEXT;

-- Re-enable Realtime for this table (in case it was disabled or needs update)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                 AND schemaname = 'public' AND tablename = 'direct_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  END IF;
END $$;
