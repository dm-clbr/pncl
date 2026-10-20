import { expect, it } from 'vitest';
import { normalize } from '../../supabase/functions/_shared/profileMirror';
const song={provider:'apple',id:'123',title:'Song',artist:'Artist',url:'https://music.apple.com/us/song/123'};
const clip={...song,clipSource:'apple_preview',previewDurationSeconds:30,clipStartSeconds:20,clipDurationSeconds:10};
it('keeps existing song selections compatible',()=>{expect(normalize('close_out_song',song)).toEqual(song);});
it('accepts the last ten seconds within an Apple preview',()=>{expect(normalize('close_out_song',clip)).toEqual(clip);});
it.each([
 {clipStartSeconds:-1}, {clipStartSeconds:1.5}, {clipDurationSeconds:11},
 {clipStartSeconds:21}, {clipStartSeconds:'12'}, {previewDurationSeconds:5},
 {previewDurationSeconds:null}, {previewDurationSeconds:Infinity}, {previewDurationSeconds:601},
 {clipSource:'full_song'}, {clipSource:undefined}, {clipDurationSeconds:undefined},
 {previewUrl:'https://example.com/audio.mp3'},
])('rejects invalid or out-of-bounds preview metadata: %j',extra=>{expect(()=>normalize('close_out_song',{...clip,...extra})).toThrow();});
it('requires all preview fields when saving a section',()=>{expect(()=>normalize('close_out_song',{...song,clipStartSeconds:0})).toThrow();});

it('preserves legacy six-second event payloads for idempotent sync',()=>{const old={...clip,clipStartSeconds:24,clipDurationSeconds:6};expect(normalize('close_out_song',old)).toEqual(old);});
