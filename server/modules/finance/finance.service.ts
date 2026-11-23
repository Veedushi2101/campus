import type {FinancialLineItem, FinancialReport} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {NotFoundError} from '../../shared/errors/AppError.ts';

export class FinanceService {
  constructor(private readonly adapter: DataAdapter) {}

  async submitFinancialReport(
    eventId: string,
    actor: {id: string; name: string},
    input: {lineItems: FinancialLineItem[]; notes: string},
  ): Promise<FinancialReport> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');

    const totalCollections = input.lineItems
      .filter((i) => i.type === 'collection')
      .reduce((sum, i) => sum + Number(i.amount), 0);
    const totalExpenses = input.lineItems
      .filter((i) => i.type === 'expense')
      .reduce((sum, i) => sum + Number(i.amount), 0);
    const netBalance = totalCollections - totalExpenses;

    const report = await this.adapter.upsertFinancialReport({
      eventId: event.id,
      eventTitle: event.title,
      clubId: event.clubId,
      clubName: event.clubName,
      submittedBy: actor.id,
      submittedByName: actor.name,
      totalCollections,
      totalExpenses,
      netBalance,
      lineItems: input.lineItems,
      notes: input.notes,
    });

    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Finance · ${event.clubName}`,
      action: 'SUBMITTED_FINANCIAL_REPORT',
      targetType: 'report',
      targetId: report.id,
      targetLabel: event.title,
      details: `Collections: ${totalCollections}, Expenses: ${totalExpenses}, Net: ${netBalance}.`,
    });

    return report;
  }

  async getFinancialReport(eventId: string): Promise<FinancialReport | null> {
    return this.adapter.getFinancialReport(eventId);
  }
}
