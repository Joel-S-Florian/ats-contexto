-- CreateEnum
CREATE TYPE "PlanKey" AS ENUM ('essential', 'professional', 'enterprise');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'past_due', 'canceled');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "plan_key" "PlanKey" NOT NULL DEFAULT 'essential',
ADD COLUMN     "retention_months" INTEGER NOT NULL DEFAULT 12;

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "anonymized_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "usage_counters" ADD COLUMN     "alerts_sent" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "applications" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_key" "PlanKey" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extra_ai_analyses" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "assigned_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_versions" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenant_id_key" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "notice_versions_label_key" ON "notice_versions"("label");


-- subscriptions lleva tenant_id: mismo aislamiento por tenant. notice_versions es de plataforma (sin RLS; solo el super admin escribe desde la API).
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subscriptions
  USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on');
