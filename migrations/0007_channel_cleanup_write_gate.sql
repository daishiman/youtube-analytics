-- 予約の前後で取込の世代を変える。予約がすぐ完了しても古いアップロードは戻さない。
ALTER TABLE tenants ADD COLUMN import_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE data_deletions ADD COLUMN lease_token TEXT;
ALTER TABLE data_deletions ADD COLUMN lease_until TEXT;
ALTER TABLE data_deletions ADD COLUMN target_generation INTEGER;
ALTER TABLE data_deletions ADD COLUMN last_swept_at TEXT;
ALTER TABLE data_deletions ADD COLUMN sweep_cursor TEXT;

-- この migration より前に作られた未完了予約は、旧世代0を削除対象にする。
-- 再連携後の新規原本が世代0へ入ると後続sweepに巻き込まれるため、
-- 該当テナントの現在世代を1へ進めてから consumer を有効にする。
-- 既に完了した過去予約は旧原本の範囲を確定できないので target_generation を NULL のまま残す。
UPDATE data_deletions SET target_generation = 0
 WHERE scope IN ('channel', 'tenant') AND done_at IS NULL;
UPDATE tenants SET import_generation = 1
 WHERE EXISTS (
   SELECT 1 FROM data_deletions
    WHERE tenant_id = tenants.tenant_id
      AND scope IN ('channel', 'tenant')
 );

CREATE TRIGGER data_deletions_advance_import_generation
AFTER INSERT ON data_deletions
WHEN NEW.scope IN ('channel', 'tenant')
BEGIN
  UPDATE data_deletions
     SET target_generation = (SELECT import_generation FROM tenants WHERE tenant_id = NEW.tenant_id)
   WHERE deletion_id = NEW.deletion_id;
  UPDATE tenants SET import_generation = import_generation + 1 WHERE tenant_id = NEW.tenant_id;
END;

-- R2.put と D1 本体への登録の間、削除側が活動中のアップロードを見失わないための台帳。
CREATE TABLE import_uploads (
  tenant_id  TEXT NOT NULL REFERENCES tenants (tenant_id),
  import_id  TEXT NOT NULL,
  r2_key     TEXT NOT NULL,
  started_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, import_id)
);
CREATE INDEX idx_import_uploads_tenant_started ON import_uploads (tenant_id, started_at);

CREATE TRIGGER import_uploads_block_pending_deletion
BEFORE INSERT ON import_uploads
WHEN EXISTS (
  SELECT 1 FROM data_deletions
   WHERE tenant_id = NEW.tenant_id
     AND scope IN ('channel', 'tenant')
     AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'IMPORT_DELETION_PENDING');
END;

-- 削除予約から完了まで、新たな取込履歴をテナントへ追加させない。
CREATE TRIGGER imports_block_pending_deletion
BEFORE INSERT ON imports
WHEN EXISTS (
  SELECT 1 FROM data_deletions
   WHERE tenant_id = NEW.tenant_id
     AND scope IN ('channel', 'tenant')
     AND done_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'IMPORT_DELETION_PENDING');
END;
