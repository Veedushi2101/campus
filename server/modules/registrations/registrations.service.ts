import type {Registration, UserAccount} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {NotFoundError, ValidationError} from '../../shared/errors/AppError.ts';
import {generateOpaqueQrToken} from '../../shared/utils/crypto.ts';

export class RegistrationsService {
  constructor(private readonly adapter: DataAdapter) {}

  async registerStudent(
    eventId: string,
    student: UserAccount,
    answers: Record<string, string | boolean | number>,
  ): Promise<Registration> {
    const form = await this.adapter.getRegistrationForm(eventId);
    const missingFields: string[] = [];

    for (const field of form.fields) {
      if (!field.required) continue;
      const val = answers[field.id];
      if (field.type === 'checkbox') {
        if (val !== true) missingFields.push(field.label);
      } else if (val === undefined || val === null || String(val).trim() === '') {
        missingFields.push(field.label);
      }
    }

    if (missingFields.length > 0) {
      throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`, {
        missingFields,
      });
    }

    const qrToken = generateOpaqueQrToken();
    const registration = await this.adapter.createRegistration({
      eventId,
      studentId: student.id,
      studentName: student.name,
      studentEmail: student.email,
      answers,
      qrToken,
    });

    await this.adapter.createNotification({
      userId: student.id,
      title: `Registration Confirmed: ${registration.eventTitle}`,
      message: `Your non-PII entry pass ${qrToken} is ready in My Registrations.`,
      category: 'registration',
      link: '/app/student/registrations',
    });

    return registration;
  }

  async listForEvent(eventId: string): Promise<Registration[]> {
    const ev = await this.adapter.getEventById(eventId);
    if (!ev) throw new NotFoundError('Event not found');
    return this.adapter.listRegistrationsForEvent(eventId);
  }

  async listForStudent(studentId: string): Promise<Registration[]> {
    return this.adapter.listRegistrationsForStudent(studentId);
  }
}
