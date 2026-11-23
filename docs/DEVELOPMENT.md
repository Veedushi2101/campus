# Development Guide

## Environment Setup

Configure environment variables in **AI Studio Secrets** (or local `.env` — never commit real secrets to git or `.env.example`):

- `SUPABASE_URL` & `VITE_SUPABASE_URL`: Your Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Your Supabase publishable/anon key (client Auth only).
- `DATABASE_MIGRATION_URL`: Privileged Postgres Session Pooler URL (`postgres` role, port `5432`) used **only** by migration/RLS/seed scripts.
- `DATABASE_URL`: Restricted runtime Postgres URL using the `campusverse_app` role (`NOSUPERUSER`, `NOBYPASSRLS`).
- `INSTITUTIONAL_EMAIL_DOMAINS`: Comma-separated allowed campus domains (e.g., `vitbhopal.ac.in`).
- `SUPER_ADMIN_BOOTSTRAP_EMAILS`: Comma-separated emails eligible for initial Super Admin bootstrap.

## Database Lifecycle Commands

```bash
npm run db:generate   # Generate Drizzle SQL migrations into drizzle/
npm run db:migrate    # Apply SQL migrations to Supabase PostgreSQL
npm run db:rls        # Apply triggers, RLS policies, and campusverse_app grants
npm run db:seed       # Seed idempotent clubs, published events, forms, and settings
npm run db:status     # Verify migration state, row counts, RLS flags, and runtime role
```

## Running & Testing

```bash
npm run dev           # Starts Express + Vite middleware on http://localhost:3000
npm run lint          # TypeScript typechecking (tsc --noEmit)
npm test              # Runs unit, frontend, and live PostgreSQL integration tests
npm run test:e2e      # Runs Playwright browser E2E tests
```
