require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/', express.static(path.join(__dirname,'..','frontend')));

function nowISO(){ return new Date().toISOString(); }

const GAS_ORDER = [
  'Oxygen','M Oxygen','Argon','Callgas','Acetylene','Zerogas',
  'Carbon Dioxide','Ethylene','Helium','Hydraulic','Mixture',
  'Other Gas 1','Other Gas 2','Other Gas 3','Other Gas 4','Other Gas 5'
];

const PREFIX = {
  'Oxygen':'OXY','M Oxygen':'MOXY','Argon':'ARG','Callgas':'CALL',
  'Acetylene':'ACET','Zerogas':'ZERO','Carbon Dioxide':'CO2',
  'Ethylene':'ETH','Helium':'HE','Hydraulic':'HYD','Mixture':'MIX',
  'Other Gas 1':'OG1','Other Gas 2':'OG2','Other Gas 3':'OG3',
  'Other Gas 4':'OG4','Other Gas 5':'OG5'
};

// 🔁 NUMBER EXPAND (THIS FIXES SELL)
function expandNumbers(type,input){
  const base = PREFIX[type];
  return input.split(',').map(x =>
    base + String(parseInt(x.trim(),10)).padStart(4,'0')
  );
}

/* LOGIN */
app.post('/api/login',(req,res)=>{
  const {username,password}=req.body;
  const u=db.prepare(
    'SELECT * FROM users WHERE username=? AND password=?'
  ).get(username,password);
  if(!u) return res.status(401).json({error:'Invalid'});
  res.json({username});
});

/* TYPES */
app.get('/api/types',(req,res)=>res.json(GAS_ORDER));

/* SELL */
app.post('/api/sell',(req,res)=>{
  const {type,customer,cylinder_numbers_input}=req.body;
  const nums=expandNumbers(type,cylinder_numbers_input);

  let cust=db.prepare(
    'SELECT * FROM customers WHERE aadhar=?'
  ).get(customer.aadhar);

  if(!cust){
    const r=db.prepare(
      'INSERT INTO customers (name,aadhar,phone) VALUES (?,?,?)'
    ).run(customer.name,customer.aadhar,customer.phone);
    cust={id:r.lastInsertRowid,...customer};
  }

  try{
    for(const cn of nums){
      const c=db.prepare(
        'SELECT * FROM cylinders WHERE cylinder_number=? AND status="inactive"'
      ).get(cn);
      if(!c) throw new Error('Invalid cylinder '+cn);

      db.prepare(
        'UPDATE cylinders SET status="active",customer_id=? WHERE cylinder_number=?'
      ).run(cust.id,cn);

      db.prepare(
        'INSERT INTO history (action,cylinder_number,cylinder_type,customer_id,customer_name,aadhar,phone,created_at) VALUES (?,?,?,?,?,?,?,?)'
      ).run('sell',cn,type,cust.id,cust.name,cust.aadhar,cust.phone,nowISO());
    }
    res.json({success:true,assigned:nums});
  }catch(e){
    res.status(400).json({error:e.message});
  }
});

/* COUNTS — ALWAYS SHOW ALL GASES */
app.get('/api/counts',(req,res)=>{
  const rows=db.prepare(`
    SELECT type,
      SUM(status='active') active_count,
      SUM(status='inactive') inactive_count
    FROM cylinders GROUP BY type
  `).all();

  const map={};
  rows.forEach(r=>map[r.type]=r);

  res.json(GAS_ORDER.map(t=>({
    type:t,
    active_count:map[t]?.active_count||0,
    inactive_count:map[t]?.inactive_count||0
  })));
});

app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'..','frontend','index.html'));
});

const PORT=process.env.PORT||4000;
app.listen(PORT,'0.0.0.0',()=>console.log('Server started',PORT));
