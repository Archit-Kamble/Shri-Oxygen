require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use('/', express.static(path.join(__dirname,'..','frontend')));

function nowISO(){ return new Date().toISOString(); }

/* ================= CONFIG: desired display order & prefixes ================= */
const GAS_ORDER = [
  'Oxygen',
  'M Oxygen',
  'Argon',
  'Callgas',
  'Acetylene',
  'Zerogas',
  'Carbon Dioxide',
  'Ethylene',
  'Helium',
  'Hydraulic',
  'Mixture',
  'Other Gas 1',
  'Other Gas 2',
  'Other Gas 3',
  'Other Gas 4',
  'Other Gas 5'
];

// Single source of truth for "preferred" prefixes (used for expansion)
const GAS_PREFIX = {
  'Oxygen':'OXY',
  'M Oxygen':'MOXY',
  'Argon':'ARG',
  'Callgas':'CALL',
  'Acetylene':'ACET',
  'Zerogas':'ZERO',
  'Carbon Dioxide':'CO2',
  'Ethylene':'ETH',
  'Helium':'HE',
  'Hydraulic':'HYD',
  'Mixture':'MIX',
  'Other Gas 1':'OG1',
  'Other Gas 2':'OG2',
  'Other Gas 3':'OG3',
  'Other Gas 4':'OG4',
  'Other Gas 5':'OG5'
};

/* ================= UTIL: fetch existing prefixes from DB =================
   We'll extract the alphabetic prefix portion from existing cylinder_number rows
   so we can attempt those as fallback candidates when matching user input.
*/
function getExistingPrefixes() {
  try {
    const rows = db.prepare('SELECT DISTINCT cylinder_number FROM cylinders').all();
    const prefixes = new Set();
    for (const r of rows) {
      if (!r || !r.cylinder_number) continue;
      const m = String(r.cylinder_number).match(/^([A-Za-z]+)/);
      if (m && m[1]) prefixes.add(m[1]);
    }
    return Array.from(prefixes);
  } catch (e) {
    console.error('Error reading existing prefixes:', e);
    return [];
  }
}

/* ================= Helper: generate candidate cylinder numbers for a given type + numeric value =================
   Strategy:
   - Preferred prefix (GAS_PREFIX[type])
   - Derived base from type string (legacy logic: remove non-alnum, take first up to 6 chars)
   - Any existing prefixes discovered in DB
   This increases chance of matching even when DB has legacy rows.
*/
function buildCandidatesForNumber(type, num, existingPrefixes) {
  const candidates = [];
  // preferred prefix from GAS_PREFIX
  const preferred = GAS_PREFIX[type];
  if (preferred) candidates.push(preferred + String(num).padStart(4,'0'));

  // legacy base derived from type string (keeps compatibility)
  const derivedBase = type ? type.replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase() : null;
  if (derivedBase) {
    const c = derivedBase + String(num).padStart(4,'0');
    if (!candidates.includes(c)) candidates.push(c);
  }

  // try existing DB prefixes (may include rare legacy/past prefixes)
  for (const p of existingPrefixes) {
    const c = p + String(num).padStart(4,'0');
    if (!candidates.includes(c)) candidates.push(c);
  }

  return candidates;
}

/* ================= LOGIN ================= */
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Missing' });
    const row = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    return res.json({ username: row.username });
  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/* ================= TYPES =================
   Return the preferred display order. This does not mutate DB.
*/
app.get('/api/types', (req, res) => {
  res.json(GAS_ORDER);
});

