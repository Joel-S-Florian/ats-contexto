-- CreateEnum
CREATE TYPE "ScreeningMode" AS ENUM ('rules', 'ai');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "ai_monthly_quota" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "screening_mode" "ScreeningMode" NOT NULL DEFAULT 'rules';

-- CreateTable
CREATE TABLE "screening_results" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "vacancy_id" UUID NOT NULL,
    "mode" "ScreeningMode" NOT NULL,
    "overall" INTEGER,
    "recommendation" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL DEFAULT '[]',
    "matched" JSONB NOT NULL DEFAULT '[]',
    "missing" JSONB NOT NULL DEFAULT '[]',
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "knockout_reasons" JSONB NOT NULL DEFAULT '[]',
    "risk_flags" JSONB NOT NULL DEFAULT '[]',
    "confidence" TEXT,
    "notes" JSONB NOT NULL DEFAULT '[]',
    "provider" TEXT,
    "model" TEXT,
    "prompt_version" TEXT,
    "weights_version" TEXT NOT NULL,
    "input_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cost_micros" INTEGER NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "ai_analyses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "screening_results_tenant_id_application_id_created_at_idx" ON "screening_results"("tenant_id", "application_id", "created_at");

-- CreateIndex
CREATE INDEX "screening_results_tenant_id_vacancy_id_overall_idx" ON "screening_results"("tenant_id", "vacancy_id", "overall");

-- CreateIndex
CREATE INDEX "ai_usage_tenant_id_created_at_idx" ON "ai_usage"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_tenant_id_month_key" ON "usage_counters"("tenant_id", "month");


DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['screening_results','ai_usage','usage_counters'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')
      WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')$p$, t);
  END LOOP;
END $$;
