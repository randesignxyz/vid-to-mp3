import { useState, useRef, useCallback, useEffect } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

type ConvertMode = 'file' | 'url'
type JobStatus = 'idle' | 'loading' | 'converting' | 'done' | 'error'

interface Job {
  status: JobStatus
  progress: number
  outputUrl: string | null
  outputName: string | null
  error: string | null
  inputName: string | null
  inputSize: string | null
}

const SUPPORTED_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-matroska']
const SUPPORTED_EXTS = ['.mp4', '.webm', '.ogg', '.mov', '.mkv', '.avi', '.flv', '.wmv']

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isYouTubeUrl(url: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url)
}

const ffmpegRef = { current: null as FFmpeg | null }

export default function App() {
  const [mode, setMode] = useState<ConvertMode>('file')
  const [job, setJob] = useState<Job>({
    status: 'idle',
    progress: 0,
    outputUrl: null,
    outputName: null,
    error: null,
    inputName: null,
    inputSize: null,
  })
  const [dragging, setDragging] = useState(false)
  const [ytUrl, setYtUrl] = useState('')
  const [ffmpegReady, setFfmpegReady] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  useEffect(() => {
    async function loadFFmpeg() {
      const ffmpeg = new FFmpeg()
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
      ffmpeg.on('progress', ({ progress }) => {
        setJob((j) => ({ ...j, progress: Math.round(progress * 100) }))
      })
      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        })
        ffmpegRef.current = ffmpeg
        setFfmpegReady(true)
      } catch {
        // non-fatal; show note if user tries to convert
      }
    }
    loadFFmpeg()
  }, [])

  const resetJob = useCallback(() => {
    if (job.outputUrl) URL.revokeObjectURL(job.outputUrl)
    setJob({ status: 'idle', progress: 0, outputUrl: null, outputName: null, error: null, inputName: null, inputSize: null })
    setYtUrl('')
  }, [job.outputUrl])

  const convertFile = useCallback(async (file: File) => {
    if (!ffmpegRef.current) {
      setJob((j) => ({ ...j, status: 'error', error: 'FFmpeg failed to load. Try refreshing.' }))
      return
    }

    const ext = file.name.split('.').pop() ?? 'mp4'
    const inputName = `input.${ext}`
    const outputName = file.name.replace(/\.[^.]+$/, '') + '.mp3'

    setJob({
      status: 'converting',
      progress: 0,
      outputUrl: null,
      outputName,
      error: null,
      inputName: file.name,
      inputSize: formatBytes(file.size),
    })

    try {
      const ffmpeg = ffmpegRef.current
      await ffmpeg.writeFile(inputName, await fetchFile(file))
      await ffmpeg.exec(['-i', inputName, '-vn', '-ar', '44100', '-ac', '2', '-b:a', '192k', 'output.mp3'])
      const data = await ffmpeg.readFile('output.mp3')
      const blob = new Blob([data], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      await ffmpeg.deleteFile(inputName)
      await ffmpeg.deleteFile('output.mp3')
      setJob((j) => ({ ...j, status: 'done', progress: 100, outputUrl: url, outputName }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Conversion failed'
      setJob((j) => ({ ...j, status: 'error', error: msg }))
    }
  }, [])

  const handleFileDrop = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]!
    if (!SUPPORTED_TYPES.includes(file.type) && !SUPPORTED_EXTS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setJob((j) => ({ ...j, status: 'error', error: `Unsupported file type. Supported: ${SUPPORTED_EXTS.join(', ')}` }))
      return
    }
    convertFile(file)
  }, [convertFile])

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    setDragging(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragging(false)
    handleFileDrop(e.dataTransfer.files)
  }

  const isConverting = job.status === 'converting' || job.status === 'loading'
  const isDone = job.status === 'done'
  const isError = job.status === 'error'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #080b14 0%, #0d1120 50%, #080b14 100%)' }}>
      {/* Grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <span className="font-mono text-sm font-semibold tracking-tight text-white">VidToMP3</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/30 font-mono">
          <span className={`w-1.5 h-1.5 rounded-full ${ffmpegReady ? 'bg-emerald-400' : 'bg-yellow-400'}`} style={{ boxShadow: ffmpegReady ? '0 0 6px #34d399' : '0 0 6px #facc15' }} />
          {ffmpegReady ? 'ENGINE READY' : 'LOADING ENGINE…'}
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          {/* Hero */}
          <div className="mb-10 text-center">
            <p className="text-xs font-mono tracking-[0.25em] text-indigo-400 mb-4 uppercase">Free · No Signup · Browser-Based</p>
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Convert Video to{' '}
              <span style={{ background: 'linear-gradient(90deg, #6366f1, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                MP3
              </span>
            </h1>
            <p className="text-white/40 text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Extract audio from MP4, WebM, MOV, MKV and more — right in your browser.
            </p>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit mx-auto" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {(['file', 'url'] as ConvertMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { resetJob(); setMode(m) }}
                className="px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 font-mono tracking-wide"
                style={{
                  background: mode === m ? 'linear-gradient(135deg, #6366f1, #7c3aed)' : 'transparent',
                  color: mode === m ? '#fff' : 'rgba(255,255,255,0.4)',
                  boxShadow: mode === m ? '0 0 20px rgba(99,102,241,0.3)' : 'none',
                }}
              >
                {m === 'file' ? '⬆ Upload File' : '⬡ YouTube / URL'}
              </button>
            ))}
          </div>

          {/* Card */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)' }}
          >
            {/* File mode */}
            {mode === 'file' && (
              <div className="p-6 sm:p-8">
                {job.status === 'idle' && (
                  <div
                    onDragEnter={onDragEnter}
                    onDragOver={(e) => e.preventDefault()}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileRef.current?.click()}
                    className="relative flex flex-col items-center justify-center gap-5 rounded-xl cursor-pointer transition-all duration-300 py-16 px-6"
                    style={{
                      border: dragging ? '2px dashed #6366f1' : '2px dashed rgba(255,255,255,0.1)',
                      background: dragging ? 'rgba(99,102,241,0.07)' : 'rgba(255,255,255,0.02)',
                      boxShadow: dragging ? '0 0 30px rgba(99,102,241,0.15) inset' : 'none',
                    }}
                  >
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300"
                      style={{ background: dragging ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dragging ? '#818cf8' : '#6366f1'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-semibold text-lg mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
                        {dragging ? 'Drop to convert' : 'Drag & drop your video'}
                      </p>
                      <p className="text-white/30 text-sm font-mono">
                        or <span className="text-indigo-400 underline underline-offset-2">browse files</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {['.MP4', '.MOV', '.MKV', '.WEBM', '.AVI', '.FLV'].map((ext) => (
                        <span key={ext} className="px-2 py-0.5 rounded text-[10px] font-mono text-white/40"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          {ext}
                        </span>
                      ))}
                    </div>
                    <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleFileDrop(e.target.files)} />
                  </div>
                )}

                {isConverting && (
                  <div className="flex flex-col items-center gap-6 py-12">
                    <div className="relative w-20 h-20">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                        <circle
                          cx="40" cy="40" r="34" fill="none"
                          stroke="url(#grad)" strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 34}`}
                          strokeDashoffset={`${2 * Math.PI * 34 * (1 - job.progress / 100)}`}
                          style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                        />
                        <defs>
                          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#6366f1" />
                            <stop offset="100%" stopColor="#a78bfa" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold text-white">
                        {job.progress}%
                      </span>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Converting…</p>
                      {job.inputName && (
                        <p className="text-white/30 text-xs font-mono truncate max-w-xs">{job.inputName}</p>
                      )}
                    </div>
                    <div className="w-full max-w-xs h-px rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${job.progress}%`, background: 'linear-gradient(90deg, #6366f1, #a78bfa)' }} />
                    </div>
                  </div>
                )}

                {isDone && job.outputUrl && (
                  <div className="flex flex-col items-center gap-6 py-8">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-semibold text-lg mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Conversion complete!</p>
                      <p className="text-white/30 text-xs font-mono truncate max-w-xs">{job.outputName}</p>
                    </div>
                    <div className="flex gap-3">
                      <a
                        href={job.outputUrl}
                        download={job.outputName ?? 'audio.mp3'}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-95"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)', color: '#fff', boxShadow: '0 0 20px rgba(99,102,241,0.4)' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download MP3
                      </a>
                      <button
                        onClick={resetJob}
                        className="px-5 py-3 rounded-xl text-sm font-medium text-white/50 transition-all duration-200 hover:text-white/80"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        Convert another
                      </button>
                    </div>
                  </div>
                )}

                {isError && (
                  <div className="flex flex-col items-center gap-6 py-8">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-semibold text-lg mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Something went wrong</p>
                      <p className="text-red-400/70 text-sm font-mono max-w-xs">{job.error}</p>
                    </div>
                    <button
                      onClick={resetJob}
                      className="px-5 py-3 rounded-xl text-sm font-medium text-white/60 hover:text-white/90 transition-all duration-200"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* URL mode */}
            {mode === 'url' && (
              <div className="p-6 sm:p-8">
                {/* YouTube notice */}
                <div className="rounded-xl p-4 mb-6 flex gap-3"
                  style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)' }}>
                  <svg className="flex-shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div>
                    <p className="text-yellow-300/80 text-sm font-medium mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Backend required for YouTube</p>
                    <p className="text-yellow-400/50 text-xs font-mono leading-relaxed">
                      Downloading from YouTube requires a server-side proxy due to CORS restrictions and platform policies. This UI is ready — connect a backend endpoint (e.g. yt-dlp) to enable it.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-white/40 mb-2 tracking-wider uppercase">Video URL</label>
                    <div className="flex gap-3">
                      <div className="flex-1 relative">
                        <input
                          type="url"
                          value={ytUrl}
                          onChange={(e) => setYtUrl(e.target.value)}
                          placeholder="https://youtube.com/watch?v=... or any direct video URL"
                          className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all duration-200 font-mono"
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                          }}
                          onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                          onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
                        />
                        {isYouTubeUrl(ytUrl) && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="#ff0000">
                              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    disabled
                    className="w-full py-3.5 rounded-xl font-semibold text-sm cursor-not-allowed"
                    style={{ background: 'rgba(99,102,241,0.15)', color: 'rgba(165,180,252,0.5)', border: '1px solid rgba(99,102,241,0.2)' }}
                  >
                    Convert to MP3 — Backend Required
                  </button>

                  <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-xs font-mono text-white/30 mb-3 uppercase tracking-wider">To enable YouTube support, connect a backend like:</p>
                    <div className="space-y-2">
                      {[
                        { name: 'yt-dlp', desc: 'Open-source CLI — best coverage' },
                        { name: 'youtube-dl', desc: 'Classic downloader' },
                        { name: 'RapidAPI YT', desc: 'SaaS API, ready to use' },
                      ].map((opt) => (
                        <div key={opt.name} className="flex items-center gap-3">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/50 flex-shrink-0" />
                          <span className="text-xs font-mono text-white/50">
                            <span className="text-indigo-400">{opt.name}</span>
                            <span className="text-white/25"> — {opt.desc}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Feature chips */}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {[
              { icon: '⚡', label: 'Runs in browser' },
              { icon: '🔒', label: 'Files never uploaded' },
              { icon: '🎧', label: '192kbps MP3 output' },
              { icon: '∞', label: 'No file size limit*' },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono text-white/40"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span>{f.icon}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-white/15 text-[10px] font-mono mt-3">
            * Very large files may be limited by available browser memory.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-4 px-6 flex items-center justify-center gap-6">
        <p className="text-xs font-mono text-white/20">Built with ffmpeg.wasm · All processing is local</p>
      </footer>
    </div>
  )
}
