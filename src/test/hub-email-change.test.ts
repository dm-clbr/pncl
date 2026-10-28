import { describe, expect, it, vi } from 'vitest';
import { changeHubWorkEmail, parseHubEmailChange } from '../../supabase/functions/_shared/hubEmailChange';
const userId='10000000-0000-4000-8000-000000000001';
const permitId='20000000-0000-4000-8000-000000000001';
const payload={userId,email:'new@thepncl.com'};
function setup(error?:string,failUpdate=false) {
 const rpc=vi.fn(async(name:string)=>name==='prepare_hub_work_email_change'?{data:{permitId},error:error?{message:error}:null}:{data:null,error:null});
 const getUserById=vi.fn(async()=>({data:{user:{id:userId,email:'old@thepncl.com'}},error:null}));
 const updateUserById=vi.fn(async()=>({data:{user:{id:userId,email:payload.email,email_confirmed_at:'today'}},error:failUpdate?{message:'private'}:null}));
 return {rpc:{rpc},admin:{auth:{admin:{getUserById,updateUserById}}},updateUserById};
}
describe('Hub administrator email changes',()=>{
 it('rejects identity overrides, domain lookalikes and malformed payloads',()=>{
  for(const input of [null,[],{...payload,adminId:userId},{...payload,email:'x@@thepncl.com'},{...payload,email:'x@thepncl.com.evil'},{...payload,userId:'bad'}]) expect(()=>parseHubEmailChange(input)).toThrow();
  expect(parseHubEmailChange({...payload,email:' NEW@THEPNCL.COM '})).toEqual(payload);
 });
 it('requires the guarded user-scoped RPC before an exact Auth Admin update',async()=>{
  const h=setup();expect(await changeHubWorkEmail(h.rpc,h.admin,payload)).toMatchObject(payload);
  expect(h.rpc.rpc).toHaveBeenCalledWith('prepare_hub_work_email_change',{p_user_id:userId,p_expected_email:'old@thepncl.com',p_email:payload.email});
  expect(h.updateUserById).toHaveBeenCalledExactlyOnceWith(userId,{email:payload.email,email_confirm:true});
  expect(h.rpc.rpc).toHaveBeenLastCalledWith('cancel_hub_work_email_change',{p_user_id:userId,p_permit_id:permitId});
 });
 it('does not mutate on denied, stale, duplicate or rate-limited authorization',async()=>{
  for(const [error,status] of [['admin_required',403],['email_taken',409],['email_changed',409],['email_change_cooldown',429]] as const){
   const h=setup(error);await expect(changeHubWorkEmail(h.rpc,h.admin,payload)).rejects.toMatchObject({status});expect(h.updateUserById).not.toHaveBeenCalled();
  }
 });
 it('revokes unused authorization and hides an ambiguous Auth failure',async()=>{
  const h=setup(undefined,true);await expect(changeHubWorkEmail(h.rpc,h.admin,payload)).rejects.toMatchObject({code:'update_failed'});
  expect(h.rpc.rpc).toHaveBeenLastCalledWith('cancel_hub_work_email_change',{p_user_id:userId,p_permit_id:permitId});
 });
 it('treats an already matching email as an idempotent read',async()=>{
  const h=setup();await changeHubWorkEmail(h.rpc,h.admin,{userId,email:'old@thepncl.com'});expect(h.rpc.rpc).not.toHaveBeenCalled();expect(h.updateUserById).not.toHaveBeenCalled();
 });
});
