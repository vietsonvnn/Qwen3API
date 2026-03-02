import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, AudioLines, Mic2, History, LogOut,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tts', icon: AudioLines, label: 'Chuyển văn bản' },
  { to: '/voice-clone', icon: Mic2, label: 'Nhân bản giọng' },
  { to: '/history', icon: History, label: 'Lịch sử' },
];

export default function Layout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const initials = (profile?.display_name || profile?.email || 'U')[0].toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col" style={{
        background: 'linear-gradient(180deg, #161b27 0%, #0f1117 100%)',
        borderRight: '1px solid #252d40',
      }}>
        {/* Logo */}
        <div className="px-4 py-5 border-b border-dark-600">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #4f73f8 0%, #7c9ef8 100%)', boxShadow: '0 0 16px rgba(79,115,248,0.4)' }}>
              <AudioLines className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-white text-sm">Qwen Voice</span>
              <p className="text-xs text-gray-600 leading-none mt-0.5">Alibaba Cloud</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                  isActive
                    ? 'text-white font-medium'
                    : 'text-gray-500 hover:text-gray-200 hover:bg-dark-700'
                }`
              }
              style={({ isActive }) => isActive ? {
                background: 'linear-gradient(135deg, rgba(79,115,248,0.18) 0%, rgba(79,115,248,0.08) 100%)',
                borderLeft: '2px solid #4f73f8',
                paddingLeft: '10px',
              } : { borderLeft: '2px solid transparent' }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-2 border-t border-dark-600">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-dark-700 transition-colors group">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary-400"
              style={{ background: 'rgba(79,115,248,0.15)', border: '1px solid rgba(79,115,248,0.2)' }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-300 truncate leading-tight">
                {profile?.display_name || 'User'}
              </p>
              <p className="text-xs text-gray-600 truncate leading-tight">{profile?.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="p-1 rounded-lg text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              title="Đăng xuất"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-dark-900">
        <Outlet />
      </main>
    </div>
  );
}
