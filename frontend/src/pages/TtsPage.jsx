import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ttsApi, voiceApi, downloadSrtFile, downloadMp3File } from '../services/api';
import toast from 'react-hot-toast';
import mammoth from 'mammoth';
import {
  AudioLines, Play, Pause, Download, Loader,
  Globe, Subtitles, Clock, Upload, Search,
  ChevronDown, Volume2, X,
} from 'lucide-react';

const POLL_INTERVAL = 2000;

const LOCALE_OPTIONS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'zh', label: 'Trung' },
  { key: 'en', label: 'Anh' },
  { key: 'ja', label: 'Nhật' },
  { key: 'ko', label: 'Hàn' },
  { key: 'es', label: 'T.B.Nha' },
  { key: 'fr', label: 'Pháp' },
  { key: 'de', label: 'Đức' },
  { key: 'ru', label: 'Nga' },
  { key: 'it', label: 'Ý' },
  { key: 'pt', label: 'B.Đ.Nha' },
  { key: 'dialect', label: 'Phương ngữ' },
];

export default function TtsPage() {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [language, setLanguage] = useState('auto');
  const [jobTitle, setJobTitle] = useState('');
  const [voiceFilter, setVoiceFilter] = useState('all');
  const [localeFilter, setLocaleFilter] = useState('all');
  const [voiceSearch, setVoiceSearch] = useState('');
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [playingJobId, setPlayingJobId] = useState(null);
  const [previewingId, setPreviewingId] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const audioRef = useRef(null);
  const previewAudioRef = useRef(null);
  const pollRef = useRef(null);
  const fileInputRef = useRef(null);
  const voicePickerRef = useRef(null);

  // ── Data queries ──
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
    queryFn: () => ttsApi.getJobs({ limit: 20 }).then(r => r.data.data),
    refetchInterval: activeJob ? POLL_INTERVAL : false,
    staleTime: 30 * 1000,
  });

  // ── Debounced estimate ──
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

  // ── Close voice picker on outside click ──
  useEffect(() => {
    const handler = (e) => {
      if (voicePickerRef.current && !voicePickerRef.current.contains(e.target)) {
        setShowVoicePicker(false);
      }
    };
    if (showVoicePicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVoicePicker]);

  // ── Mutations & handlers ──
  const generateMutation = useMutation({
    mutationFn: (data) => ttsApi.generate(data),
    onSuccess: ({ data }) => {
      const job = data.data;
      setActiveJob(job);
      toast.success('Đang tạo audio...');
      queryClient.invalidateQueries({ queryKey: ['ttsJobs'] });
      startPolling(job.id);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Tạo thất bại'),
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

  const handleDownloadMp3 = async (job) => {
    try { await downloadMp3File(job.output_url, job.job_title || job.voice_name); }
    catch { toast.error('Không thể tải file MP3'); }
  };

  const handleDownloadSrt = async (job) => {
    try { await downloadSrtFile(job.id, job.job_title || job.voice_name); }
    catch { toast.error('Không thể tải file SRT'); }
  };

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
      if (!trimmed) return toast.error('File trống');
      setText(trimmed);
      if (!jobTitle) setJobTitle(baseName);
      toast.success(`Đã tải: ${file.name} (${trimmed.length.toLocaleString()} ký tự)`);
    } catch { toast.error('Không thể đọc file'); }
  };

  // ── Voice data ──
  const clonedVoices = (clonedVoicesData || []).map(v => ({
    id: v.qwen_voice_id, name: v.name, type: 'cloned',
    description: `Clone · ${v.times_used || 0} lần dùng`, gender: 'cloned',
  }));

  const systemVoices = (systemVoicesData || []).map(v => ({
    id: v.id, name: v.name, type: 'system',
    description: v.description, gender: v.gender || 'male',
    locale: v.locale || 'zh',
  }));

  const allVoices = [...clonedVoices, ...systemVoices];

  const filteredVoices = allVoices.filter(v => {
    if (voiceFilter === 'female' && v.gender !== 'female') return false;
    if (voiceFilter === 'male' && v.gender !== 'male' && v.gender !== 'cloned') return false;
    if (localeFilter !== 'all' && v.type === 'system' && v.locale !== localeFilter) return false;
    if (voiceSearch && !v.name.toLowerCase().includes(voiceSearch.toLowerCase())) return false;
    return true;
  });

  const charCount = text.length;
  const isGenerating = generateMutation.isPending || activeJob?.status === 'processing';

  // ── RENDER ──
  return (
    <div className="h-full flex overflow-hidden">

      {/* ════════ MAIN PANEL ════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="flex-1 flex flex-col p-5 gap-4 max-w-4xl w-full mx-auto">

          {/* ── Title + Upload toolbar ── */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
              className="flex-1 bg-transparent text-lg font-medium text-gray-100 placeholder-gray-600 focus:outline-none"
              placeholder="Tiêu đề audio..."
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary text-sm px-4 py-2"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.docx"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          {/* ── Text area ── */}
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className="input resize-none text-base leading-relaxed flex-1 min-h-[240px]"
            placeholder="Nhập văn bản cần chuyển thành giọng nói..."
            maxLength={50000}
          />

          {/* ── Voice selector ── */}
          <div className="relative" ref={voicePickerRef}>
            <button
              onClick={() => setShowVoicePicker(!showVoicePicker)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                showVoicePicker
                  ? 'border-primary-500/50 bg-dark-700'
                  : 'border-dark-600 bg-dark-800 hover:border-dark-500'
              }`}
            >
              {selectedVoice ? (
                <>
                  <GenderIcon gender={selectedVoice.gender} />
                  <span className="text-sm font-medium text-gray-100">{selectedVoice.name}</span>
                  <span className="text-sm text-gray-500">{selectedVoice.description}</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-5 h-5 text-gray-600" />
                  <span className="text-sm text-gray-500">Chọn giọng đọc...</span>
                </>
              )}
              <ChevronDown className={`w-4 h-4 text-gray-500 ml-auto transition-transform ${showVoicePicker ? 'rotate-180' : ''}`} />
            </button>

            {/* Voice picker dropdown */}
            {showVoicePicker && (
              <div className="absolute z-50 left-0 right-0 mt-2 bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl overflow-hidden"
                style={{ boxShadow: '0 12px 48px rgba(0,0,0,0.5)' }}>

                {/* Search + filters */}
                <div className="p-3 border-b border-dark-600 space-y-2.5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={voiceSearch}
                      onChange={e => setVoiceSearch(e.target.value)}
                      className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-primary-500/50"
                      placeholder="Tìm giọng..."
                      autoFocus
                    />
                    {voiceSearch && (
                      <button onClick={() => setVoiceSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Filter pills row */}
                  <div className="flex gap-1.5 flex-wrap">
                    {/* Gender */}
                    {[
                      { key: 'all', label: 'Tất cả' },
                      { key: 'female', label: 'Nữ' },
                      { key: 'male', label: 'Nam' },
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => setVoiceFilter(f.key)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          voiceFilter === f.key
                            ? 'bg-primary-500/20 text-primary-400'
                            : 'bg-dark-700 text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                    <span className="w-px h-5 bg-dark-600 self-center mx-0.5" />
                    {/* Locale */}
                    {LOCALE_OPTIONS.map(f => (
                      <button
                        key={f.key}
                        onClick={() => setLocaleFilter(f.key)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          localeFilter === f.key
                            ? 'bg-primary-500/20 text-primary-400'
                            : 'bg-dark-700 text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Voice list */}
                <div className="max-h-72 overflow-y-auto p-2">
                  {filteredVoices.length === 0 ? (
                    <div className="text-center py-8 text-sm text-gray-600">Không tìm thấy giọng nào</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1">
                      {filteredVoices.map(v => (
                        <button
                          key={v.id}
                          onClick={() => { setSelectedVoice(v); setShowVoicePicker(false); }}
                          className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                            selectedVoice?.id === v.id
                              ? 'bg-primary-500/10 border border-primary-500/30'
                              : 'hover:bg-dark-700 border border-transparent'
                          }`}
                        >
                          <GenderIcon gender={v.gender} size="sm" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-200 truncate">{v.name}</div>
                            <div className="text-xs text-gray-500 truncate">{v.description}</div>
                          </div>
                          {v.type === 'system' && (
                            <button
                              onClick={(e) => handleVoicePreview(e, v.id)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-dark-600 transition-all"
                              title="Nghe thử"
                            >
                              {previewingId === v.id
                                ? <Pause className="w-3.5 h-3.5 text-primary-400" />
                                : <Play className="w-3.5 h-3.5 text-gray-400" />}
                            </button>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Action bar ── */}
          <div className="flex items-center gap-3">
            {/* Language */}
            <div className="flex items-center gap-2 bg-dark-800 border border-dark-600 rounded-xl px-3 py-2.5">
              <Globe className="w-4 h-4 text-gray-500" />
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="bg-transparent text-sm text-gray-300 focus:outline-none cursor-pointer"
              >
                {(languages || [{ id: 'auto', name: 'Tự động' }]).map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Stats */}
            <div className="text-sm text-gray-500">
              {estimate ? (
                <span>{estimate.batches} batch · {estimate.characters.toLocaleString()} ký tự</span>
              ) : (
                <span className={charCount > 45000 ? 'text-red-400' : ''}>
                  {charCount > 0 ? `${charCount.toLocaleString()} ký tự` : ''}
                </span>
              )}
            </div>

            {/* Generate */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !text.trim() || !selectedVoice}
              className="btn-primary ml-auto px-6 py-2.5 text-sm"
            >
              {isGenerating
                ? <><Loader className="w-4 h-4 animate-spin" /> Đang tạo...</>
                : <><AudioLines className="w-4 h-4" /> Tạo giọng nói</>}
            </button>
          </div>

          {/* ── Active result ── */}
          {activeJob && (
            <div className="card">
              <div className="flex items-center gap-3">
                <StatusDot status={activeJob.status} />
                <span className="text-sm font-medium text-gray-200 truncate flex-1">
                  {activeJob.job_title || activeJob.voice_name || 'Audio'}
                </span>
                <StatusBadge status={activeJob.status} progress={activeJob.progress_percent} />
              </div>

              {activeJob.status === 'processing' && (
                <div className="mt-3 w-full bg-dark-600 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-700"
                    style={{ width: `${activeJob.progress_percent || 15}%` }}
                  />
                </div>
              )}

              {activeJob.status === 'completed' && activeJob.output_url && (
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => handlePlay(activeJob)} className="btn-secondary text-sm py-2 px-4">
                    {playingJobId === activeJob.id
                      ? <><Pause className="w-4 h-4" /> Dừng</>
                      : <><Play className="w-4 h-4" /> Nghe</>}
                  </button>
                  <button onClick={() => handleDownloadMp3(activeJob)} className="btn-secondary text-sm py-2 px-4">
                    <Download className="w-4 h-4" /> MP3
                  </button>
                  {activeJob.segments?.length > 0 && (
                    <button onClick={() => handleDownloadSrt(activeJob)} className="btn-secondary text-sm py-2 px-4">
                      <Subtitles className="w-4 h-4" /> SRT
                    </button>
                  )}
                  {activeJob.output_duration_seconds && (
                    <span className="text-sm text-gray-500 ml-auto flex items-center gap-1.5">
                      <Clock className="w-4 h-4" /> {Math.round(activeJob.output_duration_seconds)}s
                    </span>
                  )}
                </div>
              )}

              {activeJob.status === 'failed' && (
                <p className="mt-2 text-sm text-red-400">{activeJob.error_message}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ════════ HISTORY SIDEBAR ════════ */}
      <div className="w-80 flex-shrink-0 border-l border-dark-600 bg-dark-800/50 flex flex-col">
        <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">Lịch sử</h3>
          {recentJobs?.length > 0 && (
            <span className="text-xs text-gray-600">{recentJobs.length}</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {(recentJobs || []).map(job => (
            <HistoryCard
              key={job.id}
              job={job}
              isPlaying={playingJobId === job.id}
              isActive={activeJob?.id === job.id}
              onPlay={() => handlePlay(job)}
              onSelect={() => setActiveJob(job)}
              onDownloadMp3={() => handleDownloadMp3(job)}
              onDownloadSrt={() => handleDownloadSrt(job)}
            />
          ))}
          {!recentJobs?.length && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AudioLines className="w-8 h-8 text-gray-700 mb-3" />
              <p className="text-sm text-gray-600">Chưa có audio nào</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SUB-COMPONENTS
   ══════════════════════════════════════════ */

function GenderIcon({ gender, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  const colors = {
    female: { bg: 'bg-pink-500/15', text: 'text-pink-400' },
    male:   { bg: 'bg-blue-500/15', text: 'text-blue-400' },
    cloned: { bg: 'bg-primary-500/15', text: 'text-primary-400' },
  };
  const c = colors[gender] || colors.male;
  const label = gender === 'female' ? '♀' : gender === 'cloned' ? '~' : '♂';

  return (
    <div className={`${sizeClass} ${c.bg} ${c.text} rounded-full flex items-center justify-center font-bold flex-shrink-0`}>
      {label}
    </div>
  );
}

function HistoryCard({ job, isPlaying, isActive, onPlay, onSelect, onDownloadMp3, onDownloadSrt }) {
  return (
    <div
      onClick={onSelect}
      className={`group p-3 rounded-xl border cursor-pointer transition-all ${
        isActive
          ? 'bg-primary-500/5 border-primary-500/20'
          : 'bg-dark-800 border-transparent hover:bg-dark-700 hover:border-dark-600'
      }`}
    >
      <div className="flex items-center gap-2.5 mb-1">
        <StatusDot status={job.status} />
        <p className="text-sm font-medium text-gray-300 truncate flex-1">
          {job.job_title || job.voice_name || 'Audio'}
        </p>
        {job.output_duration_seconds && (
          <span className="text-xs text-gray-600 flex items-center gap-1">
            <Clock className="w-3 h-3" />{Math.round(job.output_duration_seconds)}s
          </span>
        )}
      </div>

      {job.status === 'completed' && job.output_url && (
        <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onPlay(); }} className="p-1.5 rounded-lg hover:bg-dark-600 transition-colors" title={isPlaying ? 'Dừng' : 'Nghe'}>
            {isPlaying
              ? <Pause className="w-3.5 h-3.5 text-primary-400" />
              : <Play className="w-3.5 h-3.5 text-gray-400" />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDownloadMp3(); }} className="p-1.5 rounded-lg hover:bg-dark-600 transition-colors" title="Tải MP3">
            <Download className="w-3.5 h-3.5 text-gray-400" />
          </button>
          {job.segments?.length > 0 && (
            <button onClick={(e) => { e.stopPropagation(); onDownloadSrt(); }} className="p-1.5 rounded-lg hover:bg-dark-600 transition-colors" title="Tải SRT">
              <Subtitles className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
      )}

      {job.status === 'processing' && (
        <div className="flex items-center gap-1.5 mt-1 text-xs text-yellow-400">
          <Loader className="w-3 h-3 animate-spin" /> Đang xử lý...
        </div>
      )}

      {job.status === 'failed' && (
        <p className="text-xs text-red-400 truncate mt-1">{job.error_message || 'Thất bại'}</p>
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
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${map[status] || 'bg-gray-600'}`} />;
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
    <span className={`badge ${map[status] || 'badge-neutral'}`}>
      {status === 'processing' && <Loader className="w-3 h-3 animate-spin" />}
      {labels[status] || status}
    </span>
  );
}
