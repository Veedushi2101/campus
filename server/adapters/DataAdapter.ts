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

export interface ResolvedAuthContext {
  user: UserAccount;
  memberships: ClubMembership[];
  followedClubIds: string[];
}

export interface DataAdapter {
  // Adapter Lifecycle & Readiness
  getPersistenceMode(): 'in_memory_demo' | 'postgres';
  checkReadiness(): Promise<{
    ready: boolean;
    latencyMs: number;
    persistence: string;
    error?: string;
  }>;

  // Auth & Users
  getUserById(userId: string): Promise<UserAccount | null>;
  getUserByEmail(email: string): Promise<UserAccount | null>;
  provisionAuthenticatedUser(input: {
    authUserId: string;
    email: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
    emailVerified: boolean;
    isBootstrapSuperAdmin: boolean;
  }): Promise<UserAccount>;
  resolveAuthenticatedContext?(input: {
    authUserId: string;
    email: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
    emailVerified: boolean;
    isBootstrapSuperAdmin: boolean;
  }): Promise<ResolvedAuthContext>;
  recordAuthSession?(input: {
    userId: string;
    ipHash?: string;
    userAgent?: string;
  }): Promise<void>;
  listUsers(): Promise<UserAccount[]>;
  updateUserProfile(
    userId: string,
    updates: Partial<Pick<UserAccount, 'name' | 'department' | 'yearOfStudy'>>,
  ): Promise<UserAccount | null>;
  updateUserStatus(userId: string, status: 'active' | 'suspended'): Promise<UserAccount | null>;
  createDemoUser(input: {
    name: string;
    email: string;
    department: string;
    yearOfStudy: string;
  }): Promise<UserAccount>;

  // Clubs
  listClubs(filters?: {
    search?: string;
    category?: string;
    status?: ClubStatus;
    includeAllStatuses?: boolean;
    sortBy?: 'followers' | 'name' | 'events';
    page?: number;
    pageSize?: number;
  }): Promise<Club[]>;
  listClubsPaginated?(filters?: {
    search?: string;
    category?: string;
    status?: ClubStatus;
    includeAllStatuses?: boolean;
    sortBy?: 'followers' | 'name' | 'events';
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<Club>>;
  getClubDetail(clubId: string, viewerUserId?: string): Promise<ClubDetail | null>;
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
  }): Promise<Club>;
  updateClub(clubId: string, updates: Partial<Club>): Promise<Club | null>;
  updateClubStatus(clubId: string, status: ClubStatus): Promise<Club | null>;

  // Memberships, Leadership, Invitations & Following
  getMembershipsForUser(userId: string): Promise<ClubMembership[]>;
  getClubMemberships(clubId: string): Promise<ClubMembership[]>;
  listAllMemberships(): Promise<ClubMembership[]>;
  upsertClubMembership(input: {
    clubId: string;
    userId: string;
    role: ClubMembership['role'];
    title: string;
    permissions: CoreMemberPermission[];
    assignedByUserId?: string;
    strictInsert?: boolean;
  }): Promise<ClubMembership>;
  updateMembershipPermissions(
    clubId: string,
    membershipId: string,
    updates: {
      role?: ClubMembership['role'];
      title?: string;
      permissions?: CoreMemberPermission[];
    },
  ): Promise<ClubMembership | null>;
  removeClubMembership(clubId: string, membershipId: string): Promise<boolean>;

  assignClubLeadership(input: {
    clubId: string;
    email: string;
    role: 'president' | 'vice_president';
    title?: string;
    replaceExisting?: boolean;
    sendInvitation?: boolean;
    actorUserId: string;
  }): Promise<{
    mode: 'assigned' | 'invited';
    membership?: ClubMembership;
    invitation?: ClubInvitation;
    replacedUserId?: string | null;
  }>;
  createClubInvitation(input: {
    clubId: string;
    email: string;
    role: ClubRole;
    title?: string;
    permissions: CoreMemberPermission[];
    inviterUserId: string;
    replaceExisting?: boolean;
  }): Promise<ClubInvitation>;
  listClubInvitations(clubId: string): Promise<ClubInvitation[]>;
  resendClubInvitation(
    clubId: string,
    invitationId: string,
    actorUserId: string,
  ): Promise<ClubInvitation>;
  revokeClubInvitation(
    clubId: string,
    invitationId: string,
    actorUserId: string,
  ): Promise<ClubInvitation | null>;
  previewInvitation(token: string): Promise<{
    invitation: ClubInvitation;
    clubName: string;
    clubSlug: string;
    hasExistingAccount: boolean;
  }>;
  acceptInvitation(input: {
    token: string;
    authUserId: string;
    email: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
    emailVerified: boolean;
    isBootstrapSuperAdmin: boolean;
  }): Promise<{
    invitation: ClubInvitation;
    membership: ClubMembership;
    user: UserAccount;
  }>;

