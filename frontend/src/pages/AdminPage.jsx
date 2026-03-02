import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import toast from 'react-hot-toast';
import {
  ShieldCheck, Users, RefreshCw, Save, Loader,
  CheckCircle, XCircle, Clock,
} from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

export default function AdminPage() {
  const { profile: myProfile } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: () => adminApi.getUsers().then(r => r.data.data),
    staleTime: 30 * 1000,
  });

  const users = data || [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary-400" />
            Quản lý người dùng
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> {users.length} người dùng
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-secondary gap-2 text-sm"
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {isLoading ? (
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({ user, isMe, onUpdated }) {
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [maxVoices, setMaxVoices] = useState(user.max_voices);
  const [saving, setSaving] = useState(false);

  const isDirty = role !== user.role || status !== user.status || maxVoices !== user.max_voices;

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updateUser(user.id, { role, status, max_voices: parseInt(maxVoices) });
      toast.success(`Đã cập nhật ${user.display_name || user.email}`);
      onUpdated();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Cập nhật thất bại');
      // Revert
      setRole(user.role);
      setStatus(user.status);
      setMaxVoices(user.max_voices);
    } finally {
      setSaving(false);
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
              {isMe && (
                <span className="badge badge-info text-xs">Bạn</span>
              )}
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
        </div>
      </div>
    </div>
  );
}
