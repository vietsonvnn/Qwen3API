import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ttsApi, voiceApi, downloadSrtFile } from '../services/api';
import toast from 'react-hot-toast';
import {
  AudioLines, Play, Pause, Download, Loader,
  Mic2, User, Globe, Wand2, FileText, Subtitles,
  Layers, Clock, AlertCircle,
} from 'lucide-react';

const POLL_INTERVAL = 2000;

export default function TtsPage() {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [language, setLanguage] = useState('auto');
  const [jobTitle, setJobTitle] = useState('');
  const [activeJob, setActiveJob] = useState(null);
  const [playingJobId, setPlayingJobId] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const audioRef = useRef(null);
  const pollRef = useRef(null);

  const { data: systemVoicesData } = useQuery({
    queryKey: ['systemVoices'],
    queryFn: () => voiceApi.getSystemVoices().then(r => r.data.data),
  });

  const { data: clonedVoicesData } = useQuery({
    queryKey: ['myVoices'],
    queryFn: () => voiceApi.getMyVoices().then(r => r.data.data),
  });

  const { data: languages } = useQuery({
    queryKey: ['languages'],
    queryFn: () => ttsApi.getLanguages().then(r => r.data.data),
  });

  const { data: recentJobs } = useQuery({
    queryKey: ['ttsJobs'],
    queryFn: () => ttsApi.getJobs({ limit: 10 }).then(r => r.data.data),
    refetchInterval: activeJob ? POLL_INTERVAL : false,
  });

  // Debounced estimate — show batch count
  useEffect(() => {
    if (!text.trim()) { setEstimate(null); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await ttsApi.estimate(text.trim());
        setEstimate(data.data);
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [text]);

  const generateMutation = useMutation({
    mutationFn: (data) => ttsApi.generate(data),
    onSuccess: ({ data }) => {
      const job = data.data;
      setActiveJob(job);
      toast.success('Đang tạo audio...');
      queryClient.invalidateQueries({ queryKey: ['ttsJobs'] });
      startPolling(job.id);
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Tạo thất bại');
    },
  });

  const startPolling = (jobId) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await ttsApi.getJob(jobId);
        const job = data.data;
        setActiveJob(job);
        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(pollRef.current);
          queryClient.invalidateQueries({ queryKey: ['ttsJobs'] });
          if (job.status === 'completed') toast.success('Audio đã sẵn sàng!');
          else toast.error(`Thất bại: ${job.error_message}`);
        }
      } catch { clearInterval(pollRef.current); }
    }, POLL_INTERVAL);
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const handleGenerate = () => {
    if (!text.trim()) return toast.error('Nhập văn bản trước');
    if (!selectedVoice) return toast.error('Chọn giọng đọc');
    const model = selectedVoice.type === 'cloned' ? 'qwen3-tts-vc-2026-01-22' : 'qwen3-tts-flash';
    generateMutation.mutate({
      text: text.trim(), voiceId: selectedVoice.id, voiceName: selectedVoice.name,
      voiceType: selectedVoice.type || 'system', model, language,
      jobTitle: jobTitle || undefined,
    });
  };

  const handlePlay = (job) => {
    if (!job.output_url) return;
    if (playingJobId === job.id) {
      audioRef.current?.pause();
      setPlayingJobId(null);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    audioRef.current = new Audio(job.output_url);
    audioRef.current.play();
    audioRef.current.onended = () => setPlayingJobId(null);
    setPlayingJobId(job.id);
  };

  const handleDownloadSrt = async (job) => {
    try {
      await downloadSrtFile(job.id, job.job_title || job.voice_name);
    } catch {
      toast.error('Không thể tải file SRT');
    }
  };

  const charCount = text.length;
  const isGenerating = generateMutation.isPending || activeJob?.status === 'processing';
  const isClonedVoice = selectedVoice?.type === 'cloned';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-dark-600 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <AudioLines className="w-5 h-5 text-primary-400" />
            Text-to-Speech
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Qwen3 · {(systemVoicesData?.length || 0) + (clonedVoicesData?.length || 0)} giọng khả dụng
          </p>
        </div>
        {estimate && text.trim() && (
          <div className="flex items-center gap-2 bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5">
            <Layers className="w-3.5 h-3.5 text-primary-400" />
            <span className="text-xs text-gray-300">
              <span className="font-medium text-white">{estimate.batches}</span> batch ·
              <span className="font-medium text-white ml-1">{estimate.characters.toLocaleString()}</span> ký tự
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Voice + Settings */}
        <div className="w-64 flex-shrink-0 border-r border-dark-600 flex flex-col overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Voice Selector */}
            <div>
              <label className="label flex items-center gap-1 mb-2">
                <Mic2 className="w-3.5 h-3.5" /> Giọng đọc
              </label>
              <div className="max-h-60 overflow-y-auto space-y-3 pr-0.5">
                {clonedVoicesData?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide mb-1.5 flex items-center gap-1 px-1">
                      <User className="w-3 h-3" /> Của bạn
                    </p>
                    {clonedVoicesData.map(v => (
                      <VoiceItem
                        key={v.id}
                        name={v.name}
                        sub={`${v.times_used || 0} lần dùng`}
                        selected={selectedVoice?.id === v.qwen_voice_id}
                        onClick={() => setSelectedVoice({ id: v.qwen_voice_id, name: v.name, type: 'cloned' })}
                        badge="Clone"
                        color="primary"
                      />
                    ))}
                  </div>
                )}
                <div>
                  {clonedVoicesData?.length > 0 && (
                    <p className="text-xs text-gray-600 uppercase tracking-wide mb-1.5 px-1">Hệ thống</p>
                  )}
                  {(systemVoicesData || []).map(v => (
                    <VoiceItem
                      key={v.id}
                      name={v.name}
                      sub={v.description}
                      selected={selectedVoice?.id === v.id}
                      onClick={() => setSelectedVoice({ id: v.id, name: v.name, type: 'system' })}
                      color={v.gender === 'female' ? 'pink' : 'blue'}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Smart hint for cloned voice */}
            {isClonedVoice && (
              <div className="flex items-start gap-2 px-3 py-2 bg-primary-500/10 border border-primary-500/20 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 text-primary-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-primary-300 leading-relaxed">
                  Tự dùng model <span className="font-semibold">vc-2026</span> cho giọng clone
                </p>
              </div>
            )}

            {/* Language */}
            <div>
              <label className="label flex items-center gap-1">
                <Globe className="w-3.5 h-3.5" /> Ngôn ngữ
              </label>
              <select value={language} onChange={e => setLanguage(e.target.value)} className="select text-sm">
                {(languages || [{ id: 'auto', name: 'Tự động' }]).map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Model (auto-selected, read-only) */}
            <div>
              <label className="label flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5" /> Model
              </label>
              <div className="px-3 py-2 bg-dark-700/50 border border-dark-600 rounded-lg text-sm text-gray-400 font-mono">
                {isClonedVoice ? 'qwen3-tts-vc' : 'qwen3-tts-flash'}
              </div>
            </div>

            {/* Job Title */}
            <div>
              <label className="label flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Tiêu đề
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                className="input text-sm"
                placeholder="Tên audio (tuỳ chọn)"
              />
            </div>
          </div>
        </div>

        {/* Center: Text + Generate + Result */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
          {/* Text area */}
          <div className="flex-1 flex flex-col min-h-0">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              className="input flex-1 resize-none text-sm leading-relaxed min-h-0"
              placeholder={'Nhập văn bản cần chuyển thành giọng nói...\n\nHỗ trợ: Tiếng Việt, Anh, Trung, Nhật, Hàn, Pháp, Đức...'}
              maxLength={50000}
            />
            <div className="flex items-center justify-between mt-1.5 px-0.5">
              <span className="text-xs text-gray-600">
                {estimate
                  ? `~${estimate.batches} lần gọi API · ${estimate.characters.toLocaleString()} ký tự`
                  : 'Nhập văn bản để xem ước tính batch'}
              </span>
              <span className={`text-xs ${charCount > 45000 ? 'text-red-400 font-medium' : 'text-gray-600'}`}>
                {charCount.toLocaleString()} / 50,000
              </span>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !text.trim() || !selectedVoice}
            className="btn-primary justify-center py-3 text-sm w-full flex-shrink-0"
          >
            {isGenerating
              ? <><Loader className="w-4 h-4 animate-spin" /> Đang tạo audio...</>
              : <><AudioLines className="w-4 h-4" />
                  Tạo giọng nói{selectedVoice ? ` · ${selectedVoice.name}` : ''}</>
            }
          </button>

          {/* Active job result */}
          {activeJob && (
            <div className="card p-3 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot status={activeJob.status} />
                  <span className="text-sm font-medium text-gray-200 truncate">
                    {activeJob.job_title || activeJob.voice_name || 'Audio'}
                  </span>
                </div>
                <StatusBadge status={activeJob.status} progress={activeJob.progress_percent} />
              </div>

              {activeJob.status === 'processing' && (
                <div className="w-full bg-dark-600 rounded-full h-1 overflow-hidden mb-2">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-700"
                    style={{ width: `${activeJob.progress_percent || 10}%` }}
                  />
                </div>
              )}

              {activeJob.status === 'completed' && activeJob.output_url && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => handlePlay(activeJob)} className="btn-secondary gap-1.5 text-xs py-1.5 px-3">
                    {playingJobId === activeJob.id
                      ? <><Pause className="w-3.5 h-3.5" /> Dừng</>
                      : <><Play className="w-3.5 h-3.5" /> Nghe</>}
                  </button>
                  <a href={activeJob.output_url} download className="btn-secondary gap-1.5 text-xs py-1.5 px-3">
                    <Download className="w-3.5 h-3.5" /> MP3
                  </a>
                  {activeJob.segments?.length > 0 && (
                    <button
                      onClick={() => handleDownloadSrt(activeJob)}
                      className="btn-secondary gap-1.5 text-xs py-1.5 px-3"
                    >
                      <Subtitles className="w-3.5 h-3.5" /> SRT
                    </button>
                  )}
                  {activeJob.output_duration_seconds && (
                    <span className="text-xs text-gray-500 ml-auto flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {Math.round(activeJob.output_duration_seconds)}s
                    </span>
                  )}
                </div>
              )}

              {activeJob.status === 'failed' && (
                <p className="text-xs text-red-400 mt-1">{activeJob.error_message}</p>
              )}
            </div>
          )}
        </div>

        {/* Right: Recent jobs */}
        <div className="w-72 flex-shrink-0 border-l border-dark-600 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-200">Gần đây</h2>
            {recentJobs?.length > 0 && (
              <span className="text-xs text-gray-500">{recentJobs.length}</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {(recentJobs || []).map(job => (
              <RecentJobCard
                key={job.id}
                job={job}
                isPlaying={playingJobId === job.id}
                onPlay={() => handlePlay(job)}
                onDownloadSrt={() => handleDownloadSrt(job)}
              />
            ))}
            {!recentJobs?.length && (
              <div className="text-center py-12">
                <AudioLines className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">Chưa có audio nào</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentJobCard({ job, isPlaying, onPlay, onDownloadSrt }) {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 hover:border-dark-500 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusDot status={job.status} />
          <p className="text-sm font-medium text-gray-200 truncate">
            {job.job_title || job.voice_name || 'Audio'}
          </p>
        </div>
        <StatusBadge status={job.status} />
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
        <span>{job.total_characters?.toLocaleString()} ký tự</span>
        {job.output_duration_seconds && (
          <>
            <span className="text-gray-700">·</span>
            <span className="flex items-center gap-0.5">
              <Clock className="w-3 h-3" />{Math.round(job.output_duration_seconds)}s
            </span>
          </>
        )}
      </div>
      {job.status === 'completed' && job.output_url && (
        <div className="flex items-center gap-1">
          <button onClick={onPlay} className="btn-ghost p-1.5" title={isPlaying ? 'Dừng' : 'Nghe'}>
            {isPlaying
              ? <Pause className="w-3.5 h-3.5 text-primary-400" />
              : <Play className="w-3.5 h-3.5" />}
          </button>
          <a href={job.output_url} download className="btn-ghost p-1.5" title="Tải MP3">
            <Download className="w-3.5 h-3.5" />
          </a>
          {job.segments?.length > 0 && (
            <button
              onClick={onDownloadSrt}
              className="btn-ghost p-1.5 text-gray-500 hover:text-primary-400"
              title="Tải SRT"
            >
              <Subtitles className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      {job.status === 'failed' && (
        <p className="text-xs text-red-400 truncate mt-1">{job.error_message}</p>
      )}
    </div>
  );
}

function VoiceItem({ name, sub, selected, onClick, badge, color = 'blue' }) {
  const colorMap = {
    primary: 'bg-primary-500/20 text-primary-400',
    blue: 'bg-blue-500/20 text-blue-400',
    pink: 'bg-pink-500/20 text-pink-400',
  };
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors mb-1 ${
        selected
          ? 'bg-primary-500/15 border border-primary-500/30'
          : 'hover:bg-dark-700'
      }`}
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${colorMap[color]}`}>
        {name[0]}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`font-medium truncate leading-tight ${selected ? 'text-primary-300' : 'text-gray-200'}`}>{name}</p>
        {sub && <p className="text-xs text-gray-500 truncate">{sub}</p>}
      </div>
      {badge && <span className="badge badge-info text-xs flex-shrink-0">{badge}</span>}
    </button>
  );
}

function StatusDot({ status }) {
  const map = {
    completed: 'bg-green-400',
    failed: 'bg-red-400',
    processing: 'bg-yellow-400 animate-pulse',
    pending: 'bg-gray-500',
  };
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${map[status] || 'bg-gray-500'}`} />;
}

function StatusBadge({ status, progress }) {
  const map = {
    pending: 'badge-neutral',
    processing: 'badge-warning',
    completed: 'badge-success',
    failed: 'badge-error',
  };
  const labels = { pending: 'Chờ', processing: progress ? `${progress}%` : 'Đang xử lý', completed: 'Xong', failed: 'Lỗi' };
  return (
    <span className={`${map[status] || 'badge-neutral'} text-xs`}>
      {status === 'processing' && <Loader className="w-2.5 h-2.5 animate-spin" />}
      {labels[status] || status}
    </span>
  );
}
