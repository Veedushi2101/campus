import {z} from 'zod';
import {
  CLUB_CATEGORIES,
  CORE_MEMBER_PERMISSIONS,
  EVENT_CATEGORIES,
} from '../constants/permissions.ts';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
    department: z.string().trim().min(2, 'Department is required').max(80),
    yearOfStudy: z.string().trim().min(1, 'Year of study is required').max(30),
  })
  .strict();

export const patchProfileSchema = updateProfileSchema
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one profile field (name, department, yearOfStudy) must be provided',
  });

export const loginDemoSchema = z.object({
  personaId: z.string().trim().min(1).optional(),
  email: z.string().trim().email('Enter a valid institutional email').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export const registerDemoSchema = z.object({
  name: z.string().trim().min(2, 'Full name is required').max(80),
  email: z
    .string()
    .trim()
    .email('Enter a valid institutional email')
    .refine((v) => v.includes('@'), 'Must be an institutional email'),
  department: z.string().trim().min(2, 'Department is required'),
  yearOfStudy: z.string().trim().min(1, 'Year of study is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const createClubSchema = z.object({
  name: z.string().trim().min(3, 'Club name must be at least 3 characters').max(80),
  category: z.enum(CLUB_CATEGORIES),
  tagline: z.string().trim().min(8, 'Tagline must be at least 8 characters').max(140),
  description: z.string().trim().min(20, 'Description must be at least 20 characters').max(1500),
  meetingSchedule: z.string().trim().min(4).max(120),
  contactEmail: z.string().trim().email('Valid contact email is required'),
  status: z.enum(['active', 'inactive', 'pending_review']).optional(),
});

export const updateClubSchema = z
  .object({
    name: z.string().trim().min(3, 'Club name must be at least 3 characters').max(80),
    category: z.enum(CLUB_CATEGORIES),
    tagline: z.string().trim().min(8, 'Tagline must be at least 8 characters').max(140),
    description: z.string().trim().min(20, 'Description must be at least 20 characters').max(1500),
    meetingSchedule: z.string().trim().min(4).max(120),
    contactEmail: z.string().trim().email('Valid contact email is required'),
    logoUrl: z.string().trim().max(500).optional(),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one club field must be provided for update',
  });

export const updateClubStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'suspended', 'pending_review']),
  reason: z.string().trim().max(300).optional(),
});

export const upsertClubMemberSchema = z
  .object({
    email: z.string().trim().email('Valid institutional email is required').optional(),
    userId: z.string().trim().uuid('Valid user ID is required').optional(),
    role: z.enum(['club_admin', 'core_member']),
    title: z.string().trim().min(2, 'Role title is required').max(60),
    permissions: z.array(z.enum(CORE_MEMBER_PERMISSIONS)).default([]),
  })
  .refine((data) => Boolean(data.email || data.userId), {
    message: 'Either email or userId must be provided',
  });

export const updateMemberPermissionsSchema = z
  .object({
    role: z.enum(['club_admin', 'core_member']).optional(),
    title: z.string().trim().min(2).max(60).optional(),
    permissions: z.array(z.enum(CORE_MEMBER_PERMISSIONS)).optional(),
  })
  .refine(
    (data) => data.role !== undefined || data.title !== undefined || data.permissions !== undefined,
    {message: 'At least one membership field must be updated'},
  );

export const createEventSchema = z.object({
  title: z.string().trim().min(4, 'Event title must be at least 4 characters').max(120),
  category: z.enum(EVENT_CATEGORIES),
  description: z.string().trim().min(20, 'Description must be at least 20 characters').max(2000),
  venue: z.string().trim().min(3, 'Venue is required').max(120),
  startTime: z.string().trim().min(4, 'Start date/time is required'),
  endTime: z.string().trim().min(4, 'End date/time is required'),
  registrationDeadline: z.string().trim().min(4, 'Registration deadline is required'),
  capacity: z.coerce.number().int().min(5, 'Minimum capacity is 5').max(5000),
  isPaid: z.boolean().default(false),
  feeAmount: z.coerce.number().min(0).max(5000).default(0),
});

export const updateEventSchema = createEventSchema.partial();

export const formFieldSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(2, 'Field label is required').max(80),
  type: z.enum(['text', 'email', 'number', 'select', 'checkbox', 'textarea']),
  required: z.boolean(),
  placeholder: z.string().max(120).optional(),
  options: z.array(z.string().trim().min(1)).optional(),
});

export const updateRegistrationFormSchema = z.object({
  fields: z.array(formFieldSchema).min(1, 'At least one form field is required').max(20),
});

export const submitRegistrationSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])),
});

export const scanAttendanceSchema = z.object({
  qrToken: z.string().trim().min(4).max(120).optional(),
  registrationId: z.string().trim().min(2).optional(),
  method: z.enum(['qr_scan', 'manual_override']).default('qr_scan'),
}).refine((data) => Boolean(data.qrToken || data.registrationId), {
  message: 'Either qrToken or registrationId must be provided',
});

export const submitEventReportSchema = z.object({
  outcomeSummary: z.string().trim().min(20, 'Outcome summary must be at least 20 characters').max(2000),
  highlights: z.string().trim().min(10, 'Highlights must be at least 10 characters').max(1500),
  challenges: z.string().trim().max(1500).default('None reported'),
  actualAttendance: z.coerce.number().int().min(0).max(10000),
  completionStatus: z.enum(['completed', 'partial']).default('completed'),
});

export const financialLineItemSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['collection', 'expense']),
  label: z.string().trim().min(2, 'Item label is required').max(120),
  category: z.string().trim().min(2, 'Category is required').max(60),
  amount: z.coerce.number().min(0, 'Amount cannot be negative').max(1000000),
  notes: z.string().trim().max(240).optional(),
});

export const submitFinancialReportSchema = z.object({
  lineItems: z.array(financialLineItemSchema).min(1, 'At least one financial line item is required'),
  notes: z.string().trim().max(1000).default(''),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().max(300).optional(),
});

export const updateSystemSettingsSchema = z.object({
  requireClubApproval: z.boolean().optional(),
  allowStudentEventFeedback: z.boolean().optional(),
});
