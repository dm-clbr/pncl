import { useId, useMemo, useRef } from 'react';
import { CLOSE_OUT_CLIP_SECONDS } from '../../supabase/functions/_shared/profileMirror';

const songTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

interface Props {
  duration: number;
  start: number;
  peaks: number[] | null;
  loading: boolean;
  playhead: number | null;
  disabled: boolean;
  onChange: (start: number) => void;
  onCommit: (start: number) => void;
}

export function SongWaveform({ duration, start, peaks, loading, playhead, disabled, onChange, onCommit }: Props) {
  const clipId = useId().replace(/:/g, '');
  const drag = useRef<{ pointerId: number; offset: number; latest: number } | null>(null);
  const keyboardValue = useRef<number | null>(null);
  const max = Math.max(0, duration - CLOSE_OUT_CLIP_SECONDS);
  const clamp = (value: number) => Math.max(0, Math.min(max, Math.round(value)));
  const path = useMemo(() => peaks?.map((peak, i) => {
    const x = (i + 0.5) * 720 / peaks.length;
    const height = 2 + peak * 74;
    return `M${x},${48 - height / 2}v${height}`;
  }).join(' ') ?? '', [peaks]);
  const position = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return bounds.width ? Math.max(0, Math.min(duration, (event.clientX - bounds.left) / bounds.width * duration)) : start;
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !drag.current || event.pointerId !== drag.current.pointerId) return;
    const value = clamp(position(event) - drag.current.offset);
    if (value !== drag.current.latest) { drag.current.latest = value; onChange(value); }
  };
  const finish = (event: React.PointerEvent<HTMLDivElement>, preview: boolean) => {
    if (!drag.current || event.pointerId !== drag.current.pointerId) return;
    if (preview) move(event);
    const value = drag.current.latest;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (preview && !disabled) onCommit(value);
  };
  const arrowKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
  return <div className="profile-sync-waveform">
    <div
      className="profile-sync-waveform-track"
      role="slider" aria-label="Section start" aria-valuemin={0} aria-valuemax={max} aria-valuenow={start}
      aria-valuetext={`${songTime(start)} to ${songTime(start + CLOSE_OUT_CLIP_SECONDS)}, 10 seconds`}
      aria-describedby={clipId + '-help'} aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
      onPointerDown={event => {
        if (disabled || event.button !== 0 || drag.current) return;
        event.preventDefault();
        event.currentTarget.focus();
        const at = position(event);
        const offset = at >= start && at <= start + CLOSE_OUT_CLIP_SECONDS ? at - start : CLOSE_OUT_CLIP_SECONDS / 2;
        drag.current = { pointerId: event.pointerId, offset, latest: start };
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event);
      }}
      onPointerMove={move} onPointerUp={event => finish(event, true)} onPointerCancel={event => finish(event, false)}
      onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        if (disabled || !arrowKeys.includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey || event.key.startsWith('Page') ? 5 : 1;
        const direction = ['ArrowLeft', 'ArrowDown', 'PageDown'].includes(event.key) ? -1 : 1;
        const value = event.key === 'Home' ? 0 : event.key === 'End' ? max : clamp(start + direction * step);
        keyboardValue.current = value;
        onChange(value);
      }}
      onKeyUp={event => {
        if (!disabled && arrowKeys.includes(event.key) && keyboardValue.current !== null) {
          onCommit(keyboardValue.current); keyboardValue.current = null;
        }
      }}
      onBlur={() => { keyboardValue.current = null; }}
    >
      <svg viewBox="0 0 720 96" preserveAspectRatio="none" role="img" aria-label={peaks ? 'Audio waveform' : 'Preview timeline'}>
        <defs><clipPath id={clipId}><rect x={start / duration * 720} y="0" width={CLOSE_OUT_CLIP_SECONDS / duration * 720} height="96" /></clipPath></defs>
        {path ? <>
          <path d={path} className="profile-sync-waveform-bars" />
          <path d={path} className="profile-sync-waveform-bars profile-sync-waveform-bars-selected" clipPath={`url(#${clipId})`} />
        </> : <path d="M0,48H720" className="profile-sync-waveform-baseline" />}
      </svg>
      <div className="profile-sync-waveform-selection" aria-hidden="true" style={{ left: `${start / duration * 100}%`, width: `${CLOSE_OUT_CLIP_SECONDS / duration * 100}%` }}>
        <span /><span />
      </div>
      {playhead !== null && <div className="profile-sync-waveform-playhead" aria-hidden="true" style={{ left: `${Math.max(0, Math.min(100, playhead / duration * 100))}%` }} />}
    </div>
    <div className="profile-sync-waveform-ruler" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map(tick => <span key={tick}>{songTime(duration * tick / 6)}</span>)}
    </div>
    <p id={clipId + '-help'} className="profile-sync-waveform-help">
      {loading ? 'Drawing waveform… ' : !peaks ? 'Waveform unavailable. You can still choose on the timeline. ' : ''}
      Drag to choose. Release to listen. Arrow keys adjust by one second.
    </p>
  </div>;
}
