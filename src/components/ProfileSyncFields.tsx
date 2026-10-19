import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { FIELDS, STATES, fieldFor, zero, type Json, type Clock, type System } from '../../supabase/functions/_shared/profileMirror';
import { profileSyncRequest } from '../lib/profile-sync';
import '../styles/profile-sync.css';
import { CloseOutSongField } from './CloseOutSongField';
export interface ProfileSyncHandle {save:(native?:Record<string,Json>)=>Promise<Record<string,Json>|undefined>}
interface SyncView {version:3;values:Record<string,Json>;clocks:Record<string,Clock>;conflicts:Record<string,{value:Json;clock:Clock}>;urls:Record<string,string>;pending:number;errors:number;linked:boolean;lastError?:string}
const labels={personal:'Personal information',home:'Home address',sizes:'Clothing sizes',business:'Business information',licensing:'Licensing',email:'Email identity',documents:'Documents'};
const str=(v:Json|undefined)=>typeof v==='string'?v:'';
const show=(v:Json)=>v===null?'Blank':typeof v==='object'?(v as Record<string,Json>).name as string||JSON.stringify(v):String(v);
export const ProfileSyncFields=forwardRef<ProfileSyncHandle,{userId:string;system:System;nativeDirty?:boolean;onDirty?:(dirty:boolean)=>void}>(function ProfileSyncFields({userId,system,nativeDirty=false,onDirty},ref){
  const id=useId(),[view,setView]=useState<SyncView|null>(null),[draft,setDraft]=useState<Record<string,Json>>({}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const current=useRef<SyncView|null>(null),draftRef=useRef<Record<string,Json>>({}),dirty=useRef(new Set<string>()),base=useRef<Record<string,Clock>>({}),pending=useRef<Record<string,unknown>|null>(null),saving=useRef(false),native=useRef(nativeDirty),mounted=useRef(true),onDirtyRef=useRef(onDirty);native.current=nativeDirty;onDirtyRef.current=onDirty;
  const install=useCallback((next:SyncView)=>{
    const previous=current.current;current.current=next;setView(next);
    const values={...draftRef.current};for(const [key,value]of Object.entries(next.values))if(!dirty.current.has(key)){values[key]=value;if(!native.current)base.current[key]=next.clocks[key];}
    draftRef.current=values;setDraft(values);
    if(previous&&JSON.stringify(previous.clocks)!==JSON.stringify(next.clocks))window.dispatchEvent(new CustomEvent('profile-sync-updated',{detail:{userId}}));
  },[userId]);
  useEffect(()=>{
    mounted.current=true;current.current=null;dirty.current.clear();base.current={};draftRef.current={};pending.current=null;setView(null);setDraft({});
    let stopped=false;
    const read=async()=>{if(saving.current)return;try{const next=await profileSyncRequest({action:'read'}) as SyncView;if(!stopped)install(next);}catch{if(!stopped)setMessage('Profile sync is temporarily unavailable. Your existing profile fields can still be saved.');}};
    void read();const timer=setInterval(read,10000);window.addEventListener('focus',read);
    return()=>{stopped=true;mounted.current=false;clearInterval(timer);window.removeEventListener('focus',read);};
  },[userId,install]);
  const edit=(key:string,value:Json)=>{if(!dirty.current.has(key))base.current[key]=current.current?.clocks[key]??zero();dirty.current.add(key);draftRef.current={...draftRef.current,[key]:value};setDraft(draftRef.current);pending.current=null;onDirtyRef.current?.(true);};
  useImperativeHandle(ref,()=>({save:async(nativeChanges={})=>{
    if(!current.current){if(dirty.current.size)throw new Error('Wait for profile sync to reconnect before saving these fields.');return;}
    const changes={...nativeChanges,...Object.fromEntries([...dirty.current].map(k=>[k,draftRef.current[k]]))};
    if(!Object.keys(changes).length)return;
    const signature=JSON.stringify(changes);
    if(!pending.current||pending.current.signature!==signature)pending.current={id:crypto.randomUUID(),changes,expected:Object.fromEntries(Object.keys(changes).map(k=>[k,base.current[k]??current.current!.clocks[k]??zero()])),signature};
    const {signature:unused,...request}=pending.current;saving.current=true;setBusy(true);
    try{
      const result=await profileSyncRequest({action:'save',request}) as {outcome:string;view:SyncView;conflicts:string[]};
      if(result.outcome!=='saved')throw new Error('This save could not be confirmed. Keep your changes and try again.');
      pending.current=null;dirty.current.clear();base.current={...result.view.clocks};onDirtyRef.current?.(false);install(result.view);setMessage('Saved. Updates are queued for your connected profile.');return result.view.values;
    }finally{saving.current=false;if(mounted.current)setBusy(false);}
  }}));
  const upload=async(field:string,file:File)=>{
    if(file.size>5*1024*1024){setMessage('Choose a file smaller than 5 MB.');return;}
    const bytes=await file.arrayBuffer();let binary='';for(const v of new Uint8Array(bytes))binary+=String.fromCharCode(v);
    saving.current=true;setBusy(true);
    try{const result=await profileSyncRequest({action:'upload',field,id:crypto.randomUUID(),clock:current.current?.clocks[field]??zero(),name:file.name,mime:file.type,base64:btoa(binary)}) as {outcome:string;view:SyncView};install(result.view);setMessage('File saved and queued for sync.');}catch(error){setMessage(error instanceof Error?error.message:'Upload failed.');}finally{saving.current=false;setBusy(false);}
  };
  if(!view)return <p className="profile-sync-note" role="status">{message||'Checking connected profile…'}</p>;
  const missing=FIELDS.filter(f=>!f[system]);
  const render=(key:string)=>{
    const f=fieldFor(key),value=draft[key];const inputId=id+'-'+key;
    if(f.kind==='song')return <CloseOutSongField key={key} value={value} disabled={busy} onChange={value=>edit(key,value)}/>;
    if(f.kind==='asset')return <div className="profile-sync-field" key={key}><label htmlFor={inputId}>{f.label}</label>{view.urls[key]&&<a href={view.urls[key]} target="_blank" rel="noreferrer">Open {show(value??null)}</a>}<input id={inputId} type="file" disabled={busy} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(key,file);e.target.value='';}}/>{value!=null&&<button type="button" onClick={()=>edit(key,null)}>Remove file</button>}</div>;
    if(f.kind==='licenses'){
      const licenses=(value&&typeof value==='object'&&!Array.isArray(value)?value:{}) as Record<string,string>;
      return <fieldset className="profile-sync-field" key={key}><legend>{f.label}</legend><p>Enter the license number for each state. Existing states without a number remain on your account.</p>{Object.entries(licenses).map(([state,number])=><div className="profile-sync-license" key={state}><label htmlFor={inputId+'-'+state}>{state}</label><input id={inputId+'-'+state} value={number} onChange={e=>edit(key,{...licenses,[state]:e.target.value})}/><button type="button" onClick={()=>{const next={...licenses};delete next[state];edit(key,next);}}>Remove</button></div>)}<label htmlFor={inputId}>Add state</label><select id={inputId} value="" onChange={e=>{if(e.target.value)edit(key,{...licenses,[e.target.value]:''});}}><option value="">Choose a state</option>{STATES.filter(s=>!(s in licenses)).map(s=><option key={s}>{s}</option>)}</select></fieldset>;
    }
    if(f.kind==='boolean')return <label className="profile-sync-field" key={key}><span>{f.label}</span><input type="checkbox" checked={value===true} onChange={e=>edit(key,e.target.checked)}/></label>;
    const options=f.options??(f.kind==='state'?STATES:null);
    return <div className="profile-sync-field" key={key}><label htmlFor={inputId}>{f.label}</label>{options?<select id={inputId} value={str(value)} onChange={e=>edit(key,e.target.value||null)}><option value="">Select</option>{options.map(o=><option key={o}>{o}</option>)}</select>:<input id={inputId} readOnly={f.derived} value={str(value)} type={f.kind==='email'?'email':'text'} onChange={e=>edit(key,e.target.value||null)}/>}</div>;
  };
  return <div className="profile-sync-fields" aria-busy={busy}>
    <p className="profile-sync-note" role="status">{view.linked?view.lastError?'Connected profile sync is paused. It will retry automatically.':view.errors?'Some profile updates need a retry.':view.pending?'Profile updates are syncing…':'Connected profile is up to date.':'Connect your PNCL and LeadSpply accounts to sync these details.'} {view.errors>0&&<button type="button" onClick={()=>void profileSyncRequest({action:'retry'}).then(v=>install(v as SyncView))}>Retry updates</button>}</p>
    <p className="profile-sync-note">Changes saved here or in your connected profile update both. The latest saved change wins.</p>
    {Object.entries(labels).map(([section,label])=>missing.some(f=>f.section===section)&&<section key={section}><h3>{label}</h3><div className="profile-sync-grid">{missing.filter(f=>f.section===section).map(f=>render(f.key))}</div></section>)}
    {system==='leadspply'&&<section><h3>My documents</h3>{Object.keys(view.values).filter(k=>k.startsWith('document:')&&view.values[k]!==null).map(key=><div key={key}>{render(key)}<label>Document name<input value={str(draft['document_label:'+key.slice(9)])} onChange={e=>edit('document_label:'+key.slice(9),e.target.value)}/></label></div>)}<label htmlFor={id+'-new-document'}>Add document</label><input id={id+'-new-document'} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload('document:'+crypto.randomUUID(),file);e.target.value='';}}/></section>}
    {message&&<p role="status" className="profile-sync-note">{message}</p>}
  </div>;
});
