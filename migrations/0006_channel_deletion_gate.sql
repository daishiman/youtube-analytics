-- 旧チャンネルの削除完了前に同じテナントへ新しいチャンネルを保存させない。
-- usecase の事前確認と並行して、連携確定と削除予約の競合も DB で拒否する。
CREATE INDEX idx_data_deletions_pending_channel
  ON data_deletions (tenant_id, scope, requested_at DESC)
  WHERE done_at IS NULL;

CREATE TRIGGER channels_block_pending_deletion
BEFORE INSERT ON channels
WHEN EXISTS (
  SELECT 1 FROM data_deletions
   WHERE tenant_id = NEW.tenant_id AND scope = 'channel' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'CHANNEL_DELETION_PENDING');
END;
