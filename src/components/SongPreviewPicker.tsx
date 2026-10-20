import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CLOSE_OUT_CLIP_SECONDS, MAX_SONG_PREVIEW_SECONDS, type CloseOutSong, type Json } from '../../supabase/functions/_shared/profileMirror';
import { profileSyncRequest } from '../lib/profile-sync';

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const storeLink = (url: string) => { const link = new URL(url); link.searchParams.set('app', 'itunes'); return link.toString(); };

export function SongPreviewPicker({ song, onChange, disabled }: { song: CloseOutSong; onChange: (value: Json) => void; disabled: boolean }) {
  const id = useId();
  const audio = useRef<HTMLAudioElement>(null);
  const end = useRef<number | null>(null);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playingSection, setPlayingSection] = useState(false);
  const start = Math.min(song.clipStartSeconds ?? 0, Math.max(0, (duration || song.previewDurationSeconds || CLOSE_OUT_CLIP_SECONDS) - CLOSE_OUT_CLIP_SECONDS));

  const stop = useCallback(() => {
    epoch.current++;
    end.current = null;
    audio.current?.pause();
    setPlayingSection(false);
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const player = audio.current; player?.setAttribute('disableremoteplayback', ''); return () => { player?.pause(); }; }, [url]);
  useEffect(() => { if (disabled) stop(); }, [disabled, stop]);
  useEffect(() => {
    if (!playingSection) return;
    const timer = window.setInterval(() => {
      if (end.current !== null && audio.current && audio.current.currentTime >= end.current) stop();
    }, 50);
    return () => window.clearInterval(timer);
  }, [playingSection, stop]);

  async function load() {
    if (loading || disabled) return;
    setLoading(true); setError('');
    try {
      const result = await profileSyncRequest({ action: 'song_preview', id: song.id }) as { url: string | null };
      if (!mounted.current) return;
      if (!result.url) { setError('Apple does not have a playable preview for this song. You can keep the song or choose another.'); setLoading(false); return; }
      setUrl(result.url);
    } catch (cause) {
      if (mounted.current) { setError(cause instanceof Error ? cause.message : 'The preview could not be loaded. Try again.'); setLoading(false); }
    }
  }
  function choose(seconds: number, previewDuration = duration) {
    if (previewDuration < CLOSE_OUT_CLIP_SECONDS || !Number.isFinite(seconds)) return;
    stop();
    onChange({ ...song, clipSource: 'apple_preview', previewDurationSeconds: previewDuration,
      clipStartSeconds: Math.min(previewDuration - CLOSE_OUT_CLIP_SECONDS, Math.max(0, Math.floor(seconds))), clipDurationSeconds: CLOSE_OUT_CLIP_SECONDS });
  }
  function loaded() {
    const seconds = Math.floor(audio.current?.duration ?? 0);
    if (!Number.isFinite(seconds) || seconds < CLOSE_OUT_CLIP_SECONDS || seconds > MAX_SONG_PREVIEW_SECONDS) {
      stop(); setUrl(null); setDuration(0); setLoading(false); setError('This preview cannot provide a 10-second section. Choose another song.'); return;
    }
    setDuration(seconds); setLoading(false);
    if (song.clipDurationSeconds !== CLOSE_OUT_CLIP_SECONDS || song.clipSource !== 'apple_preview' || song.previewDurationSeconds !== seconds || (song.clipStartSeconds ?? 0) + CLOSE_OUT_CLIP_SECONDS > seconds) choose(song.clipStartSeconds ?? 0, seconds);
  }
  async function playSection() {
    const player = audio.current;
    if (!player || !duration || disabled) return;
    if (playingSection) { stop(); return; }
    const request = ++epoch.current;
    setError('');
    end.current = start + CLOSE_OUT_CLIP_SECONDS;
    setPlayingSection(true);
    try {
      player.currentTime = start;
      if (player.seeking) await new Promise<void>((resolve, reject) => {
        const cleanup = () => { window.clearTimeout(timer); player.removeEventListener('seeked', seeked); player.removeEventListener('error', failed); };
        const seeked = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error('seek_failed')); };
        const timer = window.setTimeout(failed, 8000);
        player.addEventListener('seeked', seeked, { once: true }); player.addEventListener('error', failed, { once: true });
      });
      if (!mounted.current || request !== epoch.current) return;
      if (Math.abs(player.currentTime - start) > 0.25) throw new Error('seek_failed');
      await player.play();
      if (!mounted.current) { player.pause(); return; }
      if (request !== epoch.current) { if (end.current === null) player.pause(); return; }
      setPlayingSection(true);
    } catch { if (mounted.current && request === epoch.current) { end.current = null; setPlayingSection(false); player.pause(); setError('Your browser could not play that section. Try the audio controls or load it again.'); } }
  }
  const maxStart = Math.max(0, duration - CLOSE_OUT_CLIP_SECONDS);
  return <fieldset className="profile-sync-song-clip" disabled={disabled}>
    <legend>Choose a 10-second preview section</legend>
    <p className="profile-sync-note">Listen to Apple’s preview, then move the slider to choose your section. Times start at the beginning of this preview, not the full song.</p>
    <div className="profile-sync-song-store">
      <strong>{song.title} — {song.artist}</strong>
      <a href={storeLink(song.url)} target="_blank" rel="noreferrer"><img src="https://www.apple.com/ca/itunes/link/images/link-badge-itunes.png" width="138" height="40" alt="Get it on iTunes" /></a>
    </div>
    {!url && <button type="button" disabled={disabled || loading} onClick={() => void load()}>{loading ? 'Loading preview…' : 'Load preview'}</button>}
    {url && <audio ref={audio} src={url} controls preload="metadata" controlsList="nodownload noplaybackrate noremoteplayback" aria-label="Apple song preview"
      onLoadedMetadata={loaded} onPause={() => { end.current = null; setPlayingSection(false); }} onEnded={() => { end.current = null; setPlayingSection(false); }}
      onTimeUpdate={() => { if (end.current !== null && audio.current && audio.current.currentTime >= end.current) stop(); }}
      onError={() => { stop(); setUrl(null); setDuration(0); setLoading(false); setError('The preview could not be played. Load it again or choose another song.'); }} />}
    {url && loading && <p role="status" className="profile-sync-note">Loading preview audio…</p>}
    {(duration > 0 || song.clipStartSeconds !== undefined) && <p id={id + '-window'} className="profile-sync-song-window">{formatTime(start)}–{formatTime(start + CLOSE_OUT_CLIP_SECONDS)}<span> within Apple’s preview</span></p>}
    {duration > 0 && <>
      <label htmlFor={id + '-start'}>Section start</label>
      <input id={id + '-start'} type="range" min={0} max={maxStart} step={1} value={start} aria-valuetext={formatTime(start)} aria-describedby={id + '-window'} onChange={event => choose(Number(event.target.value))} />
      <div className="profile-sync-song-time">
        <div><label htmlFor={id + '-seconds'}>Start at (seconds)</label><input id={id + '-seconds'} type="number" inputMode="numeric" min={0} max={maxStart} step={1} value={start}
          onChange={event => { if (event.target.value !== '') choose(Number(event.target.value)); }} /></div>
        <button type="button" disabled={disabled} onClick={() => void playSection()}>{playingSection ? 'Stop section' : 'Play 10 seconds'}</button>
      </div>
    </>}
    {error && <p role="status" className="profile-sync-note">{error}</p>}
    <p className="profile-sync-note">Preview provided courtesy of iTunes. Your saved ten-second section is used for policy-issued TV celebrations when sound is enabled.</p>
  </fieldset>;
}
