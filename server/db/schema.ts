import {sql} from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {CoreMemberPermission} from '../../shared/constants/permissions.ts';

// 1. users
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authUserId: uuid('auth_user_id').notNull().unique(),
    email: text('email').notNull().unique(),
    normalizedEmail: text('normalized_email').notNull().unique(),
    displayName: text('display_name').notNull(),
    department: text('department').notNull().default('Computer Science & Engineering'),
    yearOfStudy: text('year_of_study').notNull().default('Undergraduate'),
    studentId: text('student_id').unique(),
    avatarUrl: text('avatar_url'),
    globalRole: text('global_role').notNull().default('user'),
    accountStatus: text('account_status').notNull().default('active'),
    emailVerifiedAt: timestamp('email_verified_at', {withTimezone: true}),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
  },
  (table) => [
    index('idx_users_normalized_email').on(table.normalizedEmail),
    index('idx_users_status').on(table.accountStatus),
    check('chk_users_global_role', sql`${table.globalRole} IN ('user', 'super_admin')`),
    check(
      'chk_users_account_status',
      sql`${table.accountStatus} IN ('active', 'suspended', 'disabled')`,
    ),
  ],
);

// 2. clubs
export const clubs = pgTable(
  'clubs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    slug: text('slug').notNull().unique(),
    category: text('category').notNull(),
    tagline: text('tagline').notNull().default(''),
    description: text('description').notNull(),
    logoUrl: text('logo_url').notNull().default(''),
    contactEmail: text('contact_email').notNull().default(''),
    foundedYear: integer('founded_year').notNull().default(2024),
    meetingSchedule: text('meeting_schedule').notNull().default(''),
    status: text('status').notNull().default('pending'),
    followerCount: integer('follower_count').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, {onDelete: 'set null'}),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
  },
  (table) => [
    index('idx_clubs_status_category').on(table.status, table.category),
    index('idx_clubs_status_followers').on(table.status, table.followerCount),
    check(
      'chk_clubs_status',
      sql`${table.status} IN ('pending', 'pending_review', 'active', 'inactive', 'suspended')`,
    ),
    check('chk_clubs_follower_count', sql`${table.followerCount} >= 0`),
  ],
);

// 3. club_memberships
export const clubMemberships = pgTable(
  'club_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, {onDelete: 'cascade'}),
    membershipRole: text('membership_role').notNull(),
    title: text('title').notNull().default('Officer'),
    permissions: jsonb('permissions').$type<CoreMemberPermission[]>().notNull().default([]),
    assignedTasks: jsonb('assigned_tasks').$type<string[]>().notNull().default([]),
    status: text('status').notNull().default('active'),
    assignedBy: uuid('assigned_by').references(() => users.id, {onDelete: 'set null'}),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_club_memberships_user_club').on(table.userId, table.clubId),
    index('idx_club_memberships_user').on(table.userId),
    index('idx_club_memberships_club').on(table.clubId),
    check('chk_club_memberships_role', sql`${table.membershipRole} IN ('club_admin', 'core_member')`),
    check('chk_club_memberships_status', sql`${table.status} IN ('active', 'inactive')`),
  ],
);

// 4. club_follows
export const clubFollows = pgTable(
  'club_follows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, {onDelete: 'cascade'}),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_club_follows_user_club').on(table.userId, table.clubId),
    index('idx_club_follows_user').on(table.userId),
    index('idx_club_follows_club').on(table.clubId),
  ],
);

