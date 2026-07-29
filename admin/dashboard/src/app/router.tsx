import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout, AuthLoadingShell } from '../components/Layout';
import { SellerLayout } from '../components/SellerLayout';
import { RequirePerm } from '../components/RequirePerm';
import { useAdminAuth } from '../auth/AdminAuthProvider';
import { useSellerAuth } from '../auth/SellerAuthProvider';
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
import { BusinessAccountDetailPage } from '../pages/BusinessAccountDetailPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { MfaSetupPage } from '../pages/MfaSetupPage';
import { SellerDashboardPage } from '../pages/seller/SellerDashboardPage';
import { SellerProductsPage } from '../pages/seller/SellerProductsPage';
import { SellerOrdersPage } from '../pages/seller/SellerOrdersPage';
import { SellerReportsPage } from '../pages/seller/SellerReportsPage';
import { SellerSettingsPage } from '../pages/seller/SellerSettingsPage';

function Protected({ children }: { children: React.ReactNode }) {
  const { loading, admin } = useAdminAuth();
  const { loading: sellerLoading, seller } = useSellerAuth();
  if (loading || sellerLoading) return <AuthLoadingShell />;
  if (!admin) {
    if (seller) return <Navigate to="/seller" replace />;
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function SellerProtected({ children }: { children: React.ReactNode }) {
  const { loading, seller } = useSellerAuth();
  const { loading: adminLoading, admin } = useAdminAuth();
  if (loading || adminLoading) return <AuthLoadingShell />;
  if (!seller) {
    if (admin) return <Navigate to="/" replace />;
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/seller',
    element: (
      <SellerProtected>
        <SellerLayout />
      </SellerProtected>
    ),
    children: [
      { index: true, element: <SellerDashboardPage /> },
      { path: 'products', element: <SellerProductsPage /> },
      { path: 'orders', element: <SellerOrdersPage /> },
      { path: 'reports', element: <SellerReportsPage /> },
      { path: 'settings', element: <SellerSettingsPage /> },
    ],
  },
  {
    path: '/',
    element: (
      <Protected>
        <Layout />
      </Protected>
    ),
    children: [
      {
        index: true,
        element: (
          <RequirePerm permission="dashboard.read">
            <DashboardPage />
          </RequirePerm>
        ),
      },
      {
        path: 'moderation',
        element: (
          <RequirePerm permission="moderation.read">
            <ModerationQueuePage />
          </RequirePerm>
        ),
      },
      {
        path: 'moderation/:reportId',
        element: (
          <RequirePerm permission="moderation.read">
            <ModerationCasePage />
          </RequirePerm>
        ),
      },
      {
        path: 'users',
        element: (
          <RequirePerm permission="users.read">
            <UsersPage />
          </RequirePerm>
        ),
      },
      {
        path: 'users/:userId',
        element: (
          <RequirePerm permission="users.read">
            <UserDetailPage />
          </RequirePerm>
        ),
      },
      {
        path: 'privacy',
        element: (
          <RequirePerm permission="privacy.read">
            <PrivacyRequestsPage />
          </RequirePerm>
        ),
      },
      {
        path: 'appeals',
        element: (
          <RequirePerm permission="appeals.read">
            <AppealsPage />
          </RequirePerm>
        ),
      },
      {
        path: 'business/accounts',
        element: (
          <RequirePerm permission="business.write">
            <BusinessAccountsPage />
          </RequirePerm>
        ),
      },
      {
        path: 'business/accounts/:userId',
        element: (
          <RequirePerm permission="business.read">
            <BusinessAccountDetailPage />
          </RequirePerm>
        ),
      },
      {
        path: 'business',
        element: (
          <RequirePerm permission="business.read">
            <BusinessOrdersPage />
          </RequirePerm>
        ),
      },
      {
        path: 'analytics',
        element: (
          <RequirePerm permission="analytics.read">
            <AnalyticsPage />
          </RequirePerm>
        ),
      },
      {
        path: 'audit',
        element: (
          <RequirePerm permission="audit.read">
            <AuditLogsPage />
          </RequirePerm>
        ),
      },
      { path: 'settings/mfa', element: <MfaSetupPage /> },
    ],
  },
]);
