import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ttsApi, downloadSrtFile } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import toast from 'react-hot-toast';
import {
  History, Play, Pause, Download, Trash2, Loader,
  CheckCircle, XCircle, Clock, AudioLines, Subtitles, Filter,
} from 'lucide-react';

const STATUS_FILTERS = [
  { value: '', label: 'Tất cả' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'processing', label: 'Đang xử lý' },
  { value: 'failed', label: 'Thất bại' },
];

const LIMIT = 20;

export default function HistoryPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['history', page, statusFilter],
    queryFn: () => ttsApi.getJobs({
      limit: LIMIT,
      offset: page * LIMIT,
      ...(statusFilter ? { status: statusFilter } : {}),
    }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (jobId) => ttsApi.deleteJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
      toast.success('Đã xoá');
    },
  });

  const handlePlay = (job) => {
    if (!job.output_url) return;
    if (playingId === job.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    audioRef.current = new Audio(job.output_url);
    audioRef.current.play();
    audioRef.current.onended = () => setPlayingId(null);
    setPlayingId(job.id);
  };

  const handleDownloadSrt = async (job) => {
    try {
      await downloadSrtFile(job.id, job.job_title || job.voice_name);
    } catch {
      toast.error('Không thể tải file SRT');
    }
  };

  const handleFilterChange = (value) => {
    setStatusFilter(value);
    setPage(0);
  };

  const jobs = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-primary-400" />
            Lịch sử
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total > 0 ? `${total.toLocaleString()} audio` : 'Tất cả các audio đã tạo'}
          </p>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 bg-dark-800 border border-dark-600 rounded-xl p-1 flex-shrink-0">
          <Filter className="w-3.5 h-3.5 text-gray-500 ml-1.5 flex-shrink-0" />
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => handleFilterChange(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-dark-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader className="w-6 h-6 animate-spin text-primary-400" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="card text-center py-20">
          <AudioLines className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Không có audio nào</p>
          <p className="text-gray-600 text-sm mt-1">
            {statusFilter
              ? `Không có audio ở trạng thái "${STATUS_FILTERS.find(f => f.value === statusFilter)?.label}"`
              : 'Tạo audio đầu tiên ở trang TTS'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {jobs.map(job => (
              <HistoryCard
                key={job.id}
                job={job}
                isPlaying={playingId === job.id}
                onPlay={() => handlePlay(job)}
                onDownloadSrt={() => handleDownloadSrt(job)}
                onDelete={() => { if (confirm('Xoá audio này?')) deleteMutation.mutate(job.id); }}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary px-4 py-1.5 text-sm"
              >
                Trước
              </button>
              <span className="text-sm text-gray-400">
                Trang <span className="text-white font-medium">{page + 1}</span> / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary px-4 py-1.5 text-sm"
              >
                Sau
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HistoryCard({ job, isPlaying, onPlay, onDownloadSrt, onDelete }) {
  return (
    <div className="card hover:border-dark-500 transition-colors">
      <div className="flex items-center gap-4">
        {/* Status icon */}
        <div className="flex-shrink-0">
          {job.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-400" />}
          {job.status === 'failed' && <XCircle className="w-5 h-5 text-red-400" />}
          {(job.status === 'processing' || job.status === 'pending') && (
            <Loader className="w-5 h-5 text-yellow-400 animate-spin" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-gray-200 truncate">
              {job.job_title || job.voice_name || 'Audio'}
            </p>
            {job.voice_type === 'cloned' && (
              <span className="badge badge-info text-xs flex-shrink-0">Clone</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: vi })}
            </span>
            <span className="text-xs text-gray-600">
              {job.total_characters?.toLocaleString()} ký tự
            </span>
            {job.output_duration_seconds && (
              <span className="text-xs text-gray-600">
                {Math.round(job.output_duration_seconds)}s
              </span>
            )}
            {job.output_file_size_bytes && (
              <span className="text-xs text-gray-600">
                {(job.output_file_size_bytes / 1024 / 1024).toFixed(1)} MB
              </span>
            )}
          </div>
          {job.status === 'failed' && job.error_message && (
            <p className="text-xs text-red-400 mt-1 truncate">{job.error_message}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {job.status === 'completed' && job.output_url && (
            <>
              <button onClick={onPlay} className="btn-ghost p-2" title={isPlaying ? 'Dừng' : 'Nghe'}>
                {isPlaying
                  ? <Pause className="w-4 h-4 text-primary-400" />
                  : <Play className="w-4 h-4" />}
              </button>
              <a href={job.output_url} download className="btn-ghost p-2" title="Tải MP3">
                <Download className="w-4 h-4" />
              </a>
              {job.segments?.length > 0 && (
                <button
                  onClick={onDownloadSrt}
                  className="btn-ghost p-2 text-gray-500 hover:text-primary-400"
                  title="Tải phụ đề SRT"
                >
                  <Subtitles className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          <button
            onClick={onDelete}
            className="btn-ghost p-2 text-gray-600 hover:text-red-400"
            title="Xoá"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
