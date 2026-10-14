/* ========================================================================
   CHAINSCORE — client-side scoring engine + app shell
   ======================================================================== */

const DEVICE_ITEMS = [
  {id:'os_update', label:'Operating system is fully up to date', weight:20},
  {id:'firewall', label:'Firewall is enabled', weight:15},
  {id:'disk_encryption', label:'Disk encryption is enabled (BitLocker / FileVault)', weight:20},
  {id:'screen_lock', label:'Screen auto-locks after inactivity', weight:10},
  {id:'antivirus', label:'Antivirus / endpoint protection is active', weight:15},
  {id:'backups', label:'Automatic backups are enabled', weight:10},
  {id:'admin_separation', label:'You use a standard (non-admin) account day-to-day', weight:10},
];
const BROWSING_ITEMS = [
  {id:'check_url', label:'You check the URL/domain before entering a password', weight:20},
  {id:'no_unknown_links', label:"You avoid clicking links from unknown senders", weight:20},
  {id:'https_only', label:'You verify HTTPS/padlock before entering sensitive info', weight:15},
  {id:'no_shared_session', label:"You don't stay logged in on shared/public devices", weight:15},
  {id:'tracker_blocking', label:'You use tracker/ad blocking or private browsing', weight:15},
  {id:'review_extensions', label:'You periodically review installed browser extensions', weight:15},
];
const SENSITIVITY = [
  {id:'critical', label:'Critical (email / recovery)', order:3},
  {id:'important', label:'Important (banking / social)', order:2},
  {id:'low', label:'Low (forum / other)', order:1},
];
const COMMON_LEAKED = ['password','password1','123456','123456789','qwerty','111111','abc123','letmein','iloveyou','admin','welcome','monkey','football','dragon','master','qwertyuiop','123123','000000','password123','1q2w3e4r'];
const PILLAR_WEIGHT = {device:0.35, browsing:0.25, password:0.40};

/* ---------------- state ---------------- */
let state = {
  device: {}, browsing: {}, passwords: [],
  lastResult: null,
  history: [],
  simAnswers: {},
};
DEVICE_ITEMS.forEach(i=>state.device[i.id]=false);
BROWSING_ITEMS.forEach(i=>state.browsing[i.id]=false);

let capDb=null, capUser=null, capSample=null, capDownloads=null, uid=null;

async function initCapabilities(){
  try{
    capDb = await window.claude.use('db');
    capUser = await window.claude.use('user');
    capSample = await window.claude.use('sample');
    capDownloads = await window.claude.use('downloads');
    if(capUser){ uid = await capUser.id(); }
  }catch(e){ console.warn('capability init failed', e); }
  loadHistory();
}
if(window.claude){ initCapabilities(); } else { loadHistory(); }

/* ---------------- routing ---------------- */
function show(id){ ['view-landing','view-auth','view-app'].forEach(v=>document.getElementById(v).classList.toggle('hidden', v!==id)); window.scrollTo(0,0); }
function goLanding(){ show('view-landing'); }
function goAuth(tab){ show('view-auth'); setAuthTab(tab||'login'); }
let authTab='login';
function setAuthTab(tab){
  authTab=tab;
  document.getElementById('tabLogin').classList.toggle('active', tab==='login');
  document.getElementById('tabSignup').classList.toggle('active', tab==='signup');
  document.getElementById('signupNameField').classList.toggle('hidden', tab!=='signup');
  document.getElementById('authSubmitBtn').textContent = tab==='signup' ? 'Create Account' : 'Log In';
}
function submitAuth(){
  const name = (document.getElementById('authName').value||'').trim();
  const initials = name ? name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase() : 'U';
  document.getElementById('userAvatar').textContent = initials;
  show('view-app');
  renderChecklists();
  renderPwList();
  switchAppTab(state.lastResult ? 'dashboard' : 'intake');
}
function doLogout(){ toggleUserMenu(); show('view-landing'); }
function toggleUserMenu(){ document.getElementById('userDropdown').classList.toggle('hidden'); }
document.addEventListener('click', (e)=>{
  const menu=document.getElementById('userDropdown');
  if(menu && !menu.classList.contains('hidden') && !e.target.closest('.user-menu')) menu.classList.add('hidden');
});

