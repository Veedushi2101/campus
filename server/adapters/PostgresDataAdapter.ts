import type {
  AdminDashboardStats,
  AttendanceRecord,
  AuditLogEntry,
  Club,
  ClubDetail,
  ClubFollow,
  ClubInvitation,
  ClubMembership,
  ClubRole,
  ClubStatus,
  CoreMemberPermission,
  EventFormVersion,
  EventItem,
  EventReport,
  EventStatus,
  FinancialReport,
  FormAnswerValue,
  FormField,
  HallOfFameEntry,
  NotificationItem,
  PaginatedResult,
  Registration,
  RegistrationForm,
  SystemSettings,
  UserAccount,
} from '../../shared/types/domain.ts';
import {checkDatabaseHealth} from '../db/index.ts';
import {ClubsRepository} from '../db/repositories/clubs.repository.ts';
import {EventsRepository} from '../db/repositories/events.repository.ts';
import {InvitationsRepository} from '../db/repositories/invitations.repository.ts';
import {OperationsRepository} from '../db/repositories/operations.repository.ts';
import {UsersRepository} from '../db/repositories/users.repository.ts';
import {BusinessRuleError} from '../shared/errors/AppError.ts';
import type {DataAdapter, ResolvedAuthContext} from './DataAdapter.ts';

export class PostgresDataAdapter implements DataAdapter {
  private readonly usersRepo = new UsersRepository();
  private readonly clubsRepo = new ClubsRepository();
  private readonly invitationsRepo = new InvitationsRepository();
  private readonly eventsRepo = new EventsRepository();
  private readonly opsRepo = new OperationsRepository();

  getPersistenceMode(): 'in_memory_demo' | 'postgres' {
    return 'postgres';
  }

  async checkReadiness(): Promise<{
    ready: boolean;
    latencyMs: number;
    persistence: string;
    error?: string;
  }> {
    const dbStatus = await checkDatabaseHealth();
    return {
      ready: dbStatus.ready,
      latencyMs: dbStatus.latencyMs,
      persistence: 'postgresql-drizzle-rls',
      error: dbStatus.error,
    };
  }

  // Auth & Users
  getUserById(userId: string): Promise<UserAccount | null> {
    return this.usersRepo.getUserById(userId);
  }

  getUserByEmail(email: string): Promise<UserAccount | null> {
    return this.usersRepo.getUserByEmail(email);
  }

  provisionAuthenticatedUser(input: {
    authUserId: string;
    email: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
    emailVerified: boolean;
    isBootstrapSuperAdmin: boolean;
  }): Promise<UserAccount> {
    return this.usersRepo.provisionAuthenticatedUser(input);
  }

  resolveAuthenticatedContext(input: {
    authUserId: string;
    email: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
    emailVerified: boolean;
    isBootstrapSuperAdmin: boolean;
  }): Promise<ResolvedAuthContext> {
    return this.usersRepo.resolveAuthenticatedContext(input);
  }

  recordAuthSession(input: {
    userId: string;
    ipHash?: string;
    userAgent?: string;
  }): Promise<void> {
    return this.usersRepo.recordAuthSession(input);
  }

  listUsers(): Promise<UserAccount[]> {
    return this.usersRepo.listUsers();
  }

  updateUserProfile(
    userId: string,
    updates: Partial<Pick<UserAccount, 'name' | 'department' | 'yearOfStudy'>>,
  ): Promise<UserAccount | null> {
    return this.usersRepo.updateUserProfile(userId, updates);
  }

  updateUserStatus(userId: string, status: 'active' | 'suspended'): Promise<UserAccount | null> {
    return this.usersRepo.updateUserStatus(userId, status);
  }

  async createDemoUser(): Promise<UserAccount> {
    throw new BusinessRuleError(
      'DEMO_DISABLED',
      'Demo user creation is disabled when PostgreSQL & Supabase Auth are active',
    );
  }

  // Clubs
  listClubs(filters?: {
    search?: string;
    category?: string;
    status?: ClubStatus;
    includeAllStatuses?: boolean;
    sortBy?: 'followers' | 'name' | 'events';
    page?: number;
    pageSize?: number;
  }): Promise<Club[]> {
    return this.clubsRepo.listClubs(filters);
  }

