-- テナント削除予約の競合と、削除中の新しいテナント固有データをDBでも拒否する。
-- 旧版では予約だけ保存して利用停止しなかった。既存の未完了依頼にも即時停止を適用する。
UPDATE tenants SET deleted_at = (
  SELECT MIN(requested_at) FROM data_deletions d
   WHERE d.tenant_id = tenants.tenant_id AND d.scope = 'tenant' AND d.done_at IS NULL
)
WHERE deleted_at IS NULL AND EXISTS (
  SELECT 1 FROM data_deletions d
   WHERE d.tenant_id = tenants.tenant_id AND d.scope = 'tenant' AND d.done_at IS NULL
);

-- 旧版の競合で重複予約があっても移行を止めず、最初の依頼を代表として保持する。
DELETE FROM data_deletions
WHERE scope = 'tenant' AND done_at IS NULL AND EXISTS (
  SELECT 1 FROM data_deletions earlier
   WHERE earlier.tenant_id = data_deletions.tenant_id
     AND earlier.scope = 'tenant' AND earlier.done_at IS NULL
     AND (earlier.requested_at < data_deletions.requested_at OR
          (earlier.requested_at = data_deletions.requested_at AND
           earlier.deletion_id < data_deletions.deletion_id))
);

CREATE UNIQUE INDEX idx_data_deletions_one_pending_tenant
  ON data_deletions (tenant_id) WHERE scope = 'tenant' AND done_at IS NULL;

CREATE TRIGGER tenants_block_reuse_after_deletion
BEFORE INSERT ON tenants
WHEN EXISTS (SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id AND scope = 'tenant')
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER tenants_block_update_after_deletion
BEFORE UPDATE ON tenants WHEN OLD.deleted_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER data_deletions_block_channel_during_tenant_deletion
BEFORE INSERT ON data_deletions
WHEN NEW.scope = 'channel' AND EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER analytics_raw_rows_block_tenant_deletion_insert
BEFORE INSERT ON analytics_raw_rows
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER analytics_raw_reports_block_tenant_deletion_insert
BEFORE INSERT ON analytics_raw_reports
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER caption_attempts_block_tenant_deletion_insert
BEFORE INSERT ON caption_attempts
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER caption_records_block_tenant_deletion_insert
BEFORE INSERT ON caption_records
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER reporting_orphan_objects_block_tenant_deletion_insert
BEFORE INSERT ON reporting_orphan_objects
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER reporting_authorizations_block_tenant_deletion_insert
BEFORE INSERT ON reporting_authorizations
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER reporting_reach_stage_block_tenant_deletion_insert
BEFORE INSERT ON reporting_reach_stage
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER reporting_raw_reports_block_tenant_deletion_insert
BEFORE INSERT ON reporting_raw_reports
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER reporting_jobs_block_tenant_deletion_insert
BEFORE INSERT ON reporting_jobs
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER collection_series_status_block_tenant_deletion_insert
BEFORE INSERT ON collection_series_status
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER video_angles_block_tenant_deletion_insert
BEFORE INSERT ON video_angles
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER videos_block_tenant_deletion_insert
BEFORE INSERT ON videos
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER daily_metrics_block_tenant_deletion_insert
BEFORE INSERT ON daily_metrics
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER video_metrics_block_tenant_deletion_insert
BEFORE INSERT ON video_metrics
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER video_reach_daily_block_tenant_deletion_insert
BEFORE INSERT ON video_reach_daily
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER video_daily_metrics_block_tenant_deletion_insert
BEFORE INSERT ON video_daily_metrics
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER channel_daily_metrics_block_tenant_deletion_insert
BEFORE INSERT ON channel_daily_metrics
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER reports_block_tenant_deletion_insert
BEFORE INSERT ON reports
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER findings_block_tenant_deletion_insert
BEFORE INSERT ON findings
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER actions_block_tenant_deletion_insert
BEFORE INSERT ON actions
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER media_assets_block_tenant_deletion_insert
BEFORE INSERT ON media_assets
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

-- AI分析（main の 0008〜0015）の表も同じく止める
CREATE TRIGGER analysis_requests_block_tenant_deletion_insert
BEFORE INSERT ON analysis_requests
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER transcripts_block_tenant_deletion_insert
BEFORE INSERT ON transcripts
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER psych_findings_block_tenant_deletion_insert
BEFORE INSERT ON psych_findings
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER comment_emotions_block_tenant_deletion_insert
BEFORE INSERT ON comment_emotions
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER report_archives_block_tenant_deletion_insert
BEFORE INSERT ON report_archives
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER business_funnel_weekly_block_tenant_deletion_insert
BEFORE INSERT ON business_funnel_weekly
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER funnel_targets_block_tenant_deletion_insert
BEFORE INSERT ON funnel_targets
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER studio_csv_columns_block_tenant_deletion_insert
BEFORE INSERT ON studio_csv_columns
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER studio_csv_unresolved_rows_block_tenant_deletion_insert
BEFORE INSERT ON studio_csv_unresolved_rows
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER video_period_metrics_block_tenant_deletion_insert
BEFORE INSERT ON video_period_metrics
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER studio_csv_imports_block_tenant_deletion_insert
BEFORE INSERT ON studio_csv_imports
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER imports_block_tenant_deletion_insert
BEFORE INSERT ON imports
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER oauth_pending_block_tenant_deletion_insert
BEFORE INSERT ON oauth_pending
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER channel_oauth_tokens_block_tenant_deletion_insert
BEFORE INSERT ON channel_oauth_tokens
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER oauth_tokens_block_tenant_deletion_insert
BEFORE INSERT ON oauth_tokens
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER channels_block_tenant_deletion_insert
BEFORE INSERT ON channels
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER tenant_google_clients_block_tenant_deletion_insert
BEFORE INSERT ON tenant_google_clients
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER skill_tokens_block_tenant_deletion_insert
BEFORE INSERT ON skill_tokens
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER tenant_invites_block_tenant_deletion_insert
BEFORE INSERT ON tenant_invites
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER tenant_members_block_tenant_deletion_insert
BEFORE INSERT ON tenant_members
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER audit_log_block_tenant_deletion_insert
BEFORE INSERT ON audit_log
WHEN EXISTS (
  SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER sessions_block_deleted_tenant_tenant_id_insert
BEFORE INSERT ON sessions
WHEN NEW.tenant_id IS NOT NULL AND (
  EXISTS (SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER sessions_block_deleted_tenant_tenant_id_update
BEFORE UPDATE ON sessions
WHEN NEW.tenant_id IS NOT NULL AND (
  EXISTS (SELECT 1 FROM tenants WHERE tenant_id = NEW.tenant_id AND deleted_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM data_deletions WHERE tenant_id = NEW.tenant_id
    AND scope = 'tenant' AND done_at IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER users_block_deleted_tenant_last_tenant_id_insert
BEFORE INSERT ON users
WHEN NEW.last_tenant_id IS NOT NULL AND (
  EXISTS (SELECT 1 FROM tenants WHERE tenant_id = NEW.last_tenant_id AND deleted_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM data_deletions WHERE tenant_id = NEW.last_tenant_id
    AND scope = 'tenant' AND done_at IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;

CREATE TRIGGER users_block_deleted_tenant_last_tenant_id_update
BEFORE UPDATE ON users
WHEN NEW.last_tenant_id IS NOT NULL AND (
  EXISTS (SELECT 1 FROM tenants WHERE tenant_id = NEW.last_tenant_id AND deleted_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM data_deletions WHERE tenant_id = NEW.last_tenant_id
    AND scope = 'tenant' AND done_at IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_DELETION_PENDING');
END;
