import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const ACCEPTED_TYPES = 'audio/*,.mp3,.wav,.ogg,.m4a'

function parseLrc(text) {
  const parsed = []
  text.split(/\r?\n/).forEach((line) => {
    const timestamps = [...line.matchAll(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g)]
    const lyric = line.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').trim()
    if (!lyric) return
    timestamps.forEach((match) => {
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0
      parsed.push({ time: Number(match[1]) * 60 + Number(match[2]) + fraction, text: lyric })
    })
  })
  return parsed.sort((a, b) => a.time - b.time)
}

function formatTime(value) {
  if (!Number.isFinite(value)) return '0:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

function lyricFont(style, size) {
  if (style === 'poetic') return `italic ${size}px Georgia, serif`
  if (style === 'technical') return `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`
  return `600 ${size}px Arial, Helvetica, sans-serif`
}

function fitLyricText(context, text, requestedSize, maxWidth, maxHeight, style) {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean)
  let size = Math.max(10, requestedSize)
  let lines = []
  let maxLineWidth
  while (size >= 10) {
    context.font = lyricFont(style, size)
    lines = []
    let currentLine = ''
    words.forEach((word) => {
      const candidate = currentLine ? `${currentLine} ${word}` : word
      if (currentLine && context.measureText(candidate).width > maxWidth) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = candidate
      }
    })
    if (currentLine) lines.push(currentLine)
    const lineHeight = size * 1.18
    maxLineWidth = Math.max(...lines.map((line) => context.measureText(line).width), 0)
    if (lines.length * lineHeight <= maxHeight && maxLineWidth <= maxWidth) {
      return { font: context.font, lineHeight, lines, scaleX: 1, totalHeight: lines.length * lineHeight }
    }
    size *= 0.9
  }

  context.font = lyricFont(style, 10)
  maxLineWidth = Math.max(...lines.map((line) => context.measureText(line).width), 1)
  return {
    font: context.font,
    lineHeight: 12,
    lines,
    scaleX: Math.min(1, maxWidth / maxLineWidth),
    totalHeight: lines.length * 12,
  }
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
  const captionRef = useRef({ index: -1, text: '', changedAt: 0 })
  const lyricLevelsRef = useRef({ bass: 0, mid: 0, overall: 0 })
  const [file, setFile] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [mode, setMode] = useState('bars')
  const [showCaptions, setShowCaptions] = useState(true)
  const [captionStyle, setCaptionStyle] = useState('minimal')
  const [lyricSize, setLyricSize] = useState(24)
  const [lyricX, setLyricX] = useState(50)
  const [lyricY, setLyricY] = useState(82)
  const [lyricReaction, setLyricReaction] = useState(1)
  const [lyricFile, setLyricFile] = useState(null)
  const [lyrics, setLyrics] = useState([])
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
    const average = (start, end) => frequencyData.slice(start, end).reduce((sum, value) => sum + value, 0) / ((end - start) * 255)
    const levels = lyricLevelsRef.current
    const targetLevels = {
      bass: average(0, Math.max(1, Math.floor(frequencyData.length * 0.12))),
      mid: average(Math.floor(frequencyData.length * 0.12), Math.max(1, Math.floor(frequencyData.length * 0.45))),
      overall: average(0, frequencyData.length),
    }
    levels.bass += (targetLevels.bass - levels.bass) * 0.14
    levels.mid += (targetLevels.mid - levels.mid) * 0.12
    levels.overall += (targetLevels.overall - levels.overall) * 0.1
    const accent = '#d83a2f'
    if (mode === 'waveform') {
      analyser.getByteTimeDomainData(data)
      context.save()
      context.globalAlpha = 0.28
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
      context.restore()
    } else {
      const bars = Math.min(72, Math.floor(width / (pixelRatio * 8)))
      const gap = 3 * pixelRatio
      const barWidth = Math.max(2 * pixelRatio, (width - gap * (bars - 1)) / bars)
      context.save()
      context.globalAlpha = 0.24
      context.fillStyle = accent
      for (let index = 0; index < bars; index += 1) {
        const sampleIndex = Math.floor((index / bars) ** 1.65 * frequencyData.length * 0.72)
        const level = frequencyData[sampleIndex] / 255
        const barHeight = Math.max(3 * pixelRatio, level ** 0.85 * height * 0.74)
        const x = index * (barWidth + gap)
        context.fillRect(x, height - barHeight, barWidth, barHeight)
      }
      context.restore()
    }
    if (showCaptions && audioRef.current && lyrics.length) {
      const currentTime = audioRef.current.currentTime || 0
      let lyricIndex = -1
      for (let index = 0; index < lyrics.length; index += 1) {
        if (lyrics[index].time > currentTime) break
        lyricIndex = index
      }
      if (lyricIndex >= 0 && captionRef.current.index !== lyricIndex) {
        captionRef.current = { index: lyricIndex, text: lyrics[lyricIndex].text, changedAt: performance.now() }
      }
      if (lyricIndex >= 0) {
      const elapsed = performance.now() - captionRef.current.changedAt
      const transition = Math.min(1, elapsed / 360)
      context.save()
      const lyricScale = 1 + levels.bass * 0.3 * lyricReaction
      const maxWidth = width * 0.82
      const maxHeight = height * 0.3
      const lyricFontSize = Math.min(height * 0.2, lyricSize * pixelRatio * lyricScale)
      const lyricLayout = fitLyricText(context, captionRef.current.text, lyricFontSize, maxWidth, maxHeight, captionStyle)
      const movement = (levels.mid - 0.25) * width * 0.08 * lyricReaction
      const x = Math.max(width * 0.09, Math.min(width * 0.91, width * (lyricX / 100) + movement))
      const y = Math.max(lyricLayout.totalHeight / 2, Math.min(height - lyricLayout.totalHeight / 2, height * (lyricY / 100) - levels.mid * height * 0.035 * lyricReaction))
      context.globalAlpha = transition * Math.min(0.98, 0.72 + levels.overall * 0.26)
      context.fillStyle = captionStyle === 'technical' ? '#181816' : accent
      context.font = lyricLayout.font
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      const drawX = x + (1 - transition) * 10 * pixelRatio
      context.translate(drawX, y)
      context.scale(lyricLayout.scaleX, 1)
      lyricLayout.lines.forEach((line, index) => {
        const lineY = (index - (lyricLayout.lines.length - 1) / 2) * lyricLayout.lineHeight
        context.fillText(line, 0, lineY)
      })
      context.restore()
      }
    }
    if (isPlayingRef.current) animationRef.current = requestAnimationFrame(() => drawRef.current?.())
  }, [captionStyle, lyricReaction, lyricSize, lyricX, lyricY, lyrics, mode, showCaptions])

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
    captionRef.current = { index: -1, text: '', changedAt: 0 }
    lyricLevelsRef.current = { bass: 0, mid: 0, overall: 0 }
    setLyricFile(null)
    setLyrics([])
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current)
    fileUrlRef.current = URL.createObjectURL(nextFile)
    setAudioUrl(fileUrlRef.current)
    setFile(nextFile)
  }

  const handleLyricFileChange = async (event) => {
    const nextFile = event.target.files?.[0]
    if (!nextFile) return
    const text = await nextFile.text()
    const parsed = parseLrc(text)
    captionRef.current = { index: -1, text: '', changedAt: 0 }
    setLyricFile(nextFile)
    setLyrics(parsed)
    if (!parsed.length) setError('This .lrc file did not contain readable timestamped lyrics.')
    else setError('')
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
  }, [captionStyle, drawVisualization, isPlaying, lyricReaction, lyricSize, lyricX, lyricY, lyrics, showCaptions])

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
            {file && showCaptions && !lyrics.length && <div className="lyric-empty-state"><strong>NO SYNCED LYRICS</strong><span>Upload a user-provided .lrc file to display lyrics here.</span></div>}
          </div>
          <div className="caption-row"><span>FIG. 01 — REAL-TIME AUDIO ANALYSIS</span><span>THE CANVAS RESPONDS TO YOUR SOUND</span></div>
        </section>

        <section className="control-section">
          <div className="section-label">SOUND / SOURCE</div>
          <div className="track-info"><span className="track-index">A</span><div><strong>{file ? file.name : 'No track selected'}</strong><span>{file ? 'Local audio file' : 'Choose an audio file to begin'}</span></div></div>
          <label className="file-button"><span>{file ? 'Change track' : 'Choose track'}</span><input type="file" accept={ACCEPTED_TYPES} onChange={handleFileChange} /></label>
        </section>

        <section className="caption-section">
          <div className="section-label">USER LYRICS</div>
          <p className="caption-disclaimer">User-provided synchronized lyrics. Lines are displayed from their timestamps and are never generated by the visualizer.</p>
          <label className="toggle-control"><input type="checkbox" checked={showCaptions} onChange={(event) => setShowCaptions(event.target.checked)} /><span className="toggle-ui" aria-hidden="true" /> SYNCED CAPTIONS</label>
          <label className="caption-select">STYLE <select value={captionStyle} onChange={(event) => setCaptionStyle(event.target.value)}><option value="minimal">Minimal</option><option value="poetic">Poetic</option><option value="technical">Technical</option></select></label>
          <label className="file-button lyric-file-button"><span>{lyricFile ? 'Change .lrc' : 'Upload .lrc lyrics'}</span><input type="file" accept=".lrc,text/plain" onChange={handleLyricFileChange} /></label>
        </section>

        <section className="lyric-control-section">
          <div className="section-label">LYRIC / PLACEMENT</div>
          <label className="range-control">SIZE <input type="range" min="12" max="72" value={lyricSize} onChange={(event) => setLyricSize(Number(event.target.value))} aria-label="Lyric text size" /></label>
          <label className="range-control">HORIZONTAL <input type="range" min="10" max="90" value={lyricX} onChange={(event) => setLyricX(Number(event.target.value))} aria-label="Lyric horizontal position" /></label>
          <label className="range-control">VERTICAL <input type="range" min="12" max="90" value={lyricY} onChange={(event) => setLyricY(Number(event.target.value))} aria-label="Lyric vertical position" /></label>
          <label className="range-control">REACTION <input type="range" min="0" max="2" step="0.01" value={lyricReaction} onChange={(event) => setLyricReaction(Number(event.target.value))} aria-label="Lyric audio reaction intensity" /></label>
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