function switchAppTab(tab){
  document.getElementById('tabDashboard').classList.toggle('active', tab==='dashboard');
  document.getElementById('tabIntake').classList.toggle('active', tab==='intake');
  const showResults = tab==='dashboard' && state.lastResult;
  document.getElementById('panel-intake').classList.toggle('hidden', tab==='dashboard' && !!state.lastResult);
  document.getElementById('panel-results').classList.toggle('hidden', !showResults);
  if(tab==='dashboard' && !state.lastResult){ switchAppTab('intake'); return; }
}

/* ---------------- render checklists ---------------- */
function renderChecklists(){
  const dWrap = document.getElementById('deviceChecklist'); dWrap.innerHTML='';
  DEVICE_ITEMS.forEach(item=>{
    dWrap.appendChild(checkRow(item, state.device[item.id], (v)=>state.device[item.id]=v));
  });
  const bWrap = document.getElementById('browsingChecklist'); bWrap.innerHTML='';
  BROWSING_ITEMS.forEach(item=>{
    bWrap.appendChild(checkRow(item, state.browsing[item.id], (v)=>state.browsing[item.id]=v));
  });
}
function checkRow(item, checked, onChange){
  const row = document.createElement('div'); row.className='check-row';
  const lbl = document.createElement('div'); lbl.className='lbl'; lbl.textContent=item.label;
  const sw = document.createElement('label'); sw.className='switch';
  const input = document.createElement('input'); input.type='checkbox'; input.checked=checked;
  const track = document.createElement('span'); track.className='track'; const knob=document.createElement('span'); knob.className='knob'; track.appendChild(knob);
  input.addEventListener('change', ()=>onChange(input.checked));
  sw.appendChild(input); sw.appendChild(track);
  row.appendChild(lbl); row.appendChild(sw);
  return row;
}

