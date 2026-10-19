import {createRef} from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {ProfileSyncFields,type ProfileSyncHandle} from '../components/ProfileSyncFields';
import {FIELDS} from '../../supabase/functions/_shared/profileMirror';
import {profileSyncRequest} from '../lib/profile-sync';
vi.mock('../lib/profile-sync',()=>({profileSyncRequest:vi.fn()}));
const request=vi.mocked(profileSyncRequest);
const base=()=>({version:3,values:Object.fromEntries(FIELDS.map(f=>[f.key,null])),clocks:Object.fromEntries(FIELDS.map(f=>[f.key,{pncl:0,leadspply:0}])),conflicts:{},urls:{},pending:0,errors:0,linked:true});
beforeEach(()=>request.mockReset());
describe('production profile fields',()=>{
 it('adds counterpart fields without duplicating native contact fields',async()=>{
  request.mockResolvedValue(base());render(<ProfileSyncFields userId="u" system="pncl"/>);
  expect(await screen.findByLabelText('Business legal name')).toBeInTheDocument();expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/save/i})).not.toBeInTheDocument();
 });
 it('saves through the parent button and preserves drafts across refresh',async()=>{
  const view=base();request.mockResolvedValue(view);const ref=createRef<ProfileSyncHandle>(),dirty=vi.fn();render(<ProfileSyncFields ref={ref} userId="u" system="pncl" onDirty={dirty}/>);
  const input=await screen.findByLabelText('Business legal name');fireEvent.change(input,{target:{value:'My agency'}});expect(dirty).toHaveBeenCalledWith(true);
  fireEvent(window,new Event('focus'));await waitFor(()=>expect(request).toHaveBeenCalledTimes(2));expect(input).toHaveValue('My agency');
  request.mockResolvedValue({outcome:'saved',view:{...view,values:{...view.values,business_legal_name:'My agency'}},conflicts:[]});await act(()=>ref.current!.save());
  expect(request).toHaveBeenLastCalledWith(expect.objectContaining({action:'save',request:expect.objectContaining({changes:{business_legal_name:'My agency'}})}));expect(dirty).toHaveBeenLastCalledWith(false);
 });
 it('honors an explicit conflict choice over a stale native form value',async()=>{
  const view=base();view.values.first_name='Here';const withConflict={...view,conflicts:{first_name:{value:'Other',clock:{pncl:1,leadspply:1}}}};request.mockResolvedValue(withConflict);const ref=createRef<ProfileSyncHandle>();render(<ProfileSyncFields ref={ref} userId="u" system="pncl"/>);
  expect(await screen.findByText('Some profile details need your review.')).toBeInTheDocument();fireEvent.click(await screen.findByRole('button',{name:'Use other value'}));request.mockResolvedValue({outcome:'saved',view:{...view,values:{...view.values,first_name:'Other'}},conflicts:[]});await act(()=>ref.current!.save({first_name:'Stale'}));
  expect(request).toHaveBeenLastCalledWith(expect.objectContaining({request:expect.objectContaining({changes:{first_name:'Other'},resolve:['first_name']})}));
 });
});
