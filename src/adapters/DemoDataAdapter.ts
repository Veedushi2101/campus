import {DemoDataAdapter as ServerDemoAdapter} from '../../server/adapters/DemoDataAdapter.ts';
import {signSessionToken} from '../../server/shared/utils/crypto.ts';
import type {
  Club,
  ClubStatus,
  CoreMemberPermission,
  EventItem,
  FinancialLineItem,
  FormField,
  SystemSettings,
} from '../../shared/types/domain.ts';
import type {ClientDataAdapter} from './DataAdapter.ts';

/**
 * Isolated client-side DemoDataAdapter used for offline unit tests or decoupled
 * sandbox checks. Production and live dev builds use ApiDataAdapter -> /api/v1/*.
 */
export class ClientDemoDataAdapter implements ClientDataAdapter {
  private readonly store = new ServerDemoAdapter();
  private currentUserId = 'usr-student-1';

  setAuthToken(): void {
    // No-op in isolated in-memory client adapter
  }

  async getHealth() {
    return {status: 'ok', mode: 'demo', persistence: 'in-memory-client-demo'};
  }

  listDemoPersonas() {
    return this.store.listUsers();
  }

  async loginDemo(input: {personaId?: string; email?: string}) {
    const user = input.personaId
      ? await this.store.getUserById(input.personaId)
      : input.email
        ? await this.store.getUserByEmail(input.email)
        : await this.store.getUserById('usr-student-1');
    if (!user) throw new Error('Persona not found');
    this.currentUserId = user.id;
    const memberships = await this.store.getMembershipsForUser(user.id);
    const follows = await this.store.getFollowsForUser(user.id);
    return {
      token: 'client-demo-token',
      session: {
        user,
        memberships,
        followedClubIds: follows.map((f) => f.clubId),
        mode: 'demo' as const,
      },
    };
  }

  async registerDemo(input: {
    name: string;
    email: string;
    department: string;
    yearOfStudy: string;
    password: string;
  }) {
    const user = await this.store.createDemoUser(input);
    this.currentUserId = user.id;
    return {
      token: 'client-demo-token',
      session: {
        user,
        memberships: [],
        followedClubIds: [],
        mode: 'demo' as const,
      },
    };
  }

  async getMe() {
    const user = (await this.store.getUserById(this.currentUserId))!;
    const memberships = await this.store.getMembershipsForUser(user.id);
    const follows = await this.store.getFollowsForUser(user.id);
    return {
      user,
      memberships,
      followedClubIds: follows.map((f) => f.clubId),
      mode: 'demo' as const,
    };
  }

  async logout() {
    this.currentUserId = 'usr-student-1';
  }

  async updateMyProfile(input: {name: string; department: string; yearOfStudy: string}) {
    return (await this.store.updateUserProfile(this.currentUserId, input))!;
  }

  listClubs(params?: {search?: string; category?: string}) {
    return this.store.listClubs(params);
  }

  async getClubDetail(clubId: string) {
    return (await this.store.getClubDetail(clubId, this.currentUserId))!;
  }

  async updateClub(clubId: string, updates: Partial<Club>) {
    return (await this.store.updateClub(clubId, updates))!;
  }

  createClub(input: {
    name: string;
    category: Club['category'];
    tagline: string;
    description: string;
    meetingSchedule: string;
    contactEmail: string;
  }) {
    return this.store.createClub(input);
  }

  async getMyMemberships() {
    return {
      memberships: await this.store.getMembershipsForUser(this.currentUserId),
      follows: await this.store.getFollowsForUser(this.currentUserId),
    };
  }

  followClub(clubId: string) {
    return this.store.followClub(this.currentUserId, clubId);
  }

  async unfollowClub(clubId: string) {
    await this.store.unfollowClub(this.currentUserId, clubId);
  }

  getClubTeam(clubId: string) {
    return this.store.getClubMemberships(clubId);
  }

  async upsertClubMember(
    clubId: string,
    input: {email: string; role: 'club_admin' | 'core_member'; title: string; permissions: CoreMemberPermission[]},
  ) {
    const user = await this.store.getUserByEmail(input.email);
    if (!user) throw new Error('User not found');
    return this.store.upsertClubMembership({
      clubId,
      userId: user.id,
      role: input.role,
      title: input.title,
      permissions: input.permissions,
    });
  }

  async updateMemberPermissions(
    clubId: string,
    membershipId: string,
    updates: {role?: 'club_admin' | 'core_member'; title?: string; permissions: CoreMemberPermission[]},
  ) {
    return (await this.store.updateMembershipPermissions(clubId, membershipId, updates))!;
  }

  async removeClubMember(clubId: string, membershipId: string) {
    await this.store.removeClubMembership(clubId, membershipId);
  }

  getHallOfFame() {
    return this.store.getHallOfFame();
  }

  listEvents(params?: {search?: string; category?: string; clubId?: string; status?: string; upcomingOnly?: boolean}) {
    return this.store.listEvents(params);
  }

  async getEventDetail(eventId: string) {
    return (await this.store.getEventById(eventId))!;
  }

  createEvent(
    clubId: string,
    input: {
      title: string;
      category: EventItem['category'];
      description: string;
      venue: string;
      startTime: string;
      endTime: string;
      registrationDeadline: string;
      capacity: number;
      isPaid: boolean;
      feeAmount: number;
    },
  ) {
    return this.store.createEvent(clubId, input);
  }

