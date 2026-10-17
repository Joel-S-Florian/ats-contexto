-- CreateEnum
CREATE TYPE "ApiKeyKind" AS ENUM ('public', 'secret');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('received', 'screening', 'shortlisted', 'in_review', 'low_fit', 'knocked_out', 'interview', 'assessment', 'selection', 'selected', 'not_selected', 'on_hold', 'hired', 'withdrawn');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('pending', 'extracting', 'ready', 'unreadable', 'failed');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('pending', 'clean', 'infected');

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" "ApiKeyKind" NOT NULL,
    "label" TEXT NOT NULL,
    "public_key" TEXT,
    "secret_hash" TEXT,
    "allowed_origins" TEXT[],
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "education_level" TEXT NOT NULL,
    "years_experience" INTEGER NOT NULL,
    "skills" TEXT[],
    "languages" TEXT[],
    "preferred_mode" "WorkMode",
    "availability" TEXT,
    "portfolio_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "vacancy_id" UUID,
    "tracking_id" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'received',
    "processing" "ProcessingStatus" NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'widget',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_stage_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "from_status" "ApplicationStatus",
    "to_status" "ApplicationStatus" NOT NULL,
    "actor_id" UUID,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'pending',
    "extracted_text" TEXT,
    "extract_status" "ProcessingStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "notice_version" TEXT NOT NULL,
    "ip_truncated" TEXT,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_public_key_key" ON "api_keys"("public_key");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_secret_hash_key" ON "api_keys"("secret_hash");

-- CreateIndex
CREATE INDEX "api_keys_tenant_id_idx" ON "api_keys"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_tenant_id_email_key" ON "candidates"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "applications_tracking_id_key" ON "applications"("tracking_id");

-- CreateIndex
CREATE INDEX "applications_tenant_id_vacancy_id_idx" ON "applications"("tenant_id", "vacancy_id");

-- CreateIndex
CREATE INDEX "applications_tenant_id_candidate_id_idx" ON "applications"("tenant_id", "candidate_id");

-- CreateIndex
CREATE INDEX "application_stage_history_tenant_id_application_id_idx" ON "application_stage_history"("tenant_id", "application_id");

-- CreateIndex
CREATE INDEX "documents_tenant_id_application_id_idx" ON "documents"("tenant_id", "application_id");

-- CreateIndex
CREATE INDEX "consent_records_tenant_id_candidate_id_idx" ON "consent_records"("tenant_id", "candidate_id");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS para las tablas nuevas (ver 20261017000100_rls). Las claves publicas se consultan por el camino de plataforma
-- (se resuelve el tenant a partir de la clave), asi que api_keys tambien lleva politica.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['api_keys','candidates','applications','application_stage_history','documents','consent_records'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')
      WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')$p$, t);
  END LOOP;
END $$;
