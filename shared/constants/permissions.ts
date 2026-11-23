export const MAX_FOLLOWED_CLUBS = 2;

export const API_PREFIX = '/api/v1';

export const CORE_MEMBER_PERMISSIONS = [
  'MANAGE_EVENTS',
  'MANAGE_FORMS',
  'VIEW_REGISTRATIONS',
  'SCAN_ATTENDANCE',
  'SUBMIT_EVENT_REPORTS',
  'SUBMIT_FINANCE_REPORTS',
] as const;

export type CoreMemberPermission = (typeof CORE_MEMBER_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<CoreMemberPermission, string> = {
  MANAGE_EVENTS: 'Manage Events',
  MANAGE_FORMS: 'Manage Forms',
  VIEW_REGISTRATIONS: 'View Registrations',
  SCAN_ATTENDANCE: 'Scan Attendance QR',
  SUBMIT_EVENT_REPORTS: 'Submit Event Reports',
  SUBMIT_FINANCE_REPORTS: 'Submit Financial Reports',
};

export const CLUB_CATEGORIES = [
  'Technology',
  'Design',
  'Music & Arts',
  'Debate & Literary',
  'Robotics & Hardware',
  'Entrepreneurship',
  'Social Impact',
  'Sports & Athletics',
] as const;

export type ClubCategory = (typeof CLUB_CATEGORIES)[number];

export const EVENT_CATEGORIES = [
  'Hackathon',
  'Workshop',
  'Seminar',
  'Competition',
  'Cultural',
  'Networking',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
