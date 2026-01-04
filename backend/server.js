require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use('/', express.static(path.join(__dirname,'..','frontend')));

function nowISO(){ return new Date().toISOString(); }

/* ================= GAS ORDER ================= */
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
  if (!username || !password) return res.status(400).json({ error:'Missing' });

  const row = db.prepare(
    'SELECT * FROM users WHERE username=? AND password=?'
  ).get(username,password);

  if (!row) return res.status(401).json({ error:'Invalid credentials' });
  res.json({ username: row.username });
});

/* ================= TYPES ================= */
app.get('/api/types', (req,res)=>{
  res.json(GAS_ORDER);
});

/* ================= CYLINDERS ================= */
app.get('/api/cylinders', (req,res)=>{
  const { status, type } = req.query;
  let sql = 'SELECT * FROM cylinders';
  const where = [], params = [];

  if (status) { where.push('status = ?'); params.push(status); }
  if (type)   { where.push('type = ?');   params.push(type); }

  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  res.json(db.prepare(sql).all(...params));
});

/* ================= HELPERS ================= */
function expandNumbersInput(type,input){
  const base = type.replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase();
  return input.split(',')
    .map(x=>x.trim())
    .filter(Boolean)
    .map(n => /^\d+$/.test(n) ? base + n.padStart(4,'0') : n);
}

/* ================= SELL ================= */
app.post('/api/sell',(req,res)=>{
  try{
    const { type, customer, cylinder_numbers_input } = req.body || {};
    if (!type || !customer?.name || !customer?.aadhar)
      return res.status(400).json({ error:'Missing fields' });

    const cylinders = expandNumbersInput(type, cylinder_numbers_input || '');
    if (!cylinders.length)
      return res.status(400).json({ error:'No cylinders' });

    let cust = db.prepare(
      'SELECT * FROM customers WHERE aadhar=?'
    ).get(customer.aadhar);

    if (!cust){
      const r = db.prepare(
        'INSERT INTO customers (name,aadhar,phone) VALUES (?,?,?)'
      ).run(customer.name, customer.aadhar, customer.phone || null);
      cust = db.prepare('SELECT * FROM customers WHERE id=?').get(r.lastInsertRowid);
    }

    const update = db.prepare(`
      UPDATE cylinders
      SET status='active', customer_id=?
      WHERE cylinder_number=? AND status='inactive'
    `);

    const history = db.prepare(`
      INSERT INTO history
      (action,cylinder_number,cylinder_type,customer_id,customer_name,aadhar,phone,created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `);

    const assigned = [];
    for (const cn of cylinders){
      const ok = update.run(cust.id, cn).changes;
      if (!ok) throw new Error('Invalid cylinder ' + cn);

      history.run(
        'sell', cn, type,
        cust.id, cust.name, cust.aadhar, cust.phone || null,
        nowISO()
      );
      assigned.push(cn);
    }

    res.json({ success:true, assigned });
  }catch(e){
    res.status(400).json({ error:e.message });
  }
});

/* ================= RETURN ================= */
app.post('/api/return',(req,res)=>{
  try{
    const { cylinder_number } = req.body || {};
    if (!cylinder_number)
      return res.status(400).json({ error:'Missing cylinder number' });

    const row = db.prepare(
      "SELECT * FROM cylinders WHERE cylinder_number=? AND status='active'"
    ).get(cylinder_number);

    if (!row) return res.status(400).json({ error:'Invalid return' });

    const cust = db.prepare(
      'SELECT * FROM customers WHERE id=?'
    ).get(row.customer_id);

    db.prepare(
      "UPDATE cylinders SET status='inactive', customer_id=NULL WHERE cylinder_number=?"
    ).run(cylinder_number);

    db.prepare(`
      INSERT INTO history
      (action,cylinder_number,cylinder_type,customer_id,customer_name,aadhar,phone,created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      'return', cylinder_number, row.type,
      cust?.id || null, cust?.name || null, cust?.aadhar || null, cust?.phone || null,
      nowISO()
    );

    res.json({ success:true });
  }catch(e){
    res.status(400).json({ error:e.message });
  }
});

/* ================= SEARCH ================= */
app.get('/api/search',(req,res)=>{
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error:'Missing query' });

  const cust = db.prepare(
    'SELECT * FROM customers WHERE aadhar=?'
  ).get(q);

  if (cust){
    const counts = {};
    db.prepare(
      "SELECT type,COUNT(*) cnt FROM cylinders WHERE customer_id=? AND status='active' GROUP BY type"
    ).all(cust.id).forEach(r => counts[r.type] = r.cnt);

    const history = db.prepare(
      'SELECT * FROM history WHERE customer_id=? ORDER BY created_at DESC'
    ).all(cust.id);

    return res.json({ type:'customer', customer:cust, counts, history });
  }

  const cyl = db.prepare(
    'SELECT * FROM cylinders WHERE cylinder_number=?'
  ).get(q);

  if (cyl){
    const history = db.prepare(
      'SELECT * FROM history WHERE cylinder_number=? ORDER BY created_at DESC'
    ).all(q);
    return res.json({ type:'cylinder', cylinder:cyl, history });
  }

  res.status(404).json({ error:'Not found' });
});

/* ================= COUNTS ================= */
app.get('/api/counts',(req,res)=>{
  const rows = db.prepare(`
    SELECT type,
      SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN status='inactive' THEN 1 ELSE 0 END) AS inactive_count
    FROM cylinders
    GROUP BY type
  `).all();

  const map = {};
  rows.forEach(r => map[r.type] = r);

  res.json(
    GAS_ORDER.map(t => ({
      type: t,
      active_count: map[t]?.active_count || 0,
      inactive_count: map[t]?.inactive_count || 0
    }))
  );
});

/* ================= ACTIVE CUSTOMERS ================= */
app.get('/api/active-customers',(req,res)=>{
  const type = req.query.type;
  const rows = db.prepare(`
    SELECT DISTINCT c.id,c.name,c.aadhar,c.phone
    FROM customers c
    JOIN cylinders cy ON c.id=cy.customer_id
    WHERE cy.type=? AND cy.status='active'
  `).all(type);
  res.json(rows);
});

/* ================= HISTORY ================= */
app.get('/api/history',(req,res)=>{
  res.json(
    db.prepare('SELECT * FROM history ORDER BY created_at DESC').all()
  );
});

/* ================= FRONTEND ================= */
app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'..','frontend','index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT,'0.0.0.0',()=>{
  console.log('Server started on port', PORT);
});