  listClubsPaginated(filters?: {
    search?: string;
    category?: string;
    status?: ClubStatus;
    includeAllStatuses?: boolean;
    sortBy?: 'followers' | 'name' | 'events';
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<Club>> {
    return this.clubsRepo.listClubsPaginated(filters);
  }

  getClubDetail(clubId: string, viewerUserId?: string): Promise<ClubDetail | null> {
    return this.clubsRepo.getClubDetail(clubId, viewerUserId);
  }

  createClub(input: {
    name: string;
    slug?: string;
    category: Club['category'];
    tagline: string;
    description: string;
    meetingSchedule: string;
    contactEmail: string;
    foundedYear?: number;
    status?: ClubStatus;
    createdByUserId?: string;
  }): Promise<Club> {
    return this.clubsRepo.createClub(input);
  }

  updateClub(clubId: string, updates: Partial<Club>): Promise<Club | null> {
    return this.clubsRepo.updateClub(clubId, updates);
  }

  updateClubStatus(clubId: string, status: ClubStatus): Promise<Club | null> {
    return this.clubsRepo.updateClubStatus(clubId, status);
  }

  // Memberships, Leadership, Invitations & Following
  getMembershipsForUser(userId: string): Promise<ClubMembership[]> {
    return this.clubsRepo.getMembershipsForUser(userId);
  }

  getClubMemberships(clubId: string): Promise<ClubMembership[]> {
    return this.clubsRepo.getClubMemberships(clubId);
  }

  listAllMemberships(): Promise<ClubMembership[]> {
    return this.clubsRepo.listAllMemberships();
  }

  upsertClubMembership(input: {
    clubId: string;
    userId: string;
    role: ClubMembership['role'];
    title: string;
    permissions: CoreMemberPermission[];
    assignedByUserId?: string;
    strictInsert?: boolean;
  }): Promise<ClubMembership> {
    return this.clubsRepo.upsertClubMembership(input);
  }

  updateMembershipPermissions(
    clubId: string,
    membershipId: string,
    updates: {
      role?: ClubMembership['role'];
      title?: string;
      permissions?: CoreMemberPermission[];
    },
  ): Promise<ClubMembership | null> {
    return this.clubsRepo.updateMembershipPermissions(clubId, membershipId, updates);
  }

  removeClubMembership(clubId: string, membershipId: string): Promise<boolean> {
    return this.clubsRepo.removeClubMembership(clubId, membershipId);
  }

  assignClubLeadership(input: {
    clubId: string;
    email: string;
    role: 'president' | 'vice_president';
    title?: string;
    replaceExisting?: boolean;
    sendInvitation?: boolean;
    actorUserId: string;
  }) {
    return this.invitationsRepo.assignClubLeadership(input);
  }

  createClubInvitation(input: {
    clubId: string;
    email: string;
    role: ClubRole;
    title?: string;
    permissions: CoreMemberPermission[];
    inviterUserId: string;
    replaceExisting?: boolean;
  }): Promise<ClubInvitation> {
    return this.invitationsRepo.createClubInvitation(input);
  }

  listClubInvitations(clubId: string): Promise<ClubInvitation[]> {
    return this.invitationsRepo.listClubInvitations(clubId);
  }

  resendClubInvitation(
    clubId: string,
    invitationId: string,
    actorUserId: string,
  ): Promise<ClubInvitation> {
    return this.invitationsRepo.resendClubInvitation(clubId, invitationId, actorUserId);
  }

  revokeClubInvitation(
    clubId: string,
    invitationId: string,
    actorUserId: string,
  ): Promise<ClubInvitation | null> {
    return this.invitationsRepo.revokeClubInvitation(clubId, invitationId, actorUserId);
  }

  previewInvitation(token: string) {
    return this.invitationsRepo.previewInvitation(token);
  }

  acceptInvitation(input: {
    token: string;
    authUserId: string;
    email: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
    emailVerified: boolean;
    isBootstrapSuperAdmin: boolean;
  }) {
    return this.invitationsRepo.acceptInvitation(input);
  }

  getFollowsForUser(userId: string): Promise<ClubFollow[]> {
    return this.clubsRepo.getFollowsForUser(userId);
  }

  followClub(userId: string, clubId: string): Promise<ClubFollow> {
    return this.clubsRepo.followClub(userId, clubId);
  }

  unfollowClub(userId: string, clubId: string): Promise<boolean> {
    return this.clubsRepo.unfollowClub(userId, clubId);
  }

  // Hall of Fame
  getHallOfFame(): Promise<HallOfFameEntry[]> {
    return this.clubsRepo.getHallOfFame();
  }

  // Events
  listEvents(filters?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<EventItem[]> {
    return this.eventsRepo.listEvents(filters);
  }

  listEventsPaginated(filters?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<EventItem>> {
    return this.eventsRepo.listEventsPaginated(filters);
  }

  getEventById(eventId: string): Promise<EventItem | null> {
    return this.eventsRepo.getEventById(eventId);
  }

  createEvent(
    clubId: string,
    input: Omit<
      EventItem,
      | 'id'
      | 'clubId'
      | 'clubName'
      | 'registeredCount'
      | 'attendedCount'
      | 'status'
      | 'bannerUrl'
      | 'createdAt'
      | 'updatedAt'
    >,
  ): Promise<EventItem> {
    return this.eventsRepo.createEvent(clubId, input);
  }

  updateEvent(eventId: string, updates: Partial<EventItem>): Promise<EventItem | null> {
    return this.eventsRepo.updateEvent(eventId, updates);
  }

  publishEvent(eventId: string): Promise<EventItem | null> {
    return this.eventsRepo.publishEvent(eventId);
  }

  updateEventLifecycle(eventId: string, targetStatus: EventStatus): Promise<EventItem | null> {
    return this.eventsRepo.updateEventLifecycle(eventId, targetStatus);
  }

  // Forms
  getRegistrationForm(eventId: string): Promise<RegistrationForm> {
    return this.eventsRepo.getRegistrationForm(eventId);
  }

  upsertRegistrationForm(
    eventId: string,
    fields: FormField[],
    meta?: {title?: string; description?: string; updatedBy?: string},
  ): Promise<RegistrationForm> {
    return this.eventsRepo.upsertRegistrationForm(eventId, fields, meta);
  }

  publishRegistrationForm(eventId: string, publishedBy?: string): Promise<EventFormVersion> {
    return this.eventsRepo.publishRegistrationForm(eventId, publishedBy);
  }

  getPublishedFormVersion(eventId: string, version?: number): Promise<EventFormVersion | null> {
    return this.eventsRepo.getPublishedFormVersion(eventId, version);
  }

  // Registrations
  createRegistration(input: {
    eventId: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    answers: Record<string, FormAnswerValue>;
    qrToken: string;
    formVersion?: number;
    formVersionId?: string | null;
  }): Promise<Registration> {
    return this.opsRepo.createRegistration(input);
  }

  cancelRegistration(eventId: string, studentId: string, registrationId?: string) {
    return this.opsRepo.cancelRegistration(eventId, studentId, registrationId);
  }

  listRegistrationsForEvent(eventId: string): Promise<Registration[]> {
    return this.opsRepo.listRegistrationsForEvent(eventId);
  }

  listRegistrationsForEventPaginated(
    eventId: string,
    opts?: {page?: number; pageSize?: number; search?: string; status?: string},
  ): Promise<PaginatedResult<Registration>> {
    return this.opsRepo.listRegistrationsForEventPaginated(eventId, opts);
  }

  listRegistrationsForStudent(studentId: string): Promise<Registration[]> {
    return this.opsRepo.listRegistrationsForStudent(studentId);
  }

  getRegistrationById(registrationId: string): Promise<Registration | null> {
    return this.opsRepo.getRegistrationById(registrationId);
  }

  getRegistrationByQrToken(eventId: string, qrToken: string): Promise<Registration | null> {
    return this.opsRepo.getRegistrationByQrToken(eventId, qrToken);
  }

  // Attendance
  recordAttendance(input: {
    eventId: string;
    registrationId: string;
    studentId: string;
    studentName: string;
    studentCode: string;
    qrToken: string;
    method: 'qr_scan' | 'manual_override';
    manualReason?: string;
    checkedInBy: string;
    scannedByUserId?: string;
  }): Promise<AttendanceRecord> {
    return this.opsRepo.recordAttendance(input);
  }

  listAttendanceForEvent(eventId: string): Promise<AttendanceRecord[]> {
    return this.opsRepo.listAttendanceForEvent(eventId);
  }

  listAttendanceForEventPaginated(
    eventId: string,
    opts?: {page?: number; pageSize?: number; search?: string},
  ): Promise<PaginatedResult<AttendanceRecord>> {
    return this.opsRepo.listAttendanceForEventPaginated(eventId, opts);
  }

  // Reports & Finance
  upsertEventReport(report: Omit<EventReport, 'id' | 'submittedAt'>): Promise<EventReport> {
    return this.opsRepo.upsertEventReport(report);
  }

  getEventReport(eventId: string): Promise<EventReport | null> {
    return this.opsRepo.getEventReport(eventId);
  }

  listAllEventReports(): Promise<EventReport[]> {
    return this.opsRepo.listAllEventReports();
  }

  upsertFinancialReport(
    report: Omit<FinancialReport, 'id' | 'submittedAt'>,
  ): Promise<FinancialReport> {
    return this.opsRepo.upsertFinancialReport(report);
  }

  getFinancialReport(eventId: string): Promise<FinancialReport | null> {
    return this.opsRepo.getFinancialReport(eventId);
  }

  listAllFinancialReports(): Promise<FinancialReport[]> {
    return this.opsRepo.listAllFinancialReports();
  }

  // Notifications
  listNotificationsForUser(userId: string): Promise<NotificationItem[]> {
    return this.opsRepo.listNotificationsForUser(userId);
  }

  markNotificationRead(userId: string, notificationId: string): Promise<NotificationItem | null> {
    return this.opsRepo.markNotificationRead(userId, notificationId);
  }

  markAllNotificationsRead(userId: string): Promise<void> {
    return this.opsRepo.markAllNotificationsRead(userId);
  }

  createNotification(
    input: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>,
  ): Promise<NotificationItem> {
    return this.opsRepo.createNotification(input);
  }

  // Admin & Audit
  getAdminDashboardStats(): Promise<AdminDashboardStats> {
    return this.opsRepo.getAdminDashboardStats();
  }

  listAuditLogs(): Promise<AuditLogEntry[]> {
    return this.opsRepo.listAuditLogs();
  }

  appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<AuditLogEntry> {
    return this.opsRepo.appendAuditLog(entry);
  }

  getSystemSettings(): Promise<SystemSettings> {
    return this.opsRepo.getSystemSettings();
  }

  updateSystemSettings(updates: Partial<SystemSettings>): Promise<SystemSettings> {
    return this.opsRepo.updateSystemSettings(updates);
  }
}
