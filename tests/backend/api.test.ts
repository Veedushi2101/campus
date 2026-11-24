import request from 'supertest';
import {beforeEach, describe, expect, it} from 'vitest';
import {DemoDataAdapter} from '../../server/adapters/DemoDataAdapter.ts';
import {createApp} from '../../server/app.ts';

describe('CampusVerse Backend API & Business Rules', () => {
  let adapter: DemoDataAdapter;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    adapter = new DemoDataAdapter();
    app = createApp(adapter);
  });

  async function loginAs(personaId: string): Promise<string> {
    const res = await request(app).post('/api/v1/auth/demo-login').send({personaId});
    expect(res.status).toBe(200);
    return res.body.data.token as string;
  }

  it('returns healthy status from /api/v1/health', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('rejects unauthenticated access to protected endpoints', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('enforces the strict 2-club follow limit per student', async () => {
    // usr-student-1 (Aarav) initially follows 1 club (club-robotics)
    const token = await loginAs('usr-student-1');

    // Follow 2nd club -> succeeds
    const second = await request(app)
      .post('/api/v1/clubs/club-design/follow')
      .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(201);

    // Follow 3rd club -> rejected with 422 MAX_CLUB_FOLLOW_LIMIT_REACHED
    const third = await request(app)
      .post('/api/v1/clubs/club-music/follow')
      .set('Authorization', `Bearer ${token}`);
    expect(third.status).toBe(422);
    expect(third.body.error.code).toBe('MAX_CLUB_FOLLOW_LIMIT_REACHED');

    // Unfollow 1st club -> succeeds and frees slot
    const unfollow = await request(app)
      .delete('/api/v1/clubs/club-robotics/follow')
      .set('Authorization', `Bearer ${token}`);
    expect(unfollow.status).toBe(200);

    const retry = await request(app)
      .post('/api/v1/clubs/club-music/follow')
      .set('Authorization', `Bearer ${token}`);
    expect(retry.status).toBe(201);
  });

  it('calculates Hall of Fame rankings with deterministic tie handling', async () => {
    const res = await request(app).get('/api/v1/hall-of-fame');
    expect(res.status).toBe(200);
    const list = res.body.data as Array<{rank: number; followerCount: number; tieCount: number}>;
    expect(list[0].rank).toBe(1);
    // Club Design and Club Music are seeded with equal 289 followers -> both rank #2, next is #4
    expect(list[1].rank).toBe(2);
    expect(list[2].rank).toBe(2);
    expect(list[1].tieCount).toBe(2);
    expect(list[3].rank).toBe(4);
  });

  it('enforces Club Admin and Core Member permission scopes', async () => {
    const coreToken = await loginAs('usr-core-1'); // Has VIEW_REGISTRATIONS, SCAN_ATTENDANCE, SUBMIT_EVENT_REPORTS on club-robotics

    // Core member WITHOUT MANAGE_EVENTS cannot create an event
    const createDenied = await request(app)
      .post('/api/v1/clubs/club-robotics/events')
      .set('Authorization', `Bearer ${coreToken}`)
      .send({
        title: 'Unauthorized Draft Event',
        category: 'Workshop',
        description: 'Attempting to create event without MANAGE_EVENTS permission.',
        venue: 'Hall A',
        startTime: '2026-12-22T10:00:00.000Z',
        endTime: '2026-12-22T12:00:00.000Z',
        registrationDeadline: '2026-12-21T23:59:00.000Z',
        capacity: 50,
        isPaid: false,
        feeAmount: 0,
      });
    expect(createDenied.status).toBe(403);

    // Core member WITHOUT SUBMIT_FINANCE_REPORTS cannot submit financial report
    const financeDenied = await request(app)
      .post('/api/v1/events/evt-rover-sprint/finance-report')
      .set('Authorization', `Bearer ${coreToken}`)
      .send({
        lineItems: [{id: '1', type: 'collection', label: 'Grant', category: 'Grant', amount: 100}],
        notes: 'Attempt',
      });
    expect(financeDenied.status).toBe(403);

    // Club Admin CAN create & publish event
    const adminToken = await loginAs('usr-club-admin-1');
    const created = await request(app)
      .post('/api/v1/clubs/club-robotics/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'ROS2 Navigation Clinic',
        category: 'Workshop',
        description: 'Hands-on ROS2 SLAM navigation tuning with campus robotics kits.',
        venue: 'Innovation Hangar B2',
        startTime: '2026-12-25T10:00:00.000Z',
        endTime: '2026-12-25T13:00:00.000Z',
        registrationDeadline: '2026-12-24T23:59:00.000Z',
        capacity: 40,
        isPaid: false,
        feeAmount: 0,
      });
    expect(created.status).toBe(201);
    const eventId = created.body.data.id as string;

    // Cross-club admin cannot modify another club's event
    const designAdminToken = await loginAs('usr-multi-1');
    const crossClubUpdate = await request(app)
      .patch(`/api/v1/events/${eventId}`)
      .set('Authorization', `Bearer ${designAdminToken}`)
      .send({venue: 'Hijacked Hall'});
    expect(crossClubUpdate.status).toBe(403);

    const published = await request(app)
      .post(`/api/v1/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe('published');
  });

  it('prevents students from viewing private club financial reports', async () => {
    const studentToken = await loginAs('usr-student-1');
    const res = await request(app)
      .get('/api/v1/events/evt-pcb-workshop/finance-report')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('handles student registration with form validation, non-PII QR token, and single-use attendance scan', async () => {
    const studentToken = await loginAs('usr-student-1');

    // Missing required checkbox -> 400 validation error
    const invalidReg = await request(app)
      .post('/api/v1/events/evt-design-systems/registrations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        answers: {
          'fld-track': 'Participant',
          'fld-experience': 'Intermediate',
          'fld-code-conduct': false,
        },
      });
    expect(invalidReg.status).toBe(400);

    // Valid registration -> issues opaque non-PII QR token
    const validReg = await request(app)
      .post('/api/v1/events/evt-design-systems/registrations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        answers: {
          'fld-track': 'Participant',
          'fld-experience': 'Intermediate',
          'fld-code-conduct': true,
        },
      });
    expect(validReg.status).toBe(201);
    const qrToken = validReg.body.data.qrToken as string;
    expect(qrToken).toMatch(/^CV-QR-[A-F0-9]+$/);
    expect(qrToken).not.toContain('aarav');
    expect(qrToken).not.toContain('@');

    // Design club admin scans QR token once -> 201
    const designAdminToken = await loginAs('usr-multi-1');
    const firstScan = await request(app)
      .post('/api/v1/events/evt-design-systems/attendance/scan')
      .set('Authorization', `Bearer ${designAdminToken}`)
      .send({qrToken, method: 'qr_scan'});
    expect(firstScan.status).toBe(201);

    // Second scan of same QR token -> 409 Conflict (duplicate scan prevented)
    const duplicateScan = await request(app)
      .post('/api/v1/events/evt-design-systems/attendance/scan')
      .set('Authorization', `Bearer ${designAdminToken}`)
      .send({qrToken, method: 'qr_scan'});
    expect(duplicateScan.status).toBe(409);
  });

  it('enforces Super Admin access boundaries and prevents non-admin oversight access', async () => {
    const studentToken = await loginAs('usr-student-1');
    const denied = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(denied.status).toBe(403);

    const superToken = await loginAs('usr-super-admin');
    const allowed = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${superToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.totalClubs).toBeGreaterThanOrEqual(8);
  });

  it('validates strict user profile updates and returns followed clubs with limit metadata', async () => {
    const studentToken = await loginAs('usr-student-1');

    const badPatch = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({name: 'Aarav Updated', globalRole: 'super_admin'});
    expect(badPatch.status).toBe(400);

    const goodPatch = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({department: 'Robotics & AI'});
    expect(goodPatch.status).toBe(200);
    expect(goodPatch.body.data.department).toBe('Robotics & AI');

    const followedRes = await request(app)
      .get('/api/v1/users/me/followed-clubs')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(followedRes.status).toBe(200);
    expect(followedRes.body.data).toHaveLength(1);
    expect(followedRes.body.meta).toEqual({count: 1, limit: 2});
  });

  it('enforces inactive club exclusion from discovery/HoF/follows and redacts team emails for students', async () => {
    const superToken = await loginAs('usr-super-admin');
    const studentToken = await loginAs('usr-student-1');
    const clubAdminToken = await loginAs('usr-club-admin-1');

    // Public club detail redacts team emails from students
    const publicDetail = await request(app)
      .get('/api/v1/clubs/club-robotics')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(publicDetail.status).toBe(200);
    expect(publicDetail.body.data.team.length).toBeGreaterThan(0);
    expect(publicDetail.body.data.team[0].userEmail).toBeUndefined();

    // Club admin of that club sees team emails
    const adminDetail = await request(app)
      .get('/api/v1/clubs/club-robotics')
      .set('Authorization', `Bearer ${clubAdminToken}`);
    expect(adminDetail.status).toBe(200);
    expect(adminDetail.body.data.team[0].userEmail).toBeTruthy();

    // Non-super-admin cannot change club status
    const statusDenied = await request(app)
      .patch('/api/v1/clubs/club-green/status')
      .set('Authorization', `Bearer ${clubAdminToken}`)
      .send({status: 'inactive'});
    expect(statusDenied.status).toBe(403);

    // Super Admin deactivates club-green
    const deactivated = await request(app)
      .patch('/api/v1/clubs/club-green/status')
      .set('Authorization', `Bearer ${superToken}`)
      .send({status: 'inactive', reason: 'Semester recess'});
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.status).toBe('inactive');

    const directory = await request(app).get('/api/v1/clubs');
    expect(directory.body.data.some((c: {id: string}) => c.id === 'club-green')).toBe(false);

    const hof = await request(app).get('/api/v1/hall-of-fame');
    expect(hof.body.data.some((e: {club: {id: string}}) => e.club.id === 'club-green')).toBe(false);

    const hiddenDetail = await request(app)
      .get('/api/v1/clubs/club-green')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(hiddenDetail.status).toBe(404);

    const followInactive = await request(app)
      .post('/api/v1/clubs/club-green/follow')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(followInactive.status).toBe(422);
    expect(followInactive.body.error.code).toBe('CLUB_NOT_ACTIVE');
  });

  it('enforces Super Admin-only Club Admin assignment, duplicate 409 conflict, and /admin/memberships', async () => {
    const clubAdminToken = await loginAs('usr-club-admin-1');
    const superToken = await loginAs('usr-super-admin');

    // Club Admin cannot assign another Club Admin
    const assignAdminDenied = await request(app)
      .post('/api/v1/clubs/club-robotics/members')
      .set('Authorization', `Bearer ${clubAdminToken}`)
      .send({
        email: 'aarav.mehta@campusverse.edu',
        role: 'club_admin',
        title: 'Co-President',
        permissions: [],
      });
    expect(assignAdminDenied.status).toBe(403);

    // Club Admin CAN add a Core Member, and duplicate POST returns 409
    const addCore = await request(app)
      .post('/api/v1/clubs/club-robotics/members')
      .set('Authorization', `Bearer ${clubAdminToken}`)
      .send({
        email: 'aarav.mehta@campusverse.edu',
        role: 'core_member',
        title: 'Logistics Lead',
        permissions: ['VIEW_REGISTRATIONS', 'SCAN_ATTENDANCE'],
      });
    expect(addCore.status).toBe(201);

    const dupCore = await request(app)
      .post('/api/v1/clubs/club-robotics/members')
      .set('Authorization', `Bearer ${clubAdminToken}`)
      .send({
        email: 'aarav.mehta@campusverse.edu',
        role: 'core_member',
        title: 'Logistics Lead',
        permissions: ['VIEW_REGISTRATIONS'],
      });
    expect(dupCore.status).toBe(409);

    // Club Admin cannot remove existing Club Admin
    const teamRes = await request(app)
      .get('/api/v1/clubs/club-robotics/members')
      .set('Authorization', `Bearer ${clubAdminToken}`);
    const existingAdmin = (teamRes.body.data as Array<{id: string; role: string}>).find(
      (m) => m.role === 'club_admin',
    )!;
    const removeAdminDenied = await request(app)
      .delete(`/api/v1/clubs/club-robotics/members/${existingAdmin.id}`)
      .set('Authorization', `Bearer ${clubAdminToken}`);
    expect(removeAdminDenied.status).toBe(403);

    // Super Admin can list all memberships and promote Core Member to Club Admin
    const allMemberships = await request(app)
      .get('/api/v1/admin/memberships')
      .set('Authorization', `Bearer ${superToken}`);
    expect(allMemberships.status).toBe(200);
    expect(allMemberships.body.data.length).toBeGreaterThanOrEqual(3);

    const promoted = await request(app)
      .patch(`/api/v1/clubs/club-robotics/members/${addCore.body.data.id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({role: 'club_admin'});
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.role).toBe('club_admin');
  });
});
