import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../auth/AdminAuthProvider';
import { AuthLoadingShell } from './Layout';

export function RequirePerm({
  permission,
  children,
}: {
  permission?: string;
  children: React.ReactNode;
}) {
  const { loading, admin, permissions } = useAdminAuth();
  if (loading) return <AuthLoadingShell />;
  if (!admin) return <Navigate to="/login" replace />;
  if (permission) {
    const ok = permissions.includes('*') || permissions.includes(permission);
    if (!ok) return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
