import {API_PREFIX} from '../../shared/constants/permissions.ts';
import type {
  AdminDashboardStats,
  ApiResponse,
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
import type {ClientDataAdapter} from './DataAdapter.ts';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ApiDataAdapter implements ClientDataAdapter {
  private authToken: string | null = null;

  public setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (this.authToken) {
      headers.set('Authorization', `Bearer ${this.authToken}`);
    }

    const res = await fetch(`${API_PREFIX}${path}`, {
      ...options,
      headers,
    });

    const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
    if (!res.ok || !json || !json.success) {
      const err = json && !json.success ? json.error : null;
      throw new ApiClientError(
        res.status,
        err?.code || 'API_ERROR',
        err?.message || `Request failed with status ${res.status}`,
        err?.details,
      );
    }
    return json.data;
  }

  getHealth() {
    return this.request<{status: string; mode: string; persistence: string}>('/health');
  }

  getReadyHealth() {
    return this.request<{status: string; persistence: string; latencyMs: number}>('/health/ready');
  }

  getAuthConfig() {
    return this.request<{
      mode: 'demo' | 'supabase';
      persistenceMode: 'in_memory_demo' | 'postgres';
      demoModeEnabled: boolean;
      supabaseUrl: string | null;
      supabasePublishableKey: string | null;
      institutionalEmailDomains: string[];
    }>('/auth/config');
  }

  listDemoPersonas() {
    return this.request<UserAccount[]>('/auth/demo-personas');
  }

  loginDemo(input: {personaId?: string; email?: string; password?: string}) {
    return this.request<{token: string; session: AuthSessionResponse}>('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  registerDemo(input: {
    name: string;
    email: string;
    department: string;
    yearOfStudy: string;
    password: string;
  }) {
    return this.request<{token: string; session: AuthSessionResponse}>('/auth/demo-register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getMe() {
    return this.request<AuthSessionResponse>('/auth/me');
  }

  logout() {
    return this.request<void>('/auth/logout', {method: 'POST'});
  }

  updateMyProfile(input: {name: string; department: string; yearOfStudy: string}) {
    return this.request<UserAccount>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  listClubs(params?: {search?: string; category?: string; sortBy?: string}) {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category && params.category !== 'All') qs.set('category', params.category);
    if (params?.sortBy) qs.set('sortBy', params.sortBy);
    const query = qs.toString();
    return this.request<Club[]>(`/clubs${query ? `?${query}` : ''}`);
  }

  getClubDetail(clubId: string) {
    return this.request<ClubDetail>(`/clubs/${encodeURIComponent(clubId)}`);
  }

  updateClub(clubId: string, updates: Partial<Club>) {
    return this.request<Club>(`/clubs/${encodeURIComponent(clubId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  createClub(input: {
    name: string;
    category: Club['category'];
    tagline: string;
    description: string;
    meetingSchedule: string;
    contactEmail: string;
  }) {
    return this.request<Club>('/clubs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getMyMemberships() {
    return this.request<{memberships: ClubMembership[]; follows: ClubFollow[]}>('/memberships/me');
  }

  followClub(clubId: string) {
    return this.request<ClubFollow>(`/clubs/${encodeURIComponent(clubId)}/follow`, {
      method: 'POST',
    });
  }

  unfollowClub(clubId: string) {
    return this.request<void>(`/clubs/${encodeURIComponent(clubId)}/follow`, {
      method: 'DELETE',
    });
  }

  getClubTeam(clubId: string) {
    return this.request<ClubMembership[]>(`/clubs/${encodeURIComponent(clubId)}/members`);
  }

  upsertClubMember(
    clubId: string,
    input: {email: string; role: 'club_admin' | 'core_member'; title: string; permissions: CoreMemberPermission[]},
  ) {
    return this.request<ClubMembership>(`/clubs/${encodeURIComponent(clubId)}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateMemberPermissions(
    clubId: string,
    membershipId: string,
    updates: {role?: 'club_admin' | 'core_member'; title?: string; permissions: CoreMemberPermission[]},
  ) {
    return this.request<ClubMembership>(
      `/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(membershipId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      },
    );
  }

  removeClubMember(clubId: string, membershipId: string) {
    return this.request<void>(
      `/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(membershipId)}`,
      {method: 'DELETE'},
    );
  }

  getHallOfFame() {
    return this.request<HallOfFameEntry[]>('/hall-of-fame');
  }

  listEvents(params?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
  }) {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category && params.category !== 'All') qs.set('category', params.category);
    if (params?.clubId && params.clubId !== 'All') qs.set('clubId', params.clubId);
    if (params?.status && params.status !== 'All') qs.set('status', params.status);
    if (params?.upcomingOnly) qs.set('upcomingOnly', 'true');
    const query = qs.toString();
    return this.request<EventItem[]>(`/events${query ? `?${query}` : ''}`);
  }

  getEventDetail(eventId: string) {
    return this.request<EventItem>(`/events/${encodeURIComponent(eventId)}`);
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
    return this.request<EventItem>(`/clubs/${encodeURIComponent(clubId)}/events`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateEvent(eventId: string, updates: Partial<EventItem>) {
    return this.request<EventItem>(`/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  publishEvent(eventId: string) {
    return this.request<EventItem>(`/events/${encodeURIComponent(eventId)}/publish`, {
      method: 'POST',
    });
  }

  getEventForm(eventId: string) {
    return this.request<RegistrationForm>(`/events/${encodeURIComponent(eventId)}/form`);
  }

  saveEventForm(eventId: string, fields: FormField[]) {
    return this.request<RegistrationForm>(`/events/${encodeURIComponent(eventId)}/form`, {
      method: 'PUT',
      body: JSON.stringify({fields}),
    });
  }

  submitRegistration(eventId: string, answers: Record<string, string | boolean | number>) {
    return this.request<Registration>(`/events/${encodeURIComponent(eventId)}/registrations`, {
      method: 'POST',
      body: JSON.stringify({answers}),
    });
  }

  listEventRegistrations(eventId: string) {
    return this.request<Registration[]>(`/events/${encodeURIComponent(eventId)}/registrations`);
  }

  listMyRegistrations() {
    return this.request<Registration[]>('/registrations/me');
  }

  scanAttendance(
    eventId: string,
    input: {qrToken?: string; registrationId?: string; method: 'qr_scan' | 'manual_override'},
  ) {
    return this.request<AttendanceRecord>(`/events/${encodeURIComponent(eventId)}/attendance/scan`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getEventAttendance(eventId: string) {
    return this.request<{records: AttendanceRecord[]; registeredCount: number; attendedCount: number}>(
      `/events/${encodeURIComponent(eventId)}/attendance`,
    );
  }

  submitEventReport(
    eventId: string,
    input: {
      outcomeSummary: string;
      highlights: string;
      challenges: string;
      actualAttendance: number;
      completionStatus: 'completed' | 'partial';
    },
  ) {
    return this.request<EventReport>(`/events/${encodeURIComponent(eventId)}/report`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getEventReport(eventId: string) {
    return this.request<EventReport | null>(`/events/${encodeURIComponent(eventId)}/report`);
  }

  submitFinancialReport(
    eventId: string,
    input: {lineItems: FinancialLineItem[]; notes: string},
  ) {
    return this.request<FinancialReport>(`/events/${encodeURIComponent(eventId)}/finance-report`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getFinancialReport(eventId: string) {
    return this.request<FinancialReport | null>(`/events/${encodeURIComponent(eventId)}/finance-report`);
  }

  listNotifications() {
    return this.request<NotificationItem[]>('/notifications');
  }

  markNotificationRead(notificationId: string) {
    return this.request<NotificationItem>(
      `/notifications/${encodeURIComponent(notificationId)}/read`,
      {method: 'PATCH'},
    );
  }

  markAllNotificationsRead() {
    return this.request<void>('/notifications/read-all', {method: 'POST'});
  }

  getAdminDashboard() {
    return this.request<AdminDashboardStats>('/admin/dashboard');
  }

  listAdminClubs() {
    return this.request<Club[]>('/admin/clubs');
  }

  updateClubStatus(clubId: string, status: ClubStatus, reason?: string) {
    return this.request<Club>(`/admin/clubs/${encodeURIComponent(clubId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({status, reason}),
    });
  }

  listAdminUsers() {
    return this.request<UserAccount[]>('/admin/users');
  }

  updateUserStatus(userId: string, status: 'active' | 'suspended', reason?: string) {
    return this.request<UserAccount>(`/admin/users/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({status, reason}),
    });
  }

  listAdminReports() {
    return this.request<EventReport[]>('/admin/reports');
  }

  getAdminFinance() {
    return this.request<{
      reports: FinancialReport[];
      totalCollections: number;
      totalExpenses: number;
      netBalance: number;
    }>('/admin/finance');
  }

  listAdminAuditLogs() {
    return this.request<AuditLogEntry[]>('/admin/audit-logs');
  }

  getAdminSettings() {
    return this.request<SystemSettings>('/admin/settings');
  }

  updateAdminSettings(updates: Partial<SystemSettings>) {
    return this.request<SystemSettings>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }
}

export const apiClient = new ApiDataAdapter();
