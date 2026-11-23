import {Router} from 'express';
import {submitRegistrationSchema} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireAuth, requireEventPermission} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {RegistrationsController} from './registrations.controller.ts';
import {RegistrationsService} from './registrations.service.ts';

export function createRegistrationsRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new RegistrationsService(adapter);
  const controller = new RegistrationsController(service);

  router.post(
    '/events/:eventId/registrations',
    requireAuth,
    validateBody(submitRegistrationSchema),
    controller.create,
  );
  router.get(
    '/events/:eventId/registrations',
    requireEventPermission(adapter, 'VIEW_REGISTRATIONS', 'eventId'),
    controller.listForEvent,
  );
  router.get('/registrations/me', requireAuth, controller.listMine);

  return router;
}