/* ---------------- password rows ---------------- */
function addPasswordRow(label, tag){
  if(state.passwords.length>=5) return;
  state.passwords.push({label: label||'', tag: tag||'low', value:''});
  renderPwList();
}
function removePasswordRow(idx){
  state.passwords.splice(idx,1);
  renderPwList();
}
function renderPwList(){
  const wrap = document.getElementById('pwList'); wrap.innerHTML='';
  state.passwords.forEach((pw, idx)=>{
    const row = document.createElement('div'); row.className='pw-entry';
    row.innerHTML = `
      <div class="field"><label>Account label</label><input type="text" placeholder="e.g. Gmail" value="${escapeHtml(pw.label)}" data-idx="${idx}" data-f="label"></div>
      <div class="field"><label>Password</label><input type="password" placeholder="••••••••" value="${escapeHtml(pw.value)}" data-idx="${idx}" data-f="value"></div>
      <div class="field"><label>Sensitivity</label>
        <select data-idx="${idx}" data-f="tag">
          ${SENSITIVITY.map(s=>`<option value="${s.id}" ${pw.tag===s.id?'selected':''}>${s.label}</option>`).join('')}
        </select>
      </div>
      <button class="remove-pw" onclick="removePasswordRow(${idx})" title="Remove">✕</button>
    `;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('input,select').forEach(el=>{
    el.addEventListener('input', (e)=>{
      const idx = +e.target.dataset.idx, f = e.target.dataset.f;
      state.passwords[idx][f] = e.target.value;
    });
  });
  document.getElementById('addPwBtn').style.display = state.passwords.length>=5 ? 'none':'block';
  if(state.passwords.length===0){ addPasswordRow('Email','critical'); addPasswordRow('Shopping site','low'); }
}
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* ---------------- password analysis ---------------- */
function analyzePasswordStrength(pw){
  if(!pw) return {score:0, breached:false};
  let classes=0;
  if(/[a-z]/.test(pw)) classes++;
  if(/[A-Z]/.test(pw)) classes++;
  if(/[0-9]/.test(pw)) classes++;
  if(/[^a-zA-Z0-9]/.test(pw)) classes++;
  let score = Math.min(100, pw.length*5 + classes*10);
  const lower = pw.toLowerCase();
  let penalty = 0;
  if(/(.)\1{2,}/.test(pw)) penalty += 35;
  const walks = ['qwerty','asdfgh','zxcvbn','123456','098765','qazwsx'];
  if(walks.some(w=>lower.includes(w))) penalty += 25;
  const breachedLocal = COMMON_LEAKED.includes(lower);
  if(breachedLocal) penalty += 30;
  score = Math.max(0, score - penalty);
  return {score, breachedLocal};
}

async function checkHibp(pw){
  try{
    const enc = new TextEncoder().encode(pw);
    const hashBuf = await crypto.subtle.digest('SHA-1', enc);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    const hex = hashArr.map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    const prefix = hex.slice(0,5), suffix = hex.slice(5);
    const res = await fetch('https://api.pwnedpasswords.com/range/'+prefix, {mode:'cors'});
    if(!res.ok) throw new Error('bad response');
    const text = await res.text();
    return text.split('\n').some(line=>line.split(':')[0].trim()===suffix);
  }catch(e){
    return null; // signal: could not reach live API, fall back handled by caller
  }
}

function computePasswordPillar(passwordsInput, hibpResults){
  const entries = passwordsInput.filter(p=>p.value);
  if(entries.length===0) return {score:0, reuseGroups:[], perEntry:[], breachedAny:false};
  const perEntry = entries.map((p,i)=>{
    const a = analyzePasswordStrength(p.value);
    const hibp = hibpResults ? hibpResults[i] : null;
    const breached = hibp===true || (hibp===null && a.breachedLocal);
    return {...p, strength:a.score, breached};
  });
  // group by identical password value
  const groups = {};
  perEntry.forEach((p,i)=>{ (groups[p.value] = groups[p.value]||[]).push(i); });
  const reuseGroups = Object.values(groups).filter(idxs=>idxs.length>1).map(idxs=>{
    const members = idxs.map(i=>perEntry[i]);
    const maxSens = members.reduce((m,x)=>SENSITIVITY.find(s=>s.id===x.tag).order>SENSITIVITY.find(s=>s.id===m).order?x.tag:m, members[0].tag);
    return {members, maxSens};
  });
  let reusePenalty = 0;
  reuseGroups.forEach(g=>{
    if(g.maxSens==='critical') reusePenalty += 40;
    else if(g.maxSens==='important') reusePenalty += 25;
    else reusePenalty += 10;
  });
  const breachedAny = perEntry.some(p=>p.breached);
  const breachPenalty = perEntry.filter(p=>p.breached).length * 30;
  const avgStrength = perEntry.reduce((s,p)=>s+p.strength,0)/perEntry.length;
  const score = Math.max(0, Math.min(100, avgStrength - reusePenalty - breachPenalty));
  return {score, reuseGroups, perEntry, breachedAny};
}

function computeChecklistPillar(items, answers){
  return items.reduce((s,i)=>s+(answers[i.id]?i.weight:0),0);
}

function computeComposite(deviceScore, browsingScore, passwordScore){
  return Math.round(deviceScore*PILLAR_WEIGHT.device + browsingScore*PILLAR_WEIGHT.browsing + passwordScore*PILLAR_WEIGHT.password);
}
function tierFor(score){
  if(score>=75) return {label:'Low Risk', color:'var(--success)', soft:'var(--success-soft)'};
  if(score>=50) return {label:'Medium Risk', color:'var(--warning)', soft:'var(--warning-soft)'};
  if(score>=25) return {label:'High Risk', color:'#FF8A5C', soft:'rgba(255,138,92,0.14)'};
  return {label:'Critical Risk', color:'var(--danger)', soft:'var(--danger-soft)'};
}

/* ---------------- recommendations ---------------- */
function buildRecommendations(pwResult){
  const recs = [];
  DEVICE_ITEMS.forEach(item=>{
    if(!state.device[item.id]){
      const gain = Math.round(item.weight*PILLAR_WEIGHT.device);
      recs.push({title:item.label, gain, sev: gain>=6?'Critical':gain>=3?'Medium':'Low', icon:'💻'});
    }
  });
  BROWSING_ITEMS.forEach(item=>{
    if(!state.browsing[item.id]){
      const gain = Math.round(item.weight*PILLAR_WEIGHT.browsing);
      recs.push({title:item.label, gain, sev: gain>=5?'Critical':gain>=3?'Medium':'Low', icon:'🌐'});
    }
  });
  pwResult.reuseGroups.forEach(g=>{
    const penalty = g.maxSens==='critical'?40:g.maxSens==='important'?25:10;
    const gain = Math.round(penalty*PILLAR_WEIGHT.password);
    const labels = g.members.map(m=>m.label||'an account').join(' & ');
    recs.push({title:`Use a unique password for ${labels}`, gain, sev: g.maxSens==='critical'?'Critical':'Medium', icon:'🔑'});
  });
  pwResult.perEntry.filter(p=>p.breached).forEach(p=>{
    recs.push({title:`Change your ${p.label||'password'} — found in a known breach`, gain: Math.round(30*PILLAR_WEIGHT.password), sev:'Critical', icon:'🔑'});
  });
  recs.sort((a,b)=>b.gain-a.gain);
  return recs.slice(0,8);
}

/* ---------------- narrative ---------------- */
function ruleBasedNarrative(flags){
  if(flags.reuseCritical){
    return `Your ${flags.lowLabel||'lower-value'} password matches your ${flags.criticalLabel||'recovery email'} password — if that account is breached, an attacker could take over your email and reset everything else.`;
  }
  if(flags.browsingRisky && flags.anyReuse){
    return 'You reuse passwords and don\u2019t consistently verify links or URLs — a single phishing email could hand over credentials that unlock multiple accounts.';
  }
  if(flags.browsingRisky){
    return 'You click links from unfamiliar senders without checking URLs first — a convincing phishing page could capture a password directly, regardless of how strong it is.';
  }
  if(flags.deviceWeak){
    return 'Your firewall and antivirus are both off — malware would have very little standing in its way if it reached this device.';
  }
  return 'No single dangerous combination stood out this time — your remaining risk comes from smaller, independent gaps below.';
}

async function generateNarrative(flags){
  const badge = document.getElementById('narrativeBadge');
  const textEl = document.getElementById('narrativeText');
  const fallback = ruleBasedNarrative(flags);
  if(!capSample){ badge.textContent='RULE-BASED'; badge.className='badge-src badge-rule'; textEl.textContent = fallback; return; }
  try{
    textEl.textContent = 'Thinking…';
    const prompt = `You write one-sentence, plain-language, second-person risk warnings for a personal cybersecurity dashboard called ChainScore. `+
      `You are given ABSTRACT risk flags only — no real passwords, emails, or personal data: ${JSON.stringify(flags)}. `+
      `Write exactly ONE sentence (max 32 words), calm but direct, describing the single most realistic way this specific person could be compromised, based on the flags. No preamble, no markdown, no quotes.`;
    const result = await capSample(prompt, {modelTier:'quick', cache:true});
    const text = (result.text||'').trim().replace(/^"|"$/g,'');
    if(text){ badge.textContent='AI-GENERATED'; badge.className='badge-src badge-ai'; textEl.textContent = text; }
    else { badge.textContent='RULE-BASED'; badge.className='badge-src badge-rule'; textEl.textContent = fallback; }
  }catch(e){
    badge.textContent='RULE-BASED (fallback)'; badge.className='badge-src badge-rule'; textEl.textContent = fallback;
  }
}

/* ---------------- run assessment ---------------- */
async function runAssessment(){
  const btn = document.getElementById('runAssessmentBtn'); const oldTxt = btn.textContent; btn.textContent='Calculating…'; btn.disabled=true;
  const deviceScore = computeChecklistPillar(DEVICE_ITEMS, state.device);
  const browsingScore = computeChecklistPillar(BROWSING_ITEMS, state.browsing);

  const validPw = state.passwords.filter(p=>p.value);
  let hibpResults = null;
  try{
    hibpResults = await Promise.all(validPw.map(p=>checkHibp(p.value)));
  }catch(e){ hibpResults = null; }

  const pwResult = computePasswordPillar(state.passwords, hibpResults);
  const passwordScoreRounded = Math.round(pwResult.score);
  const composite = computeComposite(deviceScore, browsingScore, passwordScoreRounded);

  const flags = {
    reuseCritical: pwResult.reuseGroups.some(g=>g.maxSens==='critical'),
    anyReuse: pwResult.reuseGroups.length>0,
    browsingRisky: !state.browsing.check_url && !state.browsing.no_unknown_links,
    deviceWeak: !state.device.firewall && !state.device.antivirus,
    lowLabel: (pwResult.reuseGroups[0]?.members.find(m=>m.tag!=='critical')||{}).label,
    criticalLabel: (pwResult.reuseGroups[0]?.members.find(m=>m.tag==='critical')||{}).label,
  };

  state.lastResult = {
    ts: Date.now(), deviceScore, browsingScore, passwordScore: passwordScoreRounded, composite,
    pwResult, flags, recs: buildRecommendations(pwResult),
  };
  state.simAnswers = {device:{...state.device}, browsing:{...state.browsing}};

  await saveHistoryEntry(state.lastResult);
  btn.textContent = oldTxt; btn.disabled=false;
  renderResults();
  switchAppTab('dashboard');
}

/* ---------------- render results ---------------- */
function renderResults(){
  const r = state.lastResult; if(!r) return;
  document.getElementById('resultTimestamp').textContent = 'Last calculated ' + new Date(r.ts).toLocaleString();
  drawGauge(r.composite);
  document.getElementById('gaugeNumber').textContent = r.composite;
  const tier = tierFor(r.composite);
  const tb = document.getElementById('tierBadge');
  tb.textContent = tier.label; tb.style.color = tier.color; tb.style.background = tier.soft;

  const subWrap = document.getElementById('subscoreList'); subWrap.innerHTML='';
  [['Device Security', r.deviceScore, '💻'], ['Browsing Habits', r.browsingScore,'🌐'], ['Password Hygiene', r.passwordScore,'🔑']].forEach(([label,val,icon])=>{
    const t = tierFor(val);
    const div = document.createElement('div'); div.className='subscore-row';
    div.innerHTML = `<div class="top"><span>${icon} ${label}</span><b style="color:${t.color}">${val}</b></div><div class="bar-track"><div class="bar-fill" style="width:${val}%; background:${t.color};"></div></div>`;
    subWrap.appendChild(div);
  });

  generateNarrative(r.flags);

  const cgWrap = document.getElementById('chainGroupsWrap'); cgWrap.innerHTML='';
  if(r.pwResult.reuseGroups.length){
    const title = document.createElement('div'); title.className='section-title'; title.innerHTML='<h3>🔗 Password reuse — blast radius</h3>'; cgWrap.appendChild(title);
    r.pwResult.reuseGroups.forEach(g=>{
      const div = document.createElement('div'); div.className='chain-group'+(g.maxSens==='critical'?' critical':'');
      div.innerHTML = `<div class="cg-title">${g.maxSens==='critical'?'⚠️ Critical reuse':'Reused password'} — same password used across:</div>
        <div class="cg-members">${g.members.map(m=>`<span class="chain-tag${m.tag==='critical'?' critical':''}">${escapeHtml(m.label||'Untitled')} · ${SENSITIVITY.find(s=>s.id===m.tag).label}</span>`).join('')}</div>`;
      cgWrap.appendChild(div);
    });
  }

  const riskList = document.getElementById('riskList'); riskList.innerHTML='';
  if(r.recs.length===0){
    riskList.innerHTML = '<div class="card" style="text-align:center; color:var(--text-secondary); font-size:14px;">Nothing major to flag — nice work.</div>';
  }
  r.recs.forEach(rec=>{
    const sevColor = rec.sev==='Critical'?['var(--danger)','var(--danger-soft)']:rec.sev==='Medium'?['var(--warning)','var(--warning-soft)']:['var(--text-secondary)','var(--surface-3)'];
    const div = document.createElement('div'); div.className='risk-item';
    div.innerHTML = `<div class="ric" style="background:${sevColor[1]}; color:${sevColor[0]};">${rec.icon}</div>
      <div class="rtxt"><div class="t">${escapeHtml(rec.title)}</div><div class="d">Estimated improvement</div></div>
      <span class="sev-chip" style="background:${sevColor[1]}; color:${sevColor[0]};">${rec.sev}</span>
      <span class="gain-chip">+${rec.gain}</span>`;
    riskList.appendChild(div);
  });

  renderSimulator();
  renderTrend();
}

/* ---------------- gauge (SVG arc) ---------------- */
function drawGauge(score){
  const svg = document.getElementById('gaugeSvg');
  const cx=120, cy=130, r=100;
  function pt(pct){ const ang = Math.PI - pct*Math.PI; return [cx + r*Math.cos(ang), cy - r*Math.sin(ang)]; }
  function arcPath(p0,p1){ const [x0,y0]=pt(p0),[x1,y1]=pt(p1); const large = (p1-p0)>0.5?1:0; return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`; }
  const zones = [[0,0.25,'#FF5C7C'],[0.25,0.5,'#FF8A5C'],[0.5,0.75,'#FFB84D'],[0.75,1,'#3EDC8A']];
  let html = '';
  zones.forEach(([a,b,c])=>{ html += `<path d="${arcPath(a,b)}" stroke="${c}" stroke-width="16" fill="none" stroke-linecap="butt"/>`; });
  const pct = Math.max(0,Math.min(1,score/100));
  const ang = Math.PI - pct*Math.PI;
  const nx = cx + (r-22)*Math.cos(ang), ny = cy - (r-22)*Math.sin(ang);
  html += `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="var(--text-primary)" stroke-width="4" stroke-linecap="round"/>`;
  html += `<circle cx="${cx}" cy="${cy}" r="7" fill="var(--text-primary)"/>`;
  svg.innerHTML = html;
}

/* ---------------- simulator ---------------- */
function renderSimulator(){
  const grid = document.getElementById('simGrid'); grid.innerHTML='';
  const all = [...DEVICE_ITEMS.map(i=>({...i, group:'device'})), ...BROWSING_ITEMS.map(i=>({...i, group:'browsing'}))];
  all.forEach(item=>{
    const row = document.createElement('div'); row.className='sim-row';
    const checked = state.simAnswers[item.group][item.id];
    row.innerHTML = `<span>${item.label}</span>`;
    const sw = document.createElement('label'); sw.className='switch';
    const input = document.createElement('input'); input.type='checkbox'; input.checked=checked;
    const track = document.createElement('span'); track.className='track'; const knob=document.createElement('span'); knob.className='knob'; track.appendChild(knob);
    input.addEventListener('change', ()=>{ state.simAnswers[item.group][item.id]=input.checked; updateSimScore(); });
    sw.appendChild(input); sw.appendChild(track);
    row.appendChild(sw);
    grid.appendChild(row);
  });
  updateSimScore();
}
function updateSimScore(){
  const r = state.lastResult; if(!r) return;
  const d = computeChecklistPillar(DEVICE_ITEMS, state.simAnswers.device);
  const b = computeChecklistPillar(BROWSING_ITEMS, state.simAnswers.browsing);
  const composite = computeComposite(d,b,r.passwordScore);
  document.getElementById('simScoreNum').textContent = composite;
  const delta = composite - r.composite;
  const deltaEl = document.getElementById('simDelta');
  deltaEl.textContent = delta===0 ? 'No change yet' : (delta>0?`▲ +${delta} vs current`:`▼ ${delta} vs current`);
  deltaEl.style.color = delta>0?'var(--success)':delta<0?'var(--danger)':'var(--text-muted)';
}
function resetSimulator(){ state.simAnswers = {device:{...state.device}, browsing:{...state.browsing}}; renderSimulator(); }

/* ---------------- history / db ---------------- */
function historyCollection(){
  if(capDb && uid) return capDb.collection('data/users/'+uid+'/runs');
  return null;
}
async function saveHistoryEntry(r){
  const entry = {ts:r.ts, composite:r.composite, device:r.deviceScore, browsing:r.browsingScore, password:r.passwordScore};
  const col = historyCollection();
  try{
    if(col){ await col.add(entry); }
    else { const arr = JSON.parse(localStorage.getItem('chainscore_history')||'[]'); arr.push(entry); localStorage.setItem('chainscore_history', JSON.stringify(arr)); }
  }catch(e){ console.warn('history save failed, using localStorage', e);
    try{ const arr = JSON.parse(localStorage.getItem('chainscore_history')||'[]'); arr.push(entry); localStorage.setItem('chainscore_history', JSON.stringify(arr)); }catch(e2){}
  }
  state.history.push(entry);
}
async function loadHistory(){
  const col = historyCollection();
  try{
    if(col){
      const snap = await col.orderBy('ts','asc').limit(50).get();
      state.history = snap.docs.map(d=>d.data());
    } else {
      state.history = JSON.parse(localStorage.getItem('chainscore_history')||'[]');
    }
  }catch(e){
    try{ state.history = JSON.parse(localStorage.getItem('chainscore_history')||'[]'); }catch(e2){ state.history=[]; }
  }
}

let trendChartInstance = null;
function renderTrend(){
  const canvas = document.getElementById('trendChart');
  const note = document.getElementById('trendEmptyNote');
  if(state.history.length < 2){ note.textContent = 'Run a few more assessments to see your trend over time.'; }
  else { note.textContent=''; }
  if(typeof Chart === 'undefined'){ note.textContent='Chart library unavailable in this preview.'; return; }
  const labels = state.history.map(h=>new Date(h.ts).toLocaleDateString(undefined,{month:'short',day:'numeric'}));
  const data = state.history.map(h=>h.composite);
  if(trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(canvas, {
    type:'line',
    data:{labels, datasets:[{label:'ChainScore', data, borderColor:'#25E1D2', backgroundColor:'rgba(37,225,210,0.12)', fill:true, tension:0.35, pointBackgroundColor:'#8B7CFA', pointRadius:4}]},
    options:{
      responsive:true,
      plugins:{legend:{display:false}},
      scales:{
        y:{min:0, max:100, ticks:{color:'#6C76A0'}, grid:{color:'rgba(255,255,255,0.05)'}},
        x:{ticks:{color:'#6C76A0'}, grid:{display:false}}
      }
    }
  });
}

/* ---------------- PDF export ---------------- */
async function downloadPdf(){
  const r = state.lastResult; if(!r) return;
  if(typeof window.jspdf === 'undefined'){ showToast('PDF library unavailable in this preview.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const tier = tierFor(r.composite);
  doc.setFontSize(22); doc.setTextColor(20,20,40); doc.text('ChainScore Report', 14, 22);
  doc.setFontSize(11); doc.setTextColor(100); doc.text(new Date(r.ts).toLocaleString(), 14, 29);
  doc.setFontSize(40); doc.setTextColor(20,20,40); doc.text(String(r.composite), 14, 55);
  doc.setFontSize(13); doc.text('/ 100 — ' + tier.label, 40, 55);
  doc.setFontSize(12); doc.setTextColor(60);
  doc.text('Device Security: ' + r.deviceScore, 14, 70);
  doc.text('Browsing Habits: ' + r.browsingScore, 14, 78);
  doc.text('Password Hygiene: ' + r.passwordScore, 14, 86);
  doc.setFontSize(13); doc.setTextColor(20,20,40); doc.text('Most likely risk path:', 14, 100);
  doc.setFontSize(11); doc.setTextColor(60);
  const narrative = document.getElementById('narrativeText').textContent || '';
  doc.text(doc.splitTextToSize(narrative, 180), 14, 108);
  doc.setFontSize(13); doc.setTextColor(20,20,40); doc.text('Top recommendations:', 14, 128);
  doc.setFontSize(11); doc.setTextColor(60);
  r.recs.slice(0,6).forEach((rec,i)=>{ doc.text(`${i+1}. ${rec.title}  (+${rec.gain})`, 14, 136+i*7); });
  doc.setFontSize(9); doc.setTextColor(150);
  doc.text('Generated by ChainScore — a free, transparent personal cyber risk score.', 14, 285);

  const blob = doc.output('blob');
  if(capDownloads){
    try{ await capDownloads.save({filename:'chainscore-report.pdf', data:blob}); showToast('Report downloaded.'); return; }
    catch(e){ console.warn('downloads capability failed, falling back', e); }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='chainscore-report.pdf'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}

/* ---------------- QR / share ---------------- */
function openShareModal(){
  const r = state.lastResult; if(!r) return;
  const token = Math.random().toString(36).slice(2,8) + Math.random().toString(36).slice(2,6);
  const url = 'https://chainscore.app/report/' + token;
  document.getElementById('shareUrlText').textContent = url;
  const tier = tierFor(r.composite);
  document.getElementById('rpScore').textContent = r.composite + '/100';
  document.getElementById('rpScore').style.color = tier.color;
  document.getElementById('rpTier').textContent = tier.label;
  document.getElementById('rpPw').textContent = r.passwordScore;
  document.getElementById('rpDev').textContent = r.deviceScore;
  document.getElementById('rpBrw').textContent = r.browsingScore;
  document.getElementById('rpTopRisk').textContent = r.recs[0] ? r.recs[0].title : 'None flagged';
  const qrEl = document.getElementById('qrcodeEl'); qrEl.innerHTML='';
  if(typeof QRCode !== 'undefined'){
    new QRCode(qrEl, {text:url, width:170, height:170, colorDark:'#020203', colorLight:'#ffffff'});
  } else {
    qrEl.innerHTML = '<div style="width:170px;height:170px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;text-align:center;">QR library unavailable in this preview</div>';
  }
  const overlay = document.getElementById('shareModalOverlay');
  overlay.classList.remove('hidden');
  overlay.scrollIntoView({behavior:'smooth', block:'start'});
}
function closeShareModal(){ document.getElementById('shareModalOverlay').classList.add('hidden'); }

/* ---------------- misc ---------------- */
function showToast(msg){
  const el = document.getElementById('actionStatus');
  if(!el){ console.log(msg); return; }
  el.textContent = msg;
  setTimeout(()=>{ if(el.textContent===msg) el.textContent=''; }, 3500);
}

/* ---------------- click "shady" pulse effect ---------------- */
document.addEventListener('click', (e)=>{
  const el = e.target.closest('.card, .feat-card, .spotlight, .subscore-row, .risk-item, .chain-group, .pw-entry');
  if(!el) return;
  el.classList.remove('pulse-fx');
  void el.offsetWidth; // restart animation
  el.classList.add('pulse-fx');
  el.addEventListener('animationend', ()=>el.classList.remove('pulse-fx'), {once:true});
});

/* ---------------- init ---------------- */
renderChecklists();
renderPwList();
