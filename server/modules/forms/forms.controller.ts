import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {FormsService} from './forms.service.ts';

export class FormsController {
  constructor(private readonly service: FormsService) {}

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const form = await this.service.getForm(req.params.eventId);
      sendSuccess(res, form);
    } catch (error) {
      next(error);
    }
  };

  put = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const form = await this.service.saveForm(req.params.eventId, req.body.fields, {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      sendSuccess(res, form);
    } catch (error) {
      next(error);
    }
  };
}
