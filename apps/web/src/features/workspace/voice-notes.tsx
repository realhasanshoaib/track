import { Mic, Pause, Play, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import { formatDuration } from '#/i18n'

export const voiceNoteMimeTypes = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const

type VoiceRecorderStatus = 'idle' | 'requesting' | 'recording'

export function isAudioAttachment(input: { contentType?: string | null; filename: string }) {
  const contentType = input.contentType?.toLowerCase() ?? ''
  const extension = input.filename.split('.').pop()?.toLowerCase() ?? ''
  return (
    contentType.startsWith('audio/') ||
    ['aac', 'aiff', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'weba', 'webm'].includes(
      extension,
    )
  )
}

export function isVoiceNoteAttachment(input: {
  contentType?: string | null
  filename: string
  kind?: string | null
}) {
  return input.kind === 'voice_note'
}

export function formatVoiceDuration(durationMs?: number | null) {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs < 0) return '0:00'
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function getPreferredVoiceMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  return voiceNoteMimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

export function createVoiceNoteFilename(createdAt = new Date()) {
  const timestamp = createdAt
    .toISOString()
    .replaceAll(':', '-')
    .replace(/\.\d{3}Z$/, 'Z')
  return `voice-note-${timestamp}.webm`
}

export function VoiceRecorder({
  disabled,
  onRecorded,
  onRecordingChange,
}: {
  disabled: boolean
  onRecorded: (recording: { file: File; durationMs: number; previewUrl: string }) => void
  onRecordingChange?: (recording: boolean) => void
}) {
  const { t } = useTranslation('workspace')
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const chunksRef = useRef<Array<BlobPart>>([])
  const intervalRef = useRef<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const startedAtRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => () => stopRecording({ discard: true }), [])

  useEffect(() => {
    onRecordingChange?.(status === 'recording')
  }, [onRecordingChange, status])

  async function startRecording() {
    if (disabled || status !== 'idle') return
    setError(null)
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError(t('voice.unsupported'))
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setError(t('voice.unsupported'))
      return
    }

    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getPreferredVoiceMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      streamRef.current = stream
      mediaRecorderRef.current = recorder
      startedAtRef.current = Date.now()
      setElapsedMs(0)

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      })
      recorder.addEventListener('stop', () => {
        window.clearInterval(intervalRef.current ?? undefined)
        intervalRef.current = null
        setStatus('idle')
        stopStream()
      })

      recorder.start()
      setStatus('recording')
      intervalRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current)
      }, 250)
    } catch (recordingError) {
      setStatus('idle')
      stopStream()
      setError(
        recordingError instanceof DOMException && recordingError.name === 'NotAllowedError'
          ? t('voice.permissionBlocked')
          : t('voice.startFailed'),
      )
    }
  }

  function stopRecording(options: { discard?: boolean } = {}) {
    const recorder = mediaRecorderRef.current
    if (!recorder) {
      stopStream()
      setStatus('idle')
      return
    }

    const discard = options.discard === true
    recorder.addEventListener(
      'stop',
      () => {
        if (discard || chunksRef.current.length === 0) return
        const durationMs = Date.now() - startedAtRef.current
        const contentType = recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: contentType })
        const file = new File([blob], createVoiceNoteFilename(), { type: contentType })
        onRecorded({
          durationMs,
          file,
          previewUrl: URL.createObjectURL(blob),
        })
      },
      { once: true },
    )

    if (recorder.state !== 'inactive') recorder.stop()
    mediaRecorderRef.current = null
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  if (status === 'recording') {
    return (
      <div className="track-voice-recorder recording" role="status">
        <div className="track-voice-recorder-main">
          <span className="track-recording-dot" aria-hidden="true" />
          <span className="track-voice-recorder-copy">
            <strong>{t('voice.recording')}</strong>
            <small>{formatDuration(elapsedMs)}</small>
          </span>
          <span className="track-recording-meter" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, index) => (
              <span key={index} style={{ animationDelay: `${index * 70}ms` }} />
            ))}
          </span>
        </div>
        <div className="track-voice-recorder-actions">
          <Button
            className="track-button"
            onClick={() => stopRecording({ discard: true })}
            type="button"
          >
            <X size={14} />
            {t('common.cancel')}
          </Button>
          <Button
            className="track-button track-button-primary"
            onClick={() => stopRecording()}
            type="button"
          >
            <Square size={13} />
            {t('voice.stop')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Button
        className="icon-button"
        disabled={disabled || status === 'requesting'}
        onClick={() => void startRecording()}
        title={t('voice.record')}
        type="button"
      >
        <Mic size={15} />
      </Button>
      {error ? <p className="track-voice-error">{error}</p> : null}
    </>
  )
}

