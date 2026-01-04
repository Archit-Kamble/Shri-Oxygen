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

/* ================= GAS ORDER (FIXED) ================= */
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

/* ================= LOGIN ================= */
app.post('/api/login', (req,res)=>{
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing' });
  const row = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
  if (!row) return res.status(401).json({ error: 'Invalid credentials' });
  return res.json({ username: row.username });
});

/* ================= TYPES (ORDER FIXED) ================= */
app.get('/api/types', (req,res)=>{
  res.json(GAS_ORDER);
});

/* ================= CYLINDERS ================= */
app.get('/api/cylinders', (req,res)=>{
  const { status, type } = req.query;
  let sql = 'SELECT * FROM cylinders';
  const clauses=[]; const params=[];
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (type) { clauses.push('type = ?'); params.push(type); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

/* ================= HELPERS ================= */
function expandNumbersInput(type,input){
  if(!input) return [];
  const tokens = input.split(',').map(s=>s.trim()).filter(Boolean);
  const out = [];
  const base = type.replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase();
  for (const t of tokens){
    if (t.includes('-')){
      const [a,b] = t.split('-').map(s=>s.trim());
      if (/^\d+$/.test(a) && /^\d+$/.test(b)){
        for (let i=parseInt(a,10);i<=parseInt(b,10);i++)
          out.push(base + String(i).padStart(4,'0'));
      } else out.push(t);
    } else {
      if (/^\d+$/.test(t))
        out.push(base + String(parseInt(t,10)).padStart(4,'0'));
      else out.push(t);
    }
  }
  return Array.from(new Set(out));
}

/* ================= SELL ================= */
app.post('/api/sell', (req,res)=>{
  const { type, customer, cylinder_numbers_input } = req.body || {};
  if (!type || !customer || !customer.name || !customer.aadhar)
    return res.status(400).json({ error: 'Missing fields' });

  const cylinder_numbers = expandNumbersInput(type, cylinder_numbers_input);
  if (!cylinder_numbers.length)
    return res.status(400).json({ error: 'No valid cylinders' });

  let cust = db.prepare('SELECT * FROM customers WHERE aadhar = ?').get(customer.aadhar);
  if (!cust){
    const info = db.prepare('INSERT INTO customers (name,aadhar,phone) VALUES (?,?,?)')
      .run(customer.name, customer.aadhar, customer.phone || null);
    cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  }

  const updateStmt = db.prepare('UPDATE cylinders SET status = ?, customer_id = ? WHERE cylinder_number = ?');
  const histInsert = db.prepare(
    'INSERT INTO history (action,cylinder_number,cylinder_type,customer_id,customer_name,aadhar,phone,created_at) VALUES (?,?,?,?,?,?,?,?)'
  );

  try {
    const assigned = [];
    for (const cn of cylinder_numbers){
      const row = db.prepare('SELECT * FROM cylinders WHERE cylinder_number = ?').get(cn);
      if (!row || row.status !== 'inactive' || row.type !== type)
        throw new Error('Invalid cylinder: ' + cn);

      updateStmt.run('active', cust.id, cn);
      histInsert.run('sell', cn, type, cust.id, cust.name, cust.aadhar, cust.phone, nowISO());
      assigned.push(cn);
    }
    res.json({ success:true, assigned });
  } catch (err){
    res.status(400).json({ error: err.message });
  }
});

/* ================= RETURN ================= */
app.post('/api/return', (req,res)=>{
  const { cylinder_number } = req.body || {};
  const row = db.prepare('SELECT * FROM cylinders WHERE cylinder_number = ?').get(cylinder_number);
  if (!row || row.status !== 'active')
    return res.status(400).json({ error: 'Invalid return' });

  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(row.customer_id);
  db.prepare('UPDATE cylinders SET status = ?, customer_id = NULL WHERE cylinder_number = ?')
    .run('inactive', cylinder_number);

  db.prepare(
    'INSERT INTO history (action,cylinder_number,cylinder_type,customer_id,customer_name,aadhar,phone,created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run('return', cylinder_number, row.type, cust?.id, cust?.name, cust?.aadhar, cust?.phone, nowISO());

  res.json({ success:true });
});

/* ================= SEARCH / COUNTS / HISTORY ================= */
app.get('/api/search', (req,res)=>{
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });

  // 1️⃣ AADHAR (exact)
  const customer = db.prepare(
    'SELECT * FROM customers WHERE aadhar = ?'
  ).get(q);

  if (customer){
    const counts = {};
    db.prepare(
      "SELECT type, COUNT(*) cnt FROM cylinders WHERE customer_id=? AND status='active' GROUP BY type"
    ).all(customer.id).forEach(r => counts[r.type] = r.cnt);

    const history = db.prepare(
      'SELECT * FROM history WHERE customer_id=? ORDER BY created_at DESC'
    ).all(customer.id);

    return res.json({
      type: 'customer',
      customer,
      counts,
      history
    });
  }

  // 2️⃣ NAME SEARCH (partial)
  const customers = db.prepare(
    'SELECT * FROM customers WHERE name LIKE ?'
  ).all('%' + q + '%');

  if (customers.length === 1){
    const c = customers[0];

    const counts = {};
    db.prepare(
      "SELECT type, COUNT(*) cnt FROM cylinders WHERE customer_id=? AND status='active' GROUP BY type"
    ).all(c.id).forEach(r => counts[r.type] = r.cnt);

    const history = db.prepare(
      'SELECT * FROM history WHERE customer_id=? ORDER BY created_at DESC'
    ).all(c.id);

    return res.json({
      type: 'customer',
      customer: c,
      counts,
      history
    });
  }

  if (customers.length > 1){
    return res.json({
      type: 'customers',
      customers
    });
  }

  // 3️⃣ CYLINDER NUMBER
  const cyl = db.prepare(
    'SELECT * FROM cylinders WHERE cylinder_number=?'
  ).get(q);

  if (cyl){
    const history = db.prepare(
      'SELECT * FROM history WHERE cylinder_number=? ORDER BY created_at DESC'
    ).all(q);

    return res.json({
      type: 'cylinder',
      cylinder: cyl,
      history
    });
  }

  return res.status(404).json({ error: 'Not found' });
});


app.get('/api/counts',(req,res)=>{
  const rows = db.prepare(
    "SELECT type, SUM(status='active') active_count, SUM(status='inactive') inactive_count FROM cylinders GROUP BY type"
  ).all();
  res.json(rows);
});

app.get('/api/active-customers',(req,res)=>{
  const type = req.query.type;
  const rows = db.prepare(
    "SELECT DISTINCT c.id,c.name,c.aadhar,c.phone FROM customers c JOIN cylinders cy ON c.id=cy.customer_id WHERE cy.type=? AND cy.status='active'"
  ).all(type);
  res.json(rows);
});

app.get('/api/history',(req,res)=>{
  const rows = db.prepare('SELECT * FROM history ORDER BY created_at DESC').all();
  res.json(rows);
});

app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'..','frontend','index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT,'0.0.0.0',()=>console.log('Server started on port',PORT));