// 5. events (No event gallery table or column)
export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, {onDelete: 'cascade'}),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    venue: text('venue').notNull(),
    startsAt: timestamp('starts_at', {withTimezone: true}).notNull(),
    endsAt: timestamp('ends_at', {withTimezone: true}).notNull(),
    registrationDeadline: timestamp('registration_deadline', {withTimezone: true}).notNull(),
    capacity: integer('capacity').notNull(),
    registeredCount: integer('registered_count').notNull().default(0),
    isPaid: boolean('is_paid').notNull().default(false),
    feeAmount: numeric('fee_amount', {precision: 10, scale: 2}).notNull().default('0.00'),
    bannerUrl: text('banner_url').notNull().default(''),
    status: text('status').notNull().default('draft'),
    createdBy: uuid('created_by').references(() => users.id, {onDelete: 'set null'}),
    publishedAt: timestamp('published_at', {withTimezone: true}),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
  },
  (table) => [
    index('idx_events_club_status').on(table.clubId, table.status),
    index('idx_events_starts_at').on(table.startsAt),
    check('chk_events_status', sql`${table.status} IN ('draft', 'published', 'completed', 'cancelled')`),
    check('chk_events_capacity', sql`${table.capacity} > 0`),
    check('chk_events_registered_count', sql`${table.registeredCount} >= 0`),
    check('chk_events_fee_amount', sql`${table.feeAmount} >= 0`),
    check('chk_events_dates', sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

// 6. event_forms
export const eventForms = pgTable('event_forms', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .unique()
    .references(() => events.id, {onDelete: 'cascade'}),
  version: integer('version').notNull().default(1),
  title: text('title').notNull().default('Event Registration Form'),
  description: text('description').default(''),
  updatedBy: uuid('updated_by').references(() => users.id, {onDelete: 'set null'}),
  updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
});

// 7. form_fields
export const formFields = pgTable(
  'form_fields',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    formId: uuid('form_id')
      .notNull()
      .references(() => eventForms.id, {onDelete: 'cascade'}),
    fieldKey: text('field_key').notNull(),
    label: text('label').notNull(),
    fieldType: text('field_type').notNull(),
    placeholder: text('placeholder'),
    required: boolean('required').notNull().default(false),
    options: jsonb('options').$type<string[]>().notNull().default([]),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    uniqueIndex('uq_form_fields_form_key').on(table.formId, table.fieldKey),
    check(
      'chk_form_fields_type',
      sql`${table.fieldType} IN ('text', 'textarea', 'number', 'select', 'checkbox', 'email', 'phone')`,
    ),
  ],
);

// 8. registrations
export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, {onDelete: 'cascade'}),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    formVersion: integer('form_version').notNull().default(1),
    status: text('status').notNull().default('confirmed'),
    answers: jsonb('answers')
      .$type<Record<string, string | boolean | number>>()
      .notNull()
      .default({}),
    qrToken: text('qr_token').notNull().unique(),
    qrTokenHash: text('qr_token_hash').notNull().unique(),
    submittedAt: timestamp('submitted_at', {withTimezone: true}).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_registrations_event_user').on(table.eventId, table.userId),
    index('idx_registrations_user').on(table.userId),
    index('idx_registrations_qr_token').on(table.qrToken),
    index('idx_registrations_qr_token_hash').on(table.qrTokenHash),
    check(
      'chk_registrations_status',
      sql`${table.status} IN ('confirmed', 'waitlisted', 'cancelled', 'attended')`,
    ),
  ],
);

// 9. attendance_records
export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    registrationId: uuid('registration_id')
      .notNull()
      .unique()
      .references(() => registrations.id, {onDelete: 'cascade'}),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, {onDelete: 'cascade'}),
    scannedBy: uuid('scanned_by').references(() => users.id, {onDelete: 'set null'}),
    scannedByName: text('scanned_by_name').notNull().default('Club Officer'),
    scanMethod: text('scan_method').notNull(),
    scannedAt: timestamp('scanned_at', {withTimezone: true}).defaultNow().notNull(),
  },
  (table) => [
    index('idx_attendance_records_event').on(table.eventId),
    check(
      'chk_attendance_scan_method',
      sql`${table.scanMethod} IN ('qr_scan', 'manual_override', 'manual')`,
    ),
  ],
);

