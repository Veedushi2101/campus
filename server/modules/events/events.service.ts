import type {EventItem} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {NotFoundError, ValidationError} from '../../shared/errors/AppError.ts';

export class EventsService {
  constructor(private readonly adapter: DataAdapter) {}

  async listEvents(filters?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
  }): Promise<EventItem[]> {
    return this.adapter.listEvents(filters);
  }

  async getEventById(eventId: string): Promise<EventItem> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');
    return event;
  }

  async createEvent(
    clubId: string,
    actor: {id: string; name: string},
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
  ): Promise<EventItem> {
    if (new Date(input.endTime).getTime() <= new Date(input.startTime).getTime()) {
      throw new ValidationError('Event end time must be after start time');
    }
    const created = await this.adapter.createEvent(clubId, input);
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Team · ${created.clubName}`,
      action: 'CREATED_EVENT_DRAFT',
      targetType: 'event',
      targetId: created.id,
      targetLabel: created.title,
      details: `Created draft event at ${created.venue}.`,
    });
    return created;
  }

  async updateEvent(
    eventId: string,
    actor: {id: string; name: string},
    updates: Partial<EventItem>,
  ): Promise<EventItem> {
    const updated = await this.adapter.updateEvent(eventId, updates);
    if (!updated) throw new NotFoundError('Event not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Team · ${updated.clubName}`,
      action: 'UPDATED_EVENT',
      targetType: 'event',
      targetId: updated.id,
      targetLabel: updated.title,
      details: 'Updated event schedule or details.',
    });
    return updated;
  }

  async publishEvent(eventId: string, actor: {id: string; name: string}): Promise<EventItem> {
    const published = await this.adapter.publishEvent(eventId);
    if (!published) throw new NotFoundError('Event not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Team · ${published.clubName}`,
      action: 'PUBLISHED_EVENT',
      targetType: 'event',
      targetId: published.id,
      targetLabel: published.title,
      details: `Published event with capacity ${published.capacity}.`,
    });
    return published;
  }
}
