import type {
  AdminDashboardStats,
  AttendanceRecord,
  AuditLogEntry,
  Club,
  ClubDetail,
  ClubFollow,
  ClubMembership,
  ClubStatus,
  CoreMemberPermission,
  EventItem,
  EventReport,
  FinancialReport,
  FormField,
  HallOfFameEntry,
  NotificationItem,
  Registration,
  RegistrationForm,
  SystemSettings,
  UserAccount,
} from '../../shared/types/domain.ts';

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
  }): Promise<Club[]>;
  getClubDetail(clubId: string, viewerUserId?: string): Promise<ClubDetail | null>;
  createClub(input: {
    name: string;
    category: Club['category'];
    tagline: string;
    description: string;
    meetingSchedule: string;
    contactEmail: string;
    status?: ClubStatus;
    createdByUserId?: string;
  }): Promise<Club>;
  updateClub(clubId: string, updates: Partial<Club>): Promise<Club | null>;
  updateClubStatus(clubId: string, status: ClubStatus): Promise<Club | null>;

  // Memberships & Following
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
  }): Promise<EventItem[]>;
  getEventById(eventId: string): Promise<EventItem | null>;
  createEvent(
    clubId: string,
    input: Omit<
      EventItem,
      'id' | 'clubId' | 'clubName' | 'registeredCount' | 'attendedCount' | 'status' | 'bannerUrl' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<EventItem>;
  updateEvent(eventId: string, updates: Partial<EventItem>): Promise<EventItem | null>;
  publishEvent(eventId: string): Promise<EventItem | null>;

  // Forms
  getRegistrationForm(eventId: string): Promise<RegistrationForm>;
  upsertRegistrationForm(eventId: string, fields: FormField[]): Promise<RegistrationForm>;

  // Registrations
  createRegistration(input: {
    eventId: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    answers: Record<string, string | boolean | number>;
    qrToken: string;
  }): Promise<Registration>;
  listRegistrationsForEvent(eventId: string): Promise<Registration[]>;
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
    checkedInBy: string;
    scannedByUserId?: string;
  }): Promise<AttendanceRecord>;
  listAttendanceForEvent(eventId: string): Promise<AttendanceRecord[]>;

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
