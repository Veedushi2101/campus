import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';
import {AppShell} from './components/layout/AppShell.tsx';
import {RequireAuthRoute, RequireContextRoute} from './components/layout/RouteGuards.tsx';
import {OfflineStatusBanner, PWAUpdateBanner} from './components/pwa/PWABanners.tsx';
import {ErrorBoundary} from './components/ui/ErrorBoundary.tsx';
import {AuthProvider} from './context/AuthContext.tsx';
import {ToastProvider} from './context/ToastContext.tsx';
import {AdminAuditLogsPage} from './pages/admin/AdminAuditLogsPage.tsx';
import {AdminClubsPage} from './pages/admin/AdminClubsPage.tsx';
import {AdminDashboardPage} from './pages/admin/AdminDashboardPage.tsx';
import {AdminEventsPage} from './pages/admin/AdminEventsPage.tsx';
import {AdminFinancePage} from './pages/admin/AdminFinancePage.tsx';
import {AdminReportsPage} from './pages/admin/AdminReportsPage.tsx';
import {AdminSettingsPage} from './pages/admin/AdminSettingsPage.tsx';
import {AdminUsersPage} from './pages/admin/AdminUsersPage.tsx';
import {AttendancePage} from './pages/club/AttendancePage.tsx';
import {ClubAdminDashboardPage} from './pages/club/ClubAdminDashboardPage.tsx';
import {ClubEventsPage} from './pages/club/ClubEventsPage.tsx';
import {ClubProfilePage} from './pages/club/ClubProfilePage.tsx';
import {ClubRegistrationsPage} from './pages/club/ClubRegistrationsPage.tsx';
import {ClubReportsPage} from './pages/club/ClubReportsPage.tsx';
import {ClubSettingsPage} from './pages/club/ClubSettingsPage.tsx';
import {ClubTeamPage} from './pages/club/ClubTeamPage.tsx';
import {FormBuilderPage} from './pages/club/FormBuilderPage.tsx';
import {CoreMemberDashboardPage} from './pages/core/CoreMemberDashboardPage.tsx';
import {CoreMemberProfilePage} from './pages/core/CoreMemberProfilePage.tsx';
import {
  ForgotPasswordPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './pages/public/AuthPages.tsx';
import {LandingPage} from './pages/public/LandingPage.tsx';
import {LoginPage} from './pages/public/LoginPage.tsx';
import {NotFoundPage, UnauthorizedPage} from './pages/public/StatusPages.tsx';
import {ClubDetailsPage} from './pages/student/ClubDetailsPage.tsx';
import {EventDetailsPage} from './pages/student/EventDetailsPage.tsx';
import {EventsPage} from './pages/student/EventsPage.tsx';
import {ExploreClubsPage} from './pages/student/ExploreClubsPage.tsx';
import {HallOfFamePage} from './pages/student/HallOfFamePage.tsx';
import {MyRegistrationsPage} from './pages/student/MyRegistrationsPage.tsx';
import {StudentDashboardPage} from './pages/student/StudentDashboardPage.tsx';
import {StudentSettingsPage} from './pages/student/StudentSettingsPage.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 20,
    },
  },
});

