import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const ACCEPTED_TYPES = 'audio/*,.mp3,.wav,.ogg,.m4a'
const CAPTION_LINES = {
  minimal: ['SIGNAL IN MOTION', 'AUDIO / NOW', 'STAY WITH THE PULSE', 'LISTEN CLOSER'],
  poetic: ['THE AIR LEANS IN', 'A RED THREAD OF SOUND', 'WHERE THE ROOM STARTS MOVING', 'ECHOES FIND THEIR SHAPE'],
  technical: ['LOW BAND DETECTED', 'MID RANGE SHIFT', 'AMPLITUDE IN TRANSIT', 'SPECTRUM / LIVE'],
}

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
  const isPlayingRef = useRef(false)
  const reactiveLevelsRef = useRef({ bass: 0, mid: 0, overall: 0 })
  const captionRef = useRef({ section: -1, text: '', changedAt: 0 })
  const [file, setFile] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [mode, setMode] = useState('bars')
  const [displayText, setDisplayText] = useState('LISTEN / LOOK')
  const [showTypography, setShowTypography] = useState(true)
  const [textSize, setTextSize] = useState(72)
  const [textColor, setTextColor] = useState('#d83a2f')
  const [reactionIntensity, setReactionIntensity] = useState(1)
  const [showCaptions, setShowCaptions] = useState(true)
  const [captionStyle, setCaptionStyle] = useState('minimal')
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
    const frequencyData = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(frequencyData)
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
    if (showTypography && displayText.trim()) {
      const bassEnd = Math.max(1, Math.floor(frequencyData.length * 0.12))
      const midStart = Math.floor(frequencyData.length * 0.12)
      const midEnd = Math.max(midStart + 1, Math.floor(frequencyData.length * 0.45))
      const average = (start, end) => frequencyData.slice(start, end).reduce((sum, value) => sum + value, 0) / ((end - start) * 255)
      const levels = reactiveLevelsRef.current
      const target = { bass: average(0, bassEnd), mid: average(midStart, midEnd), overall: average(0, frequencyData.length) }
      levels.bass += (target.bass - levels.bass) * 0.14
      levels.mid += (target.mid - levels.mid) * 0.12
      levels.overall += (target.overall - levels.overall) * 0.1
      const scale = 1 + levels.bass * 0.42 * reactionIntensity
      const letterSpacing = levels.mid * 13 * reactionIntensity
      const fontSize = Math.min(height * 0.42, textSize * pixelRatio * scale)
      const label = displayText.trim().toUpperCase()
      context.save()
      context.font = `600 ${fontSize}px Arial, Helvetica, sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillStyle = textColor
      context.globalAlpha = Math.min(0.96, 0.42 + levels.overall * 0.58)
      const x = width / 2 + (levels.mid - 0.35) * width * 0.18 * reactionIntensity
      const y = height / 2
      const characters = [...label]
      const widths = characters.map((character) => context.measureText(character).width)
      const totalWidth = widths.reduce((sum, value) => sum + value, 0) + letterSpacing * pixelRatio * Math.max(0, characters.length - 1)
      let cursor = x - totalWidth / 2
      characters.forEach((character, index) => {
        const characterWidth = widths[index]
        context.fillText(character, cursor + characterWidth / 2, y)
        cursor += characterWidth + letterSpacing * pixelRatio
      })
      context.restore()
    }

    if (showCaptions && audioRef.current) {
      const currentTime = audioRef.current.currentTime || 0
      const sectionLength = duration > 0 ? Math.max(3.5, Math.min(7, duration / 8)) : 4
      const section = Math.floor(currentTime / sectionLength)
      const levels = reactiveLevelsRef.current
      const lines = CAPTION_LINES[captionStyle]
      const energyOffset = levels.bass > 0.55 ? 1 : levels.mid > 0.42 ? 2 : levels.overall < 0.16 ? 3 : 0
      const lineIndex = (section + energyOffset) % lines.length
      const nextText = lines[lineIndex]
      if (captionRef.current.section !== section || captionRef.current.text !== nextText) {
        captionRef.current = { section, text: nextText, changedAt: performance.now() }
      }
      const elapsed = performance.now() - captionRef.current.changedAt
      const transition = Math.min(1, elapsed / 360)
      context.save()
      context.globalAlpha = transition * Math.min(0.9, 0.42 + levels.overall * 0.48)
      context.fillStyle = captionStyle === 'technical' ? '#181816' : accent
      context.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.letterSpacing = '0.12em'
      context.textAlign = 'center'
      context.textBaseline = 'bottom'
      context.fillText(captionRef.current.text, width / 2 + (1 - transition) * 10 * pixelRatio, height - 18 * pixelRatio)
      context.restore()
    }
    if (isPlayingRef.current) animationRef.current = requestAnimationFrame(() => drawRef.current?.())
  }, [captionStyle, displayText, duration, mode, reactionIntensity, showCaptions, showTypography, textColor, textSize])

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
        isPlayingRef.current = true
        stopVisualization()
        animationRef.current = requestAnimationFrame(() => drawRef.current?.())
      } catch {
        setError('This audio file could not be played. Try another file.')
      }
    } else {
      audioRef.current.pause()
      setIsPlaying(false)
      isPlayingRef.current = false
      stopVisualization()
    }
  }

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0]
    if (!nextFile) return
    stopVisualization()
    audioRef.current?.pause()
    setIsPlaying(false)
    isPlayingRef.current = false
    setError('')
    setProgress(0)
    setDuration(0)
    captionRef.current = { section: -1, text: '', changedAt: 0 }
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

  useEffect(() => {
    if (analyserRef.current && !isPlaying) drawVisualization()
  }, [captionStyle, displayText, drawVisualization, isPlaying, reactionIntensity, showCaptions, showTypography, textColor, textSize])

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

        <section className="type-section">
          <div className="section-label">TYPE / REACTION</div>
          <label className="text-input-label">DISPLAY TEXT<input type="text" value={displayText} maxLength="32" onChange={(event) => setDisplayText(event.target.value)} /></label>
          <label className="toggle-control"><input type="checkbox" checked={showTypography} onChange={(event) => setShowTypography(event.target.checked)} /><span className="toggle-ui" aria-hidden="true" /> SHOW TYPE</label>
          <label className="range-control">SIZE <input type="range" min="32" max="130" value={textSize} onChange={(event) => setTextSize(Number(event.target.value))} /></label>
          <label className="range-control">INTENSITY <input type="range" min="0" max="2" step="0.01" value={reactionIntensity} onChange={(event) => setReactionIntensity(Number(event.target.value))} /></label>
          <label className="color-control">COLOR <input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></label>
        </section>

        <section className="caption-section">
          <div className="section-label">GENERATED CAPTIONS</div>
          <p className="caption-disclaimer">Original visual phrases, synced to the track’s current time and energy. Not verified lyrics.</p>
          <label className="toggle-control"><input type="checkbox" checked={showCaptions} onChange={(event) => setShowCaptions(event.target.checked)} /><span className="toggle-ui" aria-hidden="true" /> SYNCED CAPTIONS</label>
          <label className="caption-select">STYLE <select value={captionStyle} onChange={(event) => setCaptionStyle(event.target.value)}><option value="minimal">Minimal</option><option value="poetic">Poetic</option><option value="technical">Technical</option></select></label>
        </section>

        <audio ref={audioRef} src={audioUrl || undefined} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)} onEnded={() => { setIsPlaying(false); isPlayingRef.current = false; stopVisualization() }} onError={handleAudioError} />

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
