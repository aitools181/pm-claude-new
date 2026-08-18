"use client";


import { Select as UiSelect, Button as UiButton } from "../../../../components/ui";
import { Input as UiInput } from "../../../../components/ui";
import { useEffect, useState } from "react";
import { useToast } from "../../../../components/ui/Toast";
import { SettingsShell } from "../../../../components/settings/SettingsShell";
import { api } from "../../../../lib/api";
type Profile = { id:string; displayName:string; username?:string|null; email:string; emailVerifiedAt:string|null; avatarUrl?:string|null; designation?:string|null; department?:string|null; managerUserId?:string|null; workingHours?:Record<string,{from?:string;to?:string}>|null; contactFields?:{phone?:string;mobile?:string;location?:string}|null };
type Member = { id:string; displayName:string };
export default function ProfileSettings(){
const toast=useToast();
const [p,setP]=useState<Profile|null>(null);const [saved,setSaved]=useState(false);const [members,setMembers]=useState<Member[]>([]);
const [f,setF]=useState({displayName:"",username:"",avatarUrl:"",designation:"",department:"",managerUserId:"",phone:"",mobile:"",location:"",workFrom:"",workTo:""});
const [loadError,setLoadError]=useState('');
useEffect(()=>{api<Profile>("/me/profile",{org:true}).then(r=>{setP(r);const wh=(r.workingHours||{}) as {default?:{from?:string;to?:string}};setF({displayName:r.displayName,username:r.username||"",avatarUrl:r.avatarUrl||"",designation:r.designation||"",department:r.department||"",managerUserId:r.managerUserId||"",phone:r.contactFields?.phone||"",mobile:r.contactFields?.mobile||"",location:r.contactFields?.location||"",workFrom:wh.default?.from||"",workTo:wh.default?.to||""});setLoadError('')}).catch(e=>setLoadError(e instanceof Error?e.message:'Could not load your profile.'));api<Member[]>("/directory/members",{org:true}).then(setMembers).catch(()=>{})},[]);
async function save(){
  const body={displayName:f.displayName,username:f.username.trim()||null,avatarUrl:f.avatarUrl.trim()||null,designation:f.designation.trim()||null,department:f.department.trim()||null,managerUserId:f.managerUserId||null,
    contactFields:(f.phone||f.mobile||f.location)?{phone:f.phone||undefined,mobile:f.mobile||undefined,location:f.location||undefined}:null,
    workingHours:(f.workFrom&&f.workTo)?{default:{from:f.workFrom,to:f.workTo}}:null};
  try{const row=await api<Profile>("/me/profile",{method:"PATCH",org:true,body:JSON.stringify(body)});setP(row);setSaved(true);setTimeout(()=>setSaved(false),1600)}
  catch(e){toast({message:e instanceof Error?e.message:"Could not save your profile",tone:"error"})}
}
async function verify(){try{await api("/auth/email-verification/request",{method:"POST"});setSaved(true);toast({message:"Verification email sent"})}catch(e){toast({message:e instanceof Error?e.message:"Could not send the verification email",tone:"error"})}}
return <SettingsShell><div className="settings-section"><h2>Profile</h2><p>Your identity, role details, contact information and working hours shown to collaborators.</p>
{!p&&loadError&&<div className="callout callout-danger profile-load-error"><span>{loadError}</span></div>}
{!p&&!loadError&&<p className="muted">Loading your profile…</p>}
{p&&<div className="profile-edit">
  <div className="avatar-xl">{f.avatarUrl?<img src={f.avatarUrl} alt="" className="avatar-img"/>:(p?.displayName||"PM").split(" ").map(x=>x[0]).slice(0,2).join("")}</div>
  <div className="form-stack">
    <label>Full name<UiInput className="input" value={f.displayName} onChange={e=>setF({...f,displayName:e.target.value})}/></label>
    <label>Email<UiInput className="input" value={p?.email||""} disabled/></label>
    <label>Username (for sign-in)<UiInput className="input" value={f.username} onChange={e=>setF({...f,username:e.target.value.toLowerCase()})} placeholder="it.admin" pattern="[a-z0-9_.\-]{3,32}"/></label>
    <div className="setting-inline"><span>{p?.emailVerifiedAt?"Email verified":"Email not yet verified"}</span>{!p?.emailVerifiedAt&&<UiButton variant="secondary"  onClick={verify}>Send verification email</UiButton>}</div>
    <label>Photo URL<UiInput className="input" value={f.avatarUrl} onChange={e=>setF({...f,avatarUrl:e.target.value})} placeholder="https://…/me.jpg"/></label>
    <div className="profile-two-col">
      <label>Designation<UiInput className="input" value={f.designation} onChange={e=>setF({...f,designation:e.target.value})} placeholder="Senior Engineer"/></label>
      <label>Department<UiInput className="input" value={f.department} onChange={e=>setF({...f,department:e.target.value})} placeholder="Engineering"/></label>
    </div>
    <label>Manager<UiSelect className="input" value={f.managerUserId} onChange={e=>setF({...f,managerUserId:e.target.value})}><option value="">No manager</option>{members.filter(m=>m.id!==p?.id).map(m=><option key={m.id} value={m.id}>{m.displayName}</option>)}</UiSelect></label>
    <div className="profile-two-col">
      <label>Phone<UiInput className="input" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></label>
      <label>Mobile<UiInput className="input" value={f.mobile} onChange={e=>setF({...f,mobile:e.target.value})}/></label>
    </div>
    <label>Location<UiInput className="input" value={f.location} onChange={e=>setF({...f,location:e.target.value})} placeholder="Gandhinagar office"/></label>
    <div className="profile-two-col">
      <label>Working hours from<UiInput className="input" type="time" value={f.workFrom} onChange={e=>setF({...f,workFrom:e.target.value})}/></label>
      <label>to<UiInput className="input" type="time" value={f.workTo} onChange={e=>setF({...f,workTo:e.target.value})}/></label>
    </div>
    <UiButton variant="primary" className="fit" disabled={!f.displayName.trim()} onClick={save}>Save changes</UiButton>{saved&&<span className="save-note">Saved</span>}
  </div>
</div>}
</div></SettingsShell>}
