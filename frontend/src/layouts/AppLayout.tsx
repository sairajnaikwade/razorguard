import { NavLink, useNavigate } from 'react-router-dom';
import {
  Shield,
  LogOut,
  LayoutDashboard,
  BarChart3,
  ArrowLeftRight,
  Activity,
  Menu,
  X,
  FlaskConical,
} from 'lucide-react';

import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import Badge from '../components/ui/Badge';
import ScoreTransactionDialog from '../components/transactions/ScoreTransactionDialog';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, end: false },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight, end: false },
  { to: '/status', label: 'System Status', icon: Activity, end: false },
];

const ROLE_VARIANT = {
  ADMIN: 'CRITICAL',
  ANALYST: 'info',
  VIEWER: 'neutral',
} as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const scoreDialogOpen = useUIStore((s) => s.scoreDialogOpen);
  const setScoreDialogOpen = useUIStore((s) => s.setScoreDialogOpen);

  // Cosmetic RBAC gating only — the backend remains the source of truth.
  const canScore = user?.role === 'ADMIN' || user?.role === 'ANALYST';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinks = (
    <nav className="p-4 space-y-1" aria-label="Main navigation">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setSidebarOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
              isActive
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'text-slate-300 hover:bg-slate-800 border border-transparent'
            }`
          }
        >
          <Icon size={18} />
          <span>{label}</span>
        </NavLink>
      ))}

      {canScore && (
        <button
          onClick={() => {
            setSidebarOpen(false);
            setScoreDialogOpen(true);
          }}
          className="w-full flex items-center gap-3 px-4 py-2 mt-4 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary/90 transition-colors"
        >
          <FlaskConical size={18} />
          <span>Score Transaction</span>
        </button>
      )}
    </nav>
  );

  const userBlock = (
    <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-2">
      <div className="truncate">
        <p className="text-sm font-semibold text-white truncate">{user?.username}</p>
        <Badge
          variant={ROLE_VARIANT[user?.role as keyof typeof ROLE_VARIANT] ?? 'neutral'}
          className="mt-1"
        >
          {user?.role ?? '—'}
        </Badge>
      </div>
      <button
        onClick={handleLogout}
        className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors shrink-0"
        aria-label="Log out"
        title="Log out"
      >
        <LogOut size={18} />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col justify-between bg-slate-900/80 border-r border-slate-800 sticky top-0 h-screen">
        <div>
          <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-800">
            <Shield className="text-primary" size={24} />
            <span className="text-white font-bold text-lg tracking-tight">RazorGuard</span>
          </div>
          {navLinks}
        </div>
        {userBlock}
      </aside>

      {/* Mobile/tablet drawer */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
          <aside className="relative z-50 w-64 flex flex-col justify-between bg-slate-900 border-r border-slate-800 h-full animate-in">
            <div>
              <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Shield className="text-primary" size={24} />
                  <span className="text-white font-bold text-lg">RazorGuard</span>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>
              {navLinks}
            </div>
            {userBlock}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden h-14 flex items-center justify-between px-4 bg-slate-900/90 border-b border-slate-800 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-300 hover:text-white p-2 rounded-lg hover:bg-slate-800"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span className="flex items-center gap-2 text-white font-bold">
            <Shield className="text-primary" size={18} /> RazorGuard
          </span>
          <span className="text-xs text-slate-400">{user?.role}</span>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Global scoring dialog (ADMIN / ANALYST only; backend enforces RBAC). */}
      <ScoreTransactionDialog
        open={scoreDialogOpen}
        onClose={() => setScoreDialogOpen(false)}
        onScored={() => undefined}
      />
    </div>
  );
}

// Cosmetic helper for pages that gate scoring actions in the UI.
export function canUserScore(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'ANALYST';
}
