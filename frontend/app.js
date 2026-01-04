// frontend/app.js — fixed: don't auto-load global history when switching to history view

async function api(path, opts) {
  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data && data.error ? data.error : 'Network error');
  return data;
}

function el(id){ return document.getElementById(id); }
function setText(id, text){ const e = el(id); if (e) e.textContent = text; }
function prettyTime(iso){ try { return new Date(iso).toLocaleString(); } catch(e) { return iso; } }
function isNarrow(){ return window.innerWidth <= 640; }

// ---------------- wiring elements ----------------
const searchBox = el('searchBox');
const searchBtn = el('searchBtn');

const loginBtn = el('loginBtn');
if (loginBtn) loginBtn.addEventListener('click', doLogin);

if (searchBtn) searchBtn.addEventListener('click', doSearch);
if (searchBox) searchBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

// Login (simple)
async function doLogin(){
  setText('loginMsg','');
  const u = el('loginUsername').value.trim();
  const p = el('loginPassword').value;
  if (!u || !p) { setText('loginMsg','Enter username & password'); return; }
  try {
    const r = await api('/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username:u, password:p })});
    if (document.getElementById('rememberMe') && document.getElementById('rememberMe').checked) localStorage.setItem('user', r.username);
    else localStorage.removeItem('user');
    el('userDisplay').textContent = r.username + ' (Vijay Mane)';
    el('loginView').style.display = 'none'; el('mainView').style.display = 'block';
    await loadTypes(); switchTo('sell');
  } catch (err) { setText('loginMsg','Login failed: ' + err.message); console.error('login err', err); }
}

// ---------------- basic tab navigation ----------------
function hideAll(){ ['sellView','returnView','countsView','historyView'].forEach(id=>{ const e=el(id); if (e) e.style.display='none'; }); }

// Important change: switchTo does NOT auto-load global history.
// That prevents search/customer results from being overwritten.
function switchTo(name){
  hideAll();
  if (name === 'sell') el('sellView').style.display = 'block';
  if (name === 'return') el('returnView').style.display = 'block';
  if (name === 'counts') el('countsView').style.display = 'block';
  if (name === 'history') el('historyView').style.display = 'block';
}

// Attach tab buttons — loadActive/loadCounts/loadHistory are called explicitly where needed
const tSell = el('sellTab'), tReturn = el('returnTab'), tCounts = el('countsTab'), tHistory = el('historyTab');
if (tSell) tSell.addEventListener('click', ()=> { switchTo('sell'); });
if (tReturn) tReturn.addEventListener('click', ()=> { switchTo('return'); loadActive(); });
if (tCounts) tCounts.addEventListener('click', ()=> { switchTo('counts'); loadCounts(); });
if (tHistory) tHistory.addEventListener('click', ()=> { switchTo('history'); loadHistory(true); });

// ---------------- types ----------------
async function loadTypes(){
  try {
    const types = await api('/types');
    const s = el('sellType'), r = el('returnType');
    if (s) s.innerHTML = '';
    if (r) r.innerHTML = '';
    for (const t of types) {
      if (s){ const o = document.createElement('option'); o.value = t; o.textContent = t; s.appendChild(o); }
      if (r){ const o2 = document.createElement('option'); o2.value = t; o2.textContent = t; r.appendChild(o2); }
    }
    if (r) loadActive();
  } catch (e) {
    console.error('loadTypes', e);
  }
}

// ---------------- sell (unchanged) ----------------
function parseInput(type, input){
  if (!input) return [];
  const tokens = input.split(',').map(s=>s.trim()).filter(Boolean);
  const base = (type||'').replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase();
  const out = [];
  for (const t of tokens){
    if (t.includes('-')){
      const [a,b] = t.split('-').map(s=>s.trim());
      if (/^\d+$/.test(a) && /^\d+$/.test(b)){
        for (let i=parseInt(a,10); i<=parseInt(b,10); i++) out.push(base + String(i).padStart(4,'0'));
      } else {
        const m1=a.match(/(\D*)(\d+)$/), m2=b.match(/(\D*)(\d+)$/);
        if (m1 && m2 && m1[1]===m2[1]) {
          for (let i=parseInt(m1[2],10); i<=parseInt(m2[2],10); i++) out.push(m1[1] + String(i).padStart(m1[2].length,'0'));
        } else out.push(t);
      }
    } else {
      if (/^\d+$/.test(t)) out.push(base + String(parseInt(t,10)).padStart(4,'0'));
      else out.push(t);
    }
  }
  return Array.from(new Set(out));
}

if (el('doSell')) el('doSell').addEventListener('click', async ()=>{
  setText('sellMsg','');
  const type = el('sellType').value, input = el('cylinderNumbersInput').value;
  const name = el('custName').value.trim(), aadhar = el('custAadhar').value.trim(), phone = el('custPhone').value.trim();
  if (!type || !input || !name || !aadhar) { setText('sellMsg','Please fill required fields'); return; }
  const nums = parseInput(type,input);
  if (!nums.length){ setText('sellMsg','No cylinder numbers parsed'); return; }
  if (nums.length>1000) { setText('sellMsg','Max 1000 per op'); return; }
  try {
    const res = await api('/sell',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type, customer:{name,aadhar,phone}, cylinder_numbers_input: input }) });
    setText('sellMsg','Sold: ' + (res.assigned || []).join(', '));
    el('cylinderNumbersInput').value=''; el('custName').value=''; el('custAadhar').value=''; el('custPhone').value='';
    loadCounts(); loadActive();
  } catch (err) { setText('sellMsg','Error: ' + err.message); console.error('sell', err); }
});

