"use client";


import { Button as UiButton } from "../../../../components/ui";
import { Input as UiInput } from "../../../../components/ui";
import { useEffect, useState } from "react";
import { SettingsShell } from "../../../../components/settings/SettingsShell";
import { api } from "../../../../lib/api";
type Profile = { id:string; displayName:string; email:string; emailVerifiedAt:string|null };
export default function ProfileSettings(){const [p,setP]=useState<Profile|null>(null);const [name,setName]=useState("");const [saved,setSaved]=useState(false);useEffect(()=>{api<Profile>("/me/profile",{org:true}).then(r=>{setP(r);setName(r.displayName)}).catch(()=>{})},[]);async function save(){const row=await api<Profile>("/me/profile",{method:"PATCH",org:true,body:JSON.stringify({displayName:name})});setP(row);setSaved(true);setTimeout(()=>setSaved(false),1600)}async function verify(){await api("/auth/email-verification/request",{method:"POST"});setSaved(true)}return <SettingsShell><div className="settings-section"><h2>Profile</h2><p>Your name and identity shown to collaborators.</p><div className="profile-edit"><div className="avatar-xl">{(p?.displayName||"PM").split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div className="form-stack"><label>Full name<UiInput className="input" value={name} onChange={e=>setName(e.target.value)}/></label><label>Email<UiInput className="input" value={p?.email||""} disabled/></label><div className="setting-inline"><span>{p?.emailVerifiedAt?"Email verified":"Email not yet verified"}</span>{!p?.emailVerifiedAt&&<UiButton variant="secondary"  onClick={verify}>Send verification email</UiButton>}</div><UiButton variant="primary" className="fit" disabled={!name.trim()} onClick={save}>Save changes</UiButton>{saved&&<span className="save-note">Saved</span>}</div></div></div></SettingsShell>}