/* ================= CYLINDERS (simple list endpoint) ================= */
app.get('/api/cylinders', (req,res)=>{
  try {
    const { status, type } = req.query;
    let sql = 'SELECT * FROM cylinders';
    const clauses = [], params = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (type) { clauses.push('type = ?'); params.push(type); }
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (e) {
    console.error('/api/cylinders error:', e);
    res.status(500).json({ error: 'Failed to fetch cylinders' });
  }
});

/* ================= SELL — robust resolver that tolerates legacy prefixes ================= */
app.post('/api/sell', (req,res)=>{
  try {
    const { type, customer, cylinder_numbers_input } = req.body || {};
    if (!type || !customer || !customer.name || !customer.aadhar) return res.status(400).json({ error: 'Missing fields' });

    // parse integers or ranges from input (e.g., "1,2,5-7")
    const tokens = String(cylinder_numbers_input || '').split(',').map(s => s.trim()).filter(Boolean);
    if (tokens.length === 0) return res.status(400).json({ error: 'No cylinder numbers provided' });

    // build list of numeric tokens expanded
    const nums = [];
    for (const t of tokens) {
      if (t.includes('-')) {
        const [a,b] = t.split('-').map(x => parseInt(x,10));
        if (isNaN(a) || isNaN(b) || b < a) return res.status(400).json({ error: 'Invalid range: ' + t });
        for (let i=a;i<=b;i++) nums.push(i);
      } else {
        const n = parseInt(t,10);
        if (isNaN(n)) return res.status(400).json({ error: 'Invalid number: ' + t });
        nums.push(n);
      }
    }

    // ensure customer exists or create
    let cust = db.prepare('SELECT * FROM customers WHERE aadhar = ?').get(customer.aadhar);
    if (!cust) {
      const info = db.prepare('INSERT INTO customers (name,aadhar,phone) VALUES (?,?,?)').run(customer.name, customer.aadhar, customer.phone || null);
      cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
    } else {
      // update name/phone if changed
      db.prepare('UPDATE customers SET name = ?, phone = ? WHERE id = ?').run(customer.name, customer.phone || null, cust.id);
      cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(cust.id);
    }

    // get DB prefixes to try as fallback
    const existingPrefixes = getExistingPrefixes();

    const assigned = [];
    const updStatus = db.prepare("UPDATE cylinders SET status = 'active', customer_id = ? WHERE cylinder_number = ?");
    const updateType = db.prepare("UPDATE cylinders SET type = ? WHERE cylinder_number = ?");
    const insertHist = db.prepare('INSERT INTO history (action,cylinder_number,cylinder_type,customer_id,customer_name,aadhar,phone,created_at) VALUES (?,?,?,?,?,?,?,?)');

    for (const n of nums) {
      const candidates = buildCandidatesForNumber(type, n, existingPrefixes);
      let found = null;
      for (const cand of candidates) {
        const row = db.prepare('SELECT * FROM cylinders WHERE cylinder_number = ?').get(cand);
        if (row && row.status === 'inactive') {
          found = row;
          break;
        }
      }
      if (!found) {
        // none matched - return explicit missing token message
        return res.status(400).json({ error: 'Invalid cylinder ' + n });
      }

      // If found but type differs from selected type, update type so future counts/search align
      if (found.type !== type) {
        updateType.run(type, found.cylinder_number);
      }

      // mark active and attach customer
      updStatus.run(cust.id, found.cylinder_number);

      // insert history
      insertHist.run('sell', found.cylinder_number, type, cust.id, cust.name, cust.aadhar, cust.phone || null, nowISO());

      assigned.push(found.cylinder_number);
    }

    return res.json({ success: true, assigned });

  } catch (e) {
    console.error('/api/sell error:', e);
    return res.status(500).json({ error: 'Sell failed' });
  }
});

/* ================= RETURN ================= */
app.post('/api/return', (req,res)=>{
  try {
    const { cylinder_number } = req.body || {};
    if (!cylinder_number) return res.status(400).json({ error: 'Missing cylinder_number' });

    const row = db.prepare('SELECT * FROM cylinders WHERE cylinder_number = ?').get(cylinder_number);
    if (!row || row.status !== 'active') return res.status(400).json({ error: 'Invalid return' });

    const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(row.customer_id);

    db.prepare("UPDATE cylinders SET status = 'inactive', customer_id = NULL WHERE cylinder_number = ?").run(cylinder_number);

    db.prepare('INSERT INTO history (action,cylinder_number,cylinder_type,customer_id,customer_name,aadhar,phone,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run('return', cylinder_number, row.type, cust?.id || null, cust?.name || null, cust?.aadhar || null, cust?.phone || null, nowISO());

    return res.json({ success: true });
  } catch (e) {
    console.error('/api/return error:', e);
    return res.status(500).json({ error: 'Return failed' });
  }
});

/* ================= SEARCH ================= */
app.get('/api/search', (req,res)=>{
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing query' });

    // exact aadhar
    const customer = db.prepare('SELECT * FROM customers WHERE aadhar = ?').get(q);
    if (customer) {
      const counts = {};
      db.prepare("SELECT type, COUNT(*) cnt FROM cylinders WHERE customer_id = ? AND status = 'active' GROUP BY type")
        .all(customer.id).forEach(r => counts[r.type] = r.cnt);

      const history = db.prepare('SELECT * FROM history WHERE customer_id = ? ORDER BY created_at DESC').all(customer.id);
      return res.json({ type: 'customer', customer, counts, history });
    }

    // partial name
    const customers = db.prepare('SELECT * FROM customers WHERE name LIKE ?').all('%' + q + '%');
    if (customers.length === 1) {
      const c = customers[0];
      const counts = {};
      db.prepare("SELECT type, COUNT(*) cnt FROM cylinders WHERE customer_id = ? AND status = 'active' GROUP BY type")
        .all(c.id).forEach(r => counts[r.type] = r.cnt);
      const history = db.prepare('SELECT * FROM history WHERE customer_id = ? ORDER BY created_at DESC').all(c.id);
      return res.json({ type: 'customer', customer: c, counts, history });
    }
    if (customers.length > 1) return res.json({ type: 'customers', customers });

    // cylinder exact
    const cyl = db.prepare('SELECT * FROM cylinders WHERE cylinder_number = ?').get(q);
    if (cyl) {
      const history = db.prepare('SELECT * FROM history WHERE cylinder_number = ? ORDER BY created_at DESC').all(q);
      return res.json({ type: 'cylinder', cylinder: cyl, history });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error('/api/search error:', e);
    return res.status(500).json({ error: 'Search failed' });
  }
});

/* ================= COUNTS ================= */
app.get('/api/counts',(req,res)=>{
  try {
    const rows = db.prepare(`
      SELECT type,
        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN status='inactive' THEN 1 ELSE 0 END) AS inactive_count
      FROM cylinders
      GROUP BY type
    `).all();

    const map = {};
    rows.forEach(r => map[r.type] = r);

    const result = GAS_ORDER.map(t => ({
      type: t,
      active_count: map[t]?.active_count || 0,
      inactive_count: map[t]?.inactive_count || 0
    }));

    res.json(result);
  } catch (e) {
    console.error('/api/counts error:', e);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

/* ================= ACTIVE CUSTOMERS BY TYPE ================= */
app.get('/api/active-customers', (req,res)=>{
  try {
    const type = req.query.type;
    if (!type) return res.status(400).json({ error: 'Missing type' });
    const rows = db.prepare("SELECT DISTINCT c.id, c.name, c.aadhar, c.phone FROM customers c JOIN cylinders cy ON c.id = cy.customer_id WHERE cy.type = ? AND cy.status = 'active'").all(type);
    res.json(rows);
  } catch (e) {
    console.error('/api/active-customers error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

/* ================= HISTORY ================= */
app.get('/api/history', (req,res)=>{
  try {
    const rows = db.prepare('SELECT * FROM history ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (e) {
    console.error('/api/history error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

/* ================= FALLBACK ================= */
app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'..','frontend','index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', ()=>console.log('Server started on port', PORT));