  getFollowsForUser(userId: string): Promise<ClubFollow[]>;
  followClub(userId: string, clubId: string): Promise<ClubFollow>;
  unfollowClub(userId: string, clubId: string): Promise<boolean>;

  // Hall of Fame
  getHallOfFame(): Promise<HallOfFameEntry[]>;

  // Events
  listEvents(filters?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<EventItem[]>;
  listEventsPaginated?(filters?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<EventItem>>;
  getEventById(eventId: string): Promise<EventItem | null>;
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
  ): Promise<EventItem>;
  updateEvent(eventId: string, updates: Partial<EventItem>): Promise<EventItem | null>;
  publishEvent(eventId: string): Promise<EventItem | null>;
  updateEventLifecycle?(eventId: string, targetStatus: EventStatus): Promise<EventItem | null>;

  // Forms & Immutable Snapshots
  getRegistrationForm(eventId: string): Promise<RegistrationForm>;
  upsertRegistrationForm(
    eventId: string,
    fields: FormField[],
    meta?: {title?: string; description?: string; updatedBy?: string},
  ): Promise<RegistrationForm>;
  publishRegistrationForm?(eventId: string, publishedBy?: string): Promise<EventFormVersion>;
  getPublishedFormVersion?(eventId: string, version?: number): Promise<EventFormVersion | null>;

  // Registrations & Waitlist
  createRegistration(input: {
    eventId: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    answers: Record<string, FormAnswerValue>;
    qrToken: string;
    formVersion?: number;
    formVersionId?: string | null;
  }): Promise<Registration>;
  cancelRegistration?(
    eventId: string,
    studentId: string,
    registrationId?: string,
  ): Promise<{cancelled: Registration; promotedUserId?: string | null; promotedRegistrationId?: string | null}>;
  listRegistrationsForEvent(eventId: string): Promise<Registration[]>;
  listRegistrationsForEventPaginated?(
    eventId: string,
    opts?: {page?: number; pageSize?: number; search?: string; status?: string},
  ): Promise<PaginatedResult<Registration>>;
  listRegistrationsForStudent(studentId: string): Promise<Registration[]>;
  getRegistrationById(registrationId: string): Promise<Registration | null>;
  getRegistrationByQrToken(eventId: string, qrToken: string): Promise<Registration | null>;

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
  }): Promise<AttendanceRecord>;
  listAttendanceForEvent(eventId: string): Promise<AttendanceRecord[]>;
  listAttendanceForEventPaginated?(
    eventId: string,
    opts?: {page?: number; pageSize?: number; search?: string},
  ): Promise<PaginatedResult<AttendanceRecord>>;

  // Reports & Finance
  upsertEventReport(
    report: Omit<EventReport, 'id' | 'submittedAt'>,
  ): Promise<EventReport>;
  getEventReport(eventId: string): Promise<EventReport | null>;
  listAllEventReports(): Promise<EventReport[]>;

  upsertFinancialReport(
    report: Omit<FinancialReport, 'id' | 'submittedAt'>,
  ): Promise<FinancialReport>;
  getFinancialReport(eventId: string): Promise<FinancialReport | null>;
  listAllFinancialReports(): Promise<FinancialReport[]>;

  // Notifications
  listNotificationsForUser(userId: string): Promise<NotificationItem[]>;
  markNotificationRead(userId: string, notificationId: string): Promise<NotificationItem | null>;
  markAllNotificationsRead(userId: string): Promise<void>;
  createNotification(input: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>): Promise<NotificationItem>;

  // Admin & Audit
  getAdminDashboardStats(): Promise<AdminDashboardStats>;
  listAuditLogs(): Promise<AuditLogEntry[]>;
  appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<AuditLogEntry>;
  getSystemSettings(): Promise<SystemSettings>;
  updateSystemSettings(updates: Partial<SystemSettings>): Promise<SystemSettings>;
}
