import crypto from 'crypto';
import type {
  AuditLogEntry,
  Club,
  ClubMembership,
  ClubStatus,
  CoreMemberPermission,
  EventItem,
  EventReport,
  EventStatus,
  FinancialLineItem,
  FinancialReport,
  FormField,
  NotificationItem,
  Registration,
  RegistrationForm,
  RegistrationStatus,
  UserAccount,
} from '../../../shared/types/domain.ts';
import type {
  auditLogs,
  clubMemberships,
  clubs,
  eventForms,
  eventReports,
  events,
  financeLineItems,
  financeReports,
  formFields,
  notifications,
  registrations,
  users,
} from '../schema.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): value is string {
  return Boolean(value && UUID_REGEX.test(value.trim()));
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function hashSha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toUpperCase()).digest('hex');
}

export function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CV';
  return parts
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function toCents(amount: number | string): number {
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function fromCentsToFixed(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function fromCentsToNumber(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export function normalizeClubStatus(status: string): ClubStatus {
  if (status === 'pending') return 'pending_review';
  if (status === 'active' || status === 'suspended' || status === 'pending_review') {
    return status;
  }
  return 'pending_review';
}

export function mapUserRow(row: typeof users.$inferSelect): UserAccount {
  return {
    id: row.id,
    name: row.displayName,
    email: row.email,
    department: row.department,
    yearOfStudy: row.yearOfStudy,
    studentId: row.studentId || `STU-${row.id.slice(0, 8).toUpperCase()}`,
    isSuperAdmin: row.globalRole === 'super_admin',
    status: row.accountStatus === 'suspended' || row.accountStatus === 'disabled' ? 'suspended' : 'active',
    emailVerified: Boolean(row.emailVerifiedAt),
    avatarInitials: computeInitials(row.displayName),
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapClubRow(
  row: typeof clubs.$inferSelect,
  stats?: {memberCount?: number; upcomingEventsCount?: number},
): Club {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category as Club['category'],
    tagline: row.tagline,
    description: row.description,
    logoUrl: row.logoUrl,
    status: normalizeClubStatus(row.status),
    followerCount: row.followerCount,
    memberCount: stats?.memberCount ?? 0,
    upcomingEventsCount: stats?.upcomingEventsCount ?? 0,
    foundedYear: row.foundedYear,
    meetingSchedule: row.meetingSchedule,
    contactEmail: row.contactEmail,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapMembershipRow(
  row: typeof clubMemberships.$inferSelect,
  extras?: {userName?: string; userEmail?: string; clubName?: string},
): ClubMembership {
  return {
    id: row.id,
    userId: row.userId,
    userName: extras?.userName,
    userEmail: extras?.userEmail,
    clubId: row.clubId,
    clubName: extras?.clubName,
    role: row.membershipRole as ClubMembership['role'],
    title: row.title,
    permissions: (row.permissions || []) as CoreMemberPermission[],
    assignedTasks: row.assignedTasks || [],
    joinedAt: row.createdAt.toISOString(),
  };
}

export function mapEventRow(
  row: typeof events.$inferSelect,
  extras?: {clubName?: string; attendedCount?: number},
): EventItem {
  return {
    id: row.id,
    clubId: row.clubId,
    clubName: extras?.clubName || '',
    title: row.title,
    category: row.category as EventItem['category'],
    description: row.description,
    venue: row.venue,
    startTime: row.startsAt.toISOString(),
    endTime: row.endsAt.toISOString(),
    capacity: row.capacity,
    registeredCount: row.registeredCount,
    attendedCount: extras?.attendedCount ?? 0,
    status: row.status as EventStatus,
    bannerUrl: row.bannerUrl,
    registrationDeadline: row.registrationDeadline.toISOString(),
    isPaid: row.isPaid,
    feeAmount: Number(row.feeAmount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapFormRow(
  formRow: typeof eventForms.$inferSelect,
  fieldRows: Array<typeof formFields.$inferSelect>,
): RegistrationForm {
  const fields: FormField[] = [...fieldRows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => ({
      id: f.fieldKey,
      label: f.label,
      type: (f.fieldType === 'phone' ? 'text' : f.fieldType) as FormField['type'],
      required: f.required,
      placeholder: f.placeholder ?? undefined,
      options: f.options && f.options.length > 0 ? f.options : undefined,
    }));

  return {
    id: formRow.id,
    eventId: formRow.eventId,
    version: formRow.version,
    fields,
    updatedAt: formRow.updatedAt.toISOString(),
  };
}

export function mapRegistrationRow(
  row: typeof registrations.$inferSelect,
  extras?: {
    eventTitle?: string;
    eventStartTime?: string;
    eventVenue?: string;
    clubId?: string;
    clubName?: string;
    studentName?: string;
    studentEmail?: string;
    qrUsedAt?: string | null;
  },
): Registration {
  return {
    id: row.id,
    eventId: row.eventId,
    eventTitle: extras?.eventTitle,
    eventStartTime: extras?.eventStartTime,
    eventVenue: extras?.eventVenue,
    clubId: extras?.clubId,
    clubName: extras?.clubName,
    studentId: row.userId,
    studentName: extras?.studentName || 'Student',
    studentEmail: extras?.studentEmail || '',
    answers: row.answers || {},
    status: row.status as RegistrationStatus,
    qrToken: row.qrToken,
    qrUsedAt: extras?.qrUsedAt ?? null,
    createdAt: row.submittedAt.toISOString(),
  };
}

export function mapEventReportRow(
  row: typeof eventReports.$inferSelect,
  extras: {eventTitle: string; clubName: string},
): EventReport {
  return {
    id: row.id,
    eventId: row.eventId,
    eventTitle: extras.eventTitle,
    clubId: row.clubId,
    clubName: extras.clubName,
    submittedBy: row.submittedBy || '',
    submittedByName: row.submittedByName,
    outcomeSummary: row.summary,
    highlights: row.highlights,
    challenges: row.challenges,
    actualAttendance: row.actualAttendance,
    registeredTotal: row.registeredTotal,
    completionStatus: row.completionStatus as EventReport['completionStatus'],
    submittedAt: row.submittedAt.toISOString(),
  };
}

export function mapFinancialReportRow(
  row: typeof financeReports.$inferSelect,
  items: Array<typeof financeLineItems.$inferSelect>,
  extras: {eventTitle: string; clubName: string},
): FinancialReport {
  const lineItems: FinancialLineItem[] = items.map((i) => ({
    id: i.id,
    type: i.itemType === 'expense' ? 'expense' : 'collection',
    label: i.description,
    category: i.category,
    amount: Number(i.amount),
    notes: i.notes ?? undefined,
  }));

  return {
    id: row.id,
    eventId: row.eventId,
    eventTitle: extras.eventTitle,
    clubId: row.clubId,
    clubName: extras.clubName,
    submittedBy: row.submittedBy || '',
    submittedByName: row.submittedByName,
    totalCollections: Number(row.totalCollections),
    totalExpenses: Number(row.totalExpenses),
    netBalance: Number(row.netBalance),
    lineItems,
    notes: row.notes,
    submittedAt: row.submittedAt.toISOString(),
  };
}

export function mapNotificationRow(row: typeof notifications.$inferSelect): NotificationItem {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    message: row.message,
    category: (['event', 'club', 'registration', 'admin'].includes(row.type)
      ? row.type
      : 'event') as NotificationItem['category'],
    read: row.isRead,
    link: row.link ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapAuditLogRow(row: typeof auditLogs.$inferSelect): AuditLogEntry {
  const details =
    typeof row.metadata?.details === 'string' ? row.metadata.details : row.action;
  return {
    id: row.id,
    actorId: row.actorUserId || 'system',
    actorName: row.actorName,
    actorContext: row.actorContext,
    action: row.action,
    targetType: row.targetType as AuditLogEntry['targetType'],
    targetId: row.targetId,
    targetLabel: row.targetLabel,
    details,
    createdAt: row.createdAt.toISOString(),
  };
}
