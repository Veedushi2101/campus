// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {cleanup, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AuthProvider} from '../../src/context/AuthContext.tsx';
import {ToastProvider} from '../../src/context/ToastContext.tsx';
import {LandingPage} from '../../src/pages/public/LandingPage.tsx';
import {LoginPage} from '../../src/pages/public/LoginPage.tsx';
import {HallOfFamePage} from '../../src/pages/student/HallOfFamePage.tsx';

vi.mock('../../src/adapters/ApiDataAdapter.ts', async () => {
  const actual = await vi.importActual<typeof import('../../src/adapters/ApiDataAdapter.ts')>(
    '../../src/adapters/ApiDataAdapter.ts',
  );
  const mockClient = Object.assign(
    Object.create(Object.getPrototypeOf(actual.apiClient)),
    actual.apiClient,
    {
      setAuthToken: vi.fn(),
      getAuthConfig: vi.fn().mockResolvedValue({
        mode: 'demo',
        persistenceMode: 'in_memory_demo',
        demoModeEnabled: true,
        supabaseUrl: null,
        supabasePublishableKey: null,
        institutionalEmailDomains: ['vitbhopal.ac.in'],
      }),
      listDemoPersonas: vi.fn().mockResolvedValue([
        {
          id: 'usr-student-1',
          name: 'Aarav Mehta',
          email: 'aarav.mehta@campusverse.edu',
          department: 'CS',
          yearOfStudy: 'Year 3',
          studentId: 'STU-1',
          isSuperAdmin: false,
          status: 'active',
          emailVerified: true,
          avatarInitials: 'AM',
          createdAt: '2026-08-01T00:00:00Z',
        },
        {
          id: 'usr-super-admin',
          name: 'Dr. Elena Vance',
          email: 'elena.vance@campusverse.edu',
          department: 'Student Affairs',
          yearOfStudy: 'Dean',
          studentId: 'FAC-1',
          isSuperAdmin: true,
          status: 'active',
          emailVerified: true,
          avatarInitials: 'EV',
          createdAt: '2026-07-01T00:00:00Z',
        },
      ]),
      getHallOfFame: vi.fn().mockResolvedValue([
        {
          rank: 1,
          followerCount: 342,
          eventsHosted: 2,
          tieCount: 1,
          club: {
            id: 'club-robotics',
            name: 'Apex Robotics Lab',
            slug: 'apex-robotics-lab',
            category: 'Robotics & Hardware',
            tagline: 'Autonomous rovers and embedded firmware.',
            description: 'Robotics club',
            logoUrl: '',
            status: 'active',
            followerCount: 342,
            memberCount: 28,
            upcomingEventsCount: 2,
            foundedYear: 2018,
            meetingSchedule: 'Wed',
            contactEmail: 'robotics@campusverse.edu',
            createdAt: '2026-08-01T00:00:00Z',
          },
        },
        {
          rank: 2,
          followerCount: 289,
          eventsHosted: 2,
          tieCount: 2,
          club: {
            id: 'club-design',
            name: 'Atelier Design Guild',
            slug: 'atelier-design-guild',
            category: 'Design',
            tagline: 'Product design critiques and typography.',
            description: 'Design club',
            logoUrl: '',
            status: 'active',
            followerCount: 289,
            memberCount: 22,
            upcomingEventsCount: 2,
            foundedYear: 2020,
            meetingSchedule: 'Thu',
            contactEmail: 'atelier@campusverse.edu',
            createdAt: '2026-08-02T00:00:00Z',
          },
        },
        {
          rank: 2,
          followerCount: 289,
          eventsHosted: 1,
          tieCount: 2,
          club: {
            id: 'club-music',
            name: 'Resonance Acoustic Society',
            slug: 'resonance-acoustic-society',
            category: 'Music & Arts',
            tagline: 'Live acoustic sessions.',
            description: 'Music club',
            logoUrl: '',
            status: 'active',
            followerCount: 289,
            memberCount: 31,
            upcomingEventsCount: 1,
            foundedYear: 2016,
            meetingSchedule: 'Fri',
            contactEmail: 'resonance@campusverse.edu',
            createdAt: '2026-08-03T00:00:00Z',
          },
        },
      ]),
    },
  );
  return {
    ...actual,
    apiClient: mockClient,
  };
});

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('CampusVerse Frontend Components', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders public LandingPage with CampusVerse top bar and primary CTA', () => {
    renderWithProviders(<LandingPage />);
    expect(screen.getByRole('link', {name: 'CampusVerse'})).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /One operational system for every campus club and student event/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', {name: /Open Campus Portal/i})).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('renders LoginPage with isolated Development Auth Adapter when demoModeEnabled is true', async () => {
    renderWithProviders(<LoginPage />);
    expect(await screen.findByText(/Phase 1 Development Auth Adapter/i)).toBeInTheDocument();
    expect(await screen.findByText('Aarav Mehta')).toBeInTheDocument();
    expect(screen.getByText('Dr. Elena Vance')).toBeInTheDocument();
  });

  it('hides demo personas when PostgreSQL & Supabase Auth mode is active', async () => {
    const {apiClient} = await import('../../src/adapters/ApiDataAdapter.ts');
    vi.mocked(apiClient.getAuthConfig).mockResolvedValueOnce({
      mode: 'supabase',
      persistenceMode: 'postgres',
      demoModeEnabled: false,
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_test',
      institutionalEmailDomains: ['vitbhopal.ac.in'],
    });
    renderWithProviders(<LoginPage />);
    expect(await screen.findByText(/Institutional Single Workspace/i)).toBeInTheDocument();
    expect(screen.queryByText(/Phase 1 Development Auth Adapter/i)).not.toBeInTheDocument();
  });

  it('renders HallOfFamePage with top 3 clubs and tie indicators', async () => {
    renderWithProviders(<HallOfFamePage />);
    expect(await screen.findByText('Apex Robotics Lab')).toBeInTheDocument();
    expect(screen.getByText('Atelier Design Guild')).toBeInTheDocument();
    expect(screen.getByText('Resonance Acoustic Society')).toBeInTheDocument();
    expect(screen.getAllByText(/Rank #2 \(Tied\)/)).toHaveLength(2);
  });
});
