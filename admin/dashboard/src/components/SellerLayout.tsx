import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  FileSpreadsheet,
  Settings,
  LogOut,
  Store,
  BarChart3,
  MessageCircleQuestion,
  Users,
  BadgeCheck,
  Menu,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { useSellerAuth } from '../auth/SellerAuthProvider';
import { getApiDisplayHost, isLocalApi } from '../services/api/adminClient';
import { pageFade } from '../lib/motion';
import { Button } from './ui/Button';
import { ToastProvider } from './seller/SellerUI';

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [
      { to: '/seller', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/seller/insights', label: 'Insights', icon: BarChart3 },
    ],
  },
  {
    label: 'Shop',
    items: [
      { to: '/seller/products', label: 'Products', icon: Package },
      { to: '/seller/orders', label: 'Orders', icon: ShoppingBag },
      { to: '/seller/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    label: 'Your page',
    items: [
      { to: '/seller/storefront', label: 'Storefront', icon: Store },
      { to: '/seller/engagement', label: 'Questions & reviews', icon: MessageCircleQuestion },
      { to: '/seller/verification', label: 'Verification', icon: BadgeCheck },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/seller/reports', label: 'Reports', icon: FileSpreadsheet },
      { to: '/seller/settings', label: 'Settings', icon: Settings },
    ],
  },
];

/** Inter is bundled via @fontsource and applied to the seller portal only. */
const INTER_STACK = "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export function SellerLayout() {
  const { seller, logout } = useSellerAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const initial = seller?.email?.charAt(0).toUpperCase() || 'S';
  const apiHost = getApiDisplayHost();
  const localApi = isLocalApi();

  // Close the mobile drawer on navigation.
  useEffect(() => setNavOpen(false), [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const renderSidebar = (variant: 'desktop' | 'drawer') => (
    <>
      <div className="border-b border-surface-border px-5 py-5">
        <div className="flex items-center gap-3">
          <img
            src="/brand-mark.png"
            alt=""
            className="h-9 w-9 rounded-lg object-cover shadow-sm ring-1 ring-stone-200/80"
          />
          <div>
            <p className="font-semibold tracking-tight text-stone-900">
              Grow<span className="text-brand-600">!</span> for business
            </p>
            <p className="text-xs text-stone-500">Seller portal</p>
          </div>
        </div>
        {localApi && (
          <p className="mt-3 rounded-md bg-amber-50 px-2 py-1 text-[10px] leading-snug text-amber-800" title={apiHost}>
            Local API ({apiHost}) — demo data only.
          </p>
        )}
      </div>

      <nav aria-label="Seller navigation" className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `focus-ring relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? 'text-brand-700' : 'text-stone-600 hover:bg-surface-page hover:text-stone-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId={`seller-nav-indicator-${variant}`}
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
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white"
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-stone-900">{seller?.email || 'Seller'}</p>
            <p className="text-[11px] text-stone-500">Business account</p>
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
    </>
  );

  return (
    <ToastProvider>
      <div className="min-h-screen bg-surface-page text-stone-900" style={{ fontFamily: INTER_STACK }}>
        <a
          href="#seller-main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to content
        </a>

        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-surface-border bg-surface md:flex">
          {renderSidebar('desktop')}
        </aside>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-surface-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <img src="/brand-mark.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
            <span className="font-semibold">
              Grow<span className="text-brand-600">!</span> for business
            </span>
          </div>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
            className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg text-stone-700 hover:bg-surface-page"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        </header>

        {/* Mobile drawer */}
        <AnimatePresence>
          {navOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-stone-900/40"
                onClick={() => setNavOpen(false)}
              />
              <motion.aside
                role="dialog"
                aria-modal="true"
                aria-label="Menu"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-2xl"
              >
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setNavOpen(false)}
                  className="focus-ring absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-surface-page"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
                {renderSidebar('drawer')}
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        <main id="seller-main" className="min-h-screen md:ml-64">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-8 lg:px-10">
            <AnimatePresence mode="wait">
              <motion.div key={location.pathname} variants={pageFade} initial="initial" animate="animate" exit="exit">
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
