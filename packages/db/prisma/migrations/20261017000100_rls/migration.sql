-- Row Level Security: defensa en profundidad (regla no negociable 1).
-- Cada transaccion fija app.tenant_id; el camino de plataforma fija app.platform = 'on' (auditado en codigo).
-- FORCE aplica las politicas tambien al duenio de la tabla; los superusuarios de Postgres las ignoran,
-- por eso la aplicacion debe conectarse con un rol sin SUPERUSER ni BYPASSRLS.

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON memberships
  USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on');

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invitations
  USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on');

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on');

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants
  USING (id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')
  WITH CHECK (id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on');