export function AppRoutes() {
  return (
    <Routes>
      {/* Public & Auth */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* Authenticated Workspace */}
      <Route
        path="/app"
        element={
          <RequireAuthRoute>
            <AppShell />
          </RequireAuthRoute>
        }
      >
        <Route index element={<Navigate to="/app/student/dashboard" replace />} />

        {/* Student Experience */}
        <Route
          path="student/dashboard"
          element={
            <RequireContextRoute allowedContexts={['student']}>
              <StudentDashboardPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="student/clubs"
          element={
            <RequireContextRoute allowedContexts={['student']}>
              <ExploreClubsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="student/clubs/:clubId"
          element={
            <RequireContextRoute allowedContexts={['student']}>
              <ClubDetailsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="student/hall-of-fame"
          element={
            <RequireContextRoute allowedContexts={['student']}>
              <HallOfFamePage />
            </RequireContextRoute>
          }
        />
        <Route
          path="student/events"
          element={
            <RequireContextRoute allowedContexts={['student']}>
              <EventsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="student/events/:eventId"
          element={
            <RequireContextRoute allowedContexts={['student']}>
              <EventDetailsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="student/registrations"
          element={
            <RequireContextRoute allowedContexts={['student']}>
              <MyRegistrationsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="student/settings"
          element={
            <RequireContextRoute allowedContexts={['student']}>
              <StudentSettingsPage />
            </RequireContextRoute>
          }
        />

        {/* Club Admin Experience */}
        <Route
          path="club-admin/dashboard"
          element={
            <RequireContextRoute allowedContexts={['club_admin']}>
              <ClubAdminDashboardPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="club-admin/profile"
          element={
            <RequireContextRoute allowedContexts={['club_admin']}>
              <ClubProfilePage />
            </RequireContextRoute>
          }
        />
        <Route
          path="club-admin/team"
          element={
            <RequireContextRoute allowedContexts={['club_admin']}>
              <ClubTeamPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="club-admin/events"
          element={
            <RequireContextRoute allowedContexts={['club_admin']}>
              <ClubEventsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="club-admin/forms"
          element={
            <RequireContextRoute allowedContexts={['club_admin']}>
              <FormBuilderPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="club-admin/registrations"
          element={
            <RequireContextRoute allowedContexts={['club_admin']}>
              <ClubRegistrationsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="club-admin/attendance"
          element={
            <RequireContextRoute allowedContexts={['club_admin']}>
              <AttendancePage />
            </RequireContextRoute>
          }
        />
        <Route
          path="club-admin/reports"
          element={
            <RequireContextRoute allowedContexts={['club_admin']}>
              <ClubReportsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="club-admin/settings"
          element={
            <RequireContextRoute allowedContexts={['club_admin']}>
              <ClubSettingsPage />
            </RequireContextRoute>
          }
        />

        {/* Core Member Experience (Permission-Scoped) */}
        <Route
          path="core/dashboard"
          element={
            <RequireContextRoute allowedContexts={['core_member']}>
              <CoreMemberDashboardPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="core/events"
          element={
            <RequireContextRoute allowedContexts={['core_member']} requiredPermission="MANAGE_EVENTS">
              <ClubEventsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="core/forms"
          element={
            <RequireContextRoute allowedContexts={['core_member']} requiredPermission="MANAGE_FORMS">
              <FormBuilderPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="core/registrations"
          element={
            <RequireContextRoute allowedContexts={['core_member']} requiredPermission="VIEW_REGISTRATIONS">
              <ClubRegistrationsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="core/attendance"
          element={
            <RequireContextRoute allowedContexts={['core_member']} requiredPermission="SCAN_ATTENDANCE">
              <AttendancePage />
            </RequireContextRoute>
          }
        />
        <Route
          path="core/reports"
          element={
            <RequireContextRoute allowedContexts={['core_member']}>
              <ClubReportsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="core/profile"
          element={
            <RequireContextRoute allowedContexts={['core_member']}>
              <CoreMemberProfilePage />
            </RequireContextRoute>
          }
        />

        {/* Super Admin Experience */}
        <Route
          path="admin/dashboard"
          element={
            <RequireContextRoute allowedContexts={['super_admin']}>
              <AdminDashboardPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="admin/clubs"
          element={
            <RequireContextRoute allowedContexts={['super_admin']}>
              <AdminClubsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="admin/users"
          element={
            <RequireContextRoute allowedContexts={['super_admin']}>
              <AdminUsersPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="admin/events"
          element={
            <RequireContextRoute allowedContexts={['super_admin']}>
              <AdminEventsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="admin/reports"
          element={
            <RequireContextRoute allowedContexts={['super_admin']}>
              <AdminReportsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="admin/finance"
          element={
            <RequireContextRoute allowedContexts={['super_admin']}>
              <AdminFinancePage />
            </RequireContextRoute>
          }
        />
        <Route
          path="admin/audit-logs"
          element={
            <RequireContextRoute allowedContexts={['super_admin']}>
              <AdminAuditLogsPage />
            </RequireContextRoute>
          }
        />
        <Route
          path="admin/settings"
          element={
            <RequireContextRoute allowedContexts={['super_admin']}>
              <AdminSettingsPage />
            </RequireContextRoute>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
              <OfflineStatusBanner />
              <PWAUpdateBanner />
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