  async updateEvent(eventId: string, updates: Partial<EventItem>) {
    return (await this.store.updateEvent(eventId, updates))!;
  }

  async publishEvent(eventId: string) {
    return (await this.store.publishEvent(eventId))!;
  }

  getEventForm(eventId: string) {
    return this.store.getRegistrationForm(eventId);
  }

  saveEventForm(eventId: string, fields: FormField[]) {
    return this.store.upsertRegistrationForm(eventId, fields);
  }

  async submitRegistration(eventId: string, answers: Record<string, string | boolean | number>) {
    const user = (await this.store.getUserById(this.currentUserId))!;
    return this.store.createRegistration({
      eventId,
      studentId: user.id,
      studentName: user.name,
      studentEmail: user.email,
      answers,
      qrToken: `CV-QR-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
    });
  }

  listEventRegistrations(eventId: string) {
    return this.store.listRegistrationsForEvent(eventId);
  }

  listMyRegistrations() {
    return this.store.listRegistrationsForStudent(this.currentUserId);
  }

  async scanAttendance(
    eventId: string,
    input: {qrToken?: string; registrationId?: string; method: 'qr_scan' | 'manual_override'},
  ) {
    const reg = input.qrToken
      ? await this.store.getRegistrationByQrToken(eventId, input.qrToken)
      : input.registrationId
        ? await this.store.getRegistrationById(input.registrationId)
        : null;
    if (!reg) throw new Error('Registration not found');
    return this.store.recordAttendance({
      eventId,
      registrationId: reg.id,
      studentId: reg.studentId,
      studentName: reg.studentName,
      studentCode: reg.studentId,
      qrToken: reg.qrToken,
      method: input.method,
      checkedInBy: this.currentUserId,
    });
  }

  async getEventAttendance(eventId: string) {
    const records = await this.store.listAttendanceForEvent(eventId);
    const ev = await this.store.getEventById(eventId);
    return {
      records,
      registeredCount: ev?.registeredCount || 0,
      attendedCount: records.length,
    };
  }

  async submitEventReport(
    eventId: string,
    input: {
      outcomeSummary: string;
      highlights: string;
      challenges: string;
      actualAttendance: number;
      completionStatus: 'completed' | 'partial';
    },
  ) {
    const ev = (await this.store.getEventById(eventId))!;
    const user = (await this.store.getUserById(this.currentUserId))!;
    return this.store.upsertEventReport({
      eventId,
      eventTitle: ev.title,
      clubId: ev.clubId,
      clubName: ev.clubName,
      submittedBy: user.id,
      submittedByName: user.name,
      ...input,
      registeredTotal: ev.registeredCount,
    });
  }

  getEventReport(eventId: string) {
    return this.store.getEventReport(eventId);
  }

  async submitFinancialReport(eventId: string, input: {lineItems: FinancialLineItem[]; notes: string}) {
    const ev = (await this.store.getEventById(eventId))!;
    const user = (await this.store.getUserById(this.currentUserId))!;
    const totalCollections = input.lineItems
      .filter((i) => i.type === 'collection')
      .reduce((s, i) => s + i.amount, 0);
    const totalExpenses = input.lineItems
      .filter((i) => i.type === 'expense')
      .reduce((s, i) => s + i.amount, 0);
    return this.store.upsertFinancialReport({
      eventId,
      eventTitle: ev.title,
      clubId: ev.clubId,
      clubName: ev.clubName,
      submittedBy: user.id,
      submittedByName: user.name,
      totalCollections,
      totalExpenses,
      netBalance: totalCollections - totalExpenses,
      lineItems: input.lineItems,
      notes: input.notes,
    });
  }

  getFinancialReport(eventId: string) {
    return this.store.getFinancialReport(eventId);
  }

  listNotifications() {
    return this.store.listNotificationsForUser(this.currentUserId);
  }

  async markNotificationRead(notificationId: string) {
    return (await this.store.markNotificationRead(this.currentUserId, notificationId))!;
  }

  markAllNotificationsRead() {
    return this.store.markAllNotificationsRead(this.currentUserId);
  }

  getAdminDashboard() {
    return this.store.getAdminDashboardStats();
  }

  listAdminClubs() {
    return this.store.listClubs({includeAllStatuses: true});
  }

  async updateClubStatus(clubId: string, status: ClubStatus) {
    return (await this.store.updateClubStatus(clubId, status))!;
  }

  listAdminUsers() {
    return this.store.listUsers();
  }

  async updateUserStatus(userId: string, status: 'active' | 'suspended') {
    return (await this.store.updateUserStatus(userId, status))!;
  }

  listAdminReports() {
    return this.store.listAllEventReports();
  }

  async getAdminFinance() {
    const reports = await this.store.listAllFinancialReports();
    const totalCollections = reports.reduce((s, r) => s + r.totalCollections, 0);
    const totalExpenses = reports.reduce((s, r) => s + r.totalExpenses, 0);
    return {
      reports,
      totalCollections,
      totalExpenses,
      netBalance: totalCollections - totalExpenses,
    };
  }

  listAdminAuditLogs() {
    return this.store.listAuditLogs();
  }

  getAdminSettings() {
    return this.store.getSystemSettings();
  }

  updateAdminSettings(updates: Partial<SystemSettings>) {
    return this.store.updateSystemSettings(updates);
  }
}

void signSessionToken;
