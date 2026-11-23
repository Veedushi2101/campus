# API Contracts (`/api/v1`)

All responses use `{ success: true, data }` or `{ success: false, error: { code, message, details? } }`.

| Endpoint | Method | Auth / Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/v1/health` | GET | Public | Service & mode health check |
| `/api/v1/auth/demo-login` | POST | Public (Dev only) | Issue signed sandbox session token |
| `/api/v1/auth/me` | GET | Authenticated | Current user, memberships, follows |
| `/api/v1/users/me` | GET/PATCH | Authenticated | Retrieve or update student profile |
| `/api/v1/clubs` | GET | Public | List active clubs with filters/sort |
| `/api/v1/clubs/:clubId` | GET/PATCH | Public / Club Admin | Club details / edit club profile |
| `/api/v1/memberships/me` | GET | Authenticated | Current user memberships & follows |
| `/api/v1/clubs/:clubId/follow` | POST/DELETE | Authenticated | Follow (max 2) or unfollow club |
| `/api/v1/clubs/:clubId/members` | GET/POST | Club Admin | List or add club officers |
| `/api/v1/hall-of-fame` | GET | Public | Club rankings with tie-handling |
| `/api/v1/events` | GET | Public | Search/filter campus events |
| `/api/v1/clubs/:clubId/events` | POST | `MANAGE_EVENTS` | Create draft club event |
| `/api/v1/events/:eventId/publish` | POST | `MANAGE_EVENTS` | Publish event for registration |
| `/api/v1/events/:eventId/form` | GET/PUT | Public / `MANAGE_FORMS` | Retrieve or update registration form |
| `/api/v1/events/:eventId/registrations` | POST/GET | Auth / `VIEW_REGISTRATIONS` | Submit registration / view roster |
| `/api/v1/registrations/me` | GET | Authenticated | Student registration history & QR |
| `/api/v1/events/:eventId/attendance/scan` | POST | `SCAN_ATTENDANCE` | Single-use QR or manual check-in |
| `/api/v1/events/:eventId/report` | POST/GET | `SUBMIT_EVENT_REPORTS` | Submit or view completion report |
| `/api/v1/events/:eventId/finance-report` | POST/GET | `SUBMIT_FINANCE_REPORTS` | Submit or view private financial ledger |
| `/api/v1/admin/*` | GET/PATCH | Super Admin | Oversight dashboard, clubs, users, finance, logs |
