import {and, asc, desc, eq, ilike, or, sql, type SQL} from 'drizzle-orm';
import type {
  AdminDashboardStats,
  AttendanceRecord,
  AuditLogEntry,
  EventReport,
  FinancialReport,
  FormAnswerValue,
  NotificationItem,
  PaginatedResult,
  Registration,
  SystemSettings,
} from '../../../shared/types/domain.ts';
import {MAX_FOLLOWED_CLUBS} from '../../config/constants.ts';
import {publicReadCache} from '../../shared/cache/publicReadCache.ts';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors/AppError.ts';
import {generateOpaqueQrToken} from '../../shared/utils/crypto.ts';
import {withRlsTransaction} from '../index.ts';
import {
  attendanceRecords,
  auditLogs,
  clubs,
  eventForms,
  eventFormVersions,
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
  isPgUniqueViolation,
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
    answers: Record<string, FormAnswerValue>;
    qrToken: string;
    formVersion?: number;
    formVersionId?: string | null;
  }): Promise<Registration> {
    if (!isUuid(input.eventId) || !isUuid(input.studentId)) {
      throw new NotFoundError('Event or student record not found');
    }

    const registration = await withRlsTransaction('registrations.create', async (tx) => {
      // Exclusive transaction-scoped advisory lock guarantees atomic capacity & waitlist ordering
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`campusverse_event_reg:${input.eventId}`}))`,
      );

      const lockedEvents = await tx.execute<{
        id: string;
        club_id: string;
        title: string;
        venue: string;
        starts_at: Date;
        registration_opens_at: Date | null;
        registration_deadline: Date;
        capacity: number;
        registered_count: number;
        status: string;
      }>(
        sql`SELECT id, club_id, title, venue, starts_at, registration_opens_at, registration_deadline, capacity, registered_count, status FROM public.events WHERE id = ${input.eventId}`,
      );

      const ev = lockedEvents[0];
      if (!ev) throw new NotFoundError('Event not found');

      if (ev.status !== 'published' && ev.status !== 'registration_open') {
        throw new BusinessRuleError(
          'EVENT_NOT_OPEN',
          `Registrations are not currently open (event status: ${ev.status.replace('_', ' ')})`,
        );
      }

      const now = new Date();
      if (ev.registration_opens_at && now < new Date(ev.registration_opens_at)) {
        throw new BusinessRuleError(
          'REGISTRATION_NOT_OPEN_YET',
          `Registration opens at ${new Date(ev.registration_opens_at).toISOString()}`,
        );
      }
      if (ev.registration_deadline && now > new Date(ev.registration_deadline)) {
        throw new BusinessRuleError(
          'REGISTRATION_DEADLINE_PASSED',
          'Registration deadline for this event has passed',
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

      let resolvedVersion = input.formVersion ?? 1;
      let resolvedVersionId = input.formVersionId ?? null;

      if (!resolvedVersionId) {
        const [latestSnapshot] = await tx
          .select({id: eventFormVersions.id, version: eventFormVersions.version})
          .from(eventFormVersions)
          .where(eq(eventFormVersions.eventId, input.eventId))
          .orderBy(desc(eventFormVersions.version))
          .limit(1);

        if (latestSnapshot) {
          resolvedVersion = latestSnapshot.version;
          resolvedVersionId = latestSnapshot.id;
        } else {
          const [formRow] = await tx
            .select({version: eventForms.version})
            .from(eventForms)
            .where(eq(eventForms.eventId, input.eventId))
            .limit(1);
          resolvedVersion = formRow?.version ?? 1;
        }
      }

      const [clubRow] = await tx
        .select({name: clubs.name})
        .from(clubs)
        .where(eq(clubs.id, ev.club_id))
        .limit(1);

      const qrTokenHash = hashSha256(input.qrToken);

      try {
        let savedRow: typeof registrations.$inferSelect;
        if (existing && existing.status === 'cancelled') {
          const [reactivated] = await tx
            .update(registrations)
            .set({
              formVersion: resolvedVersion,
              formVersionId: resolvedVersionId,
              status,
              answers: input.answers,
              qrToken: input.qrToken,
              qrTokenHash,
              cancelledAt: null,
              submittedAt: now,
            })
            .where(eq(registrations.id, existing.id))
            .returning();
          savedRow = reactivated;
        } else {
          const [inserted] = await tx
            .insert(registrations)
            .values({
              eventId: input.eventId,
              userId: input.studentId,
              formVersion: resolvedVersion,
              formVersionId: resolvedVersionId,
              status,
              answers: input.answers,
              qrToken: input.qrToken,
              qrTokenHash,
            })
            .returning();
          savedRow = inserted;
        }

        let waitlistPosition: number | null = null;
        if (status === 'waitlisted') {
          const [posRow] = await tx
            .select({count: sql<number>`count(*)::int`})
            .from(registrations)
            .where(
              and(
                eq(registrations.eventId, input.eventId),
                eq(registrations.status, 'waitlisted'),
                sql`${registrations.submittedAt} <= (SELECT r_self.submitted_at FROM public.registrations r_self WHERE r_self.id = ${savedRow.id})`,
              ),
            );
          waitlistPosition = Math.max(1, posRow?.count ?? 1);
        }

        return mapRegistrationRow(savedRow, {
          eventTitle: ev.title,
          eventStartTime: new Date(ev.starts_at).toISOString(),
          eventVenue: ev.venue,
          clubId: ev.club_id,
          clubName: clubRow?.name || '',
          studentName: input.studentName,
          studentEmail: input.studentEmail,
          qrUsedAt: null,
          waitlistPosition,
        });
      } catch (err: unknown) {
        if (isPgUniqueViolation(err)) {
          throw new ConflictError('You are already registered for this event');
        }
        throw err;
      }
    });

    publicReadCache.invalidateEvents();
    return registration;
  }

  async cancelRegistration(
    eventId: string,
    studentId: string,
    registrationId?: string,
  ): Promise<{
    cancelled: Registration;
    promotedUserId?: string | null;
    promotedRegistrationId?: string | null;
  }> {
    if (!isUuid(eventId) || !isUuid(studentId)) {
      throw new NotFoundError('Registration not found');
    }

    const result = await withRlsTransaction('registrations.cancel', async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`campusverse_event_reg:${eventId}`}))`,
      );

      const conditions = [
        eq(registrations.eventId, eventId),
        eq(registrations.userId, studentId),
      ];
      if (registrationId && isUuid(registrationId)) {
        conditions.push(eq(registrations.id, registrationId));
      }

      const [existing] = await tx
        .select()
        .from(registrations)
        .where(and(...conditions))
        .limit(1);

      if (!existing) throw new NotFoundError('Registration not found');
      if (existing.status === 'cancelled') {
        throw new ConflictError('This registration has already been cancelled');
      }
      if (existing.status === 'attended') {
        throw new BusinessRuleError(
          'CANNOT_CANCEL_ATTENDED',
          'Checked-in registrations cannot be cancelled',
        );
      }

      const wasConfirmed = existing.status === 'confirmed';
      const revokedToken = `REVOKED-${generateOpaqueQrToken()}`;

      const [cancelledRow] = await tx
        .update(registrations)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          qrToken: revokedToken,
          qrTokenHash: hashSha256(revokedToken),
        })
        .where(eq(registrations.id, existing.id))
        .returning();

      let promotedRegistrationId: string | null = null;
      let promotedUserId: string | null = null;

      if (wasConfirmed) {
        const promoRows = await tx.execute<{
          promoted_registration_id: string;
          promoted_user_id: string;
        }>(sql`SELECT promoted_registration_id, promoted_user_id FROM public.promote_next_waitlisted_registration(${eventId})`);

        if (promoRows[0]) {
          promotedRegistrationId = promoRows[0].promoted_registration_id;
          promotedUserId = promoRows[0].promoted_user_id;
        }
      }

      const [metaRow] = await tx
        .select({
          studentName: users.displayName,
          studentEmail: users.email,
          eventTitle: events.title,
          eventStartTime: events.startsAt,
          eventVenue: events.venue,
          clubId: events.clubId,
          clubName: clubs.name,
        })
        .from(events)
        .innerJoin(clubs, eq(events.clubId, clubs.id))
        .innerJoin(users, eq(users.id, studentId))
        .where(eq(events.id, eventId))
        .limit(1);

      return {
        cancelled: mapRegistrationRow(cancelledRow, {
          studentName: metaRow?.studentName,
          studentEmail: metaRow?.studentEmail,
          eventTitle: metaRow?.eventTitle,
          eventStartTime: metaRow?.eventStartTime.toISOString(),
          eventVenue: metaRow?.eventVenue,
          clubId: metaRow?.clubId,
          clubName: metaRow?.clubName,
          qrUsedAt: null,
        }),
        promotedRegistrationId,
        promotedUserId,
      };
    });

    publicReadCache.invalidateEvents();
    return result;
  }

  async listRegistrationsForEventPaginated(
    eventId: string,
    opts?: {page?: number; pageSize?: number; search?: string; status?: string},
  ): Promise<PaginatedResult<Registration>> {
    if (!isUuid(eventId)) {
      return {items: [], pagination: {total: 0, page: 1, pageSize: 25, totalPages: 1}};
    }
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, opts?.pageSize ?? 25));

    return withRlsTransaction('registrations.forEventPaginated', async (tx) => {
      const conditions: SQL[] = [eq(registrations.eventId, eventId)];
      if (opts?.status && opts.status !== 'All') {
        conditions.push(eq(registrations.status, opts.status));
      }
      if (opts?.search?.trim()) {
        const pattern = `%${opts.search.trim()}%`;
        const searchCond = or(
          ilike(users.displayName, pattern),
          ilike(users.email, pattern),
          ilike(registrations.qrToken, pattern),
        );
        if (searchCond) conditions.push(searchCond);
      }

      const whereClause = and(...conditions);

      const [countRows, rows] = await Promise.all([
        tx
          .select({count: sql<number>`count(*)::int`})
          .from(registrations)
          .innerJoin(users, eq(registrations.userId, users.id))
          .where(whereClause),
        tx
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
          .where(whereClause)
          .orderBy(desc(registrations.submittedAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
      ]);

      const total = countRows[0]?.count ?? 0;
      const items = rows.map((r) =>
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

      return {
        items,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      };
    });
  }

  async listRegistrationsForEvent(eventId: string): Promise<Registration[]> {
    const res = await this.listRegistrationsForEventPaginated(eventId, {page: 1, pageSize: 500});
    return res.items;
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

      const waitlistEventIds = Array.from(
        new Set(rows.filter((r) => r.reg.status === 'waitlisted').map((r) => r.reg.eventId)),
      );
      const waitlistOrderByRegId = new Map<string, number>();
      for (const evId of waitlistEventIds) {
        const wlRows = await tx
          .select({id: registrations.id})
          .from(registrations)
          .where(and(eq(registrations.eventId, evId), eq(registrations.status, 'waitlisted')))
          .orderBy(asc(registrations.submittedAt));
        wlRows.forEach((w, idx) => waitlistOrderByRegId.set(w.id, idx + 1));
      }

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
          waitlistPosition: waitlistOrderByRegId.get(r.reg.id) ?? null,
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
    manualReason?: string;
    checkedInBy: string;
    scannedByUserId?: string;
  }): Promise<AttendanceRecord> {
    if (!isUuid(input.eventId) || !isUuid(input.registrationId)) {
      throw new NotFoundError('Registration or event not found');
    }

    const record = await withRlsTransaction('attendance.record', async (tx) => {
      const [ev] = await tx
        .select({id: events.id, status: events.status})
        .from(events)
        .where(eq(events.id, input.eventId))
        .limit(1);
      if (!ev) throw new NotFoundError('Event not found');
      if (ev.status === 'cancelled' || ev.status === 'draft') {
        throw new BusinessRuleError(
          'EVENT_NOT_CHECKIN_ELIGIBLE',
          `Check-in is not allowed while event status is ${ev.status}`,
        );
      }

      // Pessimistic row lock on registration prevents concurrent double check-in races
      const lockedRegs = await tx.execute<{id: string; status: string; event_id: string}>(
        sql`SELECT id, status, event_id FROM public.registrations WHERE id = ${input.registrationId} FOR UPDATE`,
      );
      if (!lockedRegs[0]) {
        throw new NotFoundError('Registration not found');
      }
      if (lockedRegs[0].event_id !== input.eventId) {
        throw new BusinessRuleError(
          'WRONG_EVENT_TICKET',
          'This registration does not belong to the selected event',
        );
      }
      if (lockedRegs[0].status === 'cancelled') {
        throw new BusinessRuleError(
          'REGISTRATION_CANCELLED',
          'Cancelled registrations cannot be checked in',
        );
      }
      if (lockedRegs[0].status === 'waitlisted') {
        throw new BusinessRuleError(
          'REGISTRATION_WAITLISTED',
          'Waitlisted registrations cannot be checked in until a confirmed seat opens',
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
            manualReason:
              input.method === 'manual_override' ? input.manualReason?.trim() || null : null,
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
          manualReason: inserted.manualReason,
          checkedInBy: inserted.scannedByName,
          checkedInAt: inserted.scannedAt.toISOString(),
        };
      } catch (err: unknown) {
        if (isPgUniqueViolation(err)) {
          throw new ConflictError(
            `Duplicate scan prevented: ${input.studentName} is already checked in`,
          );
        }
        throw err;
      }
    });

    publicReadCache.invalidateEvents();
    return record;
  }

  async listAttendanceForEventPaginated(
    eventId: string,
    opts?: {page?: number; pageSize?: number; search?: string},
  ): Promise<PaginatedResult<AttendanceRecord>> {
    if (!isUuid(eventId)) {
      return {items: [], pagination: {total: 0, page: 1, pageSize: 25, totalPages: 1}};
    }
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, opts?.pageSize ?? 25));

    return withRlsTransaction('attendance.forEventPaginated', async (tx) => {
      const conditions: SQL[] = [eq(attendanceRecords.eventId, eventId)];
      if (opts?.search?.trim()) {
        const pattern = `%${opts.search.trim()}%`;
        const searchCond = or(
          ilike(users.displayName, pattern),
          ilike(users.studentId, pattern),
          ilike(attendanceRecords.scannedByName, pattern),
        );
        if (searchCond) conditions.push(searchCond);
      }

      const whereClause = and(...conditions);

      const [countRows, rows] = await Promise.all([
        tx
          .select({count: sql<number>`count(*)::int`})
          .from(attendanceRecords)
          .innerJoin(registrations, eq(attendanceRecords.registrationId, registrations.id))
          .innerJoin(users, eq(registrations.userId, users.id))
          .where(whereClause),
        tx
          .select({
            att: attendanceRecords,
            reg: registrations,
            studentName: users.displayName,
            studentCode: users.studentId,
          })
          .from(attendanceRecords)
          .innerJoin(registrations, eq(attendanceRecords.registrationId, registrations.id))
          .innerJoin(users, eq(registrations.userId, users.id))
          .where(whereClause)
          .orderBy(desc(attendanceRecords.scannedAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
      ]);

      const total = countRows[0]?.count ?? 0;
      return {
        items: rows.map((r) => ({
          id: r.att.id,
          eventId: r.att.eventId,
          registrationId: r.att.registrationId,
          studentId: r.reg.userId,
          studentName: r.studentName,
          studentCode: r.studentCode || r.reg.userId,
          qrToken: r.reg.qrToken,
          method: r.att.scanMethod === 'manual_override' ? 'manual_override' : 'qr_scan',
          manualReason: r.att.manualReason,
          checkedInBy: r.att.scannedByName,
          checkedInAt: r.att.scannedAt.toISOString(),
        })),
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      };
    });
  }

  async listAttendanceForEvent(eventId: string): Promise<AttendanceRecord[]> {
    const res = await this.listAttendanceForEventPaginated(eventId, {page: 1, pageSize: 500});
    return res.items;
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
          upcomingEvents: sql<number>`count(*) FILTER (WHERE ${events.status} IN ('published', 'registration_open'))::int`,
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
          typeof val.phaseLabel === 'string' && !val.phaseLabel.startsWith('Phase 2') && !val.phaseLabel.startsWith('Phase 3')
            ? val.phaseLabel
            : 'Phase 4 — Leadership, Invitations, Forms, QR Check-in & Performance',
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
