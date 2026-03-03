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
} from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
];

const STATUS_OPTIONS = [
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
          onClick={() => tab === 'users'
            ? refetchUsers()
            : queryClient.invalidateQueries({ queryKey: ['adminJobs'] })
          }
          className="btn-secondary gap-2 text-sm"
          disabled={usersLoading}
        >
          <RefreshCw className={`w-4 h-4 ${usersLoading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

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
      </div>

      {/* Tab: Users */}
      {tab === 'users' && (
        usersLoading ? (
          <div className="flex justify-center py-20">
            <Loader className="w-6 h-6 animate-spin text-primary-400" />
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(user => (
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

  const isDirty = role !== user.role || status !== user.status || maxVoices !== user.max_voices;

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
              : <XCircle className="w-4 h-4 text-red-400" />
            }
          </div>

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
                      {job.user_profiles?.display_name || '—'}
                    </p>
                    <p className="text-xs text-gray-600 truncate max-w-[140px]">
                      {job.user_profiles?.email}
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
