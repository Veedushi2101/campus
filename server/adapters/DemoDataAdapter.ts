import type {
  AdminDashboardStats,
  AttendanceRecord,
  AuditLogEntry,
  Club,
  ClubDetail,
  ClubFollow,
  ClubMembership,
  ClubStatus,
  CoreMemberPermission,
  EventItem,
  EventReport,
  FinancialReport,
  FormField,
  HallOfFameEntry,
  NotificationItem,
  Registration,
  RegistrationForm,
  SystemSettings,
  UserAccount,
} from '../../shared/types/domain.ts';
import {MAX_FOLLOWED_CLUBS} from '../config/constants.ts';
import {BusinessRuleError, ConflictError, NotFoundError} from '../shared/errors/AppError.ts';
import type {DataAdapter} from './DataAdapter.ts';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class DemoDataAdapter implements DataAdapter {
  private users: UserAccount[] = [];
  private clubs: Club[] = [];
  private memberships: ClubMembership[] = [];
  private follows: ClubFollow[] = [];
  private events: EventItem[] = [];
  private forms: Map<string, RegistrationForm> = new Map();
  private registrations: Registration[] = [];
  private attendance: AttendanceRecord[] = [];
  private eventReports: EventReport[] = [];
  private financialReports: FinancialReport[] = [];
  private notifications: NotificationItem[] = [];
  private auditLogs: AuditLogEntry[] = [];
  private settings: SystemSettings = {
    maxClubsPerStudent: MAX_FOLLOWED_CLUBS,
    requireClubApproval: true,
    allowStudentEventFeedback: true,
    phaseLabel: 'Phase 1 — Development Sandbox (In-Memory Demo Adapter)',
    persistenceMode: 'in_memory_demo',
  };

  constructor() {
    this.seed();
  }

  public resetForTests(): void {
    this.users = [];
    this.clubs = [];
    this.memberships = [];
    this.follows = [];
    this.events = [];
    this.forms.clear();
    this.registrations = [];
    this.attendance = [];
    this.eventReports = [];
    this.financialReports = [];
    this.notifications = [];
    this.auditLogs = [];
    this.seed();
  }

  private seed(): void {
    this.users = [
      {
        id: 'usr-student-1',
        name: 'Aarav Mehta',
        email: 'aarav.mehta@campusverse.edu',
        department: 'Computer Science & Engineering',
        yearOfStudy: 'Junior (Year 3)',
        studentId: 'STU-2024-0412',
        isSuperAdmin: false,
        status: 'active',
        emailVerified: true,
        avatarInitials: 'AM',
        createdAt: '2026-08-15T09:00:00.000Z',
      },
      {
        id: 'usr-club-admin-1',
        name: 'Priya Nair',
        email: 'priya.nair@campusverse.edu',
        department: 'Robotics & Automation',
        yearOfStudy: 'Senior (Year 4)',
        studentId: 'STU-2023-0188',
        isSuperAdmin: false,
        status: 'active',
        emailVerified: true,
        avatarInitials: 'PN',
        createdAt: '2026-08-12T10:00:00.000Z',
      },
      {
        id: 'usr-core-1',
        name: 'Rohan Verma',
        email: 'rohan.verma@campusverse.edu',
        department: 'Electrical Engineering',
        yearOfStudy: 'Junior (Year 3)',
        studentId: 'STU-2024-0295',
        isSuperAdmin: false,
        status: 'active',
        emailVerified: true,
        avatarInitials: 'RV',
        createdAt: '2026-08-18T11:30:00.000Z',
      },
      {
        id: 'usr-multi-1',
        name: 'Sneha Kulkarni',
        email: 'sneha.kulkarni@campusverse.edu',
        department: 'Visual Communication & Design',
        yearOfStudy: 'Senior (Year 4)',
        studentId: 'STU-2023-0074',
        isSuperAdmin: false,
        status: 'active',
        emailVerified: true,
        avatarInitials: 'SK',
        createdAt: '2026-08-10T08:15:00.000Z',
      },
      {
        id: 'usr-student-2',
        name: 'Kabir Rao',
        email: 'kabir.rao@campusverse.edu',
        department: 'Mechanical Engineering',
        yearOfStudy: 'Sophomore (Year 2)',
        studentId: 'STU-2025-0633',
        isSuperAdmin: false,
        status: 'active',
        emailVerified: true,
        avatarInitials: 'KR',
        createdAt: '2026-09-01T14:20:00.000Z',
      },
      {
        id: 'usr-super-admin',
        name: 'Dr. Elena Vance',
        email: 'elena.vance@campusverse.edu',
        department: 'Office of Student Affairs',
        yearOfStudy: 'Dean of Campus Life',
        studentId: 'FAC-2019-0004',
        isSuperAdmin: true,
        status: 'active',
        emailVerified: true,
        avatarInitials: 'EV',
        createdAt: '2026-07-01T08:00:00.000Z',
      },
    ];

    this.clubs = [
      {
        id: 'club-robotics',
        name: 'Apex Robotics Lab',
        slug: 'apex-robotics-lab',
        category: 'Robotics & Hardware',
        tagline: 'Autonomous rovers, embedded firmware, and combat robotics engineering.',
        description:
          'Apex Robotics Lab brings together mechanical, electrical, and software students to design autonomous navigation platforms, custom PCBs, and inter-university competition robots.',
        logoUrl: '/src/assets/images/club_robotics_emblem_1795447591960.jpg',
        status: 'active',
        followerCount: 342,
        memberCount: 28,
        upcomingEventsCount: 2,
        foundedYear: 2018,
        meetingSchedule: 'Wednesdays & Saturdays · 17:30 · Innovation Hangar B2',
        contactEmail: 'robotics@campusverse.edu',
        createdAt: '2026-08-01T09:00:00.000Z',
      },
      {
        id: 'club-design',
        name: 'Atelier Design Guild',
        slug: 'atelier-design-guild',
        category: 'Design',
        tagline: 'Product design critiques, typography labs, and campus editorial systems.',
        description:
          'Atelier Design Guild fosters multidisciplinary visual craft across UI systems, industrial product prototyping, print publication design, and weekly portfolio critiques.',
        logoUrl: '/src/assets/images/club_design_emblem_1795447591826.jpg',
        status: 'active',
        followerCount: 289,
        memberCount: 22,
        upcomingEventsCount: 2,
        foundedYear: 2020,
        meetingSchedule: 'Thursdays · 18:00 · Studio Annex 104',
        contactEmail: 'atelier@campusverse.edu',
        createdAt: '2026-08-02T09:00:00.000Z',
      },
      {
        id: 'club-music',
        name: 'Resonance Acoustic Society',
        slug: 'resonance-acoustic-society',
        category: 'Music & Arts',
        tagline: 'Live acoustic sessions, studio production, and campus concert engineering.',
        description:
          'Resonance Acoustic Society runs the campus recording booth, hosts unplugged quad evenings, and trains students in live sound mixing and arrangement.',
        logoUrl: '/src/assets/images/club_music_emblem_1795447592008.jpg',
        status: 'active',
        followerCount: 289,
        memberCount: 31,
        upcomingEventsCount: 1,
        foundedYear: 2016,
        meetingSchedule: 'Fridays · 18:30 · Performing Arts Hall',
        contactEmail: 'resonance@campusverse.edu',
        createdAt: '2026-08-03T09:00:00.000Z',
      },
      {
        id: 'club-quantum',
        name: 'Quantum Computing Circle',
        slug: 'quantum-computing-circle',
        category: 'Technology',
        tagline: 'Systems algorithms, cloud architecture, and open-source engineering.',
        description:
          'A technical guild dedicated to distributed systems, applied algorithms, security CTFs, and mentoring freshmen through their first production open-source pull requests.',
        logoUrl: '',
        status: 'active',
        followerCount: 245,
        memberCount: 19,
        upcomingEventsCount: 2,
        foundedYear: 2021,
        meetingSchedule: 'Tuesdays · 17:00 · Turing Auditorium 301',
        contactEmail: 'quantum@campusverse.edu',
        createdAt: '2026-08-04T09:00:00.000Z',
      },
      {
        id: 'club-debate',
        name: 'Civic Debate Forum',
        slug: 'civic-debate-forum',
        category: 'Debate & Literary',
        tagline: 'British Parliamentary debate, policy briefs, and public rhetoric.',
        description:
          'Civic Debate Forum prepares varsity parliamentary teams for regional tournaments and hosts campus-wide town halls on technology policy and civic ethics.',
        logoUrl: '',
        status: 'active',
        followerCount: 198,
        memberCount: 16,
        upcomingEventsCount: 1,
        foundedYear: 2015,
        meetingSchedule: 'Mondays · 18:00 · Humanities Seminar 202',
        contactEmail: 'debate@campusverse.edu',
        createdAt: '2026-08-05T09:00:00.000Z',
      },
      {
        id: 'club-venture',
        name: 'Venture Foundry',
        slug: 'venture-foundry',
        category: 'Entrepreneurship',
        tagline: 'Student founder cohorts, product teardowns, and demo day showcases.',
        description:
          'Venture Foundry connects technical builders and business students with alumni founders for structured 8-week product sprints and customer discovery clinics.',
        logoUrl: '',
        status: 'active',
        followerCount: 176,
        memberCount: 15,
        upcomingEventsCount: 1,
        foundedYear: 2022,
        meetingSchedule: 'Wednesdays · 19:00 · Incubation Commons',
        contactEmail: 'foundry@campusverse.edu',
        createdAt: '2026-08-06T09:00:00.000Z',
      },
      {
        id: 'club-green',
        name: 'GreenCampus Collective',
        slug: 'greencampus-collective',
        category: 'Social Impact',
        tagline: 'Campus zero-waste audits, solar microgrids, and community outreach.',
        description:
          'Students working directly with facilities engineering to audit energy consumption, manage campus composting, and run annual sustainability summits.',
        logoUrl: '',
        status: 'active',
        followerCount: 134,
        memberCount: 24,
        upcomingEventsCount: 0,
        foundedYear: 2019,
        meetingSchedule: 'Saturdays · 10:00 · Botanical Pavilion',
        contactEmail: 'green@campusverse.edu',
        createdAt: '2026-08-07T09:00:00.000Z',
      },
      {
        id: 'club-athletics',
        name: 'Trailblazers Athletics',
        slug: 'trailblazers-athletics',
        category: 'Sports & Athletics',
        tagline: 'Endurance running, intramural leagues, and alpine trekking.',
        description:
          'Trailblazers organizes dawn track intervals, inter-departmental futsal tournaments, and weekend guided trail expeditions.',
        logoUrl: '',
        status: 'pending_review',
        followerCount: 92,
        memberCount: 12,
        upcomingEventsCount: 0,
        foundedYear: 2024,
        meetingSchedule: 'Tuesdays & Fridays · 06:30 · North Track Field',
        contactEmail: 'trailblazers@campusverse.edu',
        createdAt: '2026-09-10T09:00:00.000Z',
      },
    ];

    this.memberships = [
      {
        id: 'mem-1',
        userId: 'usr-club-admin-1',
        userName: 'Priya Nair',
        userEmail: 'priya.nair@campusverse.edu',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        role: 'club_admin',
        title: 'Club President',
        permissions: [
          'MANAGE_EVENTS',
          'MANAGE_FORMS',
          'VIEW_REGISTRATIONS',
          'SCAN_ATTENDANCE',
          'SUBMIT_EVENT_REPORTS',
          'SUBMIT_FINANCE_REPORTS',
        ],
        joinedAt: '2026-08-12T10:00:00.000Z',
      },
      {
        id: 'mem-2',
        userId: 'usr-core-1',
        userName: 'Rohan Verma',
        userEmail: 'rohan.verma@campusverse.edu',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        role: 'core_member',
        title: 'Operations & Check-In Lead',
        permissions: ['VIEW_REGISTRATIONS', 'SCAN_ATTENDANCE', 'SUBMIT_EVENT_REPORTS'],
        assignedTasks: [
          'Verify QR check-in readiness at Main Auditorium Gate A',
          'Submit Autonomous Rover Buildathon completion summary',
        ],
        joinedAt: '2026-08-18T11:30:00.000Z',
      },
      {
        id: 'mem-3',
        userId: 'usr-multi-1',
        userName: 'Sneha Kulkarni',
        userEmail: 'sneha.kulkarni@campusverse.edu',
        clubId: 'club-design',
        clubName: 'Atelier Design Guild',
        role: 'club_admin',
        title: 'Design Director',
        permissions: [
          'MANAGE_EVENTS',
          'MANAGE_FORMS',
          'VIEW_REGISTRATIONS',
          'SCAN_ATTENDANCE',
          'SUBMIT_EVENT_REPORTS',
          'SUBMIT_FINANCE_REPORTS',
        ],
        joinedAt: '2026-08-10T08:15:00.000Z',
      },
      {
        id: 'mem-4',
        userId: 'usr-multi-1',
        userName: 'Sneha Kulkarni',
        userEmail: 'sneha.kulkarni@campusverse.edu',
        clubId: 'club-music',
        clubName: 'Resonance Acoustic Society',
        role: 'core_member',
        title: 'Stage & Visual Coordinator',
        permissions: ['MANAGE_EVENTS', 'VIEW_REGISTRATIONS'],
        assignedTasks: ['Publish Winter Acoustic Showcase schedule'],
        joinedAt: '2026-08-22T09:00:00.000Z',
      },
      {
        id: 'mem-5',
        userId: 'usr-club-admin-1',
        userName: 'Priya Nair',
        userEmail: 'priya.nair@campusverse.edu',
        clubId: 'club-quantum',
        clubName: 'Quantum Computing Circle',
        role: 'core_member',
        title: 'Hardware Track Mentor',
        permissions: ['VIEW_REGISTRATIONS', 'SCAN_ATTENDANCE'],
        assignedTasks: ['Assist with Embedded Systems workshop check-ins'],
        joinedAt: '2026-09-02T09:00:00.000Z',
      },
    ];

    // Aarav follows 1 club initially so user can test following a 2nd and seeing the 3rd blocked!
    this.follows = [
      {
        id: 'fol-1',
        userId: 'usr-student-1',
        clubId: 'club-robotics',
        followedAt: '2026-10-05T12:00:00.000Z',
      },
      {
        id: 'fol-2',
        userId: 'usr-student-2',
        clubId: 'club-design',
        followedAt: '2026-10-06T12:00:00.000Z',
      },
      {
        id: 'fol-3',
        userId: 'usr-student-2',
        clubId: 'club-music',
        followedAt: '2026-10-07T12:00:00.000Z',
      },
    ];

    this.events = [
      {
        id: 'evt-rover-sprint',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        title: 'Autonomous Rover Buildathon 2026',
        category: 'Hackathon',
        description:
          'A 24-hour hardware and ROS2 navigation sprint. Teams receive an aluminum chassis kit, LiDAR sensor module, and bench power to complete an indoor obstacle course.',
        venue: 'Innovation Hangar B2 & Main Atrium',
        startTime: '2026-12-05T09:00:00.000Z',
        endTime: '2026-12-06T12:00:00.000Z',
        registrationDeadline: '2026-12-02T23:59:00.000Z',
        capacity: 120,
        registeredCount: 2,
        attendedCount: 0,
        status: 'published',
        bannerUrl: '/src/assets/images/event_hackathon_banner_1795447592033.jpg',
        isPaid: true,
        feeAmount: 250,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-20T14:00:00.000Z',
      },
      {
        id: 'evt-pcb-workshop',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        title: 'KiCad 4-Layer PCB Fabrication Lab',
        category: 'Workshop',
        description:
          'Hands-on schematic capture, differential-pair routing, and Gerber export clinic for student robotics teams preparing spring competition boards.',
        venue: 'Electronics Lab 204',
        startTime: '2026-12-12T14:00:00.000Z',
        endTime: '2026-12-12T17:30:00.000Z',
        registrationDeadline: '2026-12-10T23:59:00.000Z',
        capacity: 45,
        registeredCount: 1,
        attendedCount: 1,
        status: 'completed',
        bannerUrl: '/src/assets/images/club_robotics_emblem_1795447591960.jpg',
        isPaid: false,
        feeAmount: 0,
        createdAt: '2026-09-20T10:00:00.000Z',
        updatedAt: '2026-10-28T18:00:00.000Z',
      },
      {
        id: 'evt-drone-draft',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        title: 'Micro-Drone Flight Controller Clinic',
        category: 'Workshop',
        description:
          'Draft workshop covering PID tuning, brushless ESC telemetry, and indoor flight safety protocols.',
        venue: 'Robotics Cage C1',
        startTime: '2026-12-19T15:00:00.000Z',
        endTime: '2026-12-19T18:00:00.000Z',
        registrationDeadline: '2026-12-17T23:59:00.000Z',
        capacity: 30,
        registeredCount: 0,
        attendedCount: 0,
        status: 'draft',
        bannerUrl: '/src/assets/images/club_robotics_emblem_1795447591960.jpg',
        isPaid: false,
        feeAmount: 0,
        createdAt: '2026-11-10T10:00:00.000Z',
        updatedAt: '2026-11-10T10:00:00.000Z',
      },
      {
        id: 'evt-design-systems',
        clubId: 'club-design',
        clubName: 'Atelier Design Guild',
        title: 'Editorial Grid & Design Token Workshop',
        category: 'Workshop',
        description:
          'Learn systematic typographic scales, contrast ratios, and token handoff between Figma and Tailwind CSS 4.',
        venue: 'Studio Annex 104',
        startTime: '2026-12-08T16:00:00.000Z',
        endTime: '2026-12-08T18:30:00.000Z',
        registrationDeadline: '2026-12-07T23:59:00.000Z',
        capacity: 60,
        registeredCount: 1,
        attendedCount: 0,
        status: 'published',
        bannerUrl: '/src/assets/images/club_design_emblem_1795447591826.jpg',
        isPaid: false,
        feeAmount: 0,
        createdAt: '2026-11-01T09:00:00.000Z',
        updatedAt: '2026-11-01T09:00:00.000Z',
      },
      {
        id: 'evt-portfolio-night',
        clubId: 'club-design',
        clubName: 'Atelier Design Guild',
        title: 'Winter Design Critique & Review Night',
        category: 'Networking',
        description:
          'Bring two case studies for structured 15-minute peer and alumni design director feedback sessions.',
        venue: 'Architecture Gallery Hall',
        startTime: '2026-12-14T18:00:00.000Z',
        endTime: '2026-12-14T20:30:00.000Z',
        registrationDeadline: '2026-12-13T23:59:00.000Z',
        capacity: 50,
        registeredCount: 0,
        attendedCount: 0,
        status: 'published',
        bannerUrl: '/src/assets/images/club_design_emblem_1795447591826.jpg',
        isPaid: false,
        feeAmount: 0,
        createdAt: '2026-11-04T09:00:00.000Z',
        updatedAt: '2026-11-04T09:00:00.000Z',
      },
      {
        id: 'evt-acoustic-eve',
        clubId: 'club-music',
        clubName: 'Resonance Acoustic Society',
        title: 'Winter Quad Unplugged Showcase',
        category: 'Cultural',
        description:
          'An evening of original student acoustic compositions, chamber ensembles, and live multi-track studio recording at the central courtyard.',
        venue: 'University Student Union Amphitheater',
        startTime: '2026-12-11T18:30:00.000Z',
        endTime: '2026-12-11T21:00:00.000Z',
        registrationDeadline: '2026-12-11T12:00:00.000Z',
        capacity: 220,
        registeredCount: 1,
        attendedCount: 0,
        status: 'published',
        bannerUrl: '/src/assets/images/club_music_emblem_1795447592008.jpg',
        isPaid: false,
        feeAmount: 0,
        createdAt: '2026-11-02T11:00:00.000Z',
        updatedAt: '2026-11-02T11:00:00.000Z',
      },
      {
        id: 'evt-quantum-ctf',
        clubId: 'club-quantum',
        clubName: 'Quantum Computing Circle',
        title: 'Campus Systems Security & CTF Sprint',
        category: 'Competition',
        description:
          'Capture-the-flag challenge covering web security, cryptography, and cloud IAM misconfigurations.',
        venue: 'Turing Auditorium 301',
        startTime: '2026-12-09T10:00:00.000Z',
        endTime: '2026-12-09T17:00:00.000Z',
        registrationDeadline: '2026-12-08T20:00:00.000Z',
        capacity: 100,
        registeredCount: 0,
        attendedCount: 0,
        status: 'published',
        bannerUrl: '/src/assets/images/event_hackathon_banner_1795447592033.jpg',
        isPaid: true,
        feeAmount: 100,
        createdAt: '2026-11-05T10:00:00.000Z',
        updatedAt: '2026-11-05T10:00:00.000Z',
      },
      {
        id: 'evt-debate-open',
        clubId: 'club-debate',
        clubName: 'Civic Debate Forum',
        title: 'AI Governance & Civic Policy Open',
        category: 'Seminar',
        description:
          'Inter-collegiate parliamentary rounds and faculty panel examining algorithmic transparency in public institutions.',
        venue: 'Humanities Seminar 202',
        startTime: '2026-12-16T16:00:00.000Z',
        endTime: '2026-12-16T19:00:00.000Z',
        registrationDeadline: '2026-12-15T23:59:00.000Z',
        capacity: 80,
        registeredCount: 0,
        attendedCount: 0,
        status: 'published',
        bannerUrl: '/src/assets/images/hero_campus_quad_1795447592217.jpg',
        isPaid: false,
        feeAmount: 0,
        createdAt: '2026-11-08T10:00:00.000Z',
        updatedAt: '2026-11-08T10:00:00.000Z',
      },
    ];

    const defaultFields = (extra?: FormField[]): FormField[] => [
      {
        id: 'fld-track',
        label: 'Preferred Track or Role',
        type: 'select',
        required: true,
        options: ['Participant', 'Team Lead', 'Observer'],
      },
      {
        id: 'fld-experience',
        label: 'Relevant Experience Level',
        type: 'select',
        required: true,
        options: ['Beginner', 'Intermediate', 'Advanced'],
      },
      ...(extra || []),
      {
        id: 'fld-code-conduct',
        label: 'I agree to follow the CampusVerse Event Code of Conduct',
        type: 'checkbox',
        required: true,
      },
    ];

    for (const ev of this.events) {
      this.forms.set(ev.id, {
        id: `frm-${ev.id}`,
        eventId: ev.id,
        version: 1,
        fields:
          ev.id === 'evt-rover-sprint'
            ? defaultFields([
                {
                  id: 'fld-team-name',
                  label: 'Team Name (or Solo)',
                  type: 'text',
                  required: true,
                  placeholder: 'e.g. MechaSpark',
                },
                {
                  id: 'fld-hardware-notes',
                  label: 'Special Lab Equipment Needed',
                  type: 'textarea',
                  required: false,
                  placeholder: 'Soldering station, oscilloscope, etc.',
                },
              ])
            : defaultFields(),
        updatedAt: ev.updatedAt,
      });
    }

    this.registrations = [
      {
        id: 'reg-101',
        eventId: 'evt-rover-sprint',
        eventTitle: 'Autonomous Rover Buildathon 2026',
        eventStartTime: '2026-12-05T09:00:00.000Z',
        eventVenue: 'Innovation Hangar B2 & Main Atrium',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        studentId: 'usr-student-1',
        studentName: 'Aarav Mehta',
        studentEmail: 'aarav.mehta@campusverse.edu',
        answers: {
          'fld-track': 'Participant',
          'fld-experience': 'Intermediate',
          'fld-team-name': 'Vector Dynamics',
          'fld-code-conduct': true,
        },
        status: 'confirmed',
        qrToken: 'CV-QR-8F92A1C4',
        qrUsedAt: null,
        createdAt: '2026-11-12T09:30:00.000Z',
      },
      {
        id: 'reg-102',
        eventId: 'evt-rover-sprint',
        eventTitle: 'Autonomous Rover Buildathon 2026',
        eventStartTime: '2026-12-05T09:00:00.000Z',
        eventVenue: 'Innovation Hangar B2 & Main Atrium',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        studentId: 'usr-student-2',
        studentName: 'Kabir Rao',
        studentEmail: 'kabir.rao@campusverse.edu',
        answers: {
          'fld-track': 'Team Lead',
          'fld-experience': 'Advanced',
          'fld-team-name': 'TorqueForge',
          'fld-code-conduct': true,
        },
        status: 'confirmed',
        qrToken: 'CV-QR-3B71D9E0',
        qrUsedAt: null,
        createdAt: '2026-11-13T11:15:00.000Z',
      },
      {
        id: 'reg-103',
        eventId: 'evt-pcb-workshop',
        eventTitle: 'KiCad 4-Layer PCB Fabrication Lab',
        eventStartTime: '2026-12-12T14:00:00.000Z',
        eventVenue: 'Electronics Lab 204',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        studentId: 'usr-student-1',
        studentName: 'Aarav Mehta',
        studentEmail: 'aarav.mehta@campusverse.edu',
        answers: {
          'fld-track': 'Participant',
          'fld-experience': 'Beginner',
          'fld-code-conduct': true,
        },
        status: 'attended',
        qrToken: 'CV-QR-6C44E2B8',
        qrUsedAt: '2026-10-28T14:05:00.000Z',
        createdAt: '2026-10-20T10:00:00.000Z',
      },
      {
        id: 'reg-104',
        eventId: 'evt-design-systems',
        eventTitle: 'Editorial Grid & Design Token Workshop',
        eventStartTime: '2026-12-08T16:00:00.000Z',
        eventVenue: 'Studio Annex 104',
        clubId: 'club-design',
        clubName: 'Atelier Design Guild',
        studentId: 'usr-student-2',
        studentName: 'Kabir Rao',
        studentEmail: 'kabir.rao@campusverse.edu',
        answers: {
          'fld-track': 'Participant',
          'fld-experience': 'Intermediate',
          'fld-code-conduct': true,
        },
        status: 'confirmed',
        qrToken: 'CV-QR-91AA77D2',
        qrUsedAt: null,
        createdAt: '2026-11-14T15:40:00.000Z',
      },
      {
        id: 'reg-105',
        eventId: 'evt-acoustic-eve',
        eventTitle: 'Winter Quad Unplugged Showcase',
        eventStartTime: '2026-12-11T18:30:00.000Z',
        eventVenue: 'University Student Union Amphitheater',
        clubId: 'club-music',
        clubName: 'Resonance Acoustic Society',
        studentId: 'usr-student-1',
        studentName: 'Aarav Mehta',
        studentEmail: 'aarav.mehta@campusverse.edu',
        answers: {
          'fld-track': 'Observer',
          'fld-experience': 'Beginner',
          'fld-code-conduct': true,
        },
        status: 'confirmed',
        qrToken: 'CV-QR-55F0C8A1',
        qrUsedAt: null,
        createdAt: '2026-11-15T16:10:00.000Z',
      },
    ];

    this.attendance = [
      {
        id: 'att-1',
        eventId: 'evt-pcb-workshop',
        registrationId: 'reg-103',
        studentId: 'usr-student-1',
        studentName: 'Aarav Mehta',
        studentCode: 'STU-2024-0412',
        qrToken: 'CV-QR-6C44E2B8',
        method: 'qr_scan',
        checkedInBy: 'Rohan Verma',
        checkedInAt: '2026-10-28T14:05:00.000Z',
      },
    ];

    this.eventReports = [
      {
        id: 'rep-evt-1',
        eventId: 'evt-pcb-workshop',
        eventTitle: 'KiCad 4-Layer PCB Fabrication Lab',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        submittedBy: 'usr-club-admin-1',
        submittedByName: 'Priya Nair',
        outcomeSummary:
          'Completed full 4-layer schematic to Gerber fabrication walkthrough with student hardware teams; 12 boards exported cleanly for panelization.',
        highlights: 'Zero DRC errors across final student boards; strong cross-year mentorship.',
        challenges: 'Projector adapter needed quick swap before session start.',
        actualAttendance: 38,
        registeredTotal: 42,
        completionStatus: 'completed',
        submittedAt: '2026-10-29T11:20:00.000Z',
      },
    ];

    this.financialReports = [
      {
        id: 'fin-rep-1',
        eventId: 'evt-pcb-workshop',
        eventTitle: 'KiCad 4-Layer PCB Fabrication Lab',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        submittedBy: 'usr-club-admin-1',
        submittedByName: 'Priya Nair',
        totalCollections: 12000,
        totalExpenses: 9450,
        netBalance: 2550,
        lineItems: [
          {
            id: 'li-1',
            type: 'collection',
            label: 'Department Hardware Grant',
            category: 'Institutional Grant',
            amount: 12000,
            notes: 'Approved Fall Lab Allocation',
          },
          {
            id: 'li-2',
            type: 'expense',
            label: 'FR4 Prototype PCB Batch Order',
            category: 'Materials',
            amount: 6800,
            notes: 'Invoice #PCB-904',
          },
          {
            id: 'li-3',
            type: 'expense',
            label: 'SMD Stencils & Solder Paste',
            category: 'Consumables',
            amount: 2650,
          },
        ],
        notes: 'Surplus retained in Apex Robotics Lab spring rover fund.',
        submittedAt: '2026-10-30T15:45:00.000Z',
      },
    ];

    this.notifications = [
      {
        id: 'not-1',
        userId: 'usr-student-1',
        title: 'Registration Confirmed: Autonomous Rover Buildathon 2026',
        message: 'Your QR entry pass CV-QR-8F92A1C4 is ready in My Registrations.',
        category: 'registration',
        read: false,
        link: '/app/student/registrations',
        createdAt: '2026-11-12T09:31:00.000Z',
      },
      {
        id: 'not-2',
        userId: 'usr-student-1',
        title: 'New Event from Apex Robotics Lab',
        message: 'KiCad 4-Layer PCB Fabrication Lab report summary has been posted.',
        category: 'club',
        read: true,
        link: '/app/student/events',
        createdAt: '2026-11-01T08:00:00.000Z',
      },
      {
        id: 'not-3',
        userId: 'usr-club-admin-1',
        title: '2 Confirmed Registrations for Rover Buildathon',
        message: 'Check participant directory and finalize gate scanner assignments.',
        category: 'event',
        read: false,
        link: '/app/club-admin/registrations',
        createdAt: '2026-11-13T11:20:00.000Z',
      },
      {
        id: 'not-4',
        userId: 'usr-super-admin',
        title: 'Club Pending Review: Trailblazers Athletics',
        message: 'New club charter application awaiting Student Affairs verification.',
        category: 'admin',
        read: false,
        link: '/app/admin/clubs',
        createdAt: '2026-11-14T10:00:00.000Z',
      },
    ];

    this.auditLogs = [
      {
        id: 'aud-1',
        actorId: 'usr-super-admin',
        actorName: 'Dr. Elena Vance',
        actorContext: 'Super Admin',
        action: 'APPROVED_CLUB_CHARTER',
        targetType: 'club',
        targetId: 'club-venture',
        targetLabel: 'Venture Foundry',
        details: 'Verified faculty advisor sign-off and activated club status.',
        createdAt: '2026-10-18T11:00:00.000Z',
      },
      {
        id: 'aud-2',
        actorId: 'usr-club-admin-1',
        actorName: 'Priya Nair',
        actorContext: 'Club Admin · Apex Robotics Lab',
        action: 'SUBMITTED_FINANCIAL_REPORT',
        targetType: 'report',
        targetId: 'fin-rep-1',
        targetLabel: 'KiCad 4-Layer PCB Fabrication Lab',
        details: 'Logged INR 12,000 collections and INR 9,450 expenses.',
        createdAt: '2026-10-30T15:45:00.000Z',
      },
      {
        id: 'aud-3',
        actorId: 'usr-club-admin-1',
        actorName: 'Priya Nair',
        actorContext: 'Club Admin · Apex Robotics Lab',
        action: 'PUBLISHED_EVENT',
        targetType: 'event',
        targetId: 'evt-rover-sprint',
        targetLabel: 'Autonomous Rover Buildathon 2026',
        details: 'Published event registration with 120 participant capacity.',
        createdAt: '2026-10-20T14:00:00.000Z',
      },
    ];
  }

  getPersistenceMode(): 'in_memory_demo' | 'postgres' {
    return 'in_memory_demo';
  }

  async checkReadiness(): Promise<{
    ready: boolean;
    latencyMs: number;
    persistence: string;
    error?: string;
  }> {
    return {
      ready: true,
      latencyMs: 0,
      persistence: 'in-memory-demo-adapter',
    };
  }

  async getUserById(userId: string): Promise<UserAccount | null> {
    return this.users.find((u) => u.id === userId) || null;
  }

  async getUserByEmail(email: string): Promise<UserAccount | null> {
    const normalized = email.trim().toLowerCase();
    return this.users.find((u) => u.email.toLowerCase() === normalized) || null;
  }

  async provisionAuthenticatedUser(input: {
    authUserId: string;
    email: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
    emailVerified: boolean;
    isBootstrapSuperAdmin: boolean;
  }): Promise<UserAccount> {
    const existing = await this.getUserByEmail(input.email);
    if (existing) {
      if (input.isBootstrapSuperAdmin) {
        existing.isSuperAdmin = true;
      }
      if (input.emailVerified) {
        existing.emailVerified = true;
      }
      return {...existing};
    }

    const displayName = input.name?.trim() || input.email.split('@')[0];
    const initials = displayName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const user: UserAccount = {
      id: input.authUserId,
      name: displayName,
      email: input.email.toLowerCase(),
      department: input.department || 'General Engineering',
      yearOfStudy: input.yearOfStudy || 'Undergraduate',
      studentId: `STU-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`,
      isSuperAdmin: input.isBootstrapSuperAdmin,
      status: 'active',
      emailVerified: input.emailVerified,
      avatarInitials: initials || 'CV',
      createdAt: new Date().toISOString(),
    };
    this.users.push(user);
    return {...user};
  }

  async recordAuthSession(): Promise<void> {
    // No-op in in-memory sandbox
  }

  async listUsers(): Promise<UserAccount[]> {
    return [...this.users];
  }

  async updateUserProfile(
    userId: string,
    updates: Partial<Pick<UserAccount, 'name' | 'department' | 'yearOfStudy'>>,
  ): Promise<UserAccount | null> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return null;
    if (updates.name) {
      user.name = updates.name;
      user.avatarInitials = updates.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    }
    if (updates.department) user.department = updates.department;
    if (updates.yearOfStudy) user.yearOfStudy = updates.yearOfStudy;
    return {...user};
  }

  async updateUserStatus(
    userId: string,
    status: 'active' | 'suspended',
  ): Promise<UserAccount | null> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return null;
    user.status = status;
    return {...user};
  }

  async createDemoUser(input: {
    name: string;
    email: string;
    department: string;
    yearOfStudy: string;
  }): Promise<UserAccount> {
    const existing = await this.getUserByEmail(input.email);
    if (existing) {
      throw new ConflictError('An account with this institutional email already exists');
    }
    const initials = input.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const user: UserAccount = {
      id: `usr-${Date.now()}`,
      name: input.name,
      email: input.email.toLowerCase(),
      department: input.department,
      yearOfStudy: input.yearOfStudy,
      studentId: `STU-2026-${Math.floor(1000 + Math.random() * 8999)}`,
      isSuperAdmin: false,
      status: 'active',
      emailVerified: false,
      avatarInitials: initials || 'ST',
      createdAt: new Date().toISOString(),
    };
    this.users.push(user);
    return {...user};
  }

  async listClubs(filters?: {
    search?: string;
    category?: string;
    includeAllStatuses?: boolean;
  }): Promise<Club[]> {
    return this.clubs
      .filter((club) => {
        if (!filters?.includeAllStatuses && club.status !== 'active') return false;
        if (filters?.category && filters.category !== 'All' && club.category !== filters.category) {
          return false;
        }
        if (filters?.search) {
          const q = filters.search.toLowerCase();
          return (
            club.name.toLowerCase().includes(q) ||
            club.tagline.toLowerCase().includes(q) ||
            club.category.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .map((c) => ({
        ...c,
        upcomingEventsCount: this.events.filter(
          (e) => e.clubId === c.id && e.status === 'published',
        ).length,
      }));
  }

  async getClubDetail(clubId: string, viewerUserId?: string): Promise<ClubDetail | null> {
    const club = this.clubs.find((c) => c.id === clubId || c.slug === clubId);
    if (!club) return null;
    const team = await this.getClubMemberships(club.id);
    const upcomingEvents = this.events.filter(
      (e) => e.clubId === club.id && e.status === 'published',
    );
    const isFollowing = viewerUserId
      ? this.follows.some((f) => f.userId === viewerUserId && f.clubId === club.id)
      : false;
    return {
      ...club,
      upcomingEventsCount: upcomingEvents.length,
      team,
      upcomingEvents,
      isFollowing,
    };
  }

  async createClub(input: {
    name: string;
    category: Club['category'];
    tagline: string;
    description: string;
    meetingSchedule: string;
    contactEmail: string;
  }): Promise<Club> {
    const slug = slugify(input.name);
    if (this.clubs.some((c) => c.slug === slug)) {
      throw new ConflictError('A club with a similar name already exists');
    }
    const club: Club = {
      id: `club-${Date.now()}`,
      name: input.name,
      slug,
      category: input.category,
      tagline: input.tagline,
      description: input.description,
      logoUrl: '',
      status: this.settings.requireClubApproval ? 'pending_review' : 'active',
      followerCount: 0,
      memberCount: 1,
      upcomingEventsCount: 0,
      foundedYear: new Date().getFullYear(),
      meetingSchedule: input.meetingSchedule,
      contactEmail: input.contactEmail,
      createdAt: new Date().toISOString(),
    };
    this.clubs.push(club);
    return {...club};
  }

  async updateClub(clubId: string, updates: Partial<Club>): Promise<Club | null> {
    const club = this.clubs.find((c) => c.id === clubId);
    if (!club) return null;
    Object.assign(club, updates);
    return {...club};
  }

  async updateClubStatus(clubId: string, status: ClubStatus): Promise<Club | null> {
    const club = this.clubs.find((c) => c.id === clubId);
    if (!club) return null;
    club.status = status;
    return {...club};
  }

  async getMembershipsForUser(userId: string): Promise<ClubMembership[]> {
    return this.memberships
      .filter((m) => m.userId === userId)
      .map((m) => {
        const club = this.clubs.find((c) => c.id === m.clubId);
        return {
          ...m,
          clubName: club?.name || m.clubName,
        };
      });
  }

  async getClubMemberships(clubId: string): Promise<ClubMembership[]> {
    return this.memberships
      .filter((m) => m.clubId === clubId)
      .map((m) => {
        const user = this.users.find((u) => u.id === m.userId);
        return {
          ...m,
          userName: user?.name || m.userName,
          userEmail: user?.email || m.userEmail,
        };
      });
  }

  async upsertClubMembership(input: {
    clubId: string;
    userId: string;
    role: ClubMembership['role'];
    title: string;
    permissions: CoreMemberPermission[];
  }): Promise<ClubMembership> {
    const club = this.clubs.find((c) => c.id === input.clubId);
    const user = this.users.find((u) => u.id === input.userId);
    if (!club) throw new NotFoundError('Club not found');
    if (!user) throw new NotFoundError('User not found');

    const effectivePermissions: CoreMemberPermission[] =
      input.role === 'club_admin'
        ? [
            'MANAGE_EVENTS',
            'MANAGE_FORMS',
            'VIEW_REGISTRATIONS',
            'SCAN_ATTENDANCE',
            'SUBMIT_EVENT_REPORTS',
            'SUBMIT_FINANCE_REPORTS',
          ]
        : [...input.permissions];

    const existing = this.memberships.find(
      (m) => m.clubId === input.clubId && m.userId === input.userId,
    );
    if (existing) {
      existing.role = input.role;
      existing.title = input.title;
      existing.permissions = effectivePermissions;
      return {...existing, userName: user.name, userEmail: user.email, clubName: club.name};
    }

    const membership: ClubMembership = {
      id: `mem-${Date.now()}`,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      clubId: club.id,
      clubName: club.name,
      role: input.role,
      title: input.title,
      permissions: effectivePermissions,
      joinedAt: new Date().toISOString(),
    };
    this.memberships.push(membership);
    club.memberCount += 1;
    return {...membership};
  }

  async updateMembershipPermissions(
    clubId: string,
    membershipId: string,
    updates: {
      role?: ClubMembership['role'];
      title?: string;
      permissions: CoreMemberPermission[];
    },
  ): Promise<ClubMembership | null> {
    const membership = this.memberships.find(
      (m) => m.id === membershipId && m.clubId === clubId,
    );
    if (!membership) return null;
    if (updates.role) membership.role = updates.role;
    if (updates.title) membership.title = updates.title;
    membership.permissions =
      membership.role === 'club_admin'
        ? [
            'MANAGE_EVENTS',
            'MANAGE_FORMS',
            'VIEW_REGISTRATIONS',
            'SCAN_ATTENDANCE',
            'SUBMIT_EVENT_REPORTS',
            'SUBMIT_FINANCE_REPORTS',
          ]
        : [...updates.permissions];
    return {...membership};
  }

  async removeClubMembership(clubId: string, membershipId: string): Promise<boolean> {
    const idx = this.memberships.findIndex((m) => m.id === membershipId && m.clubId === clubId);
    if (idx === -1) return false;
    this.memberships.splice(idx, 1);
    const club = this.clubs.find((c) => c.id === clubId);
    if (club && club.memberCount > 0) club.memberCount -= 1;
    return true;
  }

  async getFollowsForUser(userId: string): Promise<ClubFollow[]> {
    return this.follows.filter((f) => f.userId === userId);
  }

  async followClub(userId: string, clubId: string): Promise<ClubFollow> {
    const club = this.clubs.find((c) => c.id === clubId && c.status === 'active');
    if (!club) throw new NotFoundError('Active club not found');

    const already = this.follows.find((f) => f.userId === userId && f.clubId === clubId);
    if (already) {
      throw new ConflictError('You are already following this club');
    }

    const userFollows = this.follows.filter((f) => f.userId === userId);
    if (userFollows.length >= MAX_FOLLOWED_CLUBS) {
      throw new BusinessRuleError(
        'MAX_CLUB_FOLLOW_LIMIT_REACHED',
        `Students can follow a maximum of ${MAX_FOLLOWED_CLUBS} clubs. Unfollow an existing club before following ${club.name}.`,
        {limit: MAX_FOLLOWED_CLUBS, currentCount: userFollows.length},
      );
    }

    const follow: ClubFollow = {
      id: `fol-${Date.now()}`,
      userId,
      clubId,
      followedAt: new Date().toISOString(),
    };
    this.follows.push(follow);
    club.followerCount += 1;
    return {...follow};
  }

  async unfollowClub(userId: string, clubId: string): Promise<boolean> {
    const idx = this.follows.findIndex((f) => f.userId === userId && f.clubId === clubId);
    if (idx === -1) return false;
    this.follows.splice(idx, 1);
    const club = this.clubs.find((c) => c.id === clubId);
    if (club && club.followerCount > 0) club.followerCount -= 1;
    return true;
  }

  async getHallOfFame(): Promise<HallOfFameEntry[]> {
    const activeClubs = this.clubs
      .filter((c) => c.status === 'active')
      .sort((a, b) => {
        if (b.followerCount !== a.followerCount) {
          return b.followerCount - a.followerCount;
        }
        return a.name.localeCompare(b.name);
      });

    // Standard competition ranking (1224): equal followerCount gets same rank
    let currentRank = 1;
    return activeClubs.map((club, index) => {
      if (index > 0 && club.followerCount < activeClubs[index - 1].followerCount) {
        currentRank = index + 1;
      }
      const tieCount = activeClubs.filter(
        (other) => other.followerCount === club.followerCount,
      ).length;
      const eventsHosted = this.events.filter(
        (e) => e.clubId === club.id && (e.status === 'published' || e.status === 'completed'),
      ).length;
      return {
        rank: currentRank,
        club: {...club},
        followerCount: club.followerCount,
        eventsHosted,
        tieCount,
      };
    });
  }

  async listEvents(filters?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
  }): Promise<EventItem[]> {
    return this.events
      .filter((ev) => {
        if (filters?.clubId && ev.clubId !== filters.clubId) return false;
        if (filters?.category && filters.category !== 'All' && ev.category !== filters.category) {
          return false;
        }
        if (filters?.status && filters.status !== 'All' && ev.status !== filters.status) {
          return false;
        }
        if (filters?.upcomingOnly && ev.status !== 'published') return false;
        if (filters?.search) {
          const q = filters.search.toLowerCase();
          return (
            ev.title.toLowerCase().includes(q) ||
            ev.clubName.toLowerCase().includes(q) ||
            ev.venue.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((e) => ({...e}));
  }

  async getEventById(eventId: string): Promise<EventItem | null> {
    const ev = this.events.find((e) => e.id === eventId);
    return ev ? {...ev} : null;
  }

  async createEvent(
    clubId: string,
    input: Omit<
      EventItem,
      | 'id'
      | 'clubId'
      | 'clubName'
      | 'registeredCount'
      | 'attendedCount'
      | 'status'
      | 'bannerUrl'
      | 'createdAt'
      | 'updatedAt'
    >,
  ): Promise<EventItem> {
    const club = this.clubs.find((c) => c.id === clubId);
    if (!club) throw new NotFoundError('Club not found');
    const now = new Date().toISOString();
    const ev: EventItem = {
      id: `evt-${Date.now()}`,
      clubId: club.id,
      clubName: club.name,
      ...input,
      registeredCount: 0,
      attendedCount: 0,
      status: 'draft',
      bannerUrl: club.logoUrl || '/src/assets/images/event_hackathon_banner_1795447592033.jpg',
      createdAt: now,
      updatedAt: now,
    };
    this.events.push(ev);
    this.forms.set(ev.id, {
      id: `frm-${ev.id}`,
      eventId: ev.id,
      version: 1,
      fields: [
        {
          id: 'fld-track',
          label: 'Participation Role',
          type: 'select',
          required: true,
          options: ['Participant', 'Observer'],
        },
        {
          id: 'fld-code-conduct',
          label: 'I agree to follow the CampusVerse Event Code of Conduct',
          type: 'checkbox',
          required: true,
        },
      ],
      updatedAt: now,
    });
    return {...ev};
  }

  async updateEvent(eventId: string, updates: Partial<EventItem>): Promise<EventItem | null> {
    const ev = this.events.find((e) => e.id === eventId);
    if (!ev) return null;
    Object.assign(ev, updates, {updatedAt: new Date().toISOString()});
    return {...ev};
  }

  async publishEvent(eventId: string): Promise<EventItem | null> {
    const ev = this.events.find((e) => e.id === eventId);
    if (!ev) return null;
    ev.status = 'published';
    ev.updatedAt = new Date().toISOString();
    return {...ev};
  }

  async getRegistrationForm(eventId: string): Promise<RegistrationForm> {
    const existing = this.forms.get(eventId);
    if (existing) return {...existing, fields: [...existing.fields]};
    const fallback: RegistrationForm = {
      id: `frm-${eventId}`,
      eventId,
      version: 1,
      fields: [
        {
          id: 'fld-notes',
          label: 'Registration Notes',
          type: 'text',
          required: false,
          placeholder: 'Any dietary or accessibility needs',
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    this.forms.set(eventId, fallback);
    return fallback;
  }

  async upsertRegistrationForm(eventId: string, fields: FormField[]): Promise<RegistrationForm> {
    const ev = this.events.find((e) => e.id === eventId);
    if (!ev) throw new NotFoundError('Event not found');
    const current = this.forms.get(eventId);
    const updated: RegistrationForm = {
      id: current?.id || `frm-${eventId}`,
      eventId,
      version: (current?.version || 0) + 1,
      fields: [...fields],
      updatedAt: new Date().toISOString(),
    };
    this.forms.set(eventId, updated);
    return {...updated};
  }

  async createRegistration(input: {
    eventId: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    answers: Record<string, string | boolean | number>;
    qrToken: string;
  }): Promise<Registration> {
    const ev = this.events.find((e) => e.id === input.eventId);
    if (!ev) throw new NotFoundError('Event not found');
    if (ev.status !== 'published') {
      throw new BusinessRuleError('EVENT_NOT_OPEN', 'Registrations are only allowed for published events');
    }
    const existing = this.registrations.find(
      (r) => r.eventId === input.eventId && r.studentId === input.studentId && r.status !== 'cancelled',
    );
    if (existing) {
      throw new ConflictError('You are already registered for this event');
    }

    const status = ev.registeredCount >= ev.capacity ? 'waitlisted' : 'confirmed';
    const reg: Registration = {
      id: `reg-${Date.now()}`,
      eventId: ev.id,
      eventTitle: ev.title,
      eventStartTime: ev.startTime,
      eventVenue: ev.venue,
      clubId: ev.clubId,
      clubName: ev.clubName,
      studentId: input.studentId,
      studentName: input.studentName,
      studentEmail: input.studentEmail,
      answers: input.answers,
      status,
      qrToken: input.qrToken,
      qrUsedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.registrations.push(reg);
    ev.registeredCount += 1;
    return {...reg};
  }

  async listRegistrationsForEvent(eventId: string): Promise<Registration[]> {
    return this.registrations.filter((r) => r.eventId === eventId).map((r) => ({...r}));
  }

  async listRegistrationsForStudent(studentId: string): Promise<Registration[]> {
    return this.registrations
      .filter((r) => r.studentId === studentId)
      .map((r) => {
        const ev = this.events.find((e) => e.id === r.eventId);
        return {
          ...r,
          eventTitle: ev?.title || r.eventTitle,
          eventStartTime: ev?.startTime || r.eventStartTime,
          eventVenue: ev?.venue || r.eventVenue,
          clubId: ev?.clubId || r.clubId,
          clubName: ev?.clubName || r.clubName,
        };
      });
  }

  async getRegistrationById(registrationId: string): Promise<Registration | null> {
    const reg = this.registrations.find((r) => r.id === registrationId);
    return reg ? {...reg} : null;
  }

  async getRegistrationByQrToken(eventId: string, qrToken: string): Promise<Registration | null> {
    const normalized = qrToken.trim().toUpperCase();
    const reg = this.registrations.find(
      (r) => r.eventId === eventId && r.qrToken.toUpperCase() === normalized,
    );
    return reg ? {...reg} : null;
  }

  async recordAttendance(input: {
    eventId: string;
    registrationId: string;
    studentId: string;
    studentName: string;
    studentCode: string;
    qrToken: string;
    method: 'qr_scan' | 'manual_override';
    checkedInBy: string;
  }): Promise<AttendanceRecord> {
    const existing = this.attendance.find((a) => a.registrationId === input.registrationId);
    if (existing) {
      throw new ConflictError(
        `Duplicate scan prevented: ${input.studentName} was already checked in at ${existing.checkedInAt}`,
      );
    }

    const now = new Date().toISOString();
    const reg = this.registrations.find((r) => r.id === input.registrationId);
    if (reg) {
      reg.status = 'attended';
      reg.qrUsedAt = now;
    }

    const ev = this.events.find((e) => e.id === input.eventId);
    if (ev) {
      ev.attendedCount += 1;
    }

    const record: AttendanceRecord = {
      id: `att-${Date.now()}`,
      eventId: input.eventId,
      registrationId: input.registrationId,
      studentId: input.studentId,
      studentName: input.studentName,
      studentCode: input.studentCode,
      qrToken: input.qrToken,
      method: input.method,
      checkedInBy: input.checkedInBy,
      checkedInAt: now,
    };
    this.attendance.push(record);
    return {...record};
  }

  async listAttendanceForEvent(eventId: string): Promise<AttendanceRecord[]> {
    return this.attendance.filter((a) => a.eventId === eventId).map((a) => ({...a}));
  }

  async upsertEventReport(
    report: Omit<EventReport, 'id' | 'submittedAt'>,
  ): Promise<EventReport> {
    const now = new Date().toISOString();
    const existing = this.eventReports.find((r) => r.eventId === report.eventId);
    if (existing) {
      Object.assign(existing, report, {submittedAt: now});
      return {...existing};
    }
    const created: EventReport = {
      id: `rep-evt-${Date.now()}`,
      ...report,
      submittedAt: now,
    };
    this.eventReports.push(created);
    return {...created};
  }

  async getEventReport(eventId: string): Promise<EventReport | null> {
    const r = this.eventReports.find((rep) => rep.eventId === eventId);
    return r ? {...r} : null;
  }

  async listAllEventReports(): Promise<EventReport[]> {
    return [...this.eventReports];
  }

  async upsertFinancialReport(
    report: Omit<FinancialReport, 'id' | 'submittedAt'>,
  ): Promise<FinancialReport> {
    const now = new Date().toISOString();
    const existing = this.financialReports.find((r) => r.eventId === report.eventId);
    if (existing) {
      Object.assign(existing, report, {submittedAt: now});
      return {...existing};
    }
    const created: FinancialReport = {
      id: `fin-rep-${Date.now()}`,
      ...report,
      submittedAt: now,
    };
    this.financialReports.push(created);
    return {...created};
  }

  async getFinancialReport(eventId: string): Promise<FinancialReport | null> {
    const r = this.financialReports.find((rep) => rep.eventId === eventId);
    return r ? {...r} : null;
  }

  async listAllFinancialReports(): Promise<FinancialReport[]> {
    return [...this.financialReports];
  }

  async listNotificationsForUser(userId: string): Promise<NotificationItem[]> {
    return this.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => ({...n}));
  }

  async markNotificationRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationItem | null> {
    const n = this.notifications.find((item) => item.id === notificationId && item.userId === userId);
    if (!n) return null;
    n.read = true;
    return {...n};
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    this.notifications.forEach((n) => {
      if (n.userId === userId) n.read = true;
    });
  }

  async createNotification(
    input: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>,
  ): Promise<NotificationItem> {
    const item: NotificationItem = {
      id: `not-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...input,
      read: false,
      createdAt: new Date().toISOString(),
    };
    this.notifications.unshift(item);
    return {...item};
  }

  async getAdminDashboardStats(): Promise<AdminDashboardStats> {
    const totalCollections = this.financialReports.reduce((acc, r) => acc + r.totalCollections, 0);
    const totalExpenses = this.financialReports.reduce((acc, r) => acc + r.totalExpenses, 0);

    return {
      totalStudents: this.users.filter((u) => !u.isSuperAdmin).length,
      totalClubs: this.clubs.length,
      activeClubs: this.clubs.filter((c) => c.status === 'active').length,
      totalEvents: this.events.length,
      upcomingEvents: this.events.filter((e) => e.status === 'published').length,
      totalRegistrations: this.registrations.length,
      totalCollections,
      totalExpenses,
      netBalance: totalCollections - totalExpenses,
      recentAuditLogs: this.auditLogs.slice(0, 8),
    };
  }

  async listAuditLogs(): Promise<AuditLogEntry[]> {
    return [...this.auditLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<AuditLogEntry> {
    const log: AuditLogEntry = {
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...entry,
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.unshift(log);
    return {...log};
  }

  async getSystemSettings(): Promise<SystemSettings> {
    return {...this.settings};
  }

  async updateSystemSettings(updates: Partial<SystemSettings>): Promise<SystemSettings> {
    if (typeof updates.requireClubApproval === 'boolean') {
      this.settings.requireClubApproval = updates.requireClubApproval;
    }
    if (typeof updates.allowStudentEventFeedback === 'boolean') {
      this.settings.allowStudentEventFeedback = updates.allowStudentEventFeedback;
    }
    return {...this.settings};
  }
}

export const demoDataAdapter = new DemoDataAdapter();
