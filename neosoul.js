/* ============================================================
   NeoSoul — auth + storage adapter.

   Runs in two modes:
     'local'    — browser only, no account server. For trying the flow.
     'supabase' — real accounts and a real database.

   Switch by filling in SUPABASE_URL and SUPABASE_ANON_KEY below.
   Nothing else in the app changes.
   ============================================================ */

const SUPABASE_URL      = '';   // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = '';   // the public anon key, safe in the browser

export const MODE = (SUPABASE_URL && SUPABASE_ANON_KEY) ? 'supabase' : 'local';

/* ---------- local mode ---------- */
const LK = 'neosoul.app.v1';
const lread  = () => { try { return JSON.parse(localStorage.getItem(LK) || '{}'); }
                       catch(e){ return {}; } };
const lwrite = db => localStorage.setItem(LK, JSON.stringify(db));

const local = {
  async signUp({ email, password, name }){
    const db = lread();
    db.users = db.users || {};
    if (db.users[email]) throw new Error('An account with that email already exists.');
    db.users[email] = {
      id: crypto.randomUUID(), email, password,          // local mode only — never do this on a server
      name, created_at: new Date().toISOString(),
      trial_started: new Date().toISOString(),
      plan: 'trial'
    };
    db.session = email; lwrite(db);
    return db.users[email];
  },
  async signIn({ email, password }){
    const db = lread();
    const u = (db.users || {})[email];
    if (!u || u.password !== password) throw new Error('Email or password is not right.');
    db.session = email; lwrite(db);
    return u;
  },
  async signOut(){ const db = lread(); delete db.session; lwrite(db); },
  async getUser(){ const db = lread(); return db.session ? db.users[db.session] : null; },

  async getEntries(uid){ const db = lread(); return (db.entries || {})[uid] || {}; },
  async putEntry(uid, date, patch){
    const db = lread();
    db.entries = db.entries || {}; db.entries[uid] = db.entries[uid] || {};
    db.entries[uid][date] = { ...(db.entries[uid][date] || {}), ...patch,
                              updated_at: new Date().toISOString() };
    lwrite(db); return db.entries[uid][date];
  },
  async getDoc(uid, key){ const db = lread(); return ((db.docs||{})[uid]||{})[key] || null; },
  async putDoc(uid, key, value){
    const db = lread();
    db.docs = db.docs || {}; db.docs[uid] = db.docs[uid] || {};
    db.docs[uid][key] = value; lwrite(db); return value;
  }
};

/* ---------- supabase mode ---------- */
let sb = null;
async function client(){
  if (sb) return sb;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return sb;
}
const remote = {
  async signUp({ email, password, name }){
    const s = await client();
    const { data, error } = await s.auth.signUp({
      email, password,
      options:{ data:{ name }, emailRedirectTo: location.origin + '/journal.html' }
    });
    if (error) throw new Error(error.message);
    return data.user;
  },
  async signIn({ email, password }){
    const s = await client();
    const { data, error } = await s.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data.user;
  },
  async signOut(){ const s = await client(); await s.auth.signOut(); },
  async getUser(){
    const s = await client();
    const { data } = await s.auth.getUser();
    return data.user || null;
  },
  async getEntries(){
    const s = await client();
    const { data, error } = await s.from('daily_entries').select('*');
    if (error) throw error;
    const out = {}; (data||[]).forEach(r => out[r.entry_date] = r); return out;
  },
  async putEntry(uid, date, patch){
    const s = await client();
    const { data, error } = await s.from('daily_entries')
      .upsert({ user_id: uid, entry_date: date, ...patch },
              { onConflict: 'user_id,entry_date' })
      .select().single();
    if (error) throw error;  return data;
  },
  async getDoc(uid, key){
    const s = await client();
    const { data } = await s.from('app_docs').select('value').eq('key', key).maybeSingle();
    return data ? data.value : null;
  },
  async putDoc(uid, key, value){
    const s = await client();
    await s.from('app_docs').upsert({ user_id: uid, key, value }, { onConflict:'user_id,key' });
    return value;
  }
};

export const api = MODE === 'supabase' ? remote : local;

/* ---------- trial state ---------- */
export const TRIAL_DAYS = 14;
export function trialState(user){
  const start = new Date(user.trial_started || user.created_at ||
                         user.created_at_iso || Date.now());
  const used  = Math.floor((Date.now() - start.getTime()) / 864e5);
  const left  = Math.max(0, TRIAL_DAYS - used);
  return { used, left, expired: left === 0, plan: user.plan || 'trial' };
}

/* ---------- route guard ---------- */
export async function requireUser(redirect = 'join.html'){
  const u = await api.getUser();
  if (!u){ location.replace(redirect); return null; }
  return u;
}
