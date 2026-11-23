import type {FormField, RegistrationForm} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';

export class FormsService {
  constructor(private readonly adapter: DataAdapter) {}

  async getForm(eventId: string): Promise<RegistrationForm> {
    return this.adapter.getRegistrationForm(eventId);
  }

  async saveForm(
    eventId: string,
    fields: FormField[],
    actor: {id: string; name: string},
  ): Promise<RegistrationForm> {
    const form = await this.adapter.upsertRegistrationForm(eventId, fields);
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Club Form Builder',
      action: 'UPDATED_REGISTRATION_FORM',
      targetType: 'event',
      targetId: eventId,
      targetLabel: `Form v${form.version}`,
      details: `Saved ${fields.length} custom registration fields.`,
    });
    return form;
  }
}
