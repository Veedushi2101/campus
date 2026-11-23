import {Router} from 'express';
import {submitFinancialReportSchema} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireEventPermission} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {FinanceController} from './finance.controller.ts';
import {FinanceService} from './finance.service.ts';

export function createFinanceRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new FinanceService(adapter);
  const controller = new FinanceController(service);

  // Strictly protected: students without SUBMIT_FINANCE_REPORTS cannot access club financial data
  router.post(
    '/events/:eventId/finance-report',
    requireEventPermission(adapter, 'SUBMIT_FINANCE_REPORTS', 'eventId'),
    validateBody(submitFinancialReportSchema),
    controller.submit,
  );
  router.get(
    '/events/:eventId/finance-report',
    requireEventPermission(adapter, 'SUBMIT_FINANCE_REPORTS', 'eventId'),
    controller.get,
  );

  return router;
}
