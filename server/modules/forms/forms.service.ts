import type {
  EventFormVersion,
  FormField,
  RegistrationForm,
} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {NotFoundError, ValidationError} from '../../shared/errors/AppError.ts';

export class FormsService {
  constructor(private readonly adapter: DataAdapter) {}

  async getForm(eventId: string): Promise<RegistrationForm> {
    return this.adapter.getRegistrationForm(eventId);
  }

  async getPublishedVersion(eventId: string, version: number): Promise<EventFormVersion> {
    if (!this.adapter.getPublishedFormVersion) {
      throw new NotFoundError('Form snapshot versioning is not available');
    }
    const snapshot = await this.adapter.getPublishedFormVersion(eventId, version);
    if (!snapshot) {
      throw new NotFoundError(`Published form version v${version} not found`);
    }
    return snapshot;
  }

  async saveForm(
    eventId: string,
    fields: FormField[],
    actor: {id: string; name: string},
    meta?: {title?: string; description?: string},
  ): Promise<RegistrationForm> {
    for (const field of fields) {
      if (
        (field.type === 'select' || field.type === 'radio' || field.type === 'checkboxes') &&
        (!field.options || field.options.length === 0)
      ) {
        throw new ValidationError(`Field "${field.label}" requires at least one choice option`);
      }
    }

    const form = await this.adapter.upsertRegistrationForm(eventId, fields, {
      title: meta?.title,
      description: meta?.description,
      updatedBy: actor.id,
    });
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Club Form Builder',
      action: 'UPDATED_REGISTRATION_FORM_DRAFT',
      targetType: 'event',
      targetId: eventId,
      targetLabel: `Form v${form.version}`,
      details: `Saved draft with ${fields.length} custom registration fields.`,
    });
    return form;
  }

  async publishForm(
    eventId: string,
    actor: {id: string; name: string},
  ): Promise<EventFormVersion> {
    if (!this.adapter.publishRegistrationForm) {
      throw new ValidationError('Form version publishing is not supported by active adapter');
    }
    const current = await this.adapter.getRegistrationForm(eventId);
    if (!current.fields || current.fields.length === 0) {
      throw new ValidationError('Cannot publish an empty registration form');
    }
    const snapshot = await this.adapter.publishRegistrationForm(eventId, actor.id);
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Club Form Builder',
      action: 'PUBLISHED_REGISTRATION_FORM_VERSION',
      targetType: 'event',
      targetId: eventId,
      targetLabel: `Form Snapshot v${snapshot.version}`,
      details: `Published immutable form snapshot v${snapshot.version} (${snapshot.fields.length} fields).`,
    });
    return snapshot;
  }
}
