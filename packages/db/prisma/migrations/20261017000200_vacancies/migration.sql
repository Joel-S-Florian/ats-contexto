-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('draft', 'published', 'paused', 'closed');

-- CreateEnum
CREATE TYPE "JobCategory" AS ENUM ('general', 'technical', 'operational', 'administrative', 'managerial', 'junior');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('internship', 'junior', 'semi_senior', 'senior', 'managerial');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('full_time', 'part_time', 'contract', 'temporary', 'internship');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('onsite', 'hybrid', 'remote');

-- CreateEnum
CREATE TYPE "SkillKind" AS ENUM ('required', 'desirable');

-- CreateEnum
CREATE TYPE "StageType" AS ENUM ('screening', 'interview', 'assessment', 'selection', 'hiring', 'custom');

-- CreateTable
CREATE TABLE "pipelines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StageType" NOT NULL,
    "position" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "transition" JSONB NOT NULL DEFAULT '{"mode":"manual"}',

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacancies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "responsibilities" TEXT NOT NULL DEFAULT '',
    "benefits" TEXT NOT NULL DEFAULT '',
    "requirements_required" TEXT NOT NULL DEFAULT '',
    "requirements_desirable" TEXT NOT NULL DEFAULT '',
    "category" "JobCategory" NOT NULL DEFAULT 'general',
    "level" "ExperienceLevel" NOT NULL,
    "min_years" INTEGER NOT NULL DEFAULT 0,
    "min_education" TEXT,
    "languages" TEXT[],
    "employment_type" "EmploymentType" NOT NULL,
    "work_mode" "WorkMode" NOT NULL,
    "province" TEXT NOT NULL,
    "municipality" TEXT,
    "salary_min" INTEGER,
    "salary_max" INTEGER,
    "show_salary" BOOLEAN NOT NULL DEFAULT false,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "status" "VacancyStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "closes_at" TIMESTAMP(3),
    "pipeline_id" UUID NOT NULL,
    "owner_id" UUID,
    "knockout_rules" JSONB NOT NULL DEFAULT '[]',
    "scoring_overrides" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacancy_skills" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "vacancy_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SkillKind" NOT NULL,

    CONSTRAINT "vacancy_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacancy_evaluators" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "vacancy_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "vacancy_evaluators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipelines_tenant_id_idx" ON "pipelines"("tenant_id");

-- CreateIndex
CREATE INDEX "pipeline_stages_tenant_id_idx" ON "pipeline_stages"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_pipeline_id_position_key" ON "pipeline_stages"("pipeline_id", "position");

-- CreateIndex
CREATE INDEX "vacancies_tenant_id_status_idx" ON "vacancies"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "vacancy_skills_tenant_id_idx" ON "vacancy_skills"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "vacancy_skills_vacancy_id_name_key" ON "vacancy_skills"("vacancy_id", "name");

-- CreateIndex
CREATE INDEX "vacancy_evaluators_tenant_id_idx" ON "vacancy_evaluators"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "vacancy_evaluators_vacancy_id_user_id_key" ON "vacancy_evaluators"("vacancy_id", "user_id");

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacancy_skills" ADD CONSTRAINT "vacancy_skills_vacancy_id_fkey" FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacancy_evaluators" ADD CONSTRAINT "vacancy_evaluators_vacancy_id_fkey" FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS para las tablas de negocio nuevas (ver migracion 20261017000100_rls).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pipelines','pipeline_stages','vacancies','vacancy_skills','vacancy_evaluators'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')
      WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')$p$, t);
  END LOOP;
END $$;
