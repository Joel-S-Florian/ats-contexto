-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('multiple_choice', 'true_false', 'short_answer');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('invited', 'in_progress', 'submitted', 'expired');

-- CreateTable
CREATE TABLE "assessment_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "time_limit_min" INTEGER NOT NULL,
    "passing_score" INTEGER NOT NULL DEFAULT 60,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_modules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "assessment_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "correct_answer" JSONB,
    "points" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_attempts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'invited',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "deadline_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "timed_out" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" JSONB,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "auto_points" INTEGER,
    "manual_points" JSONB NOT NULL DEFAULT '{}',
    "total_points" INTEGER,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "final_score" INTEGER,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_assessment_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "evaluators" TEXT[],
    "result" TEXT NOT NULL,
    "score" INTEGER,
    "observations" TEXT NOT NULL DEFAULT '',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_assessment_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessment_templates_tenant_id_idx" ON "assessment_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "assessment_modules_tenant_id_template_id_idx" ON "assessment_modules"("tenant_id", "template_id");

-- CreateIndex
CREATE INDEX "questions_tenant_id_module_id_idx" ON "questions"("tenant_id", "module_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_attempts_token_hash_key" ON "assessment_attempts"("token_hash");

-- CreateIndex
CREATE INDEX "assessment_attempts_tenant_id_application_id_idx" ON "assessment_attempts"("tenant_id", "application_id");

-- CreateIndex
CREATE INDEX "external_assessment_records_tenant_id_application_id_idx" ON "external_assessment_records"("tenant_id", "application_id");

-- AddForeignKey
ALTER TABLE "assessment_modules" ADD CONSTRAINT "assessment_modules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "assessment_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "assessment_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;


DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assessment_templates','assessment_modules','questions','assessment_attempts','external_assessment_records'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')
      WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')$p$, t);
  END LOOP;
END $$;
