const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname,'..','frontend')));

const GAS_ORDER = [
  'Oxygen','M Oxygen','Argon','Callgas','Acetylene','Zerogas',
  'Carbon Dioxide','Ethylene','Helium','Hydraulic','Mixture',
  'Other Gas 1','Other Gas 2','Other Gas 3','Other Gas 4','Other Gas 5'
];

app.post('/api/login',(req,res)=>{
  const u = db.prepare(
    'SELECT * FROM users WHERE username=? AND password=?'
  ).get(req.body.username, req.body.password);
  if (!u) return res.status(401).json({error:'Invalid'});
  res.json({username:u.username});
});

app.get('/api/types',(req,res)=>res.json(GAS_ORDER));

app.post('/api/sell',(req,res)=>{
  const {type,customer,numbers} = req.body;
  const list = numbers.split(',').map(n=>n.trim());
  const cust = db.prepare(
    'INSERT OR IGNORE INTO customers (name,aadhar,phone) VALUES (?,?,?)'
  );
  cust.run(customer.name, customer.aadhar, customer.phone);

  for (const n of list) {
    const c = db.prepare(
      'SELECT * FROM cylinders WHERE cylinder_number=? AND type=? AND status="inactive"'
    ).get(n,type);
    if (!c) return res.status(400).json({error:'Invalid cylinder '+n});
    db.prepare(
      'UPDATE cylinders SET status="active" WHERE cylinder_number=?'
    ).run(n);
    db.prepare(
      'INSERT INTO history (action,cylinder_number,cylinder_type,customer_name,created_at) VALUES (?,?,?,?,datetime("now"))'
    ).run('sell',n,type,customer.name);
  }
  res.json({success:true});
});

app.get('/api/counts',(req,res)=>{
  const rows = db.prepare(`
    SELECT type,
      SUM(status='active') active,
      SUM(status='inactive') inactive
    FROM cylinders GROUP BY type
  `).all();
  const map={}; rows.forEach(r=>map[r.type]=r);
  res.json(GAS_ORDER.map(t=>({
    type:t,
    active:map[t]?.active||0,
    inactive:map[t]?.inactive||0
  })));
});

app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'..','frontend','index.html'));
});

app.listen(process.env.PORT||4000,'0.0.0.0',()=>{
  console.log('Server running');
});
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port', PORT);
});
