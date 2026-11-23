import type {AttendanceRecord} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {BusinessRuleError, NotFoundError} from '../../shared/errors/AppError.ts';

export class AttendanceService {
  constructor(private readonly adapter: DataAdapter) {}

  async scanAttendance(
    eventId: string,
    actor: {id: string; name: string},
    input: {qrToken?: string; registrationId?: string; method: 'qr_scan' | 'manual_override'},
  ): Promise<AttendanceRecord> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');

    const registration = input.qrToken
      ? await this.adapter.getRegistrationByQrToken(eventId, input.qrToken)
      : input.registrationId
        ? await this.adapter.getRegistrationById(input.registrationId)
        : null;

    if (!registration || registration.eventId !== eventId) {
      throw new NotFoundError('No valid registration matches this QR token for this event');
    }

    if (registration.status === 'cancelled') {
      throw new BusinessRuleError('REGISTRATION_CANCELLED', 'Cancelled registrations cannot be checked in');
    }

    const student = await this.adapter.getUserById(registration.studentId);
    const record = await this.adapter.recordAttendance({
      eventId,
      registrationId: registration.id,
      studentId: registration.studentId,
      studentName: registration.studentName,
      studentCode: student?.studentId || registration.studentId,
      qrToken: registration.qrToken,
      method: input.method,
      checkedInBy: actor.name,
      scannedByUserId: actor.id,
    });

    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Attendance Gate · ${event.clubName}`,
      action: input.method === 'qr_scan' ? 'QR_CHECK_IN' : 'MANUAL_CHECK_IN',
      targetType: 'event',
      targetId: event.id,
      targetLabel: `${event.title} · ${registration.studentName}`,
      details: `Recorded single-use check-in via ${input.method}.`,
    });

    return record;
  }

  async listAttendance(eventId: string): Promise<{
    records: AttendanceRecord[];
    registeredCount: number;
    attendedCount: number;
  }> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');
    const records = await this.adapter.listAttendanceForEvent(eventId);
    return {
      records,
      registeredCount: event.registeredCount,
      attendedCount: records.length,
    };
  }
}
