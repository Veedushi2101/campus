import type {
  AdminDashboardStats,
  AttendanceRecord,
  AuditLogEntry,
  AuthSessionResponse,
  Club,
  ClubDetail,
  ClubFollow,
  ClubMembership,
  ClubStatus,
  CoreMemberPermission,
  EventItem,
  EventReport,
  FinancialLineItem,
  FinancialReport,
  FormField,
  HallOfFameEntry,
  NotificationItem,
  Registration,
  RegistrationForm,
  SystemSettings,
  UserAccount,
} from '../../shared/types/domain.ts';

export interface ClientDataAdapter {
  setAuthToken(token: string | null): void;
  getHealth(): Promise<{status: string; mode: string; persistence: string}>;

  // Auth
  listDemoPersonas(): Promise<UserAccount[]>;
  loginDemo(input: {personaId?: string; email?: string; password?: string}): Promise<{
    token: string;
    session: AuthSessionResponse;
  }>;
  registerDemo(input: {
    name: string;
    email: string;
    department: string;
    yearOfStudy: string;
    password: string;
  }): Promise<{token: string; session: AuthSessionResponse}>;
  getMe(): Promise<AuthSessionResponse>;
  logout(): Promise<void>;

  // Users
  updateMyProfile(input: {name: string; department: string; yearOfStudy: string}): Promise<UserAccount>;

  // Clubs & Follows
  listClubs(params?: {search?: string; category?: string; sortBy?: string}): Promise<Club[]>;
  getClubDetail(clubId: string): Promise<ClubDetail>;
  updateClub(clubId: string, updates: Partial<Club>): Promise<Club>;
  createClub(input: {
    name: string;
    category: Club['category'];
    tagline: string;
    description: string;
    meetingSchedule: string;
    contactEmail: string;
  }): Promise<Club>;

  getMyMemberships(): Promise<{memberships: ClubMembership[]; follows: ClubFollow[]}>;
  followClub(clubId: string): Promise<ClubFollow>;
  unfollowClub(clubId: string): Promise<void>;
  getClubTeam(clubId: string): Promise<ClubMembership[]>;
  upsertClubMember(
    clubId: string,
    input: {email: string; role: 'club_admin' | 'core_member'; title: string; permissions: CoreMemberPermission[]},
  ): Promise<ClubMembership>;
  updateMemberPermissions(
    clubId: string,
    membershipId: string,
    updates: {role?: 'club_admin' | 'core_member'; title?: string; permissions: CoreMemberPermission[]},
  ): Promise<ClubMembership>;
  removeClubMember(clubId: string, membershipId: string): Promise<void>;

  // Hall of Fame
  getHallOfFame(): Promise<HallOfFameEntry[]>;

  // Events & Forms
  listEvents(params?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
  }): Promise<EventItem[]>;
  getEventDetail(eventId: string): Promise<EventItem>;
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
  ): Promise<EventItem>;
  updateEvent(eventId: string, updates: Partial<EventItem>): Promise<EventItem>;
  publishEvent(eventId: string): Promise<EventItem>;

  getEventForm(eventId: string): Promise<RegistrationForm>;
  saveEventForm(eventId: string, fields: FormField[]): Promise<RegistrationForm>;

  // Registrations & Attendance
  submitRegistration(
    eventId: string,
    answers: Record<string, string | boolean | number>,
  ): Promise<Registration>;
  listEventRegistrations(eventId: string): Promise<Registration[]>;
  listMyRegistrations(): Promise<Registration[]>;

  scanAttendance(
    eventId: string,
    input: {qrToken?: string; registrationId?: string; method: 'qr_scan' | 'manual_override'},
  ): Promise<AttendanceRecord>;
  getEventAttendance(
    eventId: string,
  ): Promise<{records: AttendanceRecord[]; registeredCount: number; attendedCount: number}>;

  // Reports & Finance
  submitEventReport(
    eventId: string,
    input: {
      outcomeSummary: string;
      highlights: string;
      challenges: string;
      actualAttendance: number;
      completionStatus: 'completed' | 'partial';
    },
  ): Promise<EventReport>;
  getEventReport(eventId: string): Promise<EventReport | null>;

  submitFinancialReport(
    eventId: string,
    input: {lineItems: FinancialLineItem[]; notes: string},
  ): Promise<FinancialReport>;
  getFinancialReport(eventId: string): Promise<FinancialReport | null>;

  // Notifications
  listNotifications(): Promise<NotificationItem[]>;
  markNotificationRead(notificationId: string): Promise<NotificationItem>;
  markAllNotificationsRead(): Promise<void>;

  // Super Admin
  getAdminDashboard(): Promise<AdminDashboardStats>;
  listAdminClubs(): Promise<Club[]>;
  updateClubStatus(clubId: string, status: ClubStatus, reason?: string): Promise<Club>;
  listAdminUsers(): Promise<UserAccount[]>;
  updateUserStatus(userId: string, status: 'active' | 'suspended', reason?: string): Promise<UserAccount>;
  listAdminReports(): Promise<EventReport[]>;
  getAdminFinance(): Promise<{
    reports: FinancialReport[];
    totalCollections: number;
    totalExpenses: number;
    netBalance: number;
  }>;
  listAdminAuditLogs(): Promise<AuditLogEntry[]>;
  getAdminSettings(): Promise<SystemSettings>;
  updateAdminSettings(updates: Partial<SystemSettings>): Promise<SystemSettings>;
}
