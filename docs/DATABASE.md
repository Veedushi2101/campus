# Database Architecture (PostgreSQL + Drizzle ORM + RLS)

CampusVerse uses **17 normalized PostgreSQL tables** defined in `server/db/schema.ts` with UUID primary keys, explicit foreign keys (`ON DELETE CASCADE` / `SET NULL`), check constraints, unique indexes, and B-Tree query indexes.

## 17-Table Schema Inventory

1. `users` — Institutional user accounts linked 1:1 to Supabase Auth (`auth_user_id`), normalized email, global role (`user` | `super_admin`), status, and verification timestamp.
2. `clubs` — Student organizations with unique `slug`, category, status (`pending` | `pending_review` | `active` | `suspended`), and trigger-maintained `follower_count`.
3. `club_memberships` — Non-mutually-exclusive per-club leadership (`club_admin` | `core_member`) and JSONB delegated permissions.
4. `club_follows` — Student follow edges (`UNIQUE(user_id, club_id)`); capped at 2 clubs per student using a pessimistic `FOR UPDATE` row lock on `users`.
5. `events` — Club-hosted events with venue, schedule checks (`ends_at > starts_at`), capacity (`> 0`), fixed-point `numeric(10,2)` fee, and trigger-maintained `registered_count`.
6. `event_forms` — Versioned registration form container per event (`UNIQUE(event_id)`).
7. `form_fields` — Ordered fields per form (`UNIQUE(form_id, field_key)`).
8. `registrations` — Student event registrations (`UNIQUE(event_id, user_id)`) storing form answers, status (`confirmed` | `waitlisted` | `cancelled` | `attended`), opaque `qr_token`, and SHA-256 `qr_token_hash`.
9. `attendance_records` — Single-entry check-in ledger (`UNIQUE(registration_id)`) guaranteeing zero duplicate check-ins at database level.
10. `event_reports` — Post-event outcomes (`UNIQUE(event_id)`).
11. `finance_reports` — Event financial summaries (`UNIQUE(event_id)`) using fixed-point `numeric(12,2)` totals.
12. `finance_line_items` — Collections and expenses linked to `finance_reports`.
13. `notifications` — User notification inbox indexed on `(user_id, is_read, created_at)`.
14. `audit_logs` — Append-only governance & operational trail (`SELECT, INSERT` only for `campusverse_app`).
15. `system_settings` — Institutional configuration (`campusverse_config`).
16. `hall_of_fame_snapshots` — Historical leaderboard ranking snapshots.
17. `auth_sessions` — Session audit metadata (`user_id`, `user_agent`, `last_seen_at`).

## Privilege Separation & Row-Level Security

- **Migration Role (`DATABASE_MIGRATION_URL`)**: Used exclusively by `drizzle-kit`, `server/db/applyRls.ts`, `server/db/seed.ts`, and `server/db/status.ts`.
- **Runtime Role (`campusverse_app` via `DATABASE_URL`)**: Configured with `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, `NOBYPASSRLS`, `NOREPLICATION`. Granted `SELECT, INSERT` only on `audit_logs` (no `UPDATE`/`DELETE`/`TRUNCATE`).
- **Transaction-Scoped Identity**: Every `withRlsTransaction` call executes parameterized `set_config('app.current_user_id', ..., true)` and `set_config('app.current_global_role', ..., true)` so identity never leaks across pooled Supavisor connections (`prepare: false`).

## Concurrency & Integrity Guarantees

- **2-Club Follow Limit**: Locks `users` row `FOR UPDATE`, verifies `COUNT(*) < 2`, inserts into `club_follows`; trigger `sync_club_follower_count` (`SECURITY DEFINER`) updates `clubs.follower_count`.
- **Capacity & Waitlist Ordering**: Locks `events` row `FOR UPDATE`, counts `confirmed` + `attended` registrations, assigns `confirmed` or `waitlisted`; trigger `sync_event_registered_count` updates `events.registered_count`.
- **Single-Use QR Attendance**: Locks `registrations` row `FOR UPDATE`, checks `attendance_records`, and relies on `UNIQUE(registration_id)` so concurrent gate scans yield `201` for the first scan and `409 Conflict` for any duplicate scan.
