const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const { db, GAS_ORDER } = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const now = () => new Date().toISOString();

/* LOGIN */
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const u = db.prepare(
    'SELECT * FROM users WHERE username=? AND password=?'
  ).get(username, password);
  if (!u) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ username });
});

/* TYPES */
app.get('/api/types', (req, res) => {
  res.json(GAS_ORDER);
});

/* SELL */
app.post('/api/sell', (req, res) => {
  const { type, customer, cylinder_numbers_input } = req.body;

  const numbers = cylinder_numbers_input
    .split(',')
    .map(n => n.trim())
    .filter(Boolean)
    .map(n => {
      const p = db.prepare(
        'SELECT cylinder_number FROM cylinders WHERE type=? LIMIT 1'
      ).get(type).cylinder_number.replace(/\d+$/, '');
      return p + String(parseInt(n)).padStart(4, '0');
    });

  let cust = db.prepare(
    'SELECT * FROM customers WHERE aadhar=?'
  ).get(customer.aadhar);

  if (!cust) {
    const r = db.prepare(
      'INSERT INTO customers (name,aadhar,phone) VALUES (?,?,?)'
    ).run(customer.name, customer.aadhar, customer.phone || null);
    cust = { id: r.lastInsertRowid, ...customer };
  }

  const upd = db.prepare(
    'UPDATE cylinders SET status="active", customer_id=? WHERE cylinder_number=? AND status="inactive"'
  );

  const hist = db.prepare(
    'INSERT INTO history VALUES (NULL,?,?,?,?,?,?,?,?)'
  );

  for (const cn of numbers) {
    const ok = upd.run(cust.id, cn).changes;
    if (!ok) return res.status(400).json({ error: 'Invalid cylinder ' + cn });
    hist.run(
      'sell', cn, type, cust.id, cust.name,
      cust.aadhar, cust.phone, now()
    );
  }

  res.json({ success: true, assigned: numbers });
});

/* RETURN */
app.post('/api/return', (req, res) => {
  const { cylinder_number } = req.body;
  const row = db.prepare(
    'SELECT * FROM cylinders WHERE cylinder_number=? AND status="active"'
  ).get(cylinder_number);

  if (!row) return res.status(400).json({ error: 'Invalid return' });

  const cust = db.prepare(
    'SELECT * FROM customers WHERE id=?'
  ).get(row.customer_id);

  db.prepare(
    'UPDATE cylinders SET status="inactive", customer_id=NULL WHERE cylinder_number=?'
  ).run(cylinder_number);

  db.prepare(
    'INSERT INTO history VALUES (NULL,?,?,?,?,?,?,?,?)'
  ).run(
    'return', cylinder_number, row.type,
    cust.id, cust.name, cust.aadhar, cust.phone, now()
  );

  res.json({ success: true });
});

/* COUNTS */
app.get('/api/counts', (req, res) => {
  const rows = db.prepare(`
    SELECT type,
      SUM(status='active') active_count,
      SUM(status='inactive') inactive_count
    FROM cylinders GROUP BY type
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

/* HISTORY */
app.get('/api/history', (req, res) => {
  res.json(
    db.prepare('SELECT * FROM history ORDER BY created_at DESC').all()
  );
});

/* FALLBACK */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () =>
  console.log('Server running on', PORT)
);
