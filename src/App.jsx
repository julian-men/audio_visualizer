import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const ACCEPTED_TYPES = 'audio/*,.mp3,.wav,.ogg,.m4a'

function formatTime(value) {
  if (!Number.isFinite(value)) return '0:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

function App() {
  const audioRef = useRef(null)
  const canvasRef = useRef(null)
  const fileUrlRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationRef = useRef(null)
  const drawRef = useRef(null)
  const [file, setFile] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [mode, setMode] = useState('bars')
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')

  const stopVisualization = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    animationRef.current = null
  }, [])

  const drawVisualization = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return
    const context = canvas.getContext('2d')
    const bounds = canvas.getBoundingClientRect()
    const pixelRatio = window.devicePixelRatio || 1
    const width = Math.max(1, Math.floor(bounds.width * pixelRatio))
    const height = Math.max(1, Math.floor(bounds.height * pixelRatio))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    context.clearRect(0, 0, width, height)
    context.fillStyle = '#f3f0e8'
    context.fillRect(0, 0, width, height)
    context.strokeStyle = 'rgba(24, 24, 22, .12)'
    context.lineWidth = pixelRatio
    for (let line = 1; line < 5; line += 1) {
      const y = (height / 5) * line
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(width, y)
      context.stroke()
    }

    const data = new Uint8Array(analyser.frequencyBinCount)
    const accent = '#d83a2f'
    if (mode === 'waveform') {
      analyser.getByteTimeDomainData(data)
      context.beginPath()
      context.strokeStyle = accent
      context.lineWidth = 2 * pixelRatio
      data.forEach((value, index) => {
        const x = (index / (data.length - 1)) * width
        const y = height / 2 + ((value - 128) / 128) * height * 0.37
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.stroke()
    } else {
      analyser.getByteFrequencyData(data)
      const bars = Math.min(72, Math.floor(width / (pixelRatio * 8)))
      const gap = 3 * pixelRatio
      const barWidth = Math.max(2 * pixelRatio, (width - gap * (bars - 1)) / bars)
      context.fillStyle = accent
      for (let index = 0; index < bars; index += 1) {
        const sampleIndex = Math.floor((index / bars) ** 1.65 * data.length * 0.72)
        const level = data[sampleIndex] / 255
        const barHeight = Math.max(3 * pixelRatio, level ** 0.85 * height * 0.74)
        const x = index * (barWidth + gap)
        context.fillRect(x, height - barHeight, barWidth, barHeight)
      }
    }
    animationRef.current = requestAnimationFrame(() => drawRef.current?.())
  }, [mode])

  const setupAudioGraph = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext || !audioRef.current) {
      setError('This browser does not support the Web Audio API.')
      return null
    }
    const audioContext = new AudioContext()
    const source = audioContext.createMediaElementSource(audioRef.current)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.82
    source.connect(analyser)
    analyser.connect(audioContext.destination)
    audioContextRef.current = audioContext
    analyserRef.current = analyser
    return audioContext
  }, [])

  const togglePlayback = async () => {
    if (!audioRef.current || !file) return
    setError('')
    const audioContext = setupAudioGraph()
    if (!audioContext) return
    if (audioContext.state === 'suspended') await audioContext.resume()
    if (audioRef.current.paused) {
      try {
        await audioRef.current.play()
        setIsPlaying(true)
        stopVisualization()
        animationRef.current = requestAnimationFrame(() => drawRef.current?.())
      } catch {
        setError('This audio file could not be played. Try another file.')
      }
    } else {
      audioRef.current.pause()
      setIsPlaying(false)
      stopVisualization()
    }
  }

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0]
    if (!nextFile) return
    stopVisualization()
    audioRef.current?.pause()
    setIsPlaying(false)
    setError('')
    setProgress(0)
    setDuration(0)
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current)
    fileUrlRef.current = URL.createObjectURL(nextFile)
    setAudioUrl(fileUrlRef.current)
    setFile(nextFile)
  }

  const handleAudioError = () => {
    setIsPlaying(false)
    setError('This file is not a supported or valid audio file.')
  }

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    drawRef.current = drawVisualization
  }, [drawVisualization])

  useEffect(() => () => {
    stopVisualization()
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current)
    audioContextRef.current?.close()
  }, [stopVisualization])

  return (
    <main className="app-shell">
      <section className="magazine-page" aria-label="Audio visualizer">
        <header className="masthead">
          <div className="issue-label">AUDIO STUDY <span>/</span> 01</div>
          <div className="masthead-title">Pulse / Field</div>
          <div className="issue-meta">INTERACTIVE FEATURE<br />LOCAL SOUND ARCHIVE</div>
        </header>

        <div className="intro-grid">
          <p className="kicker">VISUAL SYSTEM</p>
          <div>
            <h1>Visually Representing<br /><em>the invisible.</em></h1>
            <p className="intro-copy">A small study in frequency, movement, and the marks sound leaves behind.</p>
          </div>
          <p className="edition-note">SOUND<br />AS MATERIAL</p>
        </div>

        <section className="feature-section">
          <div className="feature-heading"><span>01</span><h2>Frequency field</h2><span className="feature-rule" /><span className="feature-type">LIVE / 256 FFT</span></div>
          <div className="visualizer-wrap">
            <canvas ref={canvasRef} aria-label={`${mode} frequency visualization`} />
            {!file && <div className="empty-state"><span className="upload-glyph">+</span><p>Upload a track to begin the study</p><small>MP3 · WAV · OGG · M4A</small></div>}
          </div>
          <div className="caption-row"><span>FIG. 01 — REAL-TIME AUDIO ANALYSIS</span><span>THE CANVAS RESPONDS TO YOUR SOUND</span></div>
        </section>

        <section className="control-section">
          <div className="section-label">SOUND / SOURCE</div>
          <div className="track-info"><span className="track-index">A</span><div><strong>{file ? file.name : 'No track selected'}</strong><span>{file ? 'Local audio file' : 'Choose an audio file to begin'}</span></div></div>
          <label className="file-button"><span>{file ? 'Change track' : 'Choose track'}</span><input type="file" accept={ACCEPTED_TYPES} onChange={handleFileChange} /></label>
        </section>

        <audio ref={audioRef} src={audioUrl || undefined} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)} onEnded={() => { setIsPlaying(false); stopVisualization() }} onError={handleAudioError} />

        <section className="transport-section">
          <div className="section-label">PLAYBACK</div>
          <button className="play-button" type="button" onClick={togglePlayback} disabled={!file} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? 'Ⅱ' : '▶'}</button>
          <div className="timeline-group"><input className="progress-range" type="range" min="0" max={duration || 0} step="0.01" value={Math.min(progress, duration || 0)} onChange={(event) => { const next = Number(event.target.value); setProgress(next); if (audioRef.current) audioRef.current.currentTime = next }} disabled={!file || !duration} aria-label="Track progress" /><div className="time-labels"><span>{formatTime(progress)}</span><span>{formatTime(duration)}</span></div></div>
          <div className="volume-group"><span>VOLUME</span><input className="volume-range" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" /></div>
          <div className="mode-control"><span>MODE</span><div className="mode-switch">{['bars', 'waveform'].map((option) => <button key={option} className={mode === option ? 'active' : ''} type="button" onClick={() => setMode(option)}>{option}</button>)}</div></div>
        </section>
        {error && <p className="error-message" role="alert">{error}</p>}
        <footer className="page-footer"><span>Pulse / Field</span><span>Web Audio API / 2026</span><span>END OF STUDY</span></footer>
      </section>
    </main>
  )
}

export default App
