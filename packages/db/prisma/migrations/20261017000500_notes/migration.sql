-- CreateTable
CREATE TABLE "application_notes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_notes_tenant_id_application_id_created_at_idx" ON "application_notes"("tenant_id", "application_id", "created_at");

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE application_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON application_notes
  USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on');
