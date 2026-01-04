const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/', express.static(path.join(__dirname,'..','frontend')));

const GAS_ORDER = [
  'Oxygen','M Oxygen','Argon','Callgas','Acetylene','Zerogas',
  'Carbon Dioxide','Ethylene','Helium','Hydraulic','Mixture',
  'Other Gas 1','Other Gas 2','Other Gas 3','Other Gas 4','Other Gas 5'
];

app.post('/api/login',(req,res)=>{
  const u=db.prepare(
    'SELECT * FROM users WHERE username=? AND password=?'
  ).get(req.body.username,req.body.password);
  if(!u) return res.status(401).json({error:'Invalid'});
  res.json({username:u.username});
});

app.get('/api/types',(req,res)=>res.json(GAS_ORDER));

app.post('/api/sell',(req,res)=>{
  const {type,customer,cylinder_numbers_input}=req.body;
  const nums=cylinder_numbers_input.split(',').map(n=>n.trim());
  const cust=db.prepare(
    'INSERT OR IGNORE INTO customers (name,aadhar,phone) VALUES (?,?,?)'
  ).run(customer.name,customer.aadhar,customer.phone||null);

  for(const n of nums){
    const base = type.replace(/[^A-Za-z]/g,'').substring(0,4).toUpperCase();
    const cn = base + String(n).padStart(4,'0');
    const r=db.prepare(
      'SELECT * FROM cylinders WHERE cylinder_number=? AND status="inactive"'
    ).get(cn);
    if(!r) return res.status(400).json({error:'Invalid cylinder '+n});
    db.prepare(
      'UPDATE cylinders SET status="active",customer_id=? WHERE cylinder_number=?'
    ).run(customer.aadhar,cn);
    db.prepare(
      'INSERT INTO history (action,cylinder_number,cylinder_type,customer_name,aadhar,created_at) VALUES (?,?,?,?,?,?)'
    ).run('sell',cn,type,customer.name,customer.aadhar,new Date().toISOString());
  }
  res.json({success:true});
});

app.get('/api/counts',(req,res)=>{
  const rows=db.prepare(`
    SELECT type,
    SUM(status='active') active_count,
    SUM(status='inactive') inactive_count
    FROM cylinders GROUP BY type
  `).all();
  res.json(GAS_ORDER.map(t=>{
    const r=rows.find(x=>x.type===t)||{};
    return {type:t,active_count:r.active_count||0,inactive_count:r.inactive_count||0};
  }));
});

app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'..','frontend','index.html'));
});

app.listen(4000,'0.0.0.0',()=>console.log('RUNNING'));