// ---------------- return ----------------
async function loadActive(){
  const tEl = el('returnType'); const sel = el('returnCylinder');
  if (!tEl || !sel) return;
  sel.innerHTML = '';
  try {
    const rows = await api('/cylinders?status=active&type=' + encodeURIComponent(tEl.value));
    if (!rows || rows.length===0) { sel.innerHTML = '<option>No active cylinders for this type</option>'; return; }
    for (const r of rows){ const o = document.createElement('option'); o.value = r.cylinder_number; o.textContent = r.cylinder_number + (r.customer_id?(' (id:'+r.customer_id+')'):''); sel.appendChild(o); }
  } catch (e) { sel.innerHTML = '<option>Error</option>'; console.error('loadActive', e); }
}
if (el('returnType')) el('returnType').addEventListener('change', loadActive);
if (el('doReturn')) el('doReturn').addEventListener('click', async ()=>{
  setText('returnMsg','');
  const cn = el('returnCylinder').value; if (!cn) { setText('returnMsg','Select'); return; }
  try { await api('/return',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cylinder_number: cn }) }); setText('returnMsg','Returned'); loadCounts(); loadActive(); } catch(e) { setText('returnMsg','Error: ' + e.message); console.error('return', e); }
});

// ---------------- counts ----------------
async function loadCounts(){
  const list = el('countsList'); if (!list) return; list.innerHTML = '';
  try {
    const rows = await api('/counts');
    for (const r of rows){
      const card = document.createElement('div'); card.className='card';
      const title = document.createElement('strong'); title.textContent = r.type;
      const small = document.createElement('div'); small.className='small'; small.innerHTML = 'Active: ' + r.active_count + ' &nbsp; Inactive: ' + r.inactive_count;
      const btn = document.createElement('button'); btn.className='btn-small'; btn.textContent = 'View active customers';
      btn.addEventListener('click', ()=> viewActiveCustomers(r.type));
      card.appendChild(title); card.appendChild(small); card.appendChild(btn);
      list.appendChild(card);
    }
  } catch (e) { list.innerHTML = '<div class="small">Failed to load counts</div>'; console.error('loadCounts', e); }
}

