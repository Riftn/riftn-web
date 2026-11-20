-- Requests board attachments: 200MB per file (was 50MB) so longer screen
-- recordings of a bug can be attached. Matches MAX_FEATURE_ATTACHMENT_BYTES.
update storage.buckets set file_size_limit = 209715200 where id = 'feature-media';
