import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ttsApi } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import toast from 'react-hot-toast';
import {
  History, Play, Pause, Download, Trash2, Loader,
  CheckCircle, XCircle, AudioLines, Subtitles,
} from 'lucide-react';

export default function HistoryPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);
  const LIMIT = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['history', page],
    queryFn: () => ttsApi.getJobs({ limit: LIMIT, offset: page * LIMIT }).then(r => r.data),
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

  const jobs = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <History className="w-5 h-5 text-primary-400" />
          Lịch sử
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Tất cả các audio đã tạo</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader className="w-6 h-6 animate-spin text-primary-400" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="card text-center py-16">
          <AudioLines className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Chưa có audio nào được tạo</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {jobs.map(job => (
              <div key={job.id} className="card hover:border-dark-500 transition-colors">
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
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-200 truncate">
                        {job.job_title || job.voice_name || 'Audio'}
                      </p>
                      <span className="text-xs text-gray-600 flex-shrink-0">
                        {job.total_characters?.toLocaleString()} ký tự
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-500">
                        {formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: vi })}
                      </span>
                      {job.output_duration_seconds && (
                        <span className="text-xs text-gray-600">
                          {Math.round(job.output_duration_seconds)}s
                        </span>
                      )}
                      {job.model && (
                        <span className="text-xs text-gray-600">{job.model}</span>
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
                        <button onClick={() => handlePlay(job)} className="btn-ghost p-1.5">
                          {playingId === job.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <a href={job.output_url} download className="btn-ghost p-1.5" title="Tải MP3">
                          <Download className="w-4 h-4" />
                        </a>
                        {job.segments?.length > 0 && (
                          <a
                            href={ttsApi.downloadSrtUrl(job.id)}
                            download
                            className="btn-ghost p-1.5 text-gray-500 hover:text-primary-400"
                            title="Tải phụ đề SRT"
                          >
                            <Subtitles className="w-4 h-4" />
                          </a>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => { if (confirm('Xoá audio này?')) deleteMutation.mutate(job.id); }}
                      className="btn-ghost p-1.5 text-gray-600 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary px-3 py-1.5 text-sm"
              >
                Trước
              </button>
              <span className="flex items-center text-sm text-gray-400">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary px-3 py-1.5 text-sm"
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
