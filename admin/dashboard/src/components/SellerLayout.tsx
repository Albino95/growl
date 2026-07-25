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
    <div className="flex min-h-screen bg-surface-muted">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-gradient-to-b from-emerald-950 via-slate-900 to-slate-950 text-slate-200">
        <div className="border-b border-white/10 px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 font-bold text-white shadow-lg shadow-emerald-500/30">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-white">
                Grow<span className="text-emerald-400">!</span> Seller
              </p>
              <p className="text-xs text-slate-400">Business portal</p>
            </div>
          </div>
          <p className="mt-3 truncate text-[10px] text-slate-500" title={apiHost}>
            API: {apiHost}
          </p>
          {localApi && (
            <p className="mt-1 rounded-md bg-amber-500/15 px-2 py-1 text-[10px] leading-snug text-amber-200/90">
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
                  isActive ? 'text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="seller-nav-indicator"
                      className="absolute inset-0 rounded-lg bg-white/10 ring-1 ring-white/10"
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

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600/80 text-sm font-bold text-white">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{seller?.email || 'Seller'}</p>
              <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-200">
                Business
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            className="mt-3 w-full justify-center bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </div>
      </aside>

      <main className="ml-64 min-h-screen flex-1">
        <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
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
