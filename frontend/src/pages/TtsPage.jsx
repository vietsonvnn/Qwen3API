import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ttsApi, voiceApi } from '../services/api';
import toast from 'react-hot-toast';
import {
  AudioLines, Play, Pause, Download, Loader,
  Mic2, User, Globe, Wand2, FileText, Subtitles,
} from 'lucide-react';

const POLL_INTERVAL = 2000;

export default function TtsPage() {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [language, setLanguage] = useState('auto');
  const [model, setModel] = useState('qwen3-tts-flash');
  const [jobTitle, setJobTitle] = useState('');
  const [activeJob, setActiveJob] = useState(null);
  const [playingJobId, setPlayingJobId] = useState(null);
  const audioRef = useRef(null);
  const pollRef = useRef(null);

  // Fetch system voices
  const { data: systemVoicesData } = useQuery({
    queryKey: ['systemVoices'],
    queryFn: () => voiceApi.getSystemVoices().then(r => r.data.data),
  });

  // Fetch cloned voices
  const { data: clonedVoicesData } = useQuery({
    queryKey: ['myVoices'],
    queryFn: () => voiceApi.getMyVoices().then(r => r.data.data),
  });

  // Fetch languages
  const { data: languages } = useQuery({
    queryKey: ['languages'],
    queryFn: () => ttsApi.getLanguages().then(r => r.data.data),
  });

  // Recent jobs
  const { data: recentJobs } = useQuery({
    queryKey: ['ttsJobs'],
    queryFn: () => ttsApi.getJobs({ limit: 10 }).then(r => r.data.data),
    refetchInterval: activeJob ? POLL_INTERVAL : false,
  });

  // Generate mutation
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
    generateMutation.mutate({
      text: text.trim(),
      voiceId: selectedVoice.id,
      voiceName: selectedVoice.name,
      voiceType: selectedVoice.type || 'system',
      model,
      language,
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

  const charCount = text.length;
  const isGenerating = generateMutation.isPending || activeJob?.status === 'processing';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-dark-600">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <AudioLines className="w-5 h-5 text-primary-400" />
          Chuyển văn bản thành giọng nói
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Powered by Alibaba Cloud Qwen3 TTS</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Voice + Settings */}
        <div className="w-72 flex-shrink-0 border-r border-dark-600 flex flex-col overflow-y-auto p-4 space-y-4">
          {/* Voice Selector */}
          <div>
            <label className="label flex items-center gap-1">
              <Mic2 className="w-3.5 h-3.5" /> Giọng đọc
            </label>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {clonedVoicesData?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <User className="w-3 h-3" /> Giọng của bạn
                  </p>
                  {clonedVoicesData.map(v => (
                    <VoiceItem
                      key={v.id}
                      name={v.name}
                      sub={v.language}
                      selected={selectedVoice?.id === v.qwen_voice_id}
                      onClick={() => setSelectedVoice({ id: v.qwen_voice_id, name: v.name, type: 'cloned' })}
                      badge="Clone"
                    />
                  ))}
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500 mb-1">Giọng hệ thống</p>
                {(systemVoicesData || []).map(v => (
                  <VoiceItem
                    key={v.id}
                    name={v.name}
                    sub={v.description}
                    selected={selectedVoice?.id === v.id}
                    onClick={() => setSelectedVoice({ id: v.id, name: v.name, type: 'system' })}
                    gender={v.gender}
                  />
                ))}
              </div>
            </div>
          </div>

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

          {/* Model */}
          <div>
            <label className="label flex items-center gap-1">
              <Wand2 className="w-3.5 h-3.5" /> Model
            </label>
            <select value={model} onChange={e => setModel(e.target.value)} className="select text-sm">
              <option value="qwen3-tts-flash">Qwen3 Flash (Nhanh)</option>
              <option value="qwen3-tts-vc" disabled>Qwen3 Voice Clone (Chọn giọng clone)</option>
            </select>
          </div>

          {/* Job Title */}
          <div>
            <label className="label flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> Tiêu đề (tuỳ chọn)
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
              className="input text-sm"
              placeholder="Tên cho audio này..."
            />
          </div>
        </div>

        {/* Center: Text + Result */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
          {/* Text area */}
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <label className="label m-0">Văn bản</label>
              <span className={`text-xs ${charCount > 45000 ? 'text-red-400' : 'text-gray-500'}`}>
                {charCount.toLocaleString()} / 50,000
              </span>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              className="input flex-1 resize-none font-[inherit] text-sm leading-relaxed"
              placeholder="Nhập văn bản cần chuyển thành giọng nói...&#10;&#10;Hỗ trợ nhiều ngôn ngữ: Tiếng Việt, Tiếng Anh, Tiếng Trung, Nhật, Hàn, Pháp, Đức và nhiều ngôn ngữ khác."
              maxLength={50000}
            />
          </div>

          {/* Generate button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !text.trim() || !selectedVoice}
              className="btn-primary flex-1 justify-center py-3 text-base"
            >
              {isGenerating ? (
                <><Loader className="w-4 h-4 animate-spin" /> Đang tạo...</>
              ) : (
                <><AudioLines className="w-4 h-4" /> Tạo giọng nói</>
              )}
            </button>
          </div>

          {/* Active job result */}
          {activeJob && (
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-200">
                  {activeJob.job_title || activeJob.voice_name || 'Audio'}
                </span>
                <StatusBadge status={activeJob.status} progress={activeJob.progress_percent} />
              </div>

              {activeJob.status === 'processing' && (
                <div className="w-full bg-dark-600 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-500"
                    style={{ width: `${activeJob.progress_percent || 10}%` }}
                  />
                </div>
              )}

              {activeJob.status === 'completed' && activeJob.output_url && (
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => handlePlay(activeJob)}
                    className="btn-secondary gap-1 text-sm py-1.5"
                  >
                    {playingJobId === activeJob.id
                      ? <><Pause className="w-3.5 h-3.5" /> Dừng</>
                      : <><Play className="w-3.5 h-3.5" /> Nghe</>}
                  </button>
                  <a href={activeJob.output_url} download className="btn-secondary gap-1 text-sm py-1.5">
                    <Download className="w-3.5 h-3.5" /> Tải MP3
                  </a>
                  {activeJob.segments?.length > 0 && (
                    <a
                      href={ttsApi.downloadSrtUrl(activeJob.id)}
                      download
                      className="btn-secondary gap-1 text-sm py-1.5"
                      title="Tải phụ đề SRT"
                    >
                      <Subtitles className="w-3.5 h-3.5" /> SRT
                    </a>
                  )}
                  {activeJob.output_duration_seconds && (
                    <span className="text-xs text-gray-500 ml-auto">
                      {Math.round(activeJob.output_duration_seconds)}s
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Recent jobs */}
        <div className="w-72 flex-shrink-0 border-l border-dark-600 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-dark-600">
            <h2 className="text-sm font-medium text-gray-300">Gần đây</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {(recentJobs || []).map(job => (
              <div key={job.id} className="p-3 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">
                      {job.job_title || job.voice_name || 'Audio'}
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {job.total_characters?.toLocaleString()} ký tự
                    </p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
                {job.status === 'completed' && job.output_url && (
                  <div className="flex gap-1 mt-2">
                    <button
                      onClick={() => handlePlay(job)}
                      className="text-xs btn-ghost px-2 py-1"
                    >
                      {playingJobId === job.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                    <a href={job.output_url} download className="text-xs btn-ghost px-2 py-1">
                      <Download className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            ))}
            {!recentJobs?.length && (
              <p className="text-xs text-gray-500 text-center py-8">Chưa có audio nào</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VoiceItem({ name, sub, selected, onClick, badge, gender }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors mb-1 ${
        selected ? 'bg-primary-500/20 border border-primary-500/40' : 'hover:bg-dark-700'
      }`}
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
        gender === 'female' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
      } ${!gender ? 'bg-primary-500/20 text-primary-400' : ''}`}>
        {name[0]}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`font-medium truncate ${selected ? 'text-primary-300' : 'text-gray-200'}`}>{name}</p>
        {sub && <p className="text-xs text-gray-500 truncate">{sub}</p>}
      </div>
      {badge && <span className="badge badge-info text-xs flex-shrink-0">{badge}</span>}
    </button>
  );
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
    processing: progress ? `${progress}%` : 'Đang xử lý',
    completed: 'Hoàn thành',
    failed: 'Thất bại',
  };
  return (
    <span className={map[status] || 'badge-neutral'}>
      {status === 'processing' && <Loader className="w-2.5 h-2.5 animate-spin" />}
      {labels[status] || status}
    </span>
  );
}
