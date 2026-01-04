require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use('/', express.static(path.join(__dirname, '..', 'frontend')));

function nowISO() {
  return new Date().toISOString();
}

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
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare(
    'SELECT * FROM users WHERE username=? AND password=?'
  ).get(username, password);

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ username: user.username });
});

/* ================= TYPES ================= */
app.get('/api/types', (req, res) => {
  res.json(GAS_ORDER);
});

/* ================= HELPER ================= */
function expandNumbersInput(type, input) {
  if (!input) return [];
  const base = type.replace(/[^A-Za-z0-9]/g, '').substring(0, 3).toUpperCase();
  const tokens = input.split(',').map(x => x.trim()).filter(Boolean);
  const out = [];

  for (const t of tokens) {
    if (t.includes('-')) {
      const [a, b] = t.split('-').map(Number);
      for (let i = a; i <= b; i++) {
        out.push(base + String(i).padStart(4, '0'));
      }
    } else {
      out.push(base + String(Number(t)).padStart(4, '0'));
    }
  }
  return [...new Set(out)];
}

/* ================= SELL ================= */
app.post('/api/sell', (req, res) => {
  const { type, customer, cylinder_numbers_input } = req.body || {};
  if (!type || !customer?.name || !customer?.aadhar)
    return res.status(400).json({ error: 'Missing fields' });

  const cylinders = expandNumbersInput(type, cylinder_numbers_input);
  if (!cylinders.length)
    return res.status(400).json({ error: 'No cylinders parsed' });

  let cust = db.prepare(
    'SELECT * FROM customers WHERE aadhar=?'
  ).get(customer.aadhar);

  if (!cust) {
    const r = db.prepare(
      'INSERT INTO customers (name,aadhar,phone) VALUES (?,?,?)'
    ).run(customer.name, customer.aadhar, customer.phone || null);
    cust = db.prepare('SELECT * FROM customers WHERE id=?')
      .get(r.lastInsertRowid);
  }

  try {
    for (const cn of cylinders) {
      const row = db.prepare(
        'SELECT * FROM cylinders WHERE cylinder_number=? AND type=?'
      ).get(cn, type);

      if (!row || row.status !== 'inactive')
        throw new Error('Invalid cylinder ' + cn);

      db.prepare(
        'UPDATE cylinders SET status="active", customer_id=? WHERE cylinder_number=?'
      ).run(cust.id, cn);

      db.prepare(
        'INSERT INTO history (action,cylinder_number,cylinder_type,customer_id,customer_name,aadhar,phone,created_at) VALUES (?,?,?,?,?,?,?,?)'
      ).run('sell', cn, type, cust.id, cust.name, cust.aadhar, cust.phone, nowISO());
    }

    res.json({ success: true, assigned: cylinders });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ================= RETURN ================= */
app.post('/api/return', (req, res) => {
  const { cylinder_number } = req.body || {};
  const row = db.prepare(
    'SELECT * FROM cylinders WHERE cylinder_number=?'
  ).get(cylinder_number);

  if (!row || row.status !== 'active')
    return res.status(400).json({ error: 'Invalid return' });

  const cust = db.prepare(
    'SELECT * FROM customers WHERE id=?'
  ).get(row.customer_id);

  db.prepare(
    'UPDATE cylinders SET status="inactive", customer_id=NULL WHERE cylinder_number=?'
  ).run(cylinder_number);

  db.prepare(
    'INSERT INTO history (action,cylinder_number,cylinder_type,customer_id,customer_name,aadhar,phone,created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run('return', cylinder_number, row.type, cust?.id, cust?.name, cust?.aadhar, cust?.phone, nowISO());

  res.json({ success: true });
});

/* ================= COUNTS (FIXED ORDER) ================= */
app.get('/api/counts', (req, res) => {
  const raw = db.prepare(`
    SELECT type,
    SUM(status='active') active_count,
    SUM(status='inactive') inactive_count
    FROM cylinders GROUP BY type
  `).all();

  const map = {};
  raw.forEach(r => map[r.type] = r);

  res.json(GAS_ORDER.map(t => ({
    type: t,
    active_count: map[t]?.active_count || 0,
    inactive_count: map[t]?.inactive_count || 0
  })));
});

/* ================= HISTORY ================= */
app.get('/api/history', (req, res) => {
  res.json(
    db.prepare('SELECT * FROM history ORDER BY created_at DESC').all()
  );
});

/* ================= SEARCH ================= */
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });

  const cust = db.prepare(
    'SELECT * FROM customers WHERE aadhar=?'
  ).get(q);

  if (cust) {
    const history = db.prepare(
      'SELECT * FROM history WHERE customer_id=? ORDER BY created_at DESC'
    ).all(cust.id);
    return res.json({ type: 'customer', customer: cust, history });
  }

  return res.status(404).json({ error: 'Not found' });
});

/* ================= FALLBACK ================= */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () =>
  console.log('Server started on port', PORT)
);
