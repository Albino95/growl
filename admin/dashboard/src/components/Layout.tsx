import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import {
  LayoutDashboard,
  Shield,
  Users,
  Lock,
  Scale,
  Building2,
  ShoppingBag,
  BarChart3,
  ScrollText,
  KeyRound,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAdminAuth } from '../auth/AdminAuthProvider';
import { getApiDisplayHost, isLocalApi } from '../services/api/adminClient';
import { pageFade } from '../lib/motion';
import { PageLoader } from './ui/Skeleton';
import { Button } from './ui/Button';
import { AdminToastProvider } from './admin/Toast';

/** Inter is bundled via @fontsource (no font CDN, so the CSP stays 'self'). */
export const INTER_STACK =
  "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
  section?: string;
};

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.read', section: 'Ops' },
  { to: '/moderation', label: 'Moderation', icon: Shield, permission: 'moderation.read', section: 'Ops' },
  { to: '/users', label: 'Users', icon: Users, permission: 'users.read', section: 'Ops' },
  { to: '/business/accounts', label: 'Business Accounts', icon: Building2, permission: 'business.read', section: 'Commerce' },
  { to: '/business', label: 'Business Orders', icon: ShoppingBag, permission: 'business.read', section: 'Commerce' },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics.read', section: 'Commerce' },
  { to: '/privacy', label: 'Privacy', icon: Lock, permission: 'privacy.read', section: 'Compliance' },
  { to: '/appeals', label: 'Appeals', icon: Scale, permission: 'appeals.read', section: 'Compliance' },
  { to: '/audit', label: 'Audit Logs', icon: ScrollText, permission: 'audit.read', section: 'Compliance' },
  { to: '/settings/mfa', label: 'MFA Settings', icon: KeyRound, section: 'Settings' },
];

function canAccess(permissions: string[], required?: string) {
  if (!required) return true;
  if (permissions.includes('*')) return true;
  return permissions.includes(required);
}

export function Layout() {
  const { admin, permissions, logout, mustEnrollMfa } = useAdminAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  // Close the mobile drawer on navigation.
  useEffect(() => setNavOpen(false), [location.pathname]);
  // A restricted (MFA enrollment) session only sees MFA settings.
  const visibleNav = NAV.filter((item) =>
    mustEnrollMfa ? item.to === '/settings/mfa' : canAccess(permissions, item.permission)
  );
  const sections = [...new Set(visibleNav.map((n) => n.section || 'Other'))];

  const initial = admin?.email?.charAt(0).toUpperCase() || 'A';
  const apiHost = getApiDisplayHost();
  const localApi = isLocalApi();

  return (
    <AdminToastProvider>
    <div className="flex min-h-screen bg-surface-page" style={{ fontFamily: INTER_STACK }}>
      {/* Mobile top bar (below md the sidebar becomes a drawer). */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-3 border-b border-surface-border bg-surface px-4 md:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={navOpen}
          aria-controls="admin-sidebar"
          className="rounded-lg p-2 text-stone-700 hover:bg-surface-page focus-ring"
          onClick={() => setNavOpen(true)}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <p className="font-semibold tracking-tight text-stone-900">
          Grow<span className="text-brand-600">!</span> Admin
        </p>
      </header>
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-stone-900/40 md:hidden"
          aria-hidden
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        id="admin-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-surface-border bg-surface text-stone-800 transition-transform duration-200 md:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-surface-border px-5 py-5">
          <div className="flex items-center gap-3">
            <img
              src="/brand-mark.png"
              alt="Grow!"
              className="h-9 w-9 rounded-lg object-cover shadow-sm ring-1 ring-stone-200/80"
            />
            <div>
              <p className="font-semibold tracking-tight text-stone-900">
                Grow<span className="text-brand-600">!</span> Admin
              </p>
              <p className="text-xs text-stone-500">Trust &amp; Safety</p>
            </div>
            <button
              type="button"
              aria-label="Close navigation"
              className="ml-auto rounded-lg p-1.5 text-stone-500 hover:bg-surface-page focus-ring md:hidden"
              onClick={() => setNavOpen(false)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="mt-3 truncate text-[10px] text-stone-400" title={apiHost}>
            API: {apiHost}
          </p>
          {localApi && (
            <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[10px] leading-snug text-amber-800">
              Local API — demo/seed users only.
            </p>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section} className="mb-5">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                {section}
              </p>
              <div className="relative space-y-0.5">
                {visibleNav
                  .filter((n) => (n.section || 'Other') === section)
                  .map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                          isActive
                            ? 'text-brand-700'
                            : 'text-stone-500 hover:bg-surface-page hover:text-stone-800'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <motion.span
                              layoutId="nav-indicator"
                              className="absolute inset-0 rounded-lg bg-brand-50 ring-1 ring-brand-100"
                              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                            />
                          )}
                          <item.icon className="relative z-10 h-4 w-4 shrink-0" aria-hidden />
                          <span className="relative z-10">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-surface-border p-4">
          <div className="flex items-center gap-3 rounded-xl bg-surface-page p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-900">{admin?.email}</p>
              <span className="mt-1 inline-block rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500 ring-1 ring-surface-border">
                {admin?.role?.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            className="mt-3 w-full justify-center text-stone-600 hover:bg-surface-page hover:text-stone-900"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" aria-hidden /> Log out
          </Button>
        </div>
      </aside>

      <main className="min-h-screen min-w-0 flex-1 pt-14 md:ml-64 md:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-8 lg:px-10">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} variants={pageFade} initial="initial" animate="animate" exit="exit">
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
    </AdminToastProvider>
  );
}

export function AuthLoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page">
      <PageLoader />
    </div>
  );
}
