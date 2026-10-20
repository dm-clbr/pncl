import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SongPreviewPicker } from '../components/SongPreviewPicker';
import type { CloseOutSong } from '../../supabase/functions/_shared/profileMirror';
import { profileSyncRequest } from '../lib/profile-sync';
vi.mock('../lib/profile-sync',()=>({profileSyncRequest:vi.fn()}));
const request=vi.mocked(profileSyncRequest);
const song:CloseOutSong={provider:'apple',id:'123',title:'Song',artist:'Artist',url:'https://music.apple.com/us/song/123'};
const changed=vi.fn();
function Form({disabled=false}:{disabled?:boolean}){const [value,setValue]=useState(song);return <SongPreviewPicker song={value} disabled={disabled} onChange={v=>{changed(v);setValue(v as CloseOutSong);}}/>;}
beforeEach(()=>{request.mockReset();changed.mockReset();vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function load(seconds=30){
 request.mockResolvedValue({url:'https://audio-ssl.itunes.apple.com/test.m4a'});
 fireEvent.click(screen.getByRole('button',{name:'Load preview'}));
 const audio=await screen.findByLabelText('Apple song preview') as HTMLAudioElement;
 Object.defineProperty(audio,'duration',{configurable:true,value:seconds});fireEvent.loadedMetadata(audio);return audio;
}
it('loads on demand, shows attribution and store link, and never autoplays',async()=>{
 render(<Form/>);expect(request).not.toHaveBeenCalled();await load();
 expect(request).toHaveBeenCalledWith({action:'song_preview',id:'123'});expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
 expect(screen.getByRole('link',{name:'Get it on iTunes'})).toHaveAttribute('href','https://music.apple.com/us/song/123?app=itunes');
 expect(screen.getByText(/provided courtesy of iTunes/)).toBeInTheDocument();
 expect(changed).toHaveBeenLastCalledWith({...song,clipSource:'apple_preview',previewDurationSeconds:30,clipStartSeconds:0,clipDurationSeconds:10});
});
it('moves an exact ten-second window and clamps it inside the preview',async()=>{
 render(<Form/>);await load();fireEvent.change(screen.getByLabelText('Section start'),{target:{value:'12'}});
 expect(screen.getByText('0:12–0:22')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Start at (seconds)'),{target:{value:'29'}});
 expect(screen.getByText('0:20–0:30')).toBeInTheDocument();expect(changed.mock.lastCall?.[0].clipStartSeconds).toBe(20);
});
it('plays from the chosen start and stops at the selected end',async()=>{
 render(<Form/>);const audio=await load();fireEvent.change(screen.getByLabelText('Section start'),{target:{value:'12'}});
 fireEvent.click(screen.getByRole('button',{name:'Play 10 seconds'}));await screen.findByRole('button',{name:'Stop section'});
 expect(audio.currentTime).toBe(12);expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
 audio.currentTime=22;fireEvent.timeUpdate(audio);
 expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();expect(screen.getByRole('button',{name:'Play 10 seconds'})).toBeInTheDocument();
});
it('preserves the song and saved section when Apple has no preview',async()=>{
 const old={...song,clipSource:'apple_preview' as const,previewDurationSeconds:30,clipStartSeconds:12,clipDurationSeconds:10 as const};
 request.mockResolvedValue({url:null});render(<SongPreviewPicker song={old} onChange={changed} disabled={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'Load preview'}));await screen.findByText(/does not have a playable preview/);
 expect(changed).not.toHaveBeenCalled();expect(screen.getByText('0:12–0:22')).toBeInTheDocument();
});
it('rejects short previews and leaves the saved selection alone',async()=>{
 render(<Form/>);await load(5);expect(screen.getByText(/cannot provide a 10-second section/)).toBeInTheDocument();expect(changed).not.toHaveBeenCalled();
});
it('stops playback when leaving the song and ignores a late lookup',async()=>{
 const first=render(<Form/>);await load();const pause=vi.mocked(HTMLMediaElement.prototype.pause);pause.mockClear();first.unmount();expect(pause).toHaveBeenCalled();
 let resolve!:(v:unknown)=>void;request.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const next=render(<Form/>);fireEvent.click(screen.getByRole('button',{name:'Load preview'}));next.unmount();await act(async()=>resolve({url:'https://audio-ssl.itunes.apple.com/late.m4a'}));expect(document.querySelector('audio')).toBeNull();
});
it('keeps a failed play recoverable and disables section edits while saving',async()=>{
 const page=render(<Form/>);await load();vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('blocked'));
 fireEvent.click(screen.getByRole('button',{name:'Play 10 seconds'}));await screen.findByText(/browser could not play/);
 page.rerender(<Form disabled/>);expect(screen.getByLabelText('Section start')).toBeDisabled();expect(screen.getByRole('button',{name:'Play 10 seconds'})).toBeDisabled();
});

it('does not play from the wrong position when seeking fails',async()=>{
 render(<Form/>);const audio=await load();fireEvent.change(screen.getByLabelText('Section start'),{target:{value:'12'}});
 Object.defineProperty(audio,'currentTime',{configurable:true,get:()=>0,set:()=>{}});
 fireEvent.click(screen.getByRole('button',{name:'Play 10 seconds'}));await screen.findByText(/could not play that section/);
 expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
