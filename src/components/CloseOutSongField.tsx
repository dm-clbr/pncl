import { useId, useRef, useState } from 'react';
import { type CloseOutSong, type Json } from '../../supabase/functions/_shared/profileMirror';
import { profileSyncRequest } from '../lib/profile-sync';
import { SongPreviewPicker } from './SongPreviewPicker';

export function CloseOutSongField({ value, onChange, disabled = false }: { value: Json | undefined; onChange: (value: Json) => void; disabled?: boolean }) {
  const id = useId();
  const selected = value && typeof value === 'object' && !Array.isArray(value) ? value as CloseOutSong : null;
  const [query, setQuery] = useState('');
  const [songs, setSongs] = useState<CloseOutSong[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const sequence = useRef(0);

  async function search() {
    if (query.trim().length < 2 || searching || disabled) return;
    const requestId = ++sequence.current;
    setSearching(true);
    setMessage('');
    try {
      const result = await profileSyncRequest({ action: 'search_songs', query: query.trim() }) as { songs: CloseOutSong[] };
      if (requestId !== sequence.current) return;
      setSongs(result.songs);
      setMessage(result.songs.length ? `${result.songs.length} ${result.songs.length === 1 ? 'song' : 'songs'} found. Choose a song below.` : 'No songs found. Try another title or artist.');
    } catch (error) {
      if (requestId === sequence.current) setMessage(error instanceof Error ? error.message : 'Song search is unavailable. Try again.');
    } finally {
      if (requestId === sequence.current) setSearching(false);
    }
  }

  const options = selected && !songs.some(song => song.id === selected.id) ? [selected, ...songs] : songs;
  return <div className="profile-sync-field profile-sync-song">
    <label htmlFor={id + '-search'}>Search songs by title or artist</label>
    <div className="profile-sync-song-search">
      <input id={id + '-search'} type="search" value={query} maxLength={100} disabled={disabled}
        placeholder="Song title or artist" onChange={event => { sequence.current++; setSearching(false); setQuery(event.target.value); setMessage(''); }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void search(); } }} />
      <button type="button" disabled={disabled || searching || query.trim().length < 2} onClick={() => void search()}>{searching ? 'Searching…' : 'Search songs'}</button>
    </div>
    <label htmlFor={id + '-song'}>Close out song</label>
    <select id={id + '-song'} value={selected?.id ?? ''} disabled={disabled} aria-describedby={id + '-hint'}
      onChange={event => onChange(event.target.value === selected?.id ? selected : options.find(song => song.id === event.target.value) ?? null)}>
      <option value="">No song selected</option>
      {options.map(song => <option key={song.id} value={song.id}>{song.title} — {song.artist}</option>)}
    </select>
    {selected && <SongPreviewPicker key={selected.id} song={selected} onChange={onChange} disabled={disabled} />}
    <p id={id + '-hint'} className="profile-sync-note">Save your profile to keep this song and section on both platforms.</p>
    {message && <p role="status" className="profile-sync-note">{message}</p>}
  </div>;
}
