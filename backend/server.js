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

/* ================= PREFIX MAP ================= */
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

/* ================= FORCE RESET (ONE TIME ONLY) ================= */
// 🔥 THIS IS WHY THINGS WILL FINALLY WORK
db.prepare('DELETE FROM cylinders').run();

/* ================= SEED CYLINDERS ================= */
function seedCylinders(){
  const insert = db.prepare(
    'INSERT INTO cylinders (cylinder_number,type,status) VALUES (?,?,?)'
  );

  const tx = db.transaction(()=>{
    for (const type of GAS_ORDER){
      const prefix = GAS_PREFIX[type];
      for (let i=1;i<=1000;i++){
        insert.run(prefix + String(i).padStart(4,'0'), type, 'inactive');
      }
    }
  });

  tx();
  console.log('Cylinders seeded correctly');
}

/* ================= PARSE INPUT ================= */
function parseInput(type, input){
  const prefix = GAS_PREFIX[type];
  if (!prefix) throw new Error('Invalid gas type');

  return input
    .split(',')
    .map(x=>x.trim())
    .filter(Boolean)
    .map(n=>{
      if (isNaN(n)) throw new Error('Invalid number ' + n);
      return prefix + String(Number(n)).padStart(4,'0');
    });
}

/* ================= LOGIN ================= */
app.post('/api/login',(req,res)=>{
  const { username,password } = req.body || {};
  const row = db.prepare(
    'SELECT * FROM users WHERE username=? AND password=?'
  ).get(username,password);
  if(!row) return res.status(401).json({error:'Invalid credentials'});
  res.json({username:row.username});
});

/* ================= TYPES ================= */
app.get('/api/types',(req,res)=>res.json(GAS_ORDER));

/* ================= SELL ================= */
app.post('/api/sell',(req,res)=>{
  const { type, customer, cylinder_numbers_input } = req.body;
  if(!type || !customer?.name || !customer?.aadhar)
    return res.status(400).json({error:'Missing fields'});

  let numbers;
  try {
    numbers = parseInput(type, cylinder_numbers_input);
  } catch(e){
    return res.status(400).json({error:e.message});
  }

  let cust = db.prepare(
    'SELECT * FROM customers WHERE aadhar=?'
  ).get(customer.aadhar);

  if(!cust){
    const r = db.prepare(
      'INSERT INTO customers (name,aadhar,phone) VALUES (?,?,?)'
    ).run(customer.name, customer.aadhar, customer.phone || null);
    cust = db.prepare('SELECT * FROM customers WHERE id=?').get(r.lastInsertRowid);
  }

  try{
    const assigned=[];
    for(const cn of numbers){
      const row=db.prepare(
        'SELECT * FROM cylinders WHERE cylinder_number=?'
      ).get(cn);

      if(!row || row.status!=='inactive')
        throw new Error('Invalid cylinder ' + cn);

      db.prepare(
        'UPDATE cylinders SET status="active", customer_id=? WHERE cylinder_number=?'
      ).run(cust.id, cn);

      db.prepare(
        'INSERT INTO history (action,cylinder_number,cylinder_type,customer_id,customer_name,aadhar,phone,created_at) VALUES (?,?,?,?,?,?,?,?)'
      ).run('sell', cn, type, cust.id, cust.name, cust.aadhar, cust.phone, nowISO());

      assigned.push(cn);
    }
    res.json({success:true, assigned});
  }catch(e){
    res.status(400).json({error:e.message});
  }
});

/* ================= COUNTS ================= */
app.get('/api/counts',(req,res)=>{
  const rows=db.prepare(`
    SELECT type,
      SUM(status='active') active,
      SUM(status='inactive') inactive
    FROM cylinders GROUP BY type
  `).all();

  const map={};
  rows.forEach(r=>map[r.type]=r);

  res.json(GAS_ORDER.map(t=>({
    type:t,
    active_count:map[t]?.active||0,
    inactive_count:map[t]?.inactive||0
  })));
});

/* ================= START ================= */
seedCylinders();
const PORT=process.env.PORT||4000;
app.listen(PORT,'0.0.0.0',()=>console.log('Server started on port',PORT));
