import type {CoreMemberPermission, ClubCategory, EventCategory} from '../constants/permissions.ts';
export type {CoreMemberPermission, ClubCategory, EventCategory};

export type AccountStatus = 'active' | 'suspended' | 'pending_verification';
export type ClubStatus = 'active' | 'suspended' | 'pending_review';
export type ClubRole = 'club_admin' | 'core_member';
export type EventStatus = 'draft' | 'published' | 'completed' | 'cancelled';
export type RegistrationStatus = 'confirmed' | 'waitlisted' | 'cancelled' | 'attended';
export type FormFieldType = 'text' | 'email' | 'number' | 'select' | 'checkbox' | 'textarea';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  department: string;
  yearOfStudy: string;
  studentId: string;
  isSuperAdmin: boolean;
  status: AccountStatus;
  emailVerified: boolean;
  avatarInitials: string;
  createdAt: string;
}

export interface ClubMembership {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  clubId: string;
  clubName?: string;
  role: ClubRole;
  title: string;
  permissions: CoreMemberPermission[];
  assignedTasks?: string[];
  joinedAt: string;
}

export interface ClubFollow {
  id: string;
  userId: string;
  clubId: string;
  followedAt: string;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  category: ClubCategory;
  tagline: string;
  description: string;
  logoUrl: string;
  status: ClubStatus;
  followerCount: number;
  memberCount: number;
  upcomingEventsCount: number;
  foundedYear: number;
  meetingSchedule: string;
  contactEmail: string;
  createdAt: string;
}

export interface ClubDetail extends Club {
  team: ClubMembership[];
  upcomingEvents: EventItem[];
  isFollowing?: boolean;
}

export interface HallOfFameEntry {
  rank: number;
  club: Club;
  followerCount: number;
  eventsHosted: number;
  tieCount: number;
}

export interface EventItem {
  id: string;
  clubId: string;
  clubName: string;
  title: string;
  category: EventCategory;
  description: string;
  venue: string;
  startTime: string;
  endTime: string;
  capacity: number;
  registeredCount: number;
  attendedCount: number;
  status: EventStatus;
  bannerUrl: string;
  registrationDeadline: string;
  isPaid: boolean;
  feeAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface RegistrationForm {
  id: string;
  eventId: string;
  version: number;
  fields: FormField[];
  updatedAt: string;
}

export interface QrCredential {
  token: string;
  registrationId: string;
  eventId: string;
  issuedAt: string;
  usedAt: string | null;
}

export interface Registration {
  id: string;
  eventId: string;
  eventTitle?: string;
  eventStartTime?: string;
  eventVenue?: string;
  clubId?: string;
  clubName?: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  answers: Record<string, string | boolean | number>;
  status: RegistrationStatus;
  qrToken: string;
  qrUsedAt: string | null;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  eventId: string;
  registrationId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  qrToken: string;
  method: 'qr_scan' | 'manual_override';
  checkedInBy: string;
  checkedInAt: string;
}

export interface EventReport {
  id: string;
  eventId: string;
  eventTitle: string;
  clubId: string;
  clubName: string;
  submittedBy: string;
  submittedByName: string;
  outcomeSummary: string;
  highlights: string;
  challenges: string;
  actualAttendance: number;
  registeredTotal: number;
  completionStatus: 'completed' | 'partial';
  submittedAt: string;
}

export interface FinancialLineItem {
  id: string;
  type: 'collection' | 'expense';
  label: string;
  category: string;
  amount: number;
  notes?: string;
}

export interface FinancialReport {
  id: string;
  eventId: string;
  eventTitle: string;
  clubId: string;
  clubName: string;
  submittedBy: string;
  submittedByName: string;
  totalCollections: number;
  totalExpenses: number;
  netBalance: number;
  lineItems: FinancialLineItem[];
  notes: string;
  submittedAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  category: 'event' | 'club' | 'registration' | 'admin';
  read: boolean;
  link?: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorContext: string;
  action: string;
  targetType: 'club' | 'user' | 'event' | 'report' | 'membership' | 'system';
  targetId: string;
  targetLabel: string;
  details: string;
  createdAt: string;
}

export interface AuthSessionResponse {
  user: UserAccount;
  memberships: ClubMembership[];
  followedClubIds: string[];
  mode: 'demo' | 'supabase';
}

export interface AdminDashboardStats {
  totalStudents: number;
  totalClubs: number;
  activeClubs: number;
  totalEvents: number;
  upcomingEvents: number;
  totalRegistrations: number;
  totalCollections: number;
  totalExpenses: number;
  netBalance: number;
  recentAuditLogs: AuditLogEntry[];
}

export interface SystemSettings {
  maxClubsPerStudent: number;
  requireClubApproval: boolean;
  allowStudentEventFeedback: boolean;
  phaseLabel: string;
  persistenceMode: 'in_memory_demo' | 'postgres';
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
