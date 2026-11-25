import request from 'supertest';
import {beforeEach, describe, expect, it} from 'vitest';
import {DemoDataAdapter} from '../../server/adapters/DemoDataAdapter.ts';
import {createApp} from '../../server/app.ts';
import {
  clearCapturedInvitationEmailsForTests,
  getCapturedInvitationEmailsForTests,
} from '../../server/shared/email/invitationMailer.ts';

describe('CampusVerse Backend API & Business Rules', () => {
  let adapter: DemoDataAdapter;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    clearCapturedInvitationEmailsForTests();
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
    expect(res.body.data.phase).toBe('phase-4');
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

  it('enforces Club President and Core Member permission scopes', async () => {
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

    // Club President CAN create & publish event
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
    expect(qrToken).toMatch(/^CV-QR-[A-Z0-9_-]{12,}$/);
    expect(qrToken).not.toContain('aarav');
    expect(qrToken).not.toContain('@');

    // Design club president scans QR token once -> 201
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

    // Club President of that club sees team emails
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

  it('enforces Super Admin-only leadership assignment, duplicate 409 conflict, and /admin/memberships', async () => {
    const clubAdminToken = await loginAs('usr-club-admin-1');
    const superToken = await loginAs('usr-super-admin');

    // Club President cannot assign another Club President via /members
    const assignAdminDenied = await request(app)
      .post('/api/v1/clubs/club-robotics/members')
      .set('Authorization', `Bearer ${clubAdminToken}`)
      .send({
        email: 'aarav.mehta@campusverse.edu',
        role: 'president',
        title: 'Co-President',
        permissions: [],
      });
    expect(assignAdminDenied.status).toBe(403);

    // Club President CAN add a Core Member, and duplicate POST returns 409
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

    // Club President cannot remove existing Club President
    const teamRes = await request(app)
      .get('/api/v1/clubs/club-robotics/members')
      .set('Authorization', `Bearer ${clubAdminToken}`);
    const existingPresident = (teamRes.body.data as Array<{id: string; role: string}>).find(
      (m) => m.role === 'president',
    )!;
    const removeAdminDenied = await request(app)
      .delete(`/api/v1/clubs/club-robotics/members/${existingPresident.id}`)
      .set('Authorization', `Bearer ${clubAdminToken}`);
    expect(removeAdminDenied.status).toBe(403);

    // Super Admin can list all memberships and assign leadership cleanly
    const allMemberships = await request(app)
      .get('/api/v1/admin/memberships')
      .set('Authorization', `Bearer ${superToken}`);
    expect(allMemberships.status).toBe(200);
    expect(allMemberships.body.data.length).toBeGreaterThanOrEqual(3);

    const promoted = await request(app)
      .patch(`/api/v1/clubs/club-robotics/members/${addCore.body.data.id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({role: 'vice_president', title: 'Vice President'});
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.role).toBe('vice_president');
  });

  // =========================================================================
  // PHASE 4 TESTS
  // =========================================================================

  it('Phase 4: enforces Super Admin club creation, duplicate slug 409, leadership assignment, and VP governance limits', async () => {
    const superToken = await loginAs('usr-super-admin');
    const studentToken = await loginAs('usr-student-1');

    // Duplicate slug rejected with 409
    const dupSlug = await request(app)
      .post('/api/v1/clubs')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: 'Duplicate Robotics',
        slug: 'apex-robotics-lab',
        category: 'Robotics & Hardware',
        tagline: 'Attempted slug collision for existing robotics club.',
        description: 'Should fail cleanly with 409 Conflict due to existing slug.',
        meetingSchedule: 'Fridays · 17:00',
        contactEmail: 'dup@vitbhopal.ac.in',
      });
    expect(dupSlug.status).toBe(409);

    // Create fresh club
    const createdClubRes = await request(app)
      .post('/api/v1/clubs')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: 'Aerospace Propulsion Lab',
        slug: 'aerospace-propulsion-lab',
        category: 'Technology',
        tagline: 'Solid rocket telemetry, thrust stand testing, and avionics.',
        description:
          'Student rocketry and propulsion engineering guild building avionics and thrust instrumentation.',
        meetingSchedule: 'Saturdays · 10:00',
        contactEmail: 'aero@vitbhopal.ac.in',
        status: 'active',
      });
    expect(createdClubRes.status).toBe(201);
    const clubId = createdClubRes.body.data.id as string;

    // Assign Vice President directly to existing student account
    const assignVp = await request(app)
      .post(`/api/v1/admin/clubs/${clubId}/leadership`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        email: 'aarav.mehta@campusverse.edu',
        role: 'vice_president',
        title: 'Vice President',
        sendInvitation: false,
      });
    expect(assignVp.status).toBe(200);
    expect(assignVp.body.data.mode).toBe('assigned');

    // Assign President to existing student-2 account
    const assignPres = await request(app)
      .post(`/api/v1/admin/clubs/${clubId}/leadership`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        email: 'kabir.rao@campusverse.edu',
        role: 'president',
        title: 'Club President',
        sendInvitation: false,
      });
    expect(assignPres.status).toBe(200);
    const presMembershipId = assignPres.body.data.membership.id as string;
    const vpMembershipId = assignVp.body.data.membership.id as string;

    // Re-login as Aarav (now VP of aerospace-propulsion-lab)
    const vpToken = await loginAs('usr-student-1');

    // VP CANNOT modify President or self-promote to President
    const vpTouchPres = await request(app)
      .patch(`/api/v1/clubs/${clubId}/members/${presMembershipId}`)
      .set('Authorization', `Bearer ${vpToken}`)
      .send({title: 'Demoted'});
    expect(vpTouchPres.status).toBe(403);

    const vpSelfPromote = await request(app)
      .patch(`/api/v1/clubs/${clubId}/members/${vpMembershipId}`)
      .set('Authorization', `Bearer ${vpToken}`)
      .send({role: 'president'});
    expect(vpSelfPromote.status).toBe(403);

    // VP CANNOT remove President
    const vpDeletePres = await request(app)
      .delete(`/api/v1/clubs/${clubId}/members/${presMembershipId}`)
      .set('Authorization', `Bearer ${vpToken}`);
    expect(vpDeletePres.status).toBe(403);

    // Super Admin replacing President cleanly preserves user account
    const replacePres = await request(app)
      .post(`/api/v1/admin/clubs/${clubId}/leadership`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        email: 'priya.nair@campusverse.edu',
        role: 'president',
        title: 'Club President',
        replaceExisting: true,
        sendInvitation: false,
      });
    expect(replacePres.status).toBe(200);
    expect(replacePres.body.data.replacedUserId).toBe('usr-student-2');

    // Original student-2 account still exists
    const kabirToken = await loginAs('usr-student-2');
    const kabirMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${kabirToken}`);
    expect(kabirMe.status).toBe(200);
    expect(kabirMe.body.data.user.email).toBe('kabir.rao@campusverse.edu');
    expect(studentToken).toBeTruthy();
  });

  it('Phase 4: enforces strict 4-Core-Scanner quota per club while exempting President & Vice President', async () => {
    const superToken = await loginAs('usr-super-admin');
    const clubRes = await request(app)
      .post('/api/v1/clubs')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: 'Scanner Quota Guild',
        category: 'Technology',
        tagline: 'Verifying strict 4-scanner quota per club.',
        description: 'Club created to validate the 4 Core Member QR scanner limit and slot release.',
        meetingSchedule: 'Mondays · 17:00',
        contactEmail: 'scanners@vitbhopal.ac.in',
        status: 'active',
      });
    const clubId = clubRes.body.data.id as string;

    // Assign President & VP -> neither consumes Core Scanner quota
    await request(app)
      .post(`/api/v1/admin/clubs/${clubId}/leadership`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        email: 'priya.nair@campusverse.edu',
        role: 'president',
        sendInvitation: false,
      });
    await request(app)
      .post(`/api/v1/admin/clubs/${clubId}/leadership`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        email: 'sneha.kulkarni@campusverse.edu',
        role: 'vice_president',
        sendInvitation: false,
      });

    // Provision 5 extra users in adapter
    const extraEmails: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const email = `scanner${i}@vitbhopal.ac.in`;
      extraEmails.push(email);
      await adapter.provisionAuthenticatedUser({
        authUserId: `usr-scanner-${i}`,
        email,
        name: `Scanner ${i}`,
        emailVerified: true,
        isBootstrapSuperAdmin: false,
      });
    }

    const presToken = await loginAs('usr-club-admin-1');
    const createdMemberships: string[] = [];
    for (let i = 0; i < 4; i++) {
      const add = await request(app)
        .post(`/api/v1/clubs/${clubId}/members`)
        .set('Authorization', `Bearer ${presToken}`)
        .send({
          email: extraEmails[i],
          role: 'core_member',
          title: `Gate Scanner ${i + 1}`,
          permissions: ['SCAN_ATTENDANCE', 'VIEW_REGISTRATIONS'],
        });
      expect(add.status).toBe(201);
      createdMemberships.push(add.body.data.id as string);
    }

    // 5th Core Member with SCAN_ATTENDANCE -> blocked 422 SCANNER_SLOT_LIMIT_EXCEEDED
    const fifthBlocked = await request(app)
      .post(`/api/v1/clubs/${clubId}/members`)
      .set('Authorization', `Bearer ${presToken}`)
      .send({
        email: extraEmails[4],
        role: 'core_member',
        title: 'Gate Scanner 5',
        permissions: ['SCAN_ATTENDANCE'],
      });
    expect(fifthBlocked.status).toBe(422);
    expect(fifthBlocked.body.error.code).toBe('SCANNER_SLOT_LIMIT_EXCEEDED');

    // Inviting 5th Core Member with SCAN_ATTENDANCE is also blocked
    const fifthInviteBlocked = await request(app)
      .post(`/api/v1/clubs/${clubId}/invitations`)
      .set('Authorization', `Bearer ${presToken}`)
      .send({
        email: extraEmails[4],
        role: 'core_member',
        title: 'Gate Scanner 5',
        permissions: ['SCAN_ATTENDANCE'],
      });
    expect(fifthInviteBlocked.status).toBe(422);
    expect(fifthInviteBlocked.body.error.code).toBe('SCANNER_SLOT_LIMIT_EXCEEDED');

    // Removing 1 scanner frees slot for 5th
    const removed = await request(app)
      .delete(`/api/v1/clubs/${clubId}/members/${createdMemberships[0]}`)
      .set('Authorization', `Bearer ${presToken}`);
    expect(removed.status).toBe(200);

    const fifthAllowed = await request(app)
      .post(`/api/v1/clubs/${clubId}/members`)
      .set('Authorization', `Bearer ${presToken}`)
      .send({
        email: extraEmails[4],
        role: 'core_member',
        title: 'Gate Scanner 5',
        permissions: ['SCAN_ATTENDANCE'],
      });
    expect(fifthAllowed.status).toBe(201);
  });

  it('Phase 4: executes end-to-end tokenized invitations (preview, email match, resend rotation, single-use accept)', async () => {
    const presToken = await loginAs('usr-club-admin-1');

    // Create invite for student-1
    const inviteRes = await request(app)
      .post('/api/v1/clubs/club-robotics/invitations')
      .set('Authorization', `Bearer ${presToken}`)
      .send({
        email: 'aarav.mehta@campusverse.edu',
        role: 'core_member',
        title: 'Events Coordinator',
        permissions: ['MANAGE_EVENTS', 'VIEW_REGISTRATIONS'],
      });
    expect(inviteRes.status).toBe(201);
    const invId = inviteRes.body.data.id as string;
    // Raw token MUST never appear in API response
    expect(JSON.stringify(inviteRes.body.data)).not.toContain('CV-INV-');

    const captured1 = getCapturedInvitationEmailsForTests();
    expect(captured1).toHaveLength(1);
    const oldToken = captured1[0].token;

    // Resend rotates token and invalidates oldToken
    const resendRes = await request(app)
      .post(`/api/v1/clubs/club-robotics/invitations/${invId}/resend`)
      .set('Authorization', `Bearer ${presToken}`);
    expect(resendRes.status).toBe(200);

    const captured2 = getCapturedInvitationEmailsForTests();
    expect(captured2).toHaveLength(2);
    const freshToken = captured2[1].token;
    expect(freshToken).not.toBe(oldToken);

    const oldPreview = await request(app).get(`/api/v1/invitations/preview?token=${oldToken}`);
    expect(oldPreview.status).toBe(404);

    const validPreview = await request(app).get(`/api/v1/invitations/preview?token=${freshToken}`);
    expect(validPreview.status).toBe(200);
    expect(validPreview.body.data.invitation.inviteeEmail).toBe('aarav.mehta@campusverse.edu');

    // Wrong user cannot accept Aarav's invite -> 403
    const wrongUserToken = await loginAs('usr-student-2');
    const wrongAccept = await request(app)
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${wrongUserToken}`)
      .send({token: freshToken});
    expect(wrongAccept.status).toBe(403);

    // Intended user accepts -> 200 and gains membership
    const aaravToken = await loginAs('usr-student-1');
    const acceptRes = await request(app)
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({token: freshToken});
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.membership.role).toBe('core_member');
    expect(acceptRes.body.data.membership.permissions).toContain('MANAGE_EVENTS');

    // Second accept of same token -> 409 Conflict
    const replayAccept = await request(app)
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({token: freshToken});
    expect(replayAccept.status).toBe(409);
  });

  it('Phase 4: enforces 6-state event lifecycle, inactive club publish guard, eligibility, form snapshots, FIFO waitlist promotion & CSV neutralization', async () => {
    const presToken = await loginAs('usr-club-admin-1');
    const superToken = await loginAs('usr-super-admin');
    const student1Token = await loginAs('usr-student-1');
    const student2Token = await loginAs('usr-student-2');

    // 1. Create event with capacity=1 and future registrationOpensAt first
    const futureOpen = new Date(Date.now() + 86400_000).toISOString();
    const futureEnd = new Date(Date.now() + 5 * 86400_000).toISOString();
    const futureDeadline = new Date(Date.now() + 4 * 86400_000).toISOString();

    const createdEvt = await request(app)
      .post('/api/v1/clubs/club-robotics/events')
      .set('Authorization', `Bearer ${presToken}`)
      .send({
        title: 'Phase 4 Precision Workshop',
        category: 'Workshop',
        description: 'Comprehensive workflow event testing lifecycle, 10 form fields, eligibility & waitlist.',
        venue: 'Robotics Hall 3',
        startTime: futureEnd,
        endTime: new Date(Date.now() + 6 * 86400_000).toISOString(),
        registrationOpensAt: futureOpen,
        registrationDeadline: futureDeadline,
        capacity: 1,
        isPaid: false,
        feeAmount: 0,
        eligibilityRules: {
          allowedDepartments: ['Computer Science & Engineering', 'Mechanical Engineering'],
        },
      });
    expect(createdEvt.status).toBe(201);
    const eventId = createdEvt.body.data.id as string;

    // 2. Save 10-field form & publish immutable snapshot v1
    const putForm = await request(app)
      .put(`/api/v1/events/${eventId}/form`)
      .set('Authorization', `Bearer ${presToken}`)
      .send({
        title: 'Precision Workshop Registration',
        description: 'All 10 field types verified.',
        fields: [
          {id: 'f1', label: 'Team Name', type: 'text', required: true},
          {id: 'f2', label: 'Bio', type: 'textarea', required: true},
          {id: 'f3', label: 'Contact Email', type: 'email', required: true},
          {id: 'f4', label: 'Phone', type: 'phone', required: true},
          {id: 'f5', label: 'Experience Years', type: 'number', required: true, validationRules: {min: 0, max: 10}},
          {id: 'f6', label: 'Portfolio URL', type: 'url', required: true},
          {id: 'f7', label: 'Track', type: 'select', required: true, options: ['Hardware', 'Firmware']},
          {id: 'f8', label: 'T-Shirt Size', type: 'radio', required: true, options: ['M', 'L']},
          {id: 'f9', label: 'Code of Conduct', type: 'checkbox', required: true},
          {id: 'f10', label: 'Interests', type: 'checkboxes', required: true, options: ['CAD', 'ROS2']},
        ],
      });
    expect(putForm.status).toBe(200);

    const pubForm = await request(app)
      .post(`/api/v1/events/${eventId}/form/publish`)
      .set('Authorization', `Bearer ${presToken}`);
    expect(pubForm.status).toBe(201);
    expect(pubForm.body.data.version).toBe(1);

    // Edit draft WITHOUT publishing v2 -> student submission validates against v1 snapshot
    const draftEdit = await request(app)
      .put(`/api/v1/events/${eventId}/form`)
      .set('Authorization', `Bearer ${presToken}`)
      .send({
        fields: [
          {id: 'f_draft_only', label: 'Draft Unreleased Question', type: 'text', required: true},
        ],
      });
    expect(draftEdit.status).toBe(200);

    const v1Check = await request(app).get(`/api/v1/events/${eventId}/form?version=1`);
    expect(v1Check.status).toBe(200);
    expect(v1Check.body.data.fields).toHaveLength(10);

    // 3. Deactivating club blocks event publishing
    await request(app)
      .patch('/api/v1/clubs/club-robotics/status')
      .set('Authorization', `Bearer ${superToken}`)
      .send({status: 'inactive'});

    const pubBlocked = await request(app)
      .post(`/api/v1/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${presToken}`);
    expect(pubBlocked.status).toBe(422);
    expect(pubBlocked.body.error.code).toBe('CLUB_NOT_ACTIVE');

    // Reactivate club & transition draft -> published -> open-registration
    await request(app)
      .patch('/api/v1/clubs/club-robotics/status')
      .set('Authorization', `Bearer ${superToken}`)
      .send({status: 'active'});

    const published = await request(app)
      .post(`/api/v1/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${presToken}`);
    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe('published');

    const opened = await request(app)
      .post(`/api/v1/events/${eventId}/open-registration`)
      .set('Authorization', `Bearer ${presToken}`);
    expect(opened.status).toBe(200);
    expect(opened.body.data.status).toBe('registration_open');

    // Before registrationOpensAt -> rejected 422 REGISTRATION_NOT_OPEN_YET
    const earlyReg = await request(app)
      .post(`/api/v1/events/${eventId}/registrations`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({answers: {}});
    expect(earlyReg.status).toBe(422);
    expect(earlyReg.body.error.code).toBe('REGISTRATION_NOT_OPEN_YET');

    // Open window now
    await request(app)
      .patch(`/api/v1/events/${eventId}`)
      .set('Authorization', `Bearer ${presToken}`)
      .send({registrationOpensAt: new Date(Date.now() - 60_000).toISOString()});

    // Ineligible department (usr-core-1 is Electrical Engineering) -> 422 ELIGIBILITY_DEPARTMENT_RESTRICTED
    const coreToken = await loginAs('usr-core-1');
    const ineligibleReg = await request(app)
      .post(`/api/v1/events/${eventId}/registrations`)
      .set('Authorization', `Bearer ${coreToken}`)
      .send({answers: {}});
    expect(ineligibleReg.status).toBe(422);
    expect(ineligibleReg.body.error.code).toBe('ELIGIBILITY_DEPARTMENT_RESTRICTED');

    // 4. Student 1 fills all 10 fields (including formula injection attempt in Team Name) -> confirmed (capacity=1)
    const validAnswers = {
      f1: '=CMD("calc")',
      f2: 'Autonomous navigation builder',
      f3: 'aarav@vitbhopal.ac.in',
      f4: '+91 9876543210',
      f5: 2,
      f6: 'https://github.com/aarav-robotics',
      f7: 'Hardware',
      f8: 'M',
      f9: true,
      f10: ['CAD', 'ROS2'],
    };
    const reg1 = await request(app)
      .post(`/api/v1/events/${eventId}/registrations`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({answers: validAnswers});
    expect(reg1.status).toBe(201);
    expect(reg1.body.data.status).toBe('confirmed');
    expect(reg1.body.data.formVersion).toBe(1);
    const reg1Id = reg1.body.data.id as string;

    // Student 2 registers -> waitlisted #1
    const reg2 = await request(app)
      .post(`/api/v1/events/${eventId}/registrations`)
      .set('Authorization', `Bearer ${student2Token}`)
      .send({
        answers: {
          ...validAnswers,
          f1: '+SUM(1,2)',
          f3: 'kabir@vitbhopal.ac.in',
        },
      });
    expect(reg2.status).toBe(201);
    expect(reg2.body.data.status).toBe('waitlisted');
    expect(reg2.body.data.waitlistPosition).toBe(1);

    // IDOR check: Student 2 cannot inspect Student 1's registration
    const idorCheck = await request(app)
      .get(`/api/v1/registrations/${reg1Id}`)
      .set('Authorization', `Bearer ${student2Token}`);
    expect(idorCheck.status).toBe(403);

    // Waitlisted student cannot be checked in at gate
    const scanWaitlisted = await request(app)
      .post(`/api/v1/events/${eventId}/attendance/scan`)
      .set('Authorization', `Bearer ${presToken}`)
      .send({qrToken: reg2.body.data.qrToken, method: 'qr_scan'});
    expect(scanWaitlisted.status).toBe(422);
    expect(scanWaitlisted.body.error.code).toBe('REGISTRATION_WAITLISTED');

    // Wrong-event ticket rejected at gate
    const wrongEventScan = await request(app)
      .post(`/api/v1/events/${eventId}/attendance/scan`)
      .set('Authorization', `Bearer ${presToken}`)
      .send({qrToken: 'CV-QR-8F92A1C4', method: 'qr_scan'});
    expect(wrongEventScan.status).toBe(404);

    // Student 1 cancels -> Student 2 auto-promoted FIFO!
    const cancelRes = await request(app)
      .delete(`/api/v1/events/${eventId}/registrations/me`)
      .set('Authorization', `Bearer ${student1Token}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.promotedUserId).toBe('usr-student-2');

    // Cancelled registration's old QR token is invalidated (404) and manual lookup rejects cancelled status (422)
    const scanCancelledQr = await request(app)
      .post(`/api/v1/events/${eventId}/attendance/scan`)
      .set('Authorization', `Bearer ${presToken}`)
      .send({qrToken: reg1.body.data.qrToken, method: 'qr_scan'});
    expect(scanCancelledQr.status).toBe(404);

    const scanCancelledManual = await request(app)
      .post(`/api/v1/events/${eventId}/attendance/manual`)
      .set('Authorization', `Bearer ${presToken}`)
      .send({
        registrationId: reg1Id,
        reason: 'Attempt check-in for cancelled registration',
      });
    expect(scanCancelledManual.status).toBe(422);
    expect(scanCancelledManual.body.error.code).toBe('REGISTRATION_CANCELLED');

    // Student 2's registration is now confirmed & receives promotion notification
    const student2Regs = await request(app)
      .get('/api/v1/users/me/registrations')
      .set('Authorization', `Bearer ${student2Token}`);
    const promotedReg = (student2Regs.body.data as Array<{id: string; status: string}>).find(
      (r) => r.id === reg2.body.data.id,
    );
    expect(promotedReg?.status).toBe('confirmed');

    // Manual override requires reason >= 5 chars
    const shortReasonManual = await request(app)
      .post(`/api/v1/events/${eventId}/attendance/manual`)
      .set('Authorization', `Bearer ${presToken}`)
      .send({
        registrationId: reg2.body.data.id,
        reason: 'ok',
      });
    expect(shortReasonManual.status).toBe(400);

    const validManual = await request(app)
      .post(`/api/v1/events/${eventId}/attendance/scan`)
      .set('Authorization', `Bearer ${presToken}`)
      .send({
        registrationId: reg2.body.data.id,
        method: 'manual_override',
        reason: 'Verified physical university ID card at Robotics Hall 3',
      });
    expect(validManual.status).toBe(201);
    expect(validManual.body.data.method).toBe('manual_override');

    // CSV export escapes dangerous spreadsheet formulas (=, +)
    const regCsv = await request(app)
      .get(`/api/v1/events/${eventId}/registrations/export`)
      .set('Authorization', `Bearer ${presToken}`);
    expect(regCsv.status).toBe(200);
    expect(regCsv.headers['content-type']).toContain('text/csv');
    expect(regCsv.text).toContain("'=CMD");
    expect(regCsv.text).toContain("'+SUM(1,2)");

    const attCsv = await request(app)
      .get(`/api/v1/events/${eventId}/attendance/export`)
      .set('Authorization', `Bearer ${presToken}`);
    expect(attCsv.status).toBe(200);
    expect(attCsv.text).toContain('manual_override');

    // Lifecycle completion & cancellation checks
    const closed = await request(app)
      .post(`/api/v1/events/${eventId}/close-registration`)
      .set('Authorization', `Bearer ${presToken}`);
    expect(closed.body.data.status).toBe('registration_closed');

    const completed = await request(app)
      .post(`/api/v1/events/${eventId}/complete`)
      .set('Authorization', `Bearer ${presToken}`);
    expect(completed.body.data.status).toBe('completed');
  });
});

