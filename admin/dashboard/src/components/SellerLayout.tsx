import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  FileSpreadsheet,
  Settings,
  LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSellerAuth } from '../auth/SellerAuthProvider';
import { getApiDisplayHost, isLocalApi } from '../services/api/adminClient';
import { pageFade } from '../lib/motion';
import { Button } from './ui/Button';

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

const NAV: NavItem[] = [
  { to: '/seller', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/seller/products', label: 'Products', icon: Package },
  { to: '/seller/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/seller/reports', label: 'Reports', icon: FileSpreadsheet },
  { to: '/seller/settings', label: 'Settings', icon: Settings },
];

export function SellerLayout() {
  const { seller, logout } = useSellerAuth();
  const location = useLocation();
  const initial = seller?.email?.charAt(0).toUpperCase() || 'S';
  const apiHost = getApiDisplayHost();
  const localApi = isLocalApi();

  return (
    <div className="flex min-h-screen bg-surface-page">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-surface-border bg-surface text-stone-800">
        <div className="border-b border-surface-border px-5 py-5">
          <div className="flex items-center gap-3">
            <img
              src="/brand-mark.png"
              alt="Grow!"
              className="h-9 w-9 rounded-lg object-cover shadow-sm ring-1 ring-stone-200/80"
            />
            <div>
              <p className="font-semibold tracking-tight text-stone-900">
                Grow<span className="text-brand-600">!</span> Seller
              </p>
              <p className="text-xs text-stone-500">Business portal</p>
            </div>
          </div>
          <p className="mt-3 truncate text-[10px] text-stone-400" title={apiHost}>
            API: {apiHost}
          </p>
          {localApi && (
            <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[10px] leading-snug text-amber-800">
              Local API — demo/seed data only.
            </p>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'text-brand-700' : 'text-stone-500 hover:bg-surface-page hover:text-stone-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="seller-nav-indicator"
                      className="absolute inset-0 rounded-lg bg-brand-50 ring-1 ring-brand-100"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <item.icon className="relative z-10 h-4 w-4 shrink-0" />
                  <span className="relative z-10">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-surface-border p-4">
          <div className="flex items-center gap-3 rounded-xl bg-surface-page p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-900">{seller?.email || 'Seller'}</p>
              <span className="mt-1 inline-block rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500 ring-1 ring-surface-border">
                Business
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            className="mt-3 w-full justify-center text-stone-600 hover:bg-surface-page hover:text-stone-900"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </div>
      </aside>

      <main className="ml-64 min-h-screen flex-1">
        <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} variants={pageFade} initial="initial" animate="animate" exit="exit">
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
