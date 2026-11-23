# Testing Strategy

- **Backend Integration (`tests/backend/api.test.ts`)**: Vitest + Supertest verifying auth boundaries, 2-club limit, Hall of Fame tie ranking, Club Admin/Core Member scopes, financial privacy (`403` for students), non-PII QR generation, and single-use attendance duplicate rejection (`409`).
- **Frontend Unit/Component (`tests/frontend/campusverse.test.tsx`)**: Vitest + React Testing Library verifying landing page contract and Hall of Fame tie display.
- **End-to-End (`tests/e2e/campusverse.spec.ts`)**: Playwright suite testing all 4 roles, 2-club follow + 3rd rejected, event creation/publishing, QR scan simulation, and report submission.
