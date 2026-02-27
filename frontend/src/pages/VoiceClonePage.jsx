import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { voiceApi } from '../services/api';
import toast from 'react-hot-toast';
import {
  Mic2, Upload, Play, Pause, Trash2, Loader, Plus,
  CheckCircle, Globe, User, Music2, X, Edit3, Check,
} from 'lucide-react';

const LANGUAGES = [
  { id: 'auto', name: 'Tự động' },
  { id: 'Vietnamese', name: 'Tiếng Việt' },
  { id: 'Chinese', name: 'Tiếng Trung' },
  { id: 'English', name: 'Tiếng Anh' },
  { id: 'Japanese', name: 'Tiếng Nhật' },
  { id: 'Korean', name: 'Tiếng Hàn' },
  { id: 'French', name: 'Tiếng Pháp' },
];

export default function VoiceClonePage() {
  const queryClient = useQueryClient();
  const [audioFile, setAudioFile] = useState(null);
  const [voiceName, setVoiceName] = useState('');
  const [language, setLanguage] = useState('auto');
  const [description, setDescription] = useState('');
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  const { data: voices, isLoading } = useQuery({
    queryKey: ['myVoices'],
    queryFn: () => voiceApi.getMyVoices().then(r => r.data.data),
  });

  const cloneMutation = useMutation({
    mutationFn: (formData) => voiceApi.cloneVoice(formData),
    onSuccess: () => {
      toast.success('Tạo voiceprint thành công!');
      queryClient.invalidateQueries({ queryKey: ['myVoices'] });
      setAudioFile(null);
      setVoiceName('');
      setDescription('');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Tạo voiceprint thất bại');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (voiceId) => voiceApi.deleteVoice(voiceId),
    onSuccess: () => {
      toast.success('Đã xoá giọng');
      queryClient.invalidateQueries({ queryKey: ['myVoices'] });
    },
  });

  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (file) setAudioFile(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'audio/*': ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  });

  const handleClone = () => {
    if (!audioFile) return toast.error('Chọn file âm thanh trước');
    if (!voiceName.trim()) return toast.error('Nhập tên giọng');
    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('name', voiceName.trim());
    formData.append('language', language);
    formData.append('description', description);
    cloneMutation.mutate(formData);
  };

  const handlePlay = (voice) => {
    if (!voice.preview_url) return toast.error('Chưa có preview');
    if (playingId === voice.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    audioRef.current = new Audio(voice.preview_url);
    audioRef.current.play();
    audioRef.current.onended = () => setPlayingId(null);
    setPlayingId(voice.id);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Mic2 className="w-5 h-5 text-primary-400" />
          Nhân bản giọng nói
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Upload mẫu giọng để tạo voiceprint với Qwen3</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Clone Form */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-200 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Tạo giọng mới
          </h2>

          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-primary-500 bg-primary-500/10'
                : audioFile
                ? 'border-green-500/50 bg-green-500/5'
                : 'border-dark-500 hover:border-dark-400'
            }`}
          >
            <input {...getInputProps()} />
            {audioFile ? (
              <div className="flex items-center justify-center gap-3">
                <Music2 className="w-8 h-8 text-green-400 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-sm font-medium text-green-300">{audioFile.name}</p>
                  <p className="text-xs text-gray-500">{(audioFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setAudioFile(null); }}
                  className="ml-auto text-gray-500 hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                <p className="text-sm text-gray-400">
                  {isDragActive ? 'Thả file vào đây' : 'Kéo thả hoặc click để chọn file âm thanh'}
                </p>
                <p className="text-xs text-gray-600 mt-1">MP3, WAV, M4A, OGG, FLAC — tối đa 50MB</p>
                <p className="text-xs text-gray-600">Khuyến nghị: 10–60 giây, giọng rõ ràng, ít tiếng ồn</p>
              </>
            )}
          </div>

          {/* Voice name */}
          <div>
            <label className="label">Tên giọng</label>
            <input
              type="text"
              value={voiceName}
              onChange={e => setVoiceName(e.target.value)}
              className="input"
              placeholder="Ví dụ: Giọng Nam Miền Nam, Giọng Nữ Presenter..."
            />
          </div>

          {/* Language */}
          <div>
            <label className="label">Ngôn ngữ chính</label>
            <select value={language} onChange={e => setLanguage(e.target.value)} className="select">
              {LANGUAGES.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="label">Mô tả (tuỳ chọn)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="input"
              placeholder="Ví dụ: Giọng đọc trầm, phù hợp podcast..."
            />
          </div>

          <button
            onClick={handleClone}
            disabled={cloneMutation.isPending || !audioFile || !voiceName.trim()}
            className="btn-primary w-full justify-center py-2.5"
          >
            {cloneMutation.isPending ? (
              <><Loader className="w-4 h-4 animate-spin" /> Đang tạo voiceprint...</>
            ) : (
              <><Mic2 className="w-4 h-4" /> Tạo Voiceprint</>
            )}
          </button>

          {cloneMutation.isPending && (
            <p className="text-xs text-gray-500 text-center">
              Quá trình này có thể mất 30–60 giây...
            </p>
          )}
        </div>

        {/* Voice list */}
        <div>
          <h2 className="font-semibold text-gray-200 mb-3 flex items-center gap-2">
            <User className="w-4 h-4" /> Giọng đã tạo
            {voices?.length > 0 && (
              <span className="badge badge-info ml-1">{voices.length}</span>
            )}
          </h2>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-primary-400" />
            </div>
          ) : voices?.length === 0 ? (
            <div className="card text-center py-12">
              <Mic2 className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Chưa có giọng nào</p>
              <p className="text-gray-600 text-xs mt-1">Upload mẫu âm thanh để bắt đầu</p>
            </div>
          ) : (
            <div className="space-y-3">
              {voices?.map(voice => (
                <VoiceCard
                  key={voice.id}
                  voice={voice}
                  isPlaying={playingId === voice.id}
                  onPlay={() => handlePlay(voice)}
                  onDelete={() => {
                    if (confirm(`Xoá giọng "${voice.name}"?`)) deleteMutation.mutate(voice.id);
                  }}
                  queryClient={queryClient}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VoiceCard({ voice, isPlaying, onPlay, onDelete, queryClient }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(voice.name);

  const updateMutation = useMutation({
    mutationFn: (data) => voiceApi.updateVoice(voice.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myVoices'] });
      setEditing(false);
      toast.success('Đã cập nhật');
    },
  });

  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-primary-400">{voice.name[0]}</span>
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="input text-sm py-1"
                autoFocus
              />
              <button onClick={() => updateMutation.mutate({ name })} className="text-green-400 hover:text-green-300">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-medium text-gray-200 truncate">{voice.name}</p>
              <button onClick={() => setEditing(true)} className="text-gray-600 hover:text-gray-400">
                <Edit3 className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            {voice.language && voice.language !== 'auto' && (
              <span className="badge badge-info">{voice.language}</span>
            )}
            <span className="text-xs text-gray-500">{voice.times_used || 0} lần dùng</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onPlay}
            className={`btn-ghost p-1.5 ${!voice.preview_url ? 'opacity-40 cursor-not-allowed' : ''}`}
            title="Preview"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button onClick={onDelete} className="btn-ghost p-1.5 text-gray-500 hover:text-red-400">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {voice.description && (
        <p className="text-xs text-gray-500 mt-2 ml-13">{voice.description}</p>
      )}
    </div>
  );
}
