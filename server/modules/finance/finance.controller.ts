import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {FinanceService} from './finance.service.ts';

export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  submit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const report = await this.service.submitFinancialReport(
        req.params.eventId,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body,
      );
      sendSuccess(res, report, 201);
    } catch (error) {
      next(error);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const report = await this.service.getFinancialReport(req.params.eventId);
      sendSuccess(res, report);
    } catch (error) {
      next(error);
    }
  };
}
