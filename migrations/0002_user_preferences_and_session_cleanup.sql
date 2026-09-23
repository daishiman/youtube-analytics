-- 永続的な利用者選好をsession寿命から分離し、期限切れsessionのbounded cleanupを支える。
ALTER TABLE users ADD COLUMN last_tenant_id TEXT REFERENCES tenants (tenant_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);
