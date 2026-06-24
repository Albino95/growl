import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout, AuthLoadingShell } from '../components/Layout';
import { useAdminAuth } from '../auth/AdminAuthProvider';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ModerationQueuePage } from '../pages/ModerationQueuePage';
import { ModerationCasePage } from '../pages/ModerationCasePage';
import { UsersPage } from '../pages/UsersPage';
import { UserDetailPage } from '../pages/UserDetailPage';
import { PrivacyRequestsPage } from '../pages/PrivacyRequestsPage';
import { AuditLogsPage } from '../pages/AuditLogsPage';
import { AppealsPage } from '../pages/AppealsPage';
import { BusinessOrdersPage } from '../pages/BusinessOrdersPage';
import { BusinessAccountsPage } from '../pages/BusinessAccountsPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { MfaSetupPage } from '../pages/MfaSetupPage';

function Protected({ children }: { children: React.ReactNode }) {
  const { loading, admin } = useAdminAuth();
  if (loading) return <AuthLoadingShell />;
  if (!admin) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <Protected>
        <Layout />
      </Protected>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'moderation', element: <ModerationQueuePage /> },
      { path: 'moderation/:reportId', element: <ModerationCasePage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'users/:userId', element: <UserDetailPage /> },
      { path: 'privacy', element: <PrivacyRequestsPage /> },
      { path: 'appeals', element: <AppealsPage /> },
      { path: 'business/accounts', element: <BusinessAccountsPage /> },
      { path: 'business', element: <BusinessOrdersPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'audit', element: <AuditLogsPage /> },
      { path: 'settings/mfa', element: <MfaSetupPage /> },
    ],
  },
]);
