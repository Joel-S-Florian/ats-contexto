# Plataforma de Reclutamiento (ATS SaaS)

Contexto de producto en `CLAUDE.md` y `docs/`.

## Arranque

```
pnpm install
cp .env.example .env     # ajusta los valores
docker compose up -d     # Postgres, Redis, MinIO, Mailpit (requiere Docker)
pnpm db:dev              # alternativa sin Docker: Postgres embebido en :5433 con datos de ejemplo
pnpm dev                 # api :4000, web :3000, demo-site :3100, landing :3200
pnpm lint && pnpm typecheck && pnpm test
```

Sin Docker: apunta `DATABASE_URL` y `REDIS_URL` a instancias locales. `GET /health` reporta `503` si no responden.

Con `pnpm db:dev` activo, usa `DATABASE_URL=postgresql://ats_app:ats_app@localhost:5433/ats` en `.env`.
Usuarios de ejemplo (contraseña `demo-demo-1234`): `root@demo.test` (operador), `admin@demo.test`, `recruiter@demo.test`, `area_manager@demo.test`; segundo tenant: `*@norte.test`.
