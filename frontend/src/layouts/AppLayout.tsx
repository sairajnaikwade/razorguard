import { Link, useNavigate } from 'react-router-dom';
import { Shield, LogOut, Activity } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-dark flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between">
        <div>
          <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-800">
            <Shield className="text-primary" size={24} />
            <span className="text-white font-bold text-lg">RazorGuard</span>
          </div>
          <nav className="p-4 space-y-1">
            <Link to="/" className="flex items-center gap-3 px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">
              <Activity size={18} />
              <span>Status</span>
            </Link>
          </nav>
        </div>
        
        {/* User Info */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
          <div className="truncate pr-2">
            <p className="text-sm font-semibold text-white truncate">{user?.username}</p>
            <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
