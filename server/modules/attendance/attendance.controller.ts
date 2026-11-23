import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {AttendanceService} from './attendance.service.ts';

export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  scan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const record = await this.service.scanAttendance(
        req.params.eventId,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body,
      );
      sendSuccess(res, record, 201);
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const summary = await this.service.listAttendance(req.params.eventId);
      sendSuccess(res, summary);
    } catch (error) {
      next(error);
    }
  };
}
