-- CreateEnum
CREATE TYPE "RejectionNotice" AS ENUM ('manual', 'auto_delay', 'none');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('onsite', 'virtual');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('scheduled', 'cancelled', 'completed');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "rejection_delay_hours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "rejection_notice" "RejectionNotice" NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID,
    "to_email" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_emails" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "template_key" TEXT NOT NULL,
    "send_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "scheduled_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 45,
    "mode" "InterviewMode" NOT NULL,
    "location" TEXT,
    "meeting_url" TEXT,
    "platform" TEXT,
    "participant_ids" TEXT[],
    "message_to_candidate" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'scheduled',
    "calendar_event_id" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_tenant_id_key_key" ON "email_templates"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "email_logs_tenant_id_application_id_created_at_idx" ON "email_logs"("tenant_id", "application_id", "created_at");

-- CreateIndex
CREATE INDEX "scheduled_emails_send_at_idx" ON "scheduled_emails"("send_at");

-- CreateIndex
CREATE INDEX "scheduled_emails_tenant_id_application_id_idx" ON "scheduled_emails"("tenant_id", "application_id");

-- CreateIndex
CREATE INDEX "interviews_tenant_id_application_id_idx" ON "interviews"("tenant_id", "application_id");

-- CreateIndex
CREATE INDEX "interviews_tenant_id_scheduled_at_idx" ON "interviews"("tenant_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "communications_tenant_id_application_id_created_at_idx" ON "communications"("tenant_id", "application_id", "created_at");


DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['email_templates','email_logs','scheduled_emails','interviews','communications'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')
      WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')$p$, t);
  END LOOP;
END $$;
