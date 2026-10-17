# Plataforma de Reclutamiento (ATS SaaS)

Contexto de producto en `CLAUDE.md` y `docs/`.

## Arranque

```
pnpm install
cp .env.example .env     # ajusta los valores
docker compose up -d     # Postgres, Redis, MinIO, Mailpit (requiere Docker)
pnpm dev                 # api :4000, web :3000, demo-site :3100, landing :3200
pnpm lint && pnpm typecheck && pnpm test
```

Sin Docker: apunta `DATABASE_URL` y `REDIS_URL` a instancias locales. `GET /health` reporta `503` si no responden.
