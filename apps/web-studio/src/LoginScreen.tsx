import { useState } from 'react'
import './LoginScreen.css'
type Tenant = {id:string;name:string;slug:string}
export default function LoginScreen({onLogin}:{onLogin:(token:string,tenant:string,tenants:Tenant[])=>void}){
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');let accessToken='';
  try {
   const r=await fetch('/api/v1/auth/native/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
   if(!r.ok){setError(r.status===401?'Invalid email or password':`Login failed (HTTP ${r.status})`);return}
   const data=await r.json();accessToken=data.access_token;
   if(!accessToken)throw new Error('No access token received');
   const response=await fetch('/api/v1/me/tenants',{headers:{Authorization:`Bearer ${accessToken}`}});
   if(!response.ok)throw new Error(`Tenant discovery failed (HTTP ${response.status})`);
   const tenants:Tenant[]=await response.json();
   if(!tenants.length)throw new Error('Your account has no active tenant memberships. Contact an administrator.');
   setPassword('');onLogin(accessToken,tenants[0].id,tenants);
  }catch(e){setError(e instanceof Error?e.message:'Network error');if(accessToken)void fetch('/api/v1/auth/native/logout',{method:'POST',headers:{Authorization:`Bearer ${accessToken}`}})}finally{setBusy(false)}
 }
 return <main className="iq-login"><form className="iq-login-card" onSubmit={submit}><h1>ArchitectIQ</h1><p>Enterprise AI &amp; Automation Studio</p><h2>Sign in</h2><label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p role="alert" className="iq-error">{error}</p>}<button disabled={busy} type="submit">{busy?'Signing in…':'Sign in'}</button><small>Session stays available when refreshing this tab until the access token expires (15 minutes).</small></form></main>
}
