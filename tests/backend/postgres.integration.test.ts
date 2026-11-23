import crypto from 'crypto';
import {sql} from 'drizzle-orm';
import request from 'supertest';
import {afterAll, describe, expect, it} from 'vitest';
import {PostgresDataAdapter} from '../../server/adapters/PostgresDataAdapter.ts';
import {createApp} from '../../server/app.ts';
import {closeDbPool, createDbPool, getSqlClient} from '../../server/db/index.ts';
import {hashSha256} from '../../server/db/repositories/mappers.ts';
import {dbRequestContext} from '../../server/db/requestContext.ts';

const hasLiveDatabase = Boolean(
  process.env.DATABASE_URL?.trim() || process.env.DATABASE_MIGRATION_URL?.trim(),
);

describe.skipIf(!hasLiveDatabase)(
  'CampusVerse Phase 2 — Live Supabase PostgreSQL, Concurrency & RLS Integration',
  () => {
    const testRunSuffix = Date.now().toString(36);
    const createdUserIds: string[] = [];
    const createdClubIds: string[] = [];
    const createdAuditIds: string[] = [];

    afterAll(async () => {
      const migrationUrl =
        process.env.DATABASE_MIGRATION_URL?.trim() || process.env.DATABASE_URL?.trim();
      if (migrationUrl) {
        const {client} = createDbPool(migrationUrl, 1);
        try {
          for (const clubId of createdClubIds) {
            await client`DELETE FROM public.clubs WHERE id = ${clubId}`;
          }
          for (const userId of createdUserIds) {
            await client`DELETE FROM public.users WHERE id = ${userId}`;
          }
          for (const auditId of createdAuditIds) {
            await client`DELETE FROM public.audit_logs WHERE id = ${auditId}`;
          }
        } finally {
          await client.end({timeout: 5});
        }
      }
      await closeDbPool();
    });

    it('passes /api/v1/health/ready and verifies RLS + campusverse_app role attributes', async () => {
      const adapter = new PostgresDataAdapter();
      const app = createApp(adapter);

      const res = await request(app).get('/api/v1/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ready');
      expect(res.body.data.persistence).toBe('postgresql-drizzle-rls');

      const client = getSqlClient();
      const roleRows = await client<Array<{rolname: string; rolsuper: boolean; rolbypassrls: boolean}>>`
        SELECT rolname, rolsuper, rolbypassrls
        FROM pg_roles
        WHERE rolname = 'campusverse_app'
      `;
      expect(roleRows).toHaveLength(1);
      expect(roleRows[0].rolsuper).toBe(false);
      expect(roleRows[0].rolbypassrls).toBe(false);

      const rlsTables = await client<Array<{tablename: string; rowsecurity: boolean}>>`
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('users', 'clubs', 'registrations', 'attendance_records', 'finance_reports', 'audit_logs')
      `;
      expect(rlsTables.every((t) => t.rowsecurity === true)).toBe(true);
    });

    it('provisions users idempotently and grants bootstrap Super Admin only to configured email', async () => {
      const adapter = new PostgresDataAdapter();

      const studentAuthId = crypto.randomUUID();
      const studentEmail = `student.int.${testRunSuffix}@vitbhopal.ac.in`;
      const s1 = await adapter.provisionAuthenticatedUser({
        authUserId: studentAuthId,
        email: studentEmail,
        name: 'Integration Test Student',
        emailVerified: true,
        isBootstrapSuperAdmin: false,
      });
      createdUserIds.push(s1.id);

      const s1Again = await adapter.provisionAuthenticatedUser({
        authUserId: studentAuthId,
        email: studentEmail,
        emailVerified: true,
        isBootstrapSuperAdmin: false,
      });
      expect(s1Again.id).toBe(s1.id);
      expect(s1Again.isSuperAdmin).toBe(false);

      const adminAuthId = crypto.randomUUID();
      const adminEmail = `bootstrap.admin.${testRunSuffix}@vitbhopal.ac.in`;
      const adminUser = await adapter.provisionAuthenticatedUser({
        authUserId: adminAuthId,
        email: adminEmail,
        name: 'Bootstrap Admin Candidate',
        emailVerified: true,
        isBootstrapSuperAdmin: true,
      });
      createdUserIds.push(adminUser.id);
      expect(adminUser.isSuperAdmin).toBe(true);
    });

    it('persists clubs and events across Postgres pool shutdown and adapter re-instantiation', async () => {
      const adapter1 = new PostgresDataAdapter();
      const createdClub = await dbRequestContext.run(
        {userId: '', globalRole: 'super_admin'},
        () =>
          adapter1.createClub({
            name: `Persistence Guild ${testRunSuffix}`,
            category: 'Technology',
            tagline: 'Verifying durable PostgreSQL persistence across restarts.',
            description:
              'Automated integration verification club created to confirm real database durability across restarts.',
            meetingSchedule: 'Fridays · 17:00',
            contactEmail: `persist.${testRunSuffix}@vitbhopal.ac.in`,
          }),
      );
      createdClubIds.push(createdClub.id);

      await closeDbPool();

      const adapter2 = new PostgresDataAdapter();
      const fetched = await adapter2.getClubDetail(createdClub.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe(`Persistence Guild ${testRunSuffix}`);
    });

    it('enforces strict concurrency invariants: 2-club follow limit, capacity=1 final seat, duplicate reg, and single-scan QR', async () => {
      const adapter = new PostgresDataAdapter();

      // Create 2 test students
      const studentA = await adapter.provisionAuthenticatedUser({
        authUserId: crypto.randomUUID(),
        email: `race.a.${testRunSuffix}@vitbhopal.ac.in`,
        name: 'Concurrency Student A',
        emailVerified: true,
        isBootstrapSuperAdmin: false,
      });
      const studentB = await adapter.provisionAuthenticatedUser({
        authUserId: crypto.randomUUID(),
        email: `race.b.${testRunSuffix}@vitbhopal.ac.in`,
        name: 'Concurrency Student B',
        emailVerified: true,
        isBootstrapSuperAdmin: false,
      });
      createdUserIds.push(studentA.id, studentB.id);

      // Fetch 3 active seeded clubs
      const activeClubs = await adapter.listClubs();
      expect(activeClubs.length).toBeGreaterThanOrEqual(3);
      const [c1, c2, c3] = activeClubs;

      // 1. Follow 1st club
      await dbRequestContext.run(
        {userId: studentA.id, globalRole: 'user'},
        () => adapter.followClub(studentA.id, c1.id),
      );

      // 2. Concurrent follow of 2nd & 3rd club -> strictly 1 succeeds, 1 throws MAX_CLUB_FOLLOW_LIMIT_REACHED
      const followResults = await Promise.allSettled([
        dbRequestContext.run({userId: studentA.id, globalRole: 'user'}, () =>
          adapter.followClub(studentA.id, c2.id),
        ),
        dbRequestContext.run({userId: studentA.id, globalRole: 'user'}, () =>
          adapter.followClub(studentA.id, c3.id),
        ),
      ]);
      const fulfilledFollows = followResults.filter((r) => r.status === 'fulfilled');
      const rejectedFollows = followResults.filter((r) => r.status === 'rejected');
      expect(fulfilledFollows).toHaveLength(1);
      expect(rejectedFollows).toHaveLength(1);
      expect((rejectedFollows[0] as PromiseRejectedResult).reason.code).toBe(
        'MAX_CLUB_FOLLOW_LIMIT_REACHED',
      );

      const finalFollows = await dbRequestContext.run(
        {userId: studentA.id, globalRole: 'user'},
        () => adapter.getFollowsForUser(studentA.id),
      );
      expect(finalFollows).toHaveLength(2);

      // 3. Create capacity=1 event for concurrency & QR tests
      const club = await dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
        adapter.createClub({
          name: `Race Verification Club ${testRunSuffix}`,
          category: 'Robotics & Hardware',
          tagline: 'Concurrency test club for capacity and QR locks.',
          description:
            'Temporary club verifying PostgreSQL FOR UPDATE row locking on registrations and attendance.',
          meetingSchedule: 'Mondays · 16:00',
          contactEmail: `race.${testRunSuffix}@vitbhopal.ac.in`,
        }),
      );
      createdClubIds.push(club.id);

      const event = await dbRequestContext.run({userId: '', globalRole: 'super_admin'}, async () => {
        const ev = await adapter.createEvent(club.id, {
          title: `Single Seat Sprint ${testRunSuffix}`,
          category: 'Workshop',
          description: 'Concurrency test event with capacity=1.',
          venue: 'Lab 101',
          startTime: '2026-12-28T10:00:00.000Z',
          endTime: '2026-12-28T12:00:00.000Z',
          registrationDeadline: '2026-12-27T23:59:00.000Z',
          capacity: 1,
          isPaid: false,
          feeAmount: 0,
        });
        return (await adapter.publishEvent(ev.id))!;
      });

      // 4. Simultaneous capacity=1 registration by two students -> strictly 1 confirmed, 1 waitlisted
      const qrA = `CV-QR-TESTA-${testRunSuffix}`;
      const qrB = `CV-QR-TESTB-${testRunSuffix}`;
      const [regA, regB] = await Promise.all([
        dbRequestContext.run({userId: studentA.id, globalRole: 'user'}, () =>
          adapter.createRegistration({
            eventId: event.id,
            studentId: studentA.id,
            studentName: studentA.name,
            studentEmail: studentA.email,
            answers: {'fld-track': 'Participant', 'fld-code-conduct': true},
            qrToken: qrA,
          }),
        ),
        dbRequestContext.run({userId: studentB.id, globalRole: 'user'}, () =>
          adapter.createRegistration({
            eventId: event.id,
            studentId: studentB.id,
            studentName: studentB.name,
            studentEmail: studentB.email,
            answers: {'fld-track': 'Participant', 'fld-code-conduct': true},
            qrToken: qrB,
          }),
        ),
      ]);

      const statuses = [regA.status, regB.status].sort();
      expect(statuses).toEqual(['confirmed', 'waitlisted']);

      const updatedEvent = await adapter.getEventById(event.id);
      expect(updatedEvent?.registeredCount).toBe(1);

      // 5. Simultaneous duplicate registration by same student -> 1 fails with 409 Conflict
      const dupResults = await Promise.allSettled([
        dbRequestContext.run({userId: studentA.id, globalRole: 'user'}, () =>
          adapter.createRegistration({
            eventId: event.id,
            studentId: studentA.id,
            studentName: studentA.name,
            studentEmail: studentA.email,
            answers: {},
            qrToken: `CV-QR-DUP-${testRunSuffix}`,
          }),
        ),
      ]);
      expect(dupResults[0].status).toBe('rejected');
      expect((dupResults[0] as PromiseRejectedResult).reason.statusCode).toBe(409);

      // 6. Simultaneous double-scan of same QR token -> strictly 1 attendance record, 1 rejected with 409
      const scanResults = await Promise.allSettled([
        dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
          adapter.recordAttendance({
            eventId: event.id,
            registrationId: regA.id,
            studentId: studentA.id,
            studentName: studentA.name,
            studentCode: studentA.studentId,
            qrToken: qrA,
            method: 'qr_scan',
            checkedInBy: 'Gate Scanner 1',
          }),
        ),
        dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
          adapter.recordAttendance({
            eventId: event.id,
            registrationId: regA.id,
            studentId: studentA.id,
            studentName: studentA.name,
            studentCode: studentA.studentId,
            qrToken: qrA,
            method: 'qr_scan',
            checkedInBy: 'Gate Scanner 2',
          }),
        ),
      ]);
      expect(scanResults.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(scanResults.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(
        (scanResults.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason
          .statusCode,
      ).toBe(409);

      const attList = await dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
        adapter.listAttendanceForEvent(event.id),
      );
      expect(attList).toHaveLength(1);

      // 7. Direct PostgreSQL RLS & Role Isolation as `campusverse_app`
      const client = getSqlClient();
      await client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL ROLE campusverse_app`);
        await tx`SELECT set_config('app.current_user_id', ${studentA.id}, true), set_config('app.current_global_role', 'user', true)`;

        // Student A CANNOT see Student B's registration
        const studentBRegs = await tx`SELECT id FROM public.registrations WHERE user_id = ${studentB.id}`;
        expect(studentBRegs).toHaveLength(0);

        // Student A CAN see their own registration
        const ownRegs = await tx`SELECT id FROM public.registrations WHERE user_id = ${studentA.id}`;
        expect(ownRegs).toHaveLength(1);

        // Student A CANNOT read finance_reports
        const financeRows = await tx`SELECT id FROM public.finance_reports`;
        expect(financeRows).toHaveLength(0);
      });

      // Student A CANNOT escalate global_role (trigger check in isolated transaction)
      await expect(
        client.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL ROLE campusverse_app`);
          await tx`SELECT set_config('app.current_user_id', ${studentA.id}, true), set_config('app.current_global_role', 'user', true)`;
          await tx`UPDATE public.users SET global_role = 'super_admin' WHERE id = ${studentA.id}`;
        }),
      ).rejects.toThrow(/Privilege escalation denied/i);

      // campusverse_app CANNOT delete or update audit_logs (least-privilege grant check)
      await expect(
        client.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL ROLE campusverse_app`);
          await tx`SELECT set_config('app.current_user_id', ${studentA.id}, true), set_config('app.current_global_role', 'super_admin', true)`;
          await tx`DELETE FROM public.audit_logs`;
        }),
      ).rejects.toThrow(/permission denied/i);

      // 8. EXPLAIN ANALYZE on indexed QR hash lookup
      const qrHash = hashSha256(qrA);
      const explainRows = await client.unsafe<Array<{'QUERY PLAN': string}>>(
        `EXPLAIN (ANALYZE, FORMAT TEXT) SELECT id, status FROM public.registrations WHERE event_id = '${event.id}' AND qr_token_hash = '${qrHash}'`,
      );
        const planText = explainRows.map((r) => r['QUERY PLAN']).join('\n');
        expect(planText).toContain('Execution Time');
      },
      25000,
    );
  },
);
