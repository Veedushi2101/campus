import {and, desc, eq, sql} from 'drizzle-orm';
import type {
  AdminDashboardStats,
  AttendanceRecord,
  AuditLogEntry,
  EventReport,
  FinancialReport,
  NotificationItem,
  Registration,
  SystemSettings,
} from '../../../shared/types/domain.ts';
import {MAX_FOLLOWED_CLUBS} from '../../config/constants.ts';
import {BusinessRuleError, ConflictError, NotFoundError} from '../../shared/errors/AppError.ts';
import {withRlsTransaction} from '../index.ts';
import {
  attendanceRecords,
  auditLogs,
  clubs,
  eventForms,
  eventReports,
  events,
  financeLineItems,
  financeReports,
  notifications,
  registrations,
  systemSettings,
  users,
} from '../schema.ts';
import {
  fromCentsToFixed,
  fromCentsToNumber,
  hashSha256,
  isUuid,
  mapAuditLogRow,
  mapEventReportRow,
  mapFinancialReportRow,
  mapNotificationRow,
  mapRegistrationRow,
  toCents,
} from './mappers.ts';

export class OperationsRepository {
  async createRegistration(input: {
    eventId: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    answers: Record<string, string | boolean | number>;
    qrToken: string;
  }): Promise<Registration> {
    if (!isUuid(input.eventId) || !isUuid(input.studentId)) {
      throw new NotFoundError('Event or student record not found');
    }

    return withRlsTransaction('registrations.create', async (tx) => {
      // Acquire an exclusive transaction-scoped advisory lock on this event ID so concurrent
      // registrations serialize cleanly without requiring student UPDATE RLS privileges on `events`
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`campusverse_event_reg:${input.eventId}`}))`,
      );

      const lockedEvents = await tx.execute<{
        id: string;
        club_id: string;
        title: string;
        venue: string;
        starts_at: Date;
        capacity: number;
        registered_count: number;
        status: string;
      }>(
        sql`SELECT id, club_id, title, venue, starts_at, capacity, registered_count, status FROM public.events WHERE id = ${input.eventId}`,
      );

      const ev = lockedEvents[0];
      if (!ev) throw new NotFoundError('Event not found');
      if (ev.status !== 'published') {
        throw new BusinessRuleError(
          'EVENT_NOT_OPEN',
          'Registrations are only allowed for published events',
        );
      }

      const [existing] = await tx
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, input.eventId),
            eq(registrations.userId, input.studentId),
          ),
        )
        .limit(1);

      if (existing && existing.status !== 'cancelled') {
        throw new ConflictError('You are already registered for this event');
      }

      const status = ev.registered_count >= ev.capacity ? 'waitlisted' : 'confirmed';

      const [formRow] = await tx
        .select({version: eventForms.version})
        .from(eventForms)
        .where(eq(eventForms.eventId, input.eventId))
        .limit(1);

      const [clubRow] = await tx
        .select({name: clubs.name})
        .from(clubs)
        .where(eq(clubs.id, ev.club_id))
        .limit(1);

      const qrTokenHash = hashSha256(input.qrToken);

      try {
        const [inserted] = await tx
          .insert(registrations)
          .values({
            eventId: input.eventId,
            userId: input.studentId,
            formVersion: formRow?.version ?? 1,
            status,
            answers: input.answers,
            qrToken: input.qrToken,
            qrTokenHash,
          })
          .returning();

        return mapRegistrationRow(inserted, {
          eventTitle: ev.title,
          eventStartTime: new Date(ev.starts_at).toISOString(),
          eventVenue: ev.venue,
          clubId: ev.club_id,
          clubName: clubRow?.name || '',
          studentName: input.studentName,
          studentEmail: input.studentEmail,
          qrUsedAt: null,
        });
      } catch (err: unknown) {
        if ((err as {code?: string})?.code === '23505') {
          throw new ConflictError('You are already registered for this event');
        }
        throw err;
      }
    });
  }

  async listRegistrationsForEvent(eventId: string): Promise<Registration[]> {
    if (!isUuid(eventId)) return [];
    return withRlsTransaction('registrations.forEvent', async (tx) => {
      const rows = await tx
        .select({
          reg: registrations,
          studentName: users.displayName,
          studentEmail: users.email,
          evTitle: events.title,
          evStartsAt: events.startsAt,
          evVenue: events.venue,
          clubId: events.clubId,
          clubName: clubs.name,
          scannedAt: attendanceRecords.scannedAt,
        })
        .from(registrations)
        .innerJoin(users, eq(registrations.userId, users.id))
        .innerJoin(events, eq(registrations.eventId, events.id))
        .innerJoin(clubs, eq(events.clubId, clubs.id))
        .leftJoin(attendanceRecords, eq(attendanceRecords.registrationId, registrations.id))
        .where(eq(registrations.eventId, eventId))
        .orderBy(desc(registrations.submittedAt));

      return rows.map((r) =>
        mapRegistrationRow(r.reg, {
          studentName: r.studentName,
          studentEmail: r.studentEmail,
          eventTitle: r.evTitle,
          eventStartTime: r.evStartsAt.toISOString(),
          eventVenue: r.evVenue,
          clubId: r.clubId,
          clubName: r.clubName,
          qrUsedAt: r.scannedAt ? r.scannedAt.toISOString() : null,
        }),
      );
    });
  }

  async listRegistrationsForStudent(studentId: string): Promise<Registration[]> {
    if (!isUuid(studentId)) return [];
    return withRlsTransaction('registrations.forStudent', async (tx) => {
      const rows = await tx
        .select({
          reg: registrations,
          studentName: users.displayName,
          studentEmail: users.email,
          evTitle: events.title,
          evStartsAt: events.startsAt,
          evVenue: events.venue,
          clubId: events.clubId,
          clubName: clubs.name,
          scannedAt: attendanceRecords.scannedAt,
        })
        .from(registrations)
        .innerJoin(users, eq(registrations.userId, users.id))
        .innerJoin(events, eq(registrations.eventId, events.id))
        .innerJoin(clubs, eq(events.clubId, clubs.id))
        .leftJoin(attendanceRecords, eq(attendanceRecords.registrationId, registrations.id))
        .where(eq(registrations.userId, studentId))
        .orderBy(desc(registrations.submittedAt));

      return rows.map((r) =>
        mapRegistrationRow(r.reg, {
          studentName: r.studentName,
          studentEmail: r.studentEmail,
          eventTitle: r.evTitle,
          eventStartTime: r.evStartsAt.toISOString(),
          eventVenue: r.evVenue,
          clubId: r.clubId,
          clubName: r.clubName,
          qrUsedAt: r.scannedAt ? r.scannedAt.toISOString() : null,
        }),
      );
    });
  }

  async getRegistrationById(registrationId: string): Promise<Registration | null> {
    if (!isUuid(registrationId)) return null;
    return withRlsTransaction('registrations.getById', async (tx) => {
      const rows = await tx
        .select({
          reg: registrations,
          studentName: users.displayName,
          studentEmail: users.email,
          evTitle: events.title,
          evStartsAt: events.startsAt,
          evVenue: events.venue,
          clubId: events.clubId,
          clubName: clubs.name,
          scannedAt: attendanceRecords.scannedAt,
        })
        .from(registrations)
        .innerJoin(users, eq(registrations.userId, users.id))
        .innerJoin(events, eq(registrations.eventId, events.id))
        .innerJoin(clubs, eq(events.clubId, clubs.id))
        .leftJoin(attendanceRecords, eq(attendanceRecords.registrationId, registrations.id))
        .where(eq(registrations.id, registrationId))
        .limit(1);

      const r = rows[0];
      if (!r) return null;
      return mapRegistrationRow(r.reg, {
        studentName: r.studentName,
        studentEmail: r.studentEmail,
        eventTitle: r.evTitle,
        eventStartTime: r.evStartsAt.toISOString(),
        eventVenue: r.evVenue,
        clubId: r.clubId,
        clubName: r.clubName,
        qrUsedAt: r.scannedAt ? r.scannedAt.toISOString() : null,
      });
    });
  }

  async getRegistrationByQrToken(eventId: string, qrToken: string): Promise<Registration | null> {
    if (!isUuid(eventId) || !qrToken.trim()) return null;
    const tokenHash = hashSha256(qrToken);
    return withRlsTransaction('registrations.getByQrToken', async (tx) => {
      const rows = await tx
        .select({
          reg: registrations,
          studentName: users.displayName,
          studentEmail: users.email,
          evTitle: events.title,
          evStartsAt: events.startsAt,
          evVenue: events.venue,
          clubId: events.clubId,
          clubName: clubs.name,
          scannedAt: attendanceRecords.scannedAt,
        })
        .from(registrations)
        .innerJoin(users, eq(registrations.userId, users.id))
        .innerJoin(events, eq(registrations.eventId, events.id))
        .innerJoin(clubs, eq(events.clubId, clubs.id))
        .leftJoin(attendanceRecords, eq(attendanceRecords.registrationId, registrations.id))
        .where(and(eq(registrations.eventId, eventId), eq(registrations.qrTokenHash, tokenHash)))
        .limit(1);

      const r = rows[0];
      if (!r) return null;
      return mapRegistrationRow(r.reg, {
        studentName: r.studentName,
        studentEmail: r.studentEmail,
        eventTitle: r.evTitle,
        eventStartTime: r.evStartsAt.toISOString(),
        eventVenue: r.evVenue,
        clubId: r.clubId,
        clubName: r.clubName,
        qrUsedAt: r.scannedAt ? r.scannedAt.toISOString() : null,
      });
    });
  }

  async recordAttendance(input: {
    eventId: string;
    registrationId: string;
    studentId: string;
    studentName: string;
    studentCode: string;
    qrToken: string;
    method: 'qr_scan' | 'manual_override';
    checkedInBy: string;
    scannedByUserId?: string;
  }): Promise<AttendanceRecord> {
    if (!isUuid(input.eventId) || !isUuid(input.registrationId)) {
      throw new NotFoundError('Registration or event not found');
    }

    return withRlsTransaction('attendance.record', async (tx) => {
      // Pessimistic row lock on the registration prevents concurrent double check-in races
      const lockedRegs = await tx.execute<{id: string; status: string}>(
        sql`SELECT id, status FROM public.registrations WHERE id = ${input.registrationId} FOR UPDATE`,
      );
      if (!lockedRegs[0]) {
        throw new NotFoundError('Registration not found');
      }
      if (lockedRegs[0].status === 'cancelled') {
        throw new BusinessRuleError(
          'REGISTRATION_CANCELLED',
          'Cancelled registrations cannot be checked in',
        );
      }

      const [existing] = await tx
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.registrationId, input.registrationId))
        .limit(1);

      if (existing) {
        throw new ConflictError(
          `Duplicate scan prevented: ${input.studentName} was already checked in at ${existing.scannedAt.toISOString()}`,
        );
      }

      try {
        const [inserted] = await tx
          .insert(attendanceRecords)
          .values({
            eventId: input.eventId,
            registrationId: input.registrationId,
            scannedBy: isUuid(input.scannedByUserId) ? input.scannedByUserId : null,
            scannedByName: input.checkedInBy,
            scanMethod: input.method,
          })
          .returning();

        await tx
          .update(registrations)
          .set({status: 'attended'})
          .where(eq(registrations.id, input.registrationId));

        return {
          id: inserted.id,
          eventId: inserted.eventId,
          registrationId: inserted.registrationId,
          studentId: input.studentId,
          studentName: input.studentName,
          studentCode: input.studentCode,
          qrToken: input.qrToken,
          method: input.method,
          checkedInBy: inserted.scannedByName,
          checkedInAt: inserted.scannedAt.toISOString(),
        };
      } catch (err: unknown) {
        if ((err as {code?: string})?.code === '23505') {
          throw new ConflictError(
            `Duplicate scan prevented: ${input.studentName} is already checked in`,
          );
        }
        throw err;
      }
    });
  }

  async listAttendanceForEvent(eventId: string): Promise<AttendanceRecord[]> {
    if (!isUuid(eventId)) return [];
    return withRlsTransaction('attendance.forEvent', async (tx) => {
      const rows = await tx
        .select({
          att: attendanceRecords,
          reg: registrations,
          studentName: users.displayName,
          studentCode: users.studentId,
        })
        .from(attendanceRecords)
        .innerJoin(registrations, eq(attendanceRecords.registrationId, registrations.id))
        .innerJoin(users, eq(registrations.userId, users.id))
        .where(eq(attendanceRecords.eventId, eventId))
        .orderBy(desc(attendanceRecords.scannedAt));

      return rows.map((r) => ({
        id: r.att.id,
        eventId: r.att.eventId,
        registrationId: r.att.registrationId,
        studentId: r.reg.userId,
        studentName: r.studentName,
        studentCode: r.studentCode || r.reg.userId,
        qrToken: r.reg.qrToken,
        method: (r.att.scanMethod === 'manual_override' ? 'manual_override' : 'qr_scan'),
        checkedInBy: r.att.scannedByName,
        checkedInAt: r.att.scannedAt.toISOString(),
      }));
    });
  }

  async upsertEventReport(report: Omit<EventReport, 'id' | 'submittedAt'>): Promise<EventReport> {
    if (!isUuid(report.eventId) || !isUuid(report.clubId)) {
      throw new NotFoundError('Event or club not found');
    }

    return withRlsTransaction('reports.upsertEventReport', async (tx) => {
      const [upserted] = await tx
        .insert(eventReports)
        .values({
          eventId: report.eventId,
          clubId: report.clubId,
          summary: report.outcomeSummary,
          highlights: report.highlights,
          challenges: report.challenges,
          actualAttendance: report.actualAttendance,
          registeredTotal: report.registeredTotal,
          completionStatus: report.completionStatus,
          submittedBy: isUuid(report.submittedBy) ? report.submittedBy : null,
          submittedByName: report.submittedByName,
        })
        .onConflictDoUpdate({
          target: eventReports.eventId,
          set: {
            summary: report.outcomeSummary,
            highlights: report.highlights,
            challenges: report.challenges,
            actualAttendance: report.actualAttendance,
            registeredTotal: report.registeredTotal,
            completionStatus: report.completionStatus,
            submittedBy: isUuid(report.submittedBy) ? report.submittedBy : null,
            submittedByName: report.submittedByName,
            updatedAt: new Date(),
          },
        })
        .returning();

      return mapEventReportRow(upserted, {
        eventTitle: report.eventTitle,
        clubName: report.clubName,
      });
    });
  }

  async getEventReport(eventId: string): Promise<EventReport | null> {
    if (!isUuid(eventId)) return null;
    return withRlsTransaction('reports.getEventReport', async (tx) => {
      const rows = await tx
        .select({
          report: eventReports,
          eventTitle: events.title,
          clubName: clubs.name,
        })
        .from(eventReports)
        .innerJoin(events, eq(eventReports.eventId, events.id))
        .innerJoin(clubs, eq(eventReports.clubId, clubs.id))
        .where(eq(eventReports.eventId, eventId))
        .limit(1);
      if (!rows[0]) return null;
      return mapEventReportRow(rows[0].report, {
        eventTitle: rows[0].eventTitle,
        clubName: rows[0].clubName,
      });
    });
  }

  async listAllEventReports(): Promise<EventReport[]> {
    return withRlsTransaction('reports.listAllEventReports', async (tx) => {
      const rows = await tx
        .select({
          report: eventReports,
          eventTitle: events.title,
          clubName: clubs.name,
        })
        .from(eventReports)
        .innerJoin(events, eq(eventReports.eventId, events.id))
        .innerJoin(clubs, eq(eventReports.clubId, clubs.id))
        .orderBy(desc(eventReports.submittedAt));
      return rows.map((r) =>
        mapEventReportRow(r.report, {
          eventTitle: r.eventTitle,
          clubName: r.clubName,
        }),
      );
    });
  }

  async upsertFinancialReport(
    report: Omit<FinancialReport, 'id' | 'submittedAt'>,
  ): Promise<FinancialReport> {
    if (!isUuid(report.eventId) || !isUuid(report.clubId)) {
      throw new NotFoundError('Event or club not found');
    }

    // Integer-cent arithmetic eliminates floating-point rounding drift
    const collectionsCents = report.lineItems
      .filter((i) => i.type === 'collection')
      .reduce((sum, i) => sum + toCents(i.amount), 0);
    const expensesCents = report.lineItems
      .filter((i) => i.type === 'expense')
      .reduce((sum, i) => sum + toCents(i.amount), 0);
    const netCents = collectionsCents - expensesCents;

    return withRlsTransaction('finance.upsertReport', async (tx) => {
      const [upserted] = await tx
        .insert(financeReports)
        .values({
          eventId: report.eventId,
          clubId: report.clubId,
          totalCollections: fromCentsToFixed(collectionsCents),
          totalExpenses: fromCentsToFixed(expensesCents),
          netBalance: fromCentsToFixed(netCents),
          notes: report.notes,
          submittedBy: isUuid(report.submittedBy) ? report.submittedBy : null,
          submittedByName: report.submittedByName,
        })
        .onConflictDoUpdate({
          target: financeReports.eventId,
          set: {
            totalCollections: fromCentsToFixed(collectionsCents),
            totalExpenses: fromCentsToFixed(expensesCents),
            netBalance: fromCentsToFixed(netCents),
            notes: report.notes,
            submittedBy: isUuid(report.submittedBy) ? report.submittedBy : null,
            submittedByName: report.submittedByName,
            updatedAt: new Date(),
          },
        })
        .returning();

      await tx.delete(financeLineItems).where(eq(financeLineItems.financeReportId, upserted.id));

      const insertedItems =
        report.lineItems.length > 0
          ? await tx
              .insert(financeLineItems)
              .values(
                report.lineItems.map((item) => ({
                  financeReportId: upserted.id,
                  itemType: item.type,
                  category: item.category,
                  description: item.label,
                  amount: fromCentsToFixed(toCents(item.amount)),
                  notes: item.notes ?? null,
                })),
              )
              .returning()
          : [];

      return mapFinancialReportRow(upserted, insertedItems, {
        eventTitle: report.eventTitle,
        clubName: report.clubName,
      });
    });
  }

  async getFinancialReport(eventId: string): Promise<FinancialReport | null> {
    if (!isUuid(eventId)) return null;
    return withRlsTransaction('finance.getReport', async (tx) => {
      const rows = await tx
        .select({
          report: financeReports,
          eventTitle: events.title,
          clubName: clubs.name,
        })
        .from(financeReports)
        .innerJoin(events, eq(financeReports.eventId, events.id))
        .innerJoin(clubs, eq(financeReports.clubId, clubs.id))
        .where(eq(financeReports.eventId, eventId))
        .limit(1);
      if (!rows[0]) return null;

      const items = await tx
        .select()
        .from(financeLineItems)
        .where(eq(financeLineItems.financeReportId, rows[0].report.id));

      return mapFinancialReportRow(rows[0].report, items, {
        eventTitle: rows[0].eventTitle,
        clubName: rows[0].clubName,
      });
    });
  }

  async listAllFinancialReports(): Promise<FinancialReport[]> {
    return withRlsTransaction('finance.listAllReports', async (tx) => {
      const rows = await tx
        .select({
          report: financeReports,
          eventTitle: events.title,
          clubName: clubs.name,
        })
        .from(financeReports)
        .innerJoin(events, eq(financeReports.eventId, events.id))
        .innerJoin(clubs, eq(financeReports.clubId, clubs.id))
        .orderBy(desc(financeReports.submittedAt));

      const allItems = await tx.select().from(financeLineItems);
      const itemsByReport = new Map<string, Array<typeof financeLineItems.$inferSelect>>();
      for (const item of allItems) {
        const list = itemsByReport.get(item.financeReportId) || [];
        list.push(item);
        itemsByReport.set(item.financeReportId, list);
      }

      return rows.map((r) =>
        mapFinancialReportRow(r.report, itemsByReport.get(r.report.id) || [], {
          eventTitle: r.eventTitle,
          clubName: r.clubName,
        }),
      );
    });
  }

  async listNotificationsForUser(userId: string): Promise<NotificationItem[]> {
    if (!isUuid(userId)) return [];
    return withRlsTransaction('notifications.forUser', async (tx) => {
      const rows = await tx
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt));
      return rows.map(mapNotificationRow);
    });
  }

  async markNotificationRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationItem | null> {
    if (!isUuid(userId) || !isUuid(notificationId)) return null;
    return withRlsTransaction('notifications.markRead', async (tx) => {
      const [updated] = await tx
        .update(notifications)
        .set({isRead: true})
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
        .returning();
      return updated ? mapNotificationRow(updated) : null;
    });
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    if (!isUuid(userId)) return;
    await withRlsTransaction('notifications.markAllRead', async (tx) => {
      await tx
        .update(notifications)
        .set({isRead: true})
        .where(eq(notifications.userId, userId));
    });
  }

  async createNotification(
    input: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>,
  ): Promise<NotificationItem> {
    if (!isUuid(input.userId)) throw new NotFoundError('Notification recipient not found');
    return withRlsTransaction('notifications.create', async (tx) => {
      const [inserted] = await tx
        .insert(notifications)
        .values({
          userId: input.userId,
          type: input.category,
          title: input.title,
          message: input.message,
          link: input.link ?? null,
          isRead: false,
        })
        .returning();
      return mapNotificationRow(inserted);
    });
  }

  async getAdminDashboardStats(): Promise<AdminDashboardStats> {
    return withRlsTransaction('admin.dashboardStats', async (tx) => {
      const [userStats] = await tx
        .select({
          totalStudents: sql<number>`count(*) FILTER (WHERE ${users.globalRole} <> 'super_admin')::int`,
        })
        .from(users);

      const [clubStats] = await tx
        .select({
          totalClubs: sql<number>`count(*)::int`,
          activeClubs: sql<number>`count(*) FILTER (WHERE ${clubs.status} = 'active')::int`,
        })
        .from(clubs);

      const [eventStats] = await tx
        .select({
          totalEvents: sql<number>`count(*)::int`,
          upcomingEvents: sql<number>`count(*) FILTER (WHERE ${events.status} = 'published')::int`,
        })
        .from(events);

      const [regStats] = await tx
        .select({totalRegistrations: sql<number>`count(*)::int`})
        .from(registrations);

      const financeRows = await tx
        .select({
          totalCollections: financeReports.totalCollections,
          totalExpenses: financeReports.totalExpenses,
        })
        .from(financeReports);

      const collectionsCents = financeRows.reduce(
        (sum, r) => sum + toCents(r.totalCollections),
        0,
      );
      const expensesCents = financeRows.reduce((sum, r) => sum + toCents(r.totalExpenses), 0);

      const recentLogs = await tx
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(8);

      return {
        totalStudents: userStats?.totalStudents ?? 0,
        totalClubs: clubStats?.totalClubs ?? 0,
        activeClubs: clubStats?.activeClubs ?? 0,
        totalEvents: eventStats?.totalEvents ?? 0,
        upcomingEvents: eventStats?.upcomingEvents ?? 0,
        totalRegistrations: regStats?.totalRegistrations ?? 0,
        totalCollections: fromCentsToNumber(collectionsCents),
        totalExpenses: fromCentsToNumber(expensesCents),
        netBalance: fromCentsToNumber(collectionsCents - expensesCents),
        recentAuditLogs: recentLogs.map(mapAuditLogRow),
      };
    });
  }

  async listAuditLogs(): Promise<AuditLogEntry[]> {
    return withRlsTransaction('audit.list', async (tx) => {
      const rows = await tx.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200);
      return rows.map(mapAuditLogRow);
    });
  }

  async appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<AuditLogEntry> {
    return withRlsTransaction('audit.append', async (tx) => {
      const [inserted] = await tx
        .insert(auditLogs)
        .values({
          actorUserId: isUuid(entry.actorId) ? entry.actorId : null,
          actorName: entry.actorName,
          actorContext: entry.actorContext,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          targetLabel: entry.targetLabel,
          metadata: {details: entry.details},
        })
        .returning();
      return mapAuditLogRow(inserted);
    });
  }

  async getSystemSettings(): Promise<SystemSettings> {
    return withRlsTransaction('settings.get', async (tx) => {
      const [row] = await tx
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'campusverse_config'))
        .limit(1);

      const val = (row?.value || {}) as Record<string, unknown>;
      return {
        maxClubsPerStudent:
          typeof val.maxClubsPerStudent === 'number' ? val.maxClubsPerStudent : MAX_FOLLOWED_CLUBS,
        requireClubApproval:
          typeof val.requireClubApproval === 'boolean' ? val.requireClubApproval : true,
        allowStudentEventFeedback:
          typeof val.allowStudentEventFeedback === 'boolean'
            ? val.allowStudentEventFeedback
            : true,
        phaseLabel:
          typeof val.phaseLabel === 'string'
            ? val.phaseLabel
            : 'Phase 2 — Production PostgreSQL & Supabase Auth',
        persistenceMode: 'postgres',
      };
    });
  }

  async updateSystemSettings(updates: Partial<SystemSettings>): Promise<SystemSettings> {
    const current = await this.getSystemSettings();
    const next: SystemSettings = {
      ...current,
      requireClubApproval:
        typeof updates.requireClubApproval === 'boolean'
          ? updates.requireClubApproval
          : current.requireClubApproval,
      allowStudentEventFeedback:
        typeof updates.allowStudentEventFeedback === 'boolean'
          ? updates.allowStudentEventFeedback
          : current.allowStudentEventFeedback,
      persistenceMode: 'postgres',
    };

    await withRlsTransaction('settings.update', async (tx) => {
      await tx
        .insert(systemSettings)
        .values({
          key: 'campusverse_config',
          value: next as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: {
            value: next as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          },
        });
    });

    return next;
  }
}
