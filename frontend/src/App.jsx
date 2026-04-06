import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TtsPage from './pages/TtsPage';
import VoiceClonePage from './pages/VoiceClonePage';
import HistoryPage from './pages/HistoryPage';
import AccountPage from './pages/AccountPage';
import AdminPage from './pages/AdminPage';
import Layout from './components/Layout';

function ProtectedRoute({ children }) {
  const { user, profile, loading, signOut } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-dark-900">
      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;

  // Block pending users with a waiting screen
  if (profile?.status === 'pending') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dark-900">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Tài khoản đang chờ duyệt</h2>
          <p className="text-gray-400 mb-6">
            Tài khoản của bạn đã được tạo thành công. Vui lòng chờ admin phê duyệt trước khi sử dụng.
          </p>
          <button onClick={signOut} className="btn-secondary text-sm px-4 py-2">
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

  // Block suspended users
  if (profile?.status === 'suspended') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dark-900">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Tài khoản đã bị khoá</h2>
          <p className="text-gray-400 mb-6">
            Tài khoản của bạn đã bị tạm ngưng. Vui lòng liên hệ admin để biết thêm chi tiết.
          </p>
          <button onClick={signOut} className="btn-secondary text-sm px-4 py-2">
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="tts" element={<TtsPage />} />
            <Route path="voice-clone" element={<VoiceClonePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
