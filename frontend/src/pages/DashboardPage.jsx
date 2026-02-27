import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { ttsApi, voiceApi } from '../services/api';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  AudioLines, Mic2, History, ArrowRight, CheckCircle,
  XCircle, Loader, Clock, Play,
} from 'lucide-react';

export default function DashboardPage() {
  const { profile } = useAuth();

  const { data: jobsData } = useQuery({
    queryKey: ['ttsJobs'],
    queryFn: () => ttsApi.getJobs({ limit: 5 }).then(r => r.data),
  });

  const { data: voicesData } = useQuery({
    queryKey: ['myVoices'],
    queryFn: () => voiceApi.getMyVoices().then(r => r.data),
  });

  const jobs = jobsData?.data || [];
  const voices = voicesData?.data || [];

  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const totalChars = jobs.reduce((sum, j) => sum + (j.total_characters || 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Chào, {profile?.display_name || 'bạn'} 👋
        </h1>
        <p className="text-gray-400 text-sm mt-0.5">
          Qwen3 TTS — Chuyển văn bản thành giọng nói chất lượng cao
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={AudioLines}
          label="Audio đã tạo"
          value={jobsData?.total || 0}
          color="primary"
        />
        <StatCard
          icon={Mic2}
          label="Giọng đã clone"
          value={voices.length}
          color="green"
        />
        <StatCard
          icon={History}
          label="Ký tự đã xử lý"
          value={profile?.total_characters_used?.toLocaleString() || '0'}
          color="purple"
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          to="/tts"
          className="card hover:border-primary-500/40 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center group-hover:bg-primary-500/30 transition-colors">
              <AudioLines className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-200">Tạo giọng nói</p>
              <p className="text-xs text-gray-500">Text-to-speech với 40+ giọng</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-600 ml-auto group-hover:text-primary-400 transition-colors" />
          </div>
        </Link>

        <Link
          to="/voice-clone"
          className="card hover:border-primary-500/40 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center group-hover:bg-green-500/30 transition-colors">
              <Mic2 className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-200">Nhân bản giọng</p>
              <p className="text-xs text-gray-500">Tạo voiceprint từ mẫu âm thanh</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-600 ml-auto group-hover:text-green-400 transition-colors" />
          </div>
        </Link>
      </div>

      {/* Recent jobs */}
      {jobs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-200">Audio gần đây</h2>
            <Link to="/history" className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
              Xem tất cả <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {jobs.slice(0, 5).map(job => (
              <div key={job.id} className="card flex items-center gap-3 py-3">
                <JobStatusIcon status={job.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">
                    {job.job_title || job.voice_name || 'Audio'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: vi })}
                    {' · '}{job.total_characters?.toLocaleString()} ký tự
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    primary: 'bg-primary-500/15 text-primary-400',
    green: 'bg-green-500/15 text-green-400',
    purple: 'bg-purple-500/15 text-purple-400',
  };
  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg ${colors[color]} flex items-center justify-center`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-gray-400 mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  );
}

function JobStatusIcon({ status }) {
  if (status === 'completed') return <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />;
  if (status === 'failed') return <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
  if (status === 'processing') return <Loader className="w-4 h-4 text-yellow-400 animate-spin flex-shrink-0" />;
  return <Clock className="w-4 h-4 text-gray-500 flex-shrink-0" />;
}
