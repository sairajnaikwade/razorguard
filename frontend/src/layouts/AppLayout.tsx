import { NavLink, useNavigate } from 'react-router-dom';
import {
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
  { to: '/',              label: 'Overview',      icon: LayoutDashboard, end: true },
  { to: '/analytics',    label: 'Analytics',     icon: BarChart3,       end: false },
  { to: '/transactions', label: 'Transactions',  icon: ArrowLeftRight,  end: false },
  { to: '/status',       label: 'System Status', icon: Activity,        end: false },
];

const ROLE_VARIANT = {
  ADMIN:   'CRITICAL',
  ANALYST: 'info',
  VIEWER:  'neutral',
} as const;

// ─── Nav link ────────────────────────────────────────────────────────────────
function SideNavLink({
  to, label, Icon, end, onClick,
}: {
  to: string; label: string; Icon: React.ElementType; end: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-colors duration-100 ${
          isActive
            ? 'bg-primary/10 text-white font-semibold'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/4 font-normal'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="nav-indicator" />}
          <Icon
            size={16}
            className={isActive ? 'text-primary' : 'text-slate-500'}
            aria-hidden
          />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

// ─── Brand mark ──────────────────────────────────────────────────────────────
function BrandMark() {
  return (
    <div className="h-14 flex items-center gap-3 px-4 border-b border-[#142238] shrink-0">
      <div className="w-8 h-8 shrink-0 flex items-center justify-center">
        <img
          src="/razorguard-shield.png"
          alt="RazorGuard"
          className="w-full h-full object-contain"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = '/razorguard-shield-icon.svg';
          }}
        />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-white font-bold text-sm tracking-tight leading-tight truncate">
          RAZOR<span className="text-primary">GUARD</span>
        </span>
        <span className="text-[9px] text-slate-500 tracking-widest uppercase leading-tight mt-0.5">
          Fraud Intelligence
        </span>
      </div>
    </div>
  );
}

// ─── User block ───────────────────────────────────────────────────────────────
function UserBlock({ onLogout }: { onLogout: () => void }) {
  const user = useAuthStore(s => s.user);
  return (
    <div className="px-3 py-3 border-t border-[#142238] shrink-0">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded bg-primary/20 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary leading-none">
            {(user?.username?.[0] ?? '?').toUpperCase()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white truncate leading-snug">{user?.username ?? '—'}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-risk-low shrink-0" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">
              {user?.role ?? '—'}
            </span>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="text-slate-600 hover:text-red-400 p-1.5 rounded hover:bg-red-500/10 transition-colors shrink-0"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Nav links ────────────────────────────────────────────────────────────────
function NavLinks({
  canScore,
  onClose,
  onScoreClick,
}: {
  canScore: boolean;
  onClose: () => void;
  onScoreClick: () => void;
}) {
  return (
    <nav className="px-2 py-3 space-y-0.5 flex-1 overflow-y-auto min-h-0" aria-label="Main navigation">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <SideNavLink
          key={to}
          to={to}
          label={label}
          Icon={Icon}
          end={end}
          onClick={onClose}
        />
      ))}

      {canScore && (
        <>
          <div className="border-t border-[#142238] my-2" />
          <button
            onClick={onScoreClick}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-semibold text-white
              bg-primary hover:bg-primary-dim active:opacity-90
              transition-colors duration-100"
          >
            <FlaskConical size={16} aria-hidden />
            Score Transaction
          </button>
        </>
      )}
    </nav>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const logout             = useAuthStore(s => s.logout);
  const navigate           = useNavigate();
  const sidebarOpen        = useUIStore(s => s.sidebarOpen);
  const setSidebarOpen     = useUIStore(s => s.setSidebarOpen);
  const scoreDialogOpen    = useUIStore(s => s.scoreDialogOpen);
  const setScoreDialogOpen = useUIStore(s => s.setScoreDialogOpen);
  const user               = useAuthStore(s => s.user);

  const canScore = user?.role === 'ADMIN' || user?.role === 'ANALYST';

  const handleLogout    = () => { logout(); navigate('/login'); };
  const handleScoreClick = () => { setSidebarOpen(false); setScoreDialogOpen(true); };

  return (
    <div className="h-screen h-dvh bg-[#06101F] flex overflow-hidden">

      {/* ── Desktop sidebar (md+) ──────────────────────────────────── */}
      <aside
        className="hidden md:flex w-52 lg:w-56 flex-col bg-[#0B1728] border-r border-[#142238] sticky top-0 h-screen h-dvh shrink-0"
        aria-label="Sidebar navigation"
      >
        <BrandMark />
        <NavLinks canScore={canScore} onClose={() => undefined} onScoreClick={handleScoreClick} />
        <UserBlock onLogout={handleLogout} />
      </aside>

      {/* ── Mobile drawer (< md) ───────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 flex"
          role="dialog" aria-modal="true" aria-label="Navigation menu"
        >
          <div
            className="fixed inset-0 bg-black/60 modal-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
          <aside className="relative z-50 w-56 max-w-[80vw] flex flex-col bg-[#0B1728] border-r border-[#142238] h-full h-dvh animate-in">
            <div className="flex items-center justify-between pr-2 border-b border-[#142238] shrink-0">
              <BrandMark />
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-slate-500 hover:text-white p-2 rounded hover:bg-white/5 transition-colors"
                aria-label="Close navigation"
              >
                <X size={16} />
              </button>
            </div>
            <NavLinks canScore={canScore} onClose={() => setSidebarOpen(false)} onScoreClick={handleScoreClick} />
            <UserBlock onLogout={handleLogout} />
          </aside>
        </div>
      )}

      {/* ── Main content area ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-full">

        {/* Mobile top bar */}
        <header className="md:hidden h-12 flex items-center justify-between px-4 bg-[#0B1728] border-b border-[#142238] sticky top-0 z-30 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-white/5 transition-colors"
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/razorguard-shield.png"
              alt=""
              className="w-5 h-5 object-contain"
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/razorguard-shield-icon.svg'; }}
              aria-hidden
            />
            <span className="font-bold text-sm text-white">
              RAZOR<span className="text-primary">GUARD</span>
            </span>
          </div>
          <Badge
            variant={ROLE_VARIANT[user?.role as keyof typeof ROLE_VARIANT] ?? 'neutral'}
            className="text-[10px]"
          >
            {user?.role ?? '—'}
          </Badge>
        </header>

        {/* Page content */}
        <main className="page-main flex-1 p-4 sm:p-5 lg:p-6 xl:p-7 overflow-y-auto overflow-x-hidden max-w-[1600px] w-full mx-auto">
          <div className="route-animate">{children}</div>
        </main>
      </div>

      {/* Global Score Transaction dialog */}
      <ScoreTransactionDialog
        open={scoreDialogOpen}
        onClose={() => setScoreDialogOpen(false)}
        onScored={() => undefined}
      />
    </div>
  );
}

export function canUserScore(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'ANALYST';
}
