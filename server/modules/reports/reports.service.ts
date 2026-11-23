import type {EventReport} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {NotFoundError} from '../../shared/errors/AppError.ts';

export class ReportsService {
  constructor(private readonly adapter: DataAdapter) {}

  async submitEventReport(
    eventId: string,
    actor: {id: string; name: string},
    input: {
      outcomeSummary: string;
      highlights: string;
      challenges: string;
      actualAttendance: number;
      completionStatus: 'completed' | 'partial';
    },
  ): Promise<EventReport> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');

    const report = await this.adapter.upsertEventReport({
      eventId: event.id,
      eventTitle: event.title,
      clubId: event.clubId,
      clubName: event.clubName,
      submittedBy: actor.id,
      submittedByName: actor.name,
      outcomeSummary: input.outcomeSummary,
      highlights: input.highlights,
      challenges: input.challenges,
      actualAttendance: input.actualAttendance,
      registeredTotal: event.registeredCount,
      completionStatus: input.completionStatus,
    });

    if (input.completionStatus === 'completed') {
      await this.adapter.updateEvent(event.id, {status: 'completed'});
    }

    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Team · ${event.clubName}`,
      action: 'SUBMITTED_EVENT_REPORT',
      targetType: 'report',
      targetId: report.id,
      targetLabel: event.title,
      details: `Reported ${input.actualAttendance} attendees (${input.completionStatus}).`,
    });

    return report;
  }

  async getEventReport(eventId: string): Promise<EventReport | null> {
    return this.adapter.getEventReport(eventId);
  }
}