async function viewActiveCustomers(type){
  try {
    const rows = await api('/active-customers?type=' + encodeURIComponent(type));
    let html = '<h4>Active customers for ' + type + '</h4>';
    if (!rows || rows.length===0) html += '<div class="small">No active customers for this type</div>';
    else {
      if (isNarrow()){
        for (const r of rows) html += '<div class="card"><strong>' + (r.name||'') + '</strong><div class="small">Aadhar: ' + (r.aadhar||'') + '</div><div style="margin-top:6px"><button class="btn-small" onclick="loadCustomerById(' + r.id + ')">Open</button></div></div>';
      } else {
        html += '<table><thead><tr><th>Name</th><th>Aadhar</th><th>Phone</th></tr></thead><tbody>';
        for (const r of rows) html += '<tr style="cursor:pointer" onclick="loadCustomerById(' + r.id + ')"><td>' + r.name + '</td><td>' + (r.aadhar||'') + '</td><td>' + (r.phone||'') + '</td></tr>';
        html += '</tbody></table>';
      }
    }
    el('historyList').innerHTML = html;
    switchTo('history'); // show without loading global history
  } catch (e) { el('historyList').innerHTML = '<div class="small">Failed to load</div>'; console.error('viewActiveCustomers', e); }
}

// ---------------- global history ----------------
let histOffset = 0;
async function loadHistory(reset){
  if (reset) histOffset = 0;
  const list = el('historyList'); if (!list) return;
  try {
    const rows = await api('/history?limit=100&offset=' + histOffset);
    if (reset) list.innerHTML = '';
    if (!rows || rows.length === 0) { list.innerHTML += '<div class="small">No more history</div>'; return; }
    if (isNarrow()){
      let html = '';
      for (const h of rows) html += '<div class="card"><strong>' + (h.customer_name||'') + '</strong><div class="small">When: ' + prettyTime(h.created_at) + '</div><div class="small">Action: ' + h.action + ' | Type: ' + (h.cylinder_type||'') + ' | Cylinder: ' + (h.cylinder_number||'') + '</div></div>';
      list.innerHTML += html;
    } else {
      let html = '<table><thead><tr><th>Customer</th><th>When</th><th>Action</th><th>Type</th><th>Cylinder</th></tr></thead><tbody>';
      for (const h of rows) html += '<tr><td>' + (h.customer_name||'') + '</td><td>' + prettyTime(h.created_at) + '</td><td>' + h.action + '</td><td>' + (h.cylinder_type||'') + '</td><td>' + (h.cylinder_number||'') + '</td></tr>';
      html += '</tbody></table>';
      list.innerHTML += html;
    }
    histOffset += rows.length;
  } catch (e) {
    list.innerHTML = '<div class="small">Failed to load history</div>';
    console.error('loadHistory', e);
  }
}
if (el('loadMore')) el('loadMore').addEventListener('click', ()=> loadHistory(false));

// ---------------- SEARCH (core) ----------------
async function doSearch(){
  const q = (searchBox && searchBox.value || '').trim();
  const list = el('historyList');
  if (!list) return;
  list.innerHTML = ''; // clear previous
  if (!q) { list.innerHTML = '<div class="small">Please enter Aadhar, name, or cylinder number.</div>'; switchTo('history'); return; }

  try {
    console.log('Searching for:', q);
    const res = await api('/search?q=' + encodeURIComponent(q));
    console.log('Search response:', res);

    if (!res) { list.innerHTML = '<div class="small">No results</div>'; switchTo('history'); return; }

    if (res.type === 'customer') {
      renderCustomerResult(res);
      switchTo('history'); // show history view but do NOT load global history
      return;
    }

    if (res.type === 'customers') {
      renderCustomersList(res.customers || []);
      switchTo('history');
      return;
    }

    if (res.type === 'cylinder') {
      renderCylinderResult(res);
      switchTo('history');
      return;
    }

    list.innerHTML = '<div class="small">No results for: ' + q + '</div>';
    switchTo('history');

  } catch (err) {
    console.error('Search error', err);
    el('historyList').innerHTML = '<div class="small">Search error: ' + (err.message || err) + '</div>';
    switchTo('history');
  }
}

