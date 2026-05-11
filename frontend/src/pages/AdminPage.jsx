import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow, format } from 'date-fns';
import { vi } from 'date-fns/locale';
import toast from 'react-hot-toast';
import {
  ShieldCheck, Users, RefreshCw, Save, Loader,
  CheckCircle, XCircle, Clock, Trash2, List,
  TrendingUp, AlertCircle, BarChart2, Type,
  UserCheck, UserX, Settings, Key, Eye, EyeOff, Globe, Zap,
} from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

const JOB_STATUS_COLORS = {
  completed: 'text-green-400',
  processing: 'text-blue-400',
  failed: 'text-red-400',
  pending: 'text-yellow-400',
};

export default function AdminPage() {
  const { profile: myProfile } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('users');

  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: () => adminApi.getUsers().then(r => r.data.data),
    staleTime: 30 * 1000,
  });

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['adminStats'],
    queryFn: () => adminApi.getStats().then(r => r.data.data),
    staleTime: 60 * 1000,
  });

  const users = usersData || [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary-400" />
            Quản trị
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {users.length} người dùng
          </p>
        </div>
        <button
          onClick={() => {
            refetchUsers();
            refetchStats();
            if (tab === 'jobs') queryClient.invalidateQueries({ queryKey: ['adminJobs'] });
          }}
          className="btn-secondary gap-2 text-sm"
          disabled={usersLoading}
        >
          <RefreshCw className={`w-4 h-4 ${usersLoading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* Stats bar */}
      {stats && <StatsBar stats={stats} />}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-dark-700">
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'users'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <Users className="w-4 h-4" />
          Người dùng
        </button>
        <button
          onClick={() => setTab('jobs')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'jobs'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <List className="w-4 h-4" />
          Lịch sử Jobs
        </button>
        <button
          onClick={() => setTab('settings')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'settings'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <Settings className="w-4 h-4" />
          Cài đặt
        </button>
      </div>

      {/* Tab: Users */}
      {tab === 'users' && (
        usersLoading ? (
          <div className="flex justify-center py-20">
            <Loader className="w-6 h-6 animate-spin text-primary-400" />
          </div>
        ) : (
          <div className="space-y-2">
            {/* Pending users section */}
            {users.filter(u => u.status === 'pending').length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-yellow-400 mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Chờ duyệt ({users.filter(u => u.status === 'pending').length})
                </h3>
                <div className="space-y-2">
                  {users.filter(u => u.status === 'pending').map(user => (
                    <UserRow
                      key={user.id}
                      user={user}
                      isMe={user.id === myProfile?.id}
                      onUpdated={() => queryClient.invalidateQueries({ queryKey: ['adminUsers'] })}
                      onDeleted={() => queryClient.invalidateQueries({ queryKey: ['adminUsers'] })}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* Active/Suspended users */}
            {users.filter(u => u.status !== 'pending').map(user => (
              <UserRow
                key={user.id}
                user={user}
                isMe={user.id === myProfile?.id}
                onUpdated={() => queryClient.invalidateQueries({ queryKey: ['adminUsers'] })}
                onDeleted={() => queryClient.invalidateQueries({ queryKey: ['adminUsers'] })}
              />
            ))}
          </div>
        )
      )}

      {/* Tab: Jobs */}
      {tab === 'jobs' && <AllJobsTab />}

      {/* Tab: Settings */}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

// =====================================================
// STATS BAR
// =====================================================

function fmtChars(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function StatsBar({ stats }) {
  const successRate = stats.totalJobs > 0
    ? Math.round((stats.completedJobs / stats.totalJobs) * 100)
    : 0;

  const items = [
    {
      icon: <Users className="w-4 h-4 text-primary-400" />,
      label: 'Người dùng',
      value: stats.totalUsers,
      sub: `${stats.activeUsers7d} active 7 ngày`,
    },
    {
      icon: <TrendingUp className="w-4 h-4 text-green-400" />,
      label: 'Hoàn thành',
      value: stats.completedJobs.toLocaleString(),
      sub: `/ ${stats.totalJobs.toLocaleString()} jobs`,
    },
    {
      icon: <AlertCircle className="w-4 h-4 text-red-400" />,
      label: 'Jobs lỗi',
      value: stats.failedJobs.toLocaleString(),
      sub: stats.totalJobs > 0 ? `${100 - successRate}% tỷ lệ lỗi` : '—',
    },
    {
      icon: <BarChart2 className="w-4 h-4 text-yellow-400" />,
      label: 'Success rate',
      value: `${successRate}%`,
      sub: 'completed / total',
    },
    {
      icon: <Type className="w-4 h-4 text-purple-400" />,
      label: 'Ký tự đã dùng',
      value: fmtChars(stats.totalCharactersUsed),
      sub: `${stats.totalCharactersUsed.toLocaleString()} ký tự`,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
      {items.map((item, i) => (
        <div key={i} className="card py-3 px-4">
          <div className="flex items-center gap-2 mb-1">
            {item.icon}
            <span className="text-xs text-gray-500 uppercase tracking-wide">{item.label}</span>
          </div>
          <p className="text-xl font-bold text-white leading-none">{item.value}</p>
          <p className="text-xs text-gray-600 mt-1 truncate">{item.sub}</p>
        </div>
      ))}
    </div>
  );
}

// =====================================================
// USER ROW
// =====================================================

function UserRow({ user, isMe, onUpdated, onDeleted }) {
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [maxVoices, setMaxVoices] = useState(user.max_voices);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [approving, setApproving] = useState(false);

  const isDirty = role !== user.role || status !== user.status || maxVoices !== user.max_voices;

  const handleApprove = async () => {
    setApproving(true);
    try {
      await adminApi.approveUser(user.id);
      toast.success(`Đã duyệt ${user.display_name || user.email}`);
      onUpdated();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Duyệt thất bại');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    setDeleting(true);
    try {
      await adminApi.rejectUser(user.id);
      toast.success(`Đã từ chối ${user.display_name || user.email}`);
      onDeleted();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Từ chối thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updateUser(user.id, { role, status, max_voices: parseInt(maxVoices) });
      toast.success(`Đã cập nhật ${user.display_name || user.email}`);
      onUpdated();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Cập nhật thất bại');
      setRole(user.role);
      setStatus(user.status);
      setMaxVoices(user.max_voices);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await adminApi.deleteUser(user.id);
      toast.success(`Đã xóa ${user.display_name || user.email}`);
      onDeleted();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Xóa thất bại');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const initials = (user.display_name || user.email || '?')[0].toUpperCase();

  return (
    <div className={`card hover:border-dark-500 transition-colors ${isMe ? 'border-primary-500/30' : ''}`}>
      <div className="flex items-center gap-4 flex-wrap">
        {/* Avatar + Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{
              background: user.role === 'admin' ? 'rgba(234,179,8,0.15)' : 'rgba(79,115,248,0.15)',
              color: user.role === 'admin' ? '#fbbf24' : '#7c9ef8',
            }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-gray-200 truncate">
                {user.display_name || '—'}
              </p>
              {isMe && <span className="badge badge-info text-xs">Bạn</span>}
            </div>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-gray-500 flex-shrink-0">
          <span title="Ký tự đã dùng">
            {(user.total_characters_used || 0).toLocaleString()} ký tự
          </span>
          {user.last_login_at && (
            <span className="flex items-center gap-1" title="Đăng nhập lần cuối">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(user.last_login_at), { addSuffix: true, locale: vi })}
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {/* Role */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-600 uppercase tracking-wide px-0.5">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-primary-500 cursor-pointer"
            >
              {ROLE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-600 uppercase tracking-wide px-0.5">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-primary-500 cursor-pointer"
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Max Voices */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-600 uppercase tracking-wide px-0.5">Max giọng</label>
            <input
              type="number"
              min={1}
              max={100}
              value={maxVoices}
              onChange={e => setMaxVoices(e.target.value)}
              className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-primary-500 w-16 text-center"
            />
          </div>

          {/* Status badge */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-600 uppercase tracking-wide px-0.5 invisible">x</label>
            {status === 'active'
              ? <CheckCircle className="w-4 h-4 text-green-400" />
              : status === 'pending'
              ? <Clock className="w-4 h-4 text-yellow-400" />
              : <XCircle className="w-4 h-4 text-red-400" />
            }
          </div>

          {/* Quick approve/reject for pending users */}
          {user.status === 'pending' && !isMe && (
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-gray-600 uppercase tracking-wide px-0.5 invisible">x</label>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className="btn px-2 py-1.5 text-xs gap-1 bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30"
                >
                  {approving ? <Loader className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                  Duyệt
                </button>
                <button
                  onClick={handleReject}
                  disabled={deleting}
                  className="btn px-2 py-1.5 text-xs gap-1 bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30"
                >
                  {deleting ? <Loader className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
                  Từ chối
                </button>
              </div>
            </div>
          )}

          {/* Save button */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-600 uppercase tracking-wide px-0.5 invisible">x</label>
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className={`btn px-3 py-1.5 text-xs gap-1.5 ${
                isDirty ? 'btn-primary' : 'btn-secondary opacity-50'
              }`}
            >
              {saving
                ? <Loader className="w-3 h-3 animate-spin" />
                : <Save className="w-3 h-3" />
              }
              Lưu
            </button>
          </div>

          {/* Delete button */}
          {!isMe && (
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-gray-600 uppercase tracking-wide px-0.5 invisible">x</label>
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="btn px-2 py-1.5 text-xs gap-1 bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30"
                  >
                    {deleting ? <Loader className="w-3 h-3 animate-spin" /> : 'Chắc chắn?'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="btn-secondary px-2 py-1.5 text-xs"
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="btn-secondary px-2 py-1.5 text-xs text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================
// ALL JOBS TAB
// =====================================================

function AllJobsTab() {
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['adminJobs', offset],
    queryFn: () =>
      adminApi.getAllJobs({ limit: LIMIT, offset }).then(r => r.data),
    staleTime: 30 * 1000,
    keepPreviousData: true,
  });

  const jobs = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{total.toLocaleString()} jobs</p>
        <div className="flex items-center gap-2">
          <button
            disabled={currentPage <= 1}
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
          >
            ← Trước
          </button>
          <span className="text-xs text-gray-500">
            {currentPage}/{totalPages || 1}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setOffset(offset + LIMIT)}
            className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
          >
            Tiếp →
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader className="w-6 h-6 animate-spin text-primary-400" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-600">Chưa có job nào</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-600 uppercase tracking-wide border-b border-dark-700">
                <th className="text-left pb-2 pr-4">Người dùng</th>
                <th className="text-left pb-2 pr-4">Tiêu đề / Giọng</th>
                <th className="text-left pb-2 pr-4">Model</th>
                <th className="text-left pb-2 pr-4">Status</th>
                <th className="text-right pb-2 pr-4">Ký tự</th>
                <th className="text-right pb-2">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-dark-800/40 transition-colors">
                  <td className="py-2.5 pr-4">
                    <p className="text-gray-300 truncate max-w-[140px]">
                      {job.display_name || '—'}
                    </p>
                    <p className="text-xs text-gray-600 truncate max-w-[140px]">
                      {job.email}
                    </p>
                  </td>
                  <td className="py-2.5 pr-4">
                    <p className="text-gray-300 truncate max-w-[160px]">
                      {job.job_title || '—'}
                    </p>
                    <p className="text-xs text-gray-600">{job.voice_name}</p>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="text-xs text-gray-500">
                      {job.model === 'qwen3-tts-flash' ? 'Flash' : 'Voice Clone'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className={`text-xs font-medium ${JOB_STATUS_COLORS[job.status] || 'text-gray-400'}`}>
                      {job.status}
                    </span>
                    {job.error_message && (
                      <p className="text-xs text-red-500 truncate max-w-[140px]" title={job.error_message}>
                        {job.error_message}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-gray-400 text-xs">
                    {(job.total_characters || 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right text-xs text-gray-600 whitespace-nowrap">
                    {format(new Date(job.created_at), 'dd/MM HH:mm')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================
// SETTINGS TAB
// =====================================================

const SETTING_META = {
  qwen_api_key: { label: 'Qwen API Key', icon: Key, placeholder: 'sk-...', sensitive: true, description: 'API Key từ DashScope (Alibaba Cloud) để sử dụng Qwen3 TTS' },
  qwen_base_url: { label: 'Qwen Base URL', icon: Globe, placeholder: 'https://dashscope-intl.aliyuncs.com/api/v1', sensitive: false, description: 'Base URL của Qwen3 API' },
};

function SettingsTab() {
  const queryClient = useQueryClient();
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['adminSettings'],
    queryFn: () => adminApi.getSettings().then(r => r.data.data),
    staleTime: 30 * 1000,
  });

  const [values, setValues] = useState({});
  const [showKeys, setShowKeys] = useState({});
  const [saving, setSaving] = useState({});
  const [cleaningUp, setCleaningUp] = useState(false);

  const settings = settingsData || [];
  const getVal = (key) => values[key] !== undefined ? values[key] : (settings.find(s => s.key === key)?.value || '');
  const isChanged = (key) => {
    const original = settings.find(s => s.key === key)?.value || '';
    return values[key] !== undefined && values[key] !== original;
  };

  const handleSave = async (key) => {
    setSaving(s => ({ ...s, [key]: true }));
    try {
      const meta = SETTING_META[key] || {};
      await adminApi.updateSetting(key, values[key], meta.description);
      toast.success(`Đã lưu ${meta.label || key}`);
      queryClient.invalidateQueries({ queryKey: ['adminSettings'] });
      setValues(v => { const n = { ...v }; delete n[key]; return n; });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Lưu thất bại');
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  };

  const handleCleanup = async () => {
    setCleaningUp(true);
    try {
      const res = await adminApi.cleanup();
      const { deleted, errors } = res.data.data;
      toast.success(`Cleanup xong: ${deleted} files xóa, ${errors} lỗi`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Cleanup thất bại');
    } finally {
      setCleaningUp(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader className="w-6 h-6 animate-spin text-primary-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* API Keys Section */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Key className="w-4 h-4 text-primary-400" />
          API Keys
        </h3>
        <div className="space-y-4">
          {Object.entries(SETTING_META).map(([key, meta]) => {
            const Icon = meta.icon;
            const val = getVal(key);
            const isShown = showKeys[key];
            const changed = isChanged(key);

            return (
              <div key={key} className="space-y-1.5">
                <label className="text-xs text-gray-400 flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  {meta.label}
                </label>
                <p className="text-xs text-gray-600">{meta.description}</p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={meta.sensitive && !isShown ? 'password' : 'text'}
                      value={val}
                      onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
                      placeholder={meta.placeholder}
                      className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-primary-500 pr-10 font-mono"
                    />
                    {meta.sensitive && (
                      <button
                        type="button"
                        onClick={() => setShowKeys(s => ({ ...s, [key]: !s[key] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                      >
                        {isShown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => handleSave(key)}
                    disabled={!changed || saving[key]}
                    className={`btn px-3 py-2 text-xs gap-1.5 flex-shrink-0 ${
                      changed ? 'btn-primary' : 'btn-secondary opacity-50'
                    }`}
                  >
                    {saving[key]
                      ? <Loader className="w-3 h-3 animate-spin" />
                      : <Save className="w-3 h-3" />
                    }
                    Lưu
                  </button>
                </div>
                {val && meta.sensitive && (
                  <p className="text-xs text-green-500/70">
                    <CheckCircle className="w-3 h-3 inline mr-1" />
                    Đã cấu hình
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Storage Cleanup Section */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          Storage
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Xóa audio files cũ hơn 3 ngày để giữ dung lượng dưới giới hạn. Tự động chạy mỗi 6 giờ.
        </p>
        <button
          onClick={handleCleanup}
          disabled={cleaningUp}
          className="btn-secondary text-xs px-4 py-2 gap-1.5"
        >
          {cleaningUp
            ? <Loader className="w-3 h-3 animate-spin" />
            : <Trash2 className="w-3 h-3" />
          }
          Chạy Cleanup ngay
        </button>
      </div>
    </div>
  );
}
