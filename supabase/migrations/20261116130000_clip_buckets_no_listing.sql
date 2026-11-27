-- Clip and dub buckets: files stay public, the folder listing does not.
--
-- stage-clips, live-clips and video-dubs are public buckets, so every file in
-- them is served from its public URL with no policy involved. The SELECT
-- policies below added only one thing on top of that: anyone holding the
-- publishable key could list the whole bucket. For live-clips that means the
-- grabbed source and draft renders of clips nobody has posted yet, found by
-- walking the folders rather than by being handed a link.
--
-- Nothing reads these buckets through the storage API except the edge
-- functions, which use the service key and are not subject to these policies.
-- Uploads go through signed upload URLs, which do not need them either.

DROP POLICY IF EXISTS "Public read stage clips" ON storage.objects;
DROP POLICY IF EXISTS "Public read live clips" ON storage.objects;
DROP POLICY IF EXISTS "Public read video dubs" ON storage.objects;
