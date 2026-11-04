import {createRef} from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ProfileSyncFields,type ProfileSyncHandle} from '../components/ProfileSyncFields';
import {FIELDS} from '../../supabase/functions/_shared/profileMirror';
import {profileSyncRequest} from '../lib/profile-sync';
vi.mock('../lib/profile-sync',()=>({profileSyncRequest:vi.fn()}));
const request=vi.mocked(profileSyncRequest);
const base=()=>({version:3,values:Object.fromEntries(FIELDS.map(f=>[f.key,null])),clocks:Object.fromEntries(FIELDS.map(f=>[f.key,{pncl:0,leadspply:0}])),conflicts:{},urls:{},pending:0,errors:0,linked:true});
beforeEach(()=>request.mockReset());
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
describe('production profile fields',()=>{
 it('adds counterpart fields without duplicating native contact fields',async()=>{
  request.mockResolvedValue(base());render(<ProfileSyncFields userId="u" system="pncl"/>);
  expect(await screen.findByLabelText('Business legal name')).toBeInTheDocument();expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/save/i})).not.toBeInTheDocument();
 });
 it('keeps edits local until the parent Save profile action',async()=>{
  vi.useFakeTimers();
  const view=base();request.mockResolvedValue(view);const ref=createRef<ProfileSyncHandle>(),dirty=vi.fn();render(<ProfileSyncFields ref={ref} userId="u" system="pncl" onDirty={dirty}/>);
  await act(async()=>{});
  const input=screen.getByLabelText('Business legal name');fireEvent.change(input,{target:{value:'My agency'}});expect(dirty).toHaveBeenCalledWith(true);
  fireEvent(window,new Event('focus'));expect(request).toHaveBeenCalledTimes(1);
  await act(()=>vi.advanceTimersByTimeAsync(3600000));expect(request).toHaveBeenCalledTimes(1);expect(input).toHaveValue('My agency');
  request.mockResolvedValue({outcome:'saved',view:{...view,values:{...view.values,business_legal_name:'My agency'}},conflicts:[]});await act(()=>ref.current!.save());
  expect(request).toHaveBeenLastCalledWith(expect.objectContaining({action:'save',request:expect.objectContaining({changes:{business_legal_name:'My agency'}})}));expect(dirty).toHaveBeenLastCalledWith(false);
 });
 it('saves the edited value without a review step even if an older response contains a conflict',async()=>{
  const view=base();const withConflict={...view,conflicts:{first_name:{value:'Other',clock:{pncl:1,leadspply:1}}}};request.mockResolvedValue(withConflict);const ref=createRef<ProfileSyncHandle>();render(<ProfileSyncFields ref={ref} userId="u" system="pncl"/>);
  await screen.findByLabelText('Business legal name');
  expect(screen.queryByRole('button',{name:'Use other value'})).not.toBeInTheDocument();
  expect(screen.queryByText(/needs review/)).not.toBeInTheDocument();
  request.mockResolvedValue({outcome:'saved',view:{...view,values:{...view.values,first_name:'My latest name'}},conflicts:[]});await act(()=>ref.current!.save({first_name:'My latest name'}));
  expect(request).toHaveBeenLastCalledWith(expect.objectContaining({request:expect.objectContaining({changes:{first_name:'My latest name'}})}));
 });
});

describe('profile loading without polling',()=>{
 it('keeps a single read in flight and aborts it when leaving the profile',async()=>{
  vi.useFakeTimers();request.mockImplementation(()=>new Promise(()=>{}));
  const page=render(<ProfileSyncFields userId="u" system="pncl"/>);
  await act(()=>vi.advanceTimersByTimeAsync(120000));
  expect(screen.getByRole('status')).toHaveTextContent('temporarily unavailable');
  fireEvent(window,new Event('focus'));fireEvent(document,new Event('visibilitychange'));
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][1]?.timeout).toBe(15000);
  const signal=request.mock.calls[0][1]!.signal!;
  page.unmount();expect(signal.aborted).toBe(true);
 });
 it('never retries automatically after failure, but supports an explicit display reload',async()=>{
  vi.useFakeTimers();request.mockRejectedValue(new Error('unavailable'));
  render(<ProfileSyncFields userId="u" system="pncl"/>);await act(async()=>{});
  expect(screen.getByRole('status')).toHaveTextContent('temporarily unavailable');
  fireEvent(window,new Event('focus'));
  fireEvent(document,new Event('visibilitychange'));
  await act(()=>vi.advanceTimersByTimeAsync(3600000));expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValue(base());
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Try loading again'})));expect(request).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(/Profile sync is temporarily unavailable/)).not.toBeInTheDocument();
  await act(()=>vi.advanceTimersByTimeAsync(3600000));expect(request).toHaveBeenCalledTimes(2);
 });
 it('does not refetch on focus, tab visibility changes, or elapsed time after a successful load',async()=>{
  vi.useFakeTimers();let hidden=false;vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden);
  request.mockResolvedValue(base());render(<ProfileSyncFields userId="u" system="pncl"/>);
  await act(async()=>{});expect(request).toHaveBeenCalledTimes(1);
  hidden=true;fireEvent(document,new Event('visibilitychange'));
  await act(()=>vi.advanceTimersByTimeAsync(3600000));expect(request).toHaveBeenCalledTimes(1);
  hidden=false;fireEvent(document,new Event('visibilitychange'));fireEvent(window,new Event('focus'));
  await act(()=>vi.advanceTimersByTimeAsync(3600000));expect(request).toHaveBeenCalledTimes(1);
 });
 it('retains unsaved edits and the request identity when Save profile fails',async()=>{
  const view=base(),ref=createRef<ProfileSyncHandle>();request.mockResolvedValue(view);
  render(<ProfileSyncFields ref={ref} userId="u" system="pncl"/>);
  const input=await screen.findByLabelText('Business legal name');fireEvent.change(input,{target:{value:'My agency'}});
  request.mockRejectedValueOnce(new Error('offline'));
  await act(async()=>{await expect(ref.current!.save()).rejects.toThrow('offline');});
  const failedRequest=request.mock.calls[1][0];expect(input).toHaveValue('My agency');
  request.mockResolvedValue({outcome:'saved',view:{...view,values:{...view.values,business_legal_name:'My agency'}},conflicts:[]});
  await act(()=>ref.current!.save());expect(request.mock.calls[2][0]).toEqual(failedRequest);
 });
});