// 10. event_reports
export const eventReports = pgTable(
  'event_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .unique()
      .references(() => events.id, {onDelete: 'cascade'}),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, {onDelete: 'cascade'}),
    summary: text('summary').notNull(),
    highlights: text('highlights').notNull(),
    challenges: text('challenges').notNull().default('None reported'),
    actualAttendance: integer('actual_attendance').notNull(),
    registeredTotal: integer('registered_total').notNull().default(0),
    completionStatus: text('completion_status').notNull().default('completed'),
    submittedBy: uuid('submitted_by').references(() => users.id, {onDelete: 'set null'}),
    submittedByName: text('submitted_by_name').notNull().default('Club Officer'),
    submittedAt: timestamp('submitted_at', {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
  },
  (table) => [
    check('chk_event_reports_attendance', sql`${table.actualAttendance} >= 0`),
    check(
      'chk_event_reports_completion_status',
      sql`${table.completionStatus} IN ('completed', 'partial')`,
    ),
  ],
);

// 11. finance_reports
export const financeReports = pgTable('finance_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .unique()
    .references(() => events.id, {onDelete: 'cascade'}),
  clubId: uuid('club_id')
    .notNull()
    .references(() => clubs.id, {onDelete: 'cascade'}),
  totalCollections: numeric('total_collections', {precision: 12, scale: 2})
    .notNull()
    .default('0.00'),
  totalExpenses: numeric('total_expenses', {precision: 12, scale: 2}).notNull().default('0.00'),
  netBalance: numeric('net_balance', {precision: 12, scale: 2}).notNull().default('0.00'),
  notes: text('notes').notNull().default(''),
  submittedBy: uuid('submitted_by').references(() => users.id, {onDelete: 'set null'}),
  submittedByName: text('submitted_by_name').notNull().default('Club Officer'),
  submittedAt: timestamp('submitted_at', {withTimezone: true}).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
});

// 12. finance_line_items
export const financeLineItems = pgTable(
  'finance_line_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    financeReportId: uuid('finance_report_id')
      .notNull()
      .references(() => financeReports.id, {onDelete: 'cascade'}),
    itemType: text('item_type').notNull(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    amount: numeric('amount', {precision: 12, scale: 2}).notNull(),
    notes: text('notes'),
    recordedAt: timestamp('recorded_at', {withTimezone: true}).defaultNow().notNull(),
  },
  (table) => [
    index('idx_finance_line_items_report').on(table.financeReportId),
    check(
      'chk_finance_line_items_type',
      sql`${table.itemType} IN ('collection', 'expense', 'adjustment')`,
    ),
    check('chk_finance_line_items_amount', sql`${table.amount} >= 0`),
  ],
);

// 13. notifications
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    type: text('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    link: text('link'),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
  },
  (table) => [
    index('idx_notifications_user_read_created').on(table.userId, table.isRead, table.createdAt),
  ],
);

// 14. audit_logs (Append-only)
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {onDelete: 'set null'}),
    actorName: text('actor_name').notNull().default('System'),
    actorContext: text('actor_context').notNull().default('System'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    targetLabel: text('target_label').notNull().default(''),
    requestId: text('request_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
  },
  (table) => [index('idx_audit_logs_created_at').on(table.createdAt)],
);

// 15. system_settings
export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, {onDelete: 'set null'}),
  updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
});

// 16. hall_of_fame_snapshots
export const hallOfFameSnapshots = pgTable(
  'hall_of_fame_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, {onDelete: 'cascade'}),
    rank: integer('rank').notNull(),
    followerCount: integer('follower_count').notNull(),
    capturedAt: timestamp('captured_at', {withTimezone: true}).defaultNow().notNull(),
  },
  (table) => [index('idx_hof_snapshots_captured_rank').on(table.capturedAt, table.rank)],
);

// 17. auth_sessions
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    lastSeenAt: timestamp('last_seen_at', {withTimezone: true}).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', {withTimezone: true}),
  },
  (table) => [index('idx_auth_sessions_user_seen').on(table.userId, table.lastSeenAt)],
);
