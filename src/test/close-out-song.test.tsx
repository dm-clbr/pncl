import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CloseOutSongField } from '../components/CloseOutSongField';
import { profileSyncRequest } from '../lib/profile-sync';
vi.mock('../lib/profile-sync',()=>({profileSyncRequest:vi.fn()}));
const request=vi.mocked(profileSyncRequest);
const song={provider:'apple' as const,id:'123',title:'Test Song',artist:'Test Artist',url:'https://music.apple.com/us/song/123'};
beforeEach(()=>{request.mockReset();});
it('searches on demand and selects song metadata without playing audio',async()=>{
 request.mockResolvedValue({songs:[song]});const change=vi.fn();render(<CloseOutSongField value={null} onChange={change}/>);
 fireEvent.change(screen.getByLabelText('Search songs by title or artist'),{target:{value:'Test'}});
 expect(request).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Search songs'}));
 await screen.findByRole('option',{name:'Test Song — Test Artist'});
 fireEvent.change(screen.getByLabelText('Close out song'),{target:{value:'123'}});expect(change).toHaveBeenCalledWith(song);
 expect(request).toHaveBeenCalledWith({action:'search_songs',query:'Test'});
 expect(document.querySelector('audio')).toBeNull();
});
it('preserves the selected song when search fails and lets the owner remove it',async()=>{
 request.mockRejectedValue(new Error('Search unavailable'));const change=vi.fn();render(<CloseOutSongField value={song} onChange={change}/>);
 fireEvent.change(screen.getByLabelText('Search songs by title or artist'),{target:{value:'Another song'}});
 fireEvent.click(screen.getByRole('button',{name:'Search songs'}));await screen.findByText('Search unavailable');
 expect(screen.getByLabelText('Close out song')).toHaveValue('123');expect(change).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Close out song'),{target:{value:''}});expect(change).toHaveBeenCalledWith(null);
});
it('does not submit the parent profile form when Enter searches',async()=>{
 request.mockResolvedValue({songs:[]});const submit=vi.fn();render(<form onSubmit={submit}><CloseOutSongField value={null} onChange={vi.fn()}/></form>);
 const search=screen.getByLabelText('Search songs by title or artist');fireEvent.change(search,{target:{value:'No match'}});fireEvent.keyDown(search,{key:'Enter'});
 await waitFor(()=>expect(request).toHaveBeenCalled());expect(submit).not.toHaveBeenCalled();await screen.findByText('No songs found. Try another title or artist.');
});