export function VoiceNoteReview({
  durationMs,
  file,
  onRemove,
  previewUrl,
}: {
  durationMs?: number | null
  file: File
  onRemove: () => void
  previewUrl: string
}) {
  const { t } = useTranslation('workspace')
  return (
    <div className="track-voice-review">
      <VoiceNotePlayer
        contentType={file.type}
        durationMs={durationMs}
        filename={file.name}
        kind="voice_note"
        size={file.size}
        url={previewUrl}
        variant="composer"
      />
      <Button
        aria-label={t('voice.remove')}
        className="track-voice-review-remove"
        onClick={onRemove}
        title={t('voice.remove')}
        type="button"
      >
        <X size={13} />
      </Button>
    </div>
  )
}

export function VoiceNotePlayer({
  className,
  contentType,
  durationMs,
  filename,
  kind,
  url,
  variant = 'message',
}: {
  className?: string
  contentType: string
  durationMs?: number | null
  filename: string
  kind?: string | null
  size: number
  url: string | null
  variant?: 'composer' | 'message'
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [measuredDuration, setMeasuredDuration] = useState(0)
  const metadataDurationSeconds = durationMs && durationMs > 0 ? durationMs / 1000 : 0
  const durationSeconds = Math.max(metadataDurationSeconds, measuredDuration, 0)
  const displayCurrentTime = durationSeconds > 0 && durationSeconds - currentTime <= 0.35
    ? durationSeconds
    : Math.min(currentTime, durationSeconds || currentTime)
  const progress = durationSeconds > 0 ? Math.min(displayCurrentTime / durationSeconds, 1) : 0
  const { t } = useTranslation('workspace')
  const label = isVoiceNoteAttachment({ contentType, filename, kind }) ? t('voice.voiceNote') : t('voice.audio')

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    function syncTime() {
      const nextTime = audio?.currentTime ?? 0
      const nextDuration = Number.isFinite(audio?.duration) ? (audio?.duration ?? 0) : durationSeconds
      setCurrentTime(nextDuration > 0 && nextDuration - nextTime <= 0.35 ? nextDuration : nextTime)
    }
    function syncDuration() {
      setMeasuredDuration(Number.isFinite(audio?.duration) ? (audio?.duration ?? 0) : 0)
    }
    function syncPaused() {
      setPlaying(false)
    }
    function syncEnded() {
      const finalDuration = Number.isFinite(audio?.duration) && audio?.duration
        ? audio.duration
        : durationSeconds
      setCurrentTime(finalDuration)
      setPlaying(false)
    }
    audio.addEventListener('timeupdate', syncTime)
    audio.addEventListener('loadedmetadata', syncDuration)
    audio.addEventListener('pause', syncPaused)
    audio.addEventListener('ended', syncEnded)
    return () => {
      audio.removeEventListener('timeupdate', syncTime)
      audio.removeEventListener('loadedmetadata', syncDuration)
      audio.removeEventListener('pause', syncPaused)
      audio.removeEventListener('ended', syncEnded)
    }
  }, [durationSeconds, url])

  async function togglePlayback() {
    const audio = audioRef.current
    if (!audio || !url) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    await audio.play()
    setPlaying(true)
  }

  function handleSeek(value: string) {
    const audio = audioRef.current
    if (!audio || durationSeconds <= 0) return
    const nextTime = (Number(value) / 100) * durationSeconds
    audio.currentTime = nextTime
    setCurrentTime(nextTime)
  }

  const canPlay = Boolean(url)

  return (
    <div className={cn('track-voice-player', `track-voice-player-${variant}`, className)}>
      {url ? <audio preload="metadata" ref={audioRef} src={url} /> : null}
      <Button
        aria-label={playing ? t('voice.pause') : t('voice.play')}
        className="track-voice-play"
        disabled={!canPlay}
        onClick={() => void togglePlayback()}
        type="button"
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </Button>
      <div className="track-voice-main">
        <strong className="track-voice-label">{label}</strong>
        <input
          aria-label={t('voice.progress')}
          className="track-voice-progress"
          disabled={!canPlay || durationSeconds <= 0}
          max="100"
          min="0"
          onChange={(event) => handleSeek(event.currentTarget.value)}
          style={{ '--voice-progress': `${progress * 100}%` } as CSSProperties}
          type="range"
          value={Math.round(progress * 100)}
        />
        <span className="track-voice-duration">
          {formatDuration(displayCurrentTime * 1000)} / {formatDuration(durationSeconds * 1000)}
        </span>
      </div>
    </div>
  )
}
