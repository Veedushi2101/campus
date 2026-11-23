import {asc, eq, sql} from 'drizzle-orm';
import type {EventItem, FormField, RegistrationForm} from '../../../shared/types/domain.ts';
import {NotFoundError, ValidationError} from '../../shared/errors/AppError.ts';
import {withRlsTransaction} from '../index.ts';
import {attendanceRecords, clubs, eventForms, events, formFields} from '../schema.ts';
import {fromCentsToFixed, isUuid, mapEventRow, mapFormRow, slugify, toCents} from './mappers.ts';

export class EventsRepository {
  async listEvents(filters?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
  }): Promise<EventItem[]> {
    return withRlsTransaction('events.list', async (tx) => {
      const rows = await tx
        .select({
          event: events,
          clubName: clubs.name,
        })
        .from(events)
        .innerJoin(clubs, eq(events.clubId, clubs.id))
        .orderBy(asc(events.startsAt));

      const attRows = await tx
        .select({
          eventId: attendanceRecords.eventId,
          count: sql<number>`count(*)::int`,
        })
        .from(attendanceRecords)
        .groupBy(attendanceRecords.eventId);
      const attendedMap = new Map(attRows.map((a) => [a.eventId, a.count]));

      return rows
        .map((r) =>
          mapEventRow(r.event, {
            clubName: r.clubName,
            attendedCount: attendedMap.get(r.event.id) ?? 0,
          }),
        )
        .filter((ev) => {
          if (filters?.clubId && ev.clubId !== filters.clubId) return false;
          if (filters?.category && filters.category !== 'All' && ev.category !== filters.category) {
            return false;
          }
          if (filters?.status && filters.status !== 'All' && ev.status !== filters.status) {
            return false;
          }
          if (filters?.upcomingOnly && ev.status !== 'published') return false;
          if (filters?.search) {
            const q = filters.search.toLowerCase();
            return (
              ev.title.toLowerCase().includes(q) ||
              ev.clubName.toLowerCase().includes(q) ||
              ev.venue.toLowerCase().includes(q)
            );
          }
          return true;
        });
    });
  }

  async getEventById(eventIdOrSlug: string): Promise<EventItem | null> {
    return withRlsTransaction('events.getById', async (tx) => {
      const condition = isUuid(eventIdOrSlug)
        ? eq(events.id, eventIdOrSlug)
        : eq(events.slug, eventIdOrSlug);

      const rows = await tx
        .select({
          event: events,
          clubName: clubs.name,
        })
        .from(events)
        .innerJoin(clubs, eq(events.clubId, clubs.id))
        .where(condition)
        .limit(1);

      if (!rows[0]) return null;

      const attCount = await tx
        .select({count: sql<number>`count(*)::int`})
        .from(attendanceRecords)
        .where(eq(attendanceRecords.eventId, rows[0].event.id));

      return mapEventRow(rows[0].event, {
        clubName: rows[0].clubName,
        attendedCount: attCount[0]?.count ?? 0,
      });
    });
  }

  async createEvent(
    clubId: string,
    input: Omit<
      EventItem,
      | 'id'
      | 'clubId'
      | 'clubName'
      | 'registeredCount'
      | 'attendedCount'
      | 'status'
      | 'bannerUrl'
      | 'createdAt'
      | 'updatedAt'
    >,
  ): Promise<EventItem> {
    if (!isUuid(clubId)) throw new NotFoundError('Club not found');
    const startsAt = new Date(input.startTime);
    const endsAt = new Date(input.endTime);
    const deadline = new Date(input.registrationDeadline);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new ValidationError('Invalid start or end timestamp');
    }
    if (endsAt <= startsAt) {
      throw new ValidationError('Event end time must be after start time');
    }

    return withRlsTransaction('events.create', async (tx) => {
      const [clubRow] = await tx.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
      if (!clubRow) throw new NotFoundError('Club not found');

      const baseSlug = slugify(input.title) || 'campus-event';
      const uniqueSlug = `${baseSlug}-${Date.now().toString().slice(-5)}`;
      const feeFixed = input.isPaid ? fromCentsToFixed(toCents(input.feeAmount)) : '0.00';

      const [inserted] = await tx
        .insert(events)
        .values({
          clubId: clubRow.id,
          title: input.title.trim(),
          slug: uniqueSlug,
          category: input.category,
          description: input.description.trim(),
          venue: input.venue.trim(),
          startsAt,
          endsAt,
          registrationDeadline: Number.isNaN(deadline.getTime()) ? startsAt : deadline,
          capacity: input.capacity,
          registeredCount: 0,
          isPaid: input.isPaid,
          feeAmount: feeFixed,
          bannerUrl: clubRow.logoUrl || '/src/assets/images/event_hackathon_banner_1795447592033.jpg',
          status: 'draft',
        })
        .returning();

      const [formRow] = await tx
        .insert(eventForms)
        .values({
          eventId: inserted.id,
          version: 1,
          title: `${inserted.title} Registration`,
        })
        .returning();

      await tx.insert(formFields).values([
        {
          formId: formRow.id,
          fieldKey: 'fld-track',
          label: 'Participation Role',
          fieldType: 'select',
          required: true,
          options: ['Participant', 'Observer'],
          sortOrder: 0,
        },
        {
          formId: formRow.id,
          fieldKey: 'fld-code-conduct',
          label: 'I agree to follow the CampusVerse Event Code of Conduct',
          fieldType: 'checkbox',
          required: true,
          options: [],
          sortOrder: 1,
        },
      ]);

      return mapEventRow(inserted, {clubName: clubRow.name, attendedCount: 0});
    });
  }

  async updateEvent(eventId: string, updates: Partial<EventItem>): Promise<EventItem | null> {
    if (!isUuid(eventId)) return null;
    return withRlsTransaction('events.update', async (tx) => {
      const setData: Partial<typeof events.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (updates.title !== undefined) setData.title = updates.title.trim();
      if (updates.category !== undefined) setData.category = updates.category;
      if (updates.description !== undefined) setData.description = updates.description.trim();
      if (updates.venue !== undefined) setData.venue = updates.venue.trim();
      if (updates.startTime !== undefined) setData.startsAt = new Date(updates.startTime);
      if (updates.endTime !== undefined) setData.endsAt = new Date(updates.endTime);
      if (updates.registrationDeadline !== undefined) {
        setData.registrationDeadline = new Date(updates.registrationDeadline);
      }
      if (updates.capacity !== undefined) setData.capacity = updates.capacity;
      if (updates.isPaid !== undefined) setData.isPaid = updates.isPaid;
      if (updates.feeAmount !== undefined) {
        setData.feeAmount = fromCentsToFixed(toCents(updates.feeAmount));
      }
      if (updates.status !== undefined) setData.status = updates.status;

      const updated = await tx
        .update(events)
        .set(setData)
        .where(eq(events.id, eventId))
        .returning();
      if (!updated[0]) return null;

      const [clubRow] = await tx
        .select({name: clubs.name})
        .from(clubs)
        .where(eq(clubs.id, updated[0].clubId))
        .limit(1);

      return mapEventRow(updated[0], {clubName: clubRow?.name || ''});
    });
  }

  async publishEvent(eventId: string): Promise<EventItem | null> {
    if (!isUuid(eventId)) return null;
    return withRlsTransaction('events.publish', async (tx) => {
      const updated = await tx
        .update(events)
        .set({
          status: 'published',
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(events.id, eventId))
        .returning();
      if (!updated[0]) return null;

      const [clubRow] = await tx
        .select({name: clubs.name})
        .from(clubs)
        .where(eq(clubs.id, updated[0].clubId))
        .limit(1);

      return mapEventRow(updated[0], {clubName: clubRow?.name || ''});
    });
  }

  async getRegistrationForm(eventId: string): Promise<RegistrationForm> {
    if (!isUuid(eventId)) throw new NotFoundError('Event not found');
    return withRlsTransaction('forms.get', async (tx) => {
      const [ev] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!ev) throw new NotFoundError('Event not found');

      const [formRow] = await tx
        .select()
        .from(eventForms)
        .where(eq(eventForms.eventId, eventId))
        .limit(1);

      if (!formRow) {
        return {
          id: `default-${eventId}`,
          eventId,
          version: 1,
          fields: [
            {
              id: 'fld-notes',
              label: 'Registration Notes',
              type: 'text',
              required: false,
              placeholder: 'Any dietary or accessibility needs',
            },
          ],
          updatedAt: new Date().toISOString(),
        };
      }

      const fields = await tx
        .select()
        .from(formFields)
        .where(eq(formFields.formId, formRow.id))
        .orderBy(asc(formFields.sortOrder));

      return mapFormRow(formRow, fields);
    });
  }

  async upsertRegistrationForm(eventId: string, fields: FormField[]): Promise<RegistrationForm> {
    if (!isUuid(eventId)) throw new NotFoundError('Event not found');

    return withRlsTransaction('forms.upsert', async (tx) => {
      const [ev] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!ev) throw new NotFoundError('Event not found');

      const [existing] = await tx
        .select()
        .from(eventForms)
        .where(eq(eventForms.eventId, eventId))
        .limit(1);

      let formRow: typeof eventForms.$inferSelect;
      if (existing) {
        const [updated] = await tx
          .update(eventForms)
          .set({
            version: existing.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(eventForms.id, existing.id))
          .returning();
        formRow = updated;
        await tx.delete(formFields).where(eq(formFields.formId, formRow.id));
      } else {
        const [inserted] = await tx
          .insert(eventForms)
          .values({
            eventId,
            version: 1,
            title: `${ev.title} Registration`,
          })
          .returning();
        formRow = inserted;
      }

      const seenKeys = new Set<string>();
      const fieldValues = fields.map((f, index) => {
        let key = f.id.trim() || `field-${index}`;
        if (seenKeys.has(key)) key = `${key}-${index}`;
        seenKeys.add(key);
        return {
          formId: formRow.id,
          fieldKey: key,
          label: f.label.trim(),
          fieldType: f.type,
          placeholder: f.placeholder ?? null,
          required: Boolean(f.required),
          options: f.options ? [...f.options] : [],
          sortOrder: index,
        };
      });

      const insertedFields =
        fieldValues.length > 0 ? await tx.insert(formFields).values(fieldValues).returning() : [];

      return mapFormRow(formRow, insertedFields);
    });
  }
}
