-- Read-only inventory for reconciling historical migration versions.
WITH expected(old_version, new_version, migration_name) AS (VALUES
  ('20260214', '20260214', 'direct_messages'),
  ('20260214', '20260215000001', 'direct_messages_metadata'),
  ('20260820120000', '20260820120000', 'arcade_leaderboards'),
  ('20260820120000', '20260820120001', 'stage_chat_messages'),
  ('20260914120000', '20260914120000', 'get_user_id_by_email'),
  ('20260914120000', '20260914120001', 'page_view_events'),
  ('20260916120000', '20260916120000', 'swap_killer_whale_great_white'),
  ('20260916120000', '20260916120001', 'santa_scores_lockdown'),
  ('20260921120000', '20260921120000', 'onboarding_checklist'),
  ('20260921120000', '20260921120001', 'passkey_identities'),
  ('20260921120000', '20260921120002', 'post_discussion_settings'),
  ('20261102060000', '20261102060000', 'community_groups_channels'),
  ('20261102060000', '20261102060001', 'miniapp_review_queue'),
  ('20261118100000', '20261118100000', 'buy_bot_min_50'),
  ('20261118100000', '20261118100001', 'governance_multiple_choice')
)
SELECT old_version, new_version, migration_name,
       old.name AS recorded_at_old_version, new.name AS recorded_at_new_version
FROM expected
LEFT JOIN supabase_migrations.schema_migrations old ON old.version = old_version
LEFT JOIN supabase_migrations.schema_migrations new ON new.version = new_version
ORDER BY old_version, new_version;