function renderCustomerResult(res){
  const list = el('historyList'); if (!list) return;
  const cust = res.customer || {};
  const counts = res.counts || {};
  const historyRows = res.history || [];

  let html = '<div class="card"><strong>' + (cust.name||'') + '</strong><div class="small">Aadhar: ' + (cust.aadhar||'') + (cust.phone? ' &nbsp; Phone: ' + cust.phone : '') + '</div></div>';

  html += '<div class="card"><h4>Active counts</h4>';
  if (Object.keys(counts).length) {
    for (const k of Object.keys(counts)) html += '<div>' + k + ': ' + counts[k] + '</div>';
  } else html += '<div class="small">No active cylinders</div>';
  html += '</div>';

  html += '<div class="card"><h4>History for ' + (cust.name||'') + '</h4>';
  if (!historyRows.length) html += '<div class="small">No history for this customer</div>';
  else {
    if (isNarrow()){
      for (const h of historyRows) {
        html += '<div class="card"><strong>' + (h.action||'') + ' — ' + (h.cylinder_number||'') + '</strong><div class="small">When: ' + prettyTime(h.created_at) + '</div><div class="small">Type: ' + (h.cylinder_type||'') + '</div></div>';
      }
    } else {
      html += '<table><thead><tr><th>When</th><th>Action</th><th>Type</th><th>Cylinder</th></tr></thead><tbody>';
      for (const h of historyRows) html += '<tr><td>' + prettyTime(h.created_at) + '</td><td>' + h.action + '</td><td>' + (h.cylinder_type||'') + '</td><td>' + (h.cylinder_number||'') + '</td></tr>';
      html += '</tbody></table>';
    }
  }
  html += '</div>';
  list.innerHTML = html;
}

function renderCustomersList(customers){
  const list = el('historyList'); if (!list) return;
  let html = '<h4>Multiple customers — tap to view</h4>';
  if (isNarrow()){
    for (const c of customers) html += '<div class="card"><strong>' + (c.name||'') + '</strong><div class="small">Aadhar: ' + (c.aadhar||'') + '</div><div style="margin-top:6px"><button class="btn-small" onclick="loadCustomerById(' + c.id + ')">Open</button></div></div>';
  } else {
    html += '<table><thead><tr><th>Name</th><th>Aadhar</th><th>Phone</th></tr></thead><tbody>';
    for (const c of customers) html += '<tr style="cursor:pointer" onclick="loadCustomerById(' + c.id + ')"><td>' + (c.name||'') + '</td><td>' + (c.aadhar||'') + '</td><td>' + (c.phone||'') + '</td></tr>';
    html += '</tbody></table>';
  }
  list.innerHTML = html;
}

function renderCylinderResult(res){
  const list = el('historyList'); if (!list) return;
  const cyl = res.cylinder || {};
  const historyRows = res.history || [];
  let html = '<div class="card"><strong>Cylinder: ' + (cyl.cylinder_number||'') + '</strong><div class="small">Type: ' + (cyl.type||'') + ' &nbsp; Status: ' + (cyl.status||'') + '</div></div>';
  html += '<div class="card"><h4>History</h4>';
  if (!historyRows.length) html += '<div class="small">No history</div>';
  else {
    if (isNarrow()){
      for (const h of historyRows) html += '<div class="card"><strong>' + (h.action||'') + ' — ' + (h.customer_name||'') + '</strong><div class="small">When: ' + prettyTime(h.created_at) + '</div></div>';
    } else {
      html += '<table><thead><tr><th>When</th><th>Action</th><th>Customer</th></tr></thead><tbody>';
      for (const h of historyRows) html += '<tr><td>' + prettyTime(h.created_at) + '</td><td>' + h.action + '</td><td>' + (h.customer_name||'') + '</td></tr>';
      html += '</tbody></table>';
    }
  }
  html += '</div>';
  list.innerHTML = html;
}

// ---------------- load customer by id ----------------
async function loadCustomerById(id){
  try {
    const res = await api('/customers/' + encodeURIComponent(id));
    renderCustomerResult({ customer: res.customer, counts: res.counts, history: res.history, type: 'customer' });
    switchTo('history'); // show but do NOT load global history
  } catch (e) {
    el('historyList').innerHTML = '<div class="small">Failed to load customer: ' + (e.message || e) + '</div>';
    console.error('loadCustomerById', e);
  }
}

// ---------------- initial load if already logged ----------------
window.addEventListener('load', () => {
  const u = localStorage.getItem('user');
  if (u) {
    el('userDisplay').textContent = u + ' (Vijay Mane)';
    el('loginView').style.display = 'none';
    el('mainView').style.display = 'block';
    loadTypes().then(()=> switchTo('sell')).catch(()=> switchTo('sell'));
  }
});
