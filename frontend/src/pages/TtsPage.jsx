import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ttsApi, voiceApi, downloadSrtFile } from '../services/api';
import toast from 'react-hot-toast';
import mammoth from 'mammoth';
import {
  AudioLines, Play, Pause, Download, Loader,
  Globe, Wand2, Subtitles, Layers, Clock,
  FileText, Upload,
} from 'lucide-react';

const POLL_INTERVAL = 2000;

export default function TtsPage() {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [language, setLanguage] = useState('auto');
  const [jobTitle, setJobTitle] = useState('');
  const [voiceFilter, setVoiceFilter] = useState('all'); // 'all' | 'female' | 'male'
  const [activeJob, setActiveJob] = useState(null);
  const [playingJobId, setPlayingJobId] = useState(null);
  const [previewingId, setPreviewingId] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const audioRef = useRef(null);
  const previewAudioRef = useRef(null);
  const pollRef = useRef(null);
  const fileInputRef = useRef(null);

  const { data: systemVoicesData } = useQuery({
    queryKey: ['systemVoices'],
    queryFn: () => voiceApi.getSystemVoices().then(r => r.data.data),
    staleTime: 10 * 60 * 1000,
  });

  const { data: clonedVoicesData } = useQuery({
    queryKey: ['myVoices'],
    queryFn: () => voiceApi.getMyVoices().then(r => r.data.data),
    staleTime: 2 * 60 * 1000,
  });

  const { data: languages } = useQuery({
    queryKey: ['languages'],
    queryFn: () => ttsApi.getLanguages().then(r => r.data.data),
    staleTime: 60 * 60 * 1000,
  });

  const { data: recentJobs } = useQuery({
    queryKey: ['ttsJobs'],
    queryFn: () => ttsApi.getJobs({ limit: 12 }).then(r => r.data.data),
    refetchInterval: activeJob ? POLL_INTERVAL : false,
    staleTime: 30 * 1000,
  });

  // Debounced estimate
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

  const handleVoicePreview = async (e, voiceId) => {
    e.stopPropagation();
    if (previewingId === voiceId) {
      previewAudioRef.current?.pause();
      setPreviewingId(null);
      return;
    }
    setPreviewingId(voiceId);
    try {
      const { data } = await ttsApi.systemPreview(voiceId);
      const audio = new Audio(data.data.audio);
      previewAudioRef.current?.pause();
      previewAudioRef.current = audio;
      audio.play();
      audio.onended = () => setPreviewingId(null);
    } catch {
      toast.error('Không thể preview giọng này');
      setPreviewingId(null);
    }
  };

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

  // File upload: .txt or .docx → fill textarea
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const ext = file.name.split('.').pop().toLowerCase();
    const baseName = file.name.replace(/\.[^.]+$/, '');

    try {
      let extracted = '';

      if (ext === 'txt') {
        extracted = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.onerror = reject;
          reader.readAsText(file, 'UTF-8');
        });
      } else if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawValue({ arrayBuffer });
        extracted = result.value;
      } else {
        return toast.error('Chỉ hỗ trợ file .txt và .docx');
      }

      const trimmed = extracted.trim();
      if (!trimmed) return toast.error('File trống hoặc không đọc được nội dung');

      setText(trimmed);
      if (!jobTitle) setJobTitle(baseName);
      toast.success(`Đã tải: ${file.name} (${trimmed.length.toLocaleString()} ký tự)`);
    } catch {
      toast.error('Không thể đọc file, thử lại');
    }
  };

  // Build voice list with gender metadata
  const clonedVoices = (clonedVoicesData || []).map(v => ({
    id: v.qwen_voice_id, name: v.name, type: 'cloned',
    sub: `${v.times_used || 0} lần dùng`, gender: 'cloned',
  }));

  const systemVoices = (systemVoicesData || []).map(v => ({
    id: v.id, name: v.name, type: 'system',
    sub: v.description, gender: v.gender || 'male',
  }));

  const allVoices = [...clonedVoices, ...systemVoices];

  const filteredVoices = voiceFilter === 'all'
    ? allVoices
    : voiceFilter === 'female'
      ? allVoices.filter(v => v.gender === 'female')
      : allVoices.filter(v => v.gender === 'male' || v.gender === 'cloned');

  const charCount = text.length;
  const isGenerating = generateMutation.isPending || activeJob?.status === 'processing';
  const isClonedVoice = selectedVoice?.type === 'cloned';
  const modelLabel = isClonedVoice ? 'qwen3-tts-vc' : 'qwen3-tts-flash';

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Voice picker ── */}
      <div className="flex-shrink-0 bg-dark-800 border-b border-dark-600">
        {/* Header with filter tabs */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex-1">
            Chọn giọng đọc
            {selectedVoice && (
              <span className="ml-2 text-primary-400 font-normal normal-case">· {selectedVoice.name}</span>
            )}
          </span>
          <div className="flex gap-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'female', label: '♀ Female' },
              { key: 'male', label: '♂ Male' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setVoiceFilter(f.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  voiceFilter === f.key
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Voice grid — wraps, max 144px height with scroll */}
        <div className="flex flex-wrap gap-1.5 px-4 pb-3 max-h-36 overflow-y-auto scrollbar-hide">
          {allVoices.length === 0
            ? Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="skeleton w-[72px] h-[72px] rounded-xl" />
              ))
            : filteredVoices.map(v => (
                <VoiceCard
                  key={v.id}
                  voice={v}
                  selected={selectedVoice?.id === v.id}
                  onClick={() => setSelectedVoice(v)}
                  onPreview={(e) => handleVoicePreview(e, v.id)}
                  isPreviewing={previewingId === v.id}
                />
              ))
          }
        </div>
      </div>

      {/* ── Main 2-col ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: upload + textarea + settings + generate */}
        <div className="flex-1 flex flex-col p-4 gap-2.5 min-w-0 overflow-hidden">

          {/* Top row: file upload + job title */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary gap-1.5 text-xs px-3 py-1.5 flex-shrink-0"
              title="Upload .txt hoặc .docx"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.docx"
              className="hidden"
              onChange={handleFileUpload}
            />
            <div className="flex items-center gap-1.5 bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-1.5 flex-1">
              <FileText className="w-3 h-3 text-gray-500 flex-shrink-0" />
              <input
                type="text"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                className="bg-transparent text-xs text-gray-300 placeholder-gray-600 focus:outline-none w-full"
                placeholder="Tiêu đề (tuỳ chọn)"
              />
            </div>
          </div>

          {/* Textarea — fixed height 192px */}
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className="input resize-none text-sm leading-relaxed h-48 flex-shrink-0"
            placeholder={'Nhập văn bản hoặc upload file .txt / .docx...\n\nTiếng Việt: chọn ngôn ngữ "Tự động"'}
            maxLength={50000}
          />

          {/* Settings + generate row */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {/* Language */}
            <div className="flex items-center gap-1.5 bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5">
              <Globe className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="bg-transparent text-xs text-gray-300 focus:outline-none cursor-pointer"
              >
                {(languages || [{ id: 'auto', name: 'Tự động' }]).map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Model badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-dark-700 border border-dark-600 rounded-lg">
              <Wand2 className="w-3 h-3 text-gray-500" />
              <span className="text-xs text-gray-500 font-mono">{modelLabel}</span>
            </div>

            {/* Char/batch count */}
            <div className="text-xs text-gray-600 flex items-center gap-1.5">
              {estimate ? (
                <>
                  <Layers className="w-3 h-3 text-primary-500" />
                  <span className="text-primary-400 font-medium">{estimate.batches}</span>
                  <span>batch ·</span>
                  <span className="text-gray-400">{estimate.characters.toLocaleString()} ký tự</span>
                </>
              ) : (
                <span className={charCount > 45000 ? 'text-red-400 font-medium' : ''}>
                  {charCount.toLocaleString()} / 50,000
                </span>
              )}
            </div>

            {/* Generate button — right-aligned */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !text.trim() || !selectedVoice}
              className="btn-primary ml-auto px-5 py-2 text-sm gap-2"
            >
              {isGenerating
                ? <><Loader className="w-4 h-4 animate-spin" /> Đang tạo...</>
                : <><AudioLines className="w-4 h-4" /> Tạo giọng nói</>
              }
            </button>
          </div>
        </div>

        {/* Right: output + recent */}
        <div className="w-80 flex-shrink-0 border-l border-dark-600 flex flex-col overflow-hidden">

          {/* Active result */}
          <div className="flex-shrink-0 border-b border-dark-600 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Kết quả</p>
            {activeJob ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot status={activeJob.status} />
                  <span className="text-sm font-medium text-gray-200 truncate flex-1">
                    {activeJob.job_title || activeJob.voice_name || 'Audio'}
                  </span>
                  <StatusBadge status={activeJob.status} progress={activeJob.progress_percent} />
                </div>

                {activeJob.status === 'processing' && (
                  <div className="w-full bg-dark-600 rounded-full h-1 overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all duration-700"
                      style={{ width: `${activeJob.progress_percent || 15}%` }}
                    />
                  </div>
                )}

                {activeJob.status === 'completed' && activeJob.output_url && (
                  <div className="flex items-center gap-1.5 flex-wrap">
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
                      <span className="text-xs text-gray-500 flex items-center gap-1 ml-auto">
                        <Clock className="w-3 h-3" /> {Math.round(activeJob.output_duration_seconds)}s
                      </span>
                    )}
                  </div>
                )}

                {activeJob.status === 'failed' && (
                  <p className="text-xs text-red-400">{activeJob.error_message}</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center py-5 text-center">
                <div className="w-12 h-12 rounded-2xl bg-dark-700 border border-dark-600 flex items-center justify-center mb-3">
                  <AudioLines className="w-5 h-5 text-gray-700" />
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Chọn giọng đọc và nhập văn bản<br />để bắt đầu tạo audio
                </p>
              </div>
            )}
          </div>

          {/* Recent jobs */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-dark-600 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Gần đây</p>
              {recentJobs?.length > 0 && (
                <span className="text-xs text-gray-700">{recentJobs.length}</span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
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
                <div className="text-center py-8">
                  <p className="text-xs text-gray-700">Chưa có audio nào</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function VoiceCard({ voice, selected, onClick, onPreview, isPreviewing }) {
  const colorMap = {
    female: { bg: 'rgba(236,72,153,0.15)', text: '#f9a8d4' },
    male:   { bg: 'rgba(59,130,246,0.15)', text: '#93c5fd' },
    cloned: { bg: 'rgba(79,115,248,0.2)',  text: '#7c9ef8' },
  };
  const c = colorMap[voice.gender] || colorMap.male;

  return (
    <div className="relative group w-[72px] flex-shrink-0">
      <button
        onClick={onClick}
        title={voice.sub}
        className={`w-full flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
          selected
            ? 'border-primary-500 bg-primary-500/10'
            : 'border-dark-600 bg-dark-700 hover:border-dark-500'
        }`}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: c.bg, color: c.text }}
        >
          {voice.name[0]}
        </div>
        <span className="text-[10px] font-medium text-gray-300 text-center leading-tight truncate w-full">
          {voice.name}
        </span>
        {voice.type === 'cloned'
          ? <span className="text-[9px] text-primary-400 font-medium leading-none">clone</span>
          : <span className="text-[9px] text-gray-600 leading-none truncate w-full text-center">{voice.sub}</span>
        }
      </button>
      {voice.type === 'system' && (
        <button
          onClick={onPreview}
          title={isPreviewing ? 'Dừng' : 'Nghe thử'}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {isPreviewing
            ? <Pause className="w-2.5 h-2.5 text-white" />
            : <Play className="w-2.5 h-2.5 text-white" />}
        </button>
      )}
    </div>
  );
}

function RecentJobCard({ job, isPlaying, onPlay, onDownloadSrt }) {
  return (
    <div className="card-sm hover:border-dark-500 transition-colors">
      <div className="flex items-center gap-1.5 mb-1.5">
        <StatusDot status={job.status} />
        <p className="text-xs font-medium text-gray-300 truncate flex-1">
          {job.job_title || job.voice_name || 'Audio'}
        </p>
        {job.output_duration_seconds && (
          <span className="text-xs text-gray-700 flex-shrink-0 flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />{Math.round(job.output_duration_seconds)}s
          </span>
        )}
      </div>

      {job.status === 'completed' && job.output_url && (
        <div className="flex items-center gap-0.5">
          <button onClick={onPlay} className="btn-ghost p-1.5 rounded-lg" title={isPlaying ? 'Dừng' : 'Nghe'}>
            {isPlaying
              ? <Pause className="w-3 h-3 text-primary-400" />
              : <Play className="w-3 h-3" />}
          </button>
          <a href={job.output_url} download className="btn-ghost p-1.5 rounded-lg" title="Tải MP3">
            <Download className="w-3 h-3" />
          </a>
          {job.segments?.length > 0 && (
            <button onClick={onDownloadSrt} className="btn-ghost p-1.5 rounded-lg hover:text-primary-400" title="Tải SRT">
              <Subtitles className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {job.status === 'processing' && (
        <div className="flex items-center gap-1.5 text-xs text-yellow-400">
          <Loader className="w-3 h-3 animate-spin" /> Đang xử lý...
        </div>
      )}

      {job.status === 'failed' && (
        <p className="text-xs text-red-400 truncate">{job.error_message || 'Thất bại'}</p>
      )}
    </div>
  );
}

function StatusDot({ status }) {
  const map = {
    completed: 'bg-green-400',
    failed: 'bg-red-400',
    processing: 'bg-yellow-400 animate-pulse',
    pending: 'bg-gray-600',
  };
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${map[status] || 'bg-gray-600'}`} />;
}

function StatusBadge({ status, progress }) {
  const map = {
    pending: 'badge-neutral',
    processing: 'badge-warning',
    completed: 'badge-success',
    failed: 'badge-error',
  };
  const labels = {
    pending: 'Chờ',
    processing: progress ? `${progress}%` : 'Xử lý',
    completed: 'Xong',
    failed: 'Lỗi',
  };
  return (
    <span className={`badge ${map[status] || 'badge-neutral'} text-xs`}>
      {status === 'processing' && <Loader className="w-2.5 h-2.5 animate-spin" />}
      {labels[status] || status}
    </span>
  );
}
