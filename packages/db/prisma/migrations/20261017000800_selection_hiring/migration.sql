-- CreateEnum
CREATE TYPE "SelectionStance" AS ENUM ('favor', 'against', 'neutral');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'success', 'failed');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "auto_confirm_hire" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vacancies" ADD COLUMN     "auto_select" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "selection_comments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "stance" "SelectionStance" NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selection_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selection_decisions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "decided_by" UUID,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selection_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hires" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "vacancy_id" UUID,
    "hired_by" UUID,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "start_date" TIMESTAMP(3),
    "hired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "hires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "secret_enc" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMP(3),

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "endpoint_id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_status" INTEGER,
    "last_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "selection_comments_tenant_id_application_id_idx" ON "selection_comments"("tenant_id", "application_id");

-- CreateIndex
CREATE INDEX "selection_decisions_tenant_id_application_id_idx" ON "selection_decisions"("tenant_id", "application_id");

-- CreateIndex
CREATE UNIQUE INDEX "hires_application_id_key" ON "hires"("application_id");

-- CreateIndex
CREATE INDEX "hires_tenant_id_hired_at_idx" ON "hires"("tenant_id", "hired_at");

-- CreateIndex
CREATE INDEX "webhook_endpoints_tenant_id_idx" ON "webhook_endpoints"("tenant_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_next_attempt_at_idx" ON "webhook_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_tenant_id_endpoint_id_created_at_idx" ON "webhook_deliveries"("tenant_id", "endpoint_id", "created_at");


DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['selection_comments','selection_decisions','hires','webhook_endpoints','webhook_deliveries'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')
      WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')$p$, t);
  END LOOP;
END $$;
