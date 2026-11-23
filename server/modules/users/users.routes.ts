import {Router} from 'express';
import {updateProfileSchema} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireAuth} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {UsersController} from './users.controller.ts';
import {UsersService} from './users.service.ts';

export function createUsersRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new UsersService(adapter);
  const controller = new UsersController(service);

  router.get('/users/me', requireAuth, controller.getMe);
  router.patch('/users/me', requireAuth, validateBody(updateProfileSchema), controller.updateMe);

  return router;
}
