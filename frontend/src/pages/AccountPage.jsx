import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi, voiceApi } from '../services/api';
import toast from 'react-hot-toast';
import {
  User, Mail, Shield, Key, LogOut, Save,
  BarChart2, Mic2, CheckCircle,
} from 'lucide-react';

export default function AccountPage() {
  const { profile, signOut, refreshProfile, changePassword } = useAuth();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [savingName, setSavingName] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Cloned voice count
  const { data: myVoices } = useQuery({
    queryKey: ['myVoices'],
    queryFn: () => voiceApi.getMyVoices().then(r => r.data.data),
    staleTime: 2 * 60 * 1000,
  });

  const handleSaveName = async () => {
    if (!displayName.trim()) return toast.error('Tên không được để trống');
    if (displayName.trim() === profile?.display_name) return;
    setSavingName(true);
    try {
      await userApi.updateMe({ display_name: displayName.trim() });
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Đã cập nhật tên');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Cập nhật thất bại');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) return toast.error('Mật khẩu tối thiểu 6 ký tự');
    if (newPassword !== confirmPassword) return toast.error('Mật khẩu xác nhận không khớp');
    setSavingPassword(true);
    try {
      await changePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Đã đổi mật khẩu thành công');
    } catch (err) {
      toast.error(err.message || 'Đổi mật khẩu thất bại');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const initials = (profile?.display_name || profile?.email || 'U')[0].toUpperCase();
  const isAdmin = profile?.role === 'admin';
  const charsUsed = profile?.total_characters_used || 0;
  const voiceCount = myVoices?.length || 0;
  const maxVoices = profile?.max_voices || 10;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <User className="w-5 h-5 text-primary-400" />
          Tài khoản
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Quản lý thông tin và bảo mật</p>
      </div>

      <div className="space-y-4">
        {/* Profile */}
        <div className="card space-y-4">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-primary-400 flex-shrink-0"
              style={{ background: 'rgba(79,115,248,0.15)', border: '1px solid rgba(79,115,248,0.25)' }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-white text-lg leading-tight">
                {profile?.display_name || 'Người dùng'}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`badge ${isAdmin ? 'badge-warning' : 'badge-neutral'}`}>
                  <Shield className="w-2.5 h-2.5" />
                  {isAdmin ? 'Admin' : 'User'}
                </span>
                {profile?.status === 'active' && (
                  <span className="badge badge-success">
                    <CheckCircle className="w-2.5 h-2.5" /> Hoạt động
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Display name */}
          <div>
            <label className="label flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> Tên hiển thị
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                className="input flex-1"
                placeholder="Tên hiển thị"
              />
              <button
                onClick={handleSaveName}
                disabled={savingName || displayName.trim() === profile?.display_name}
                className="btn-primary px-4"
              >
                <Save className="w-4 h-4" />
                {savingName ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="label flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" /> Email
            </label>
            <div className="flex items-center gap-2 px-3 py-2.5 bg-dark-700/50 border border-dark-600 rounded-xl text-gray-400 text-sm">
              {profile?.email}
            </div>
          </div>
        </div>

        {/* Usage Stats */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary-400" /> Thống kê sử dụng
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-dark-700/50 border border-dark-600 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Ký tự đã dùng</p>
              <p className="text-lg font-bold text-white">{charsUsed.toLocaleString()}</p>
            </div>
            <div className="bg-dark-700/50 border border-dark-600 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <Mic2 className="w-3 h-3" /> Giọng đã clone
              </p>
              <p className="text-lg font-bold text-white">
                {voiceCount}
                <span className="text-sm font-normal text-gray-500"> / {maxVoices}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <Key className="w-4 h-4 text-primary-400" /> Đổi mật khẩu
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="label">Mật khẩu mới</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="input"
                placeholder="Tối thiểu 6 ký tự"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label">Xác nhận mật khẩu</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="input"
                placeholder="Nhập lại mật khẩu mới"
                autoComplete="new-password"
              />
            </div>
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-400">Mật khẩu xác nhận không khớp</p>
            )}
            <button
              type="submit"
              disabled={savingPassword || !newPassword || !confirmPassword}
              className="btn-primary"
            >
              <Key className="w-4 h-4" />
              {savingPassword ? 'Đang đổi...' : 'Đổi mật khẩu'}
            </button>
          </form>
        </div>

        {/* Sign Out */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <LogOut className="w-4 h-4 text-red-400" /> Đăng xuất
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Phiên đăng nhập sẽ kết thúc và bạn sẽ được chuyển về trang đăng nhập.
          </p>
          <button onClick={handleSignOut} className="btn-danger">
            <LogOut className="w-4 h-4" /> Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}
