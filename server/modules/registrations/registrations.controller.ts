import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {RegistrationsService} from './registrations.service.ts';

export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reg = await this.service.registerStudent(
        req.params.eventId,
        req.auth!.user,
        req.body.answers,
      );
      sendSuccess(res, reg, 201);
    } catch (error) {
      next(error);
    }
  };

  listForEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const list = await this.service.listForEvent(req.params.eventId);
      sendSuccess(res, list);
    } catch (error) {
      next(error);
    }
  };

  listMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const list = await this.service.listForStudent(req.auth!.user.id);
      sendSuccess(res, list);
    } catch (error) {
      next(error);
    }
  };
}
