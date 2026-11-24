# API Contracts (`/api/v1`)

All responses use `{ success: true, data }` or `{ success: false, error: { code, message, details? } }`.

| Endpoint | Method | Auth / Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/v1/health` | GET | Public | Service & mode health check (`phase-3`) |
| `/api/v1/health/ready` | GET | Public | Live PostgreSQL readiness & pool latency |
| `/api/v1/auth/config` | GET | Public | Runtime auth mode & Supabase Auth config |
| `/api/v1/auth/me` | GET | Authenticated | Current user, memberships, followedClubIds |
| `/api/v1/users/me` | GET/PATCH | Authenticated | Retrieve or strictly update profile (`name`, `department`, `yearOfStudy`) |
| `/api/v1/users/me/followed-clubs` | GET | Authenticated | Active followed clubs + `{ count, limit: 2 }` metadata |
| `/api/v1/clubs` | GET/POST | Public / Super Admin | List active clubs (with live follow counts) / create club |
| `/api/v1/clubs/:clubId` | GET/PATCH | Public / Club Admin or Super Admin | Club details (active only for students; team emails redacted) / edit club |
| `/api/v1/clubs/:clubId/status` | PATCH | Super Admin | Update club lifecycle status (`active`, `inactive`, `suspended`, `pending_review`) |
| `/api/v1/memberships/me` | GET | Authenticated | Current user memberships & follows |
| `/api/v1/clubs/:clubId/follow` | POST/DELETE | Authenticated | Follow active club (max 2) or unfollow club |
| `/api/v1/clubs/:clubId/members` | GET/POST | Club Admin / Super Admin | List team / add member (`409` duplicate; Super Admin only for `club_admin`) |
| `/api/v1/clubs/:clubId/members/:membershipId` | PATCH/DELETE | Club Admin / Super Admin | Update title/role/permissions or remove member (Super Admin only for `club_admin`) |
| `/api/v1/hall-of-fame` | GET | Public | Live competition rankings (`1, 2, 2, 4`) across active clubs |
| `/api/v1/events` | GET | Public | Search/filter campus events |
| `/api/v1/clubs/:clubId/events` | POST | `MANAGE_EVENTS` | Create draft club event |
| `/api/v1/events/:eventId/publish` | POST | `MANAGE_EVENTS` | Publish event for registration |
| `/api/v1/events/:eventId/form` | GET/PUT | Public / `MANAGE_FORMS` | Retrieve or update registration form |
| `/api/v1/events/:eventId/registrations` | POST/GET | Auth / `VIEW_REGISTRATIONS` | Submit registration / view roster |
| `/api/v1/registrations/me` | GET | Authenticated | Student registration history & QR |
| `/api/v1/events/:eventId/attendance/scan` | POST | `SCAN_ATTENDANCE` | Single-use QR or manual check-in |
| `/api/v1/events/:eventId/report` | POST/GET | `SUBMIT_EVENT_REPORTS` | Submit or view completion report |
| `/api/v1/events/:eventId/finance-report` | POST/GET | `SUBMIT_FINANCE_REPORTS` | Submit or view private financial ledger |
| `/api/v1/admin/memberships` | GET | Super Admin | Institutional cross-club leadership directory |
| `/api/v1/admin/*` | GET/PATCH | Super Admin | Oversight dashboard, clubs (filterable by `?status=`), users, finance, logs |
