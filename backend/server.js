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

/* ================= CYLINDER SEED (SQLITE SAFE) ================= */
function seedCylindersIfNeeded(){
  const count = db.prepare('SELECT COUNT(*) AS c FROM cylinders').get().c;
  if (count > 0) return;

  console.log('Seeding cylinders...');

  const prefix = {
    'Oxygen':'OXY','M Oxygen':'MOXY','Argon':'ARG','Callgas':'CALL',
    'Acetylene':'ACET','Zerogas':'ZERO','Carbon Dioxide':'CO2',
    'Ethylene':'ETH','Helium':'HE','Hydraulic':'HYD','Mixture':'MIX',
    'Other Gas 1':'OG1','Other Gas 2':'OG2','Other Gas 3':'OG3',
    'Other Gas 4':'OG4','Other Gas 5':'OG5'
  };

  const insert = db.prepare(
    'INSERT INTO cylinders (cylinder_number,type,status) VALUES (?,?,?)'
  );

  const tx = db.transaction(()=>{
    for (const type of GAS_ORDER){
      for (let i=1;i<=1000;i++){
        insert.run(prefix[type]+String(i).padStart(4,'0'), type, 'inactive');
      }
    }
  });
  tx();
  console.log('Cylinder seeding completed');
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

/* ================= CYLINDERS ================= */
app.get('/api/cylinders',(req,res)=>{
  const {status,type}=req.query;
  let sql='SELECT * FROM cylinders';const p=[],w=[];
  if(status){w.push('status=?');p.push(status);}
  if(type){w.push('type=?');p.push(type);}
  if(w.length) sql+=' WHERE '+w.join(' AND ');
  res.json(db.prepare(sql).all(...p));
});

/* ================= SELL ================= */
app.post('/api/sell',(req,res)=>{
  const {type,customer,cylinder_numbers_input}=req.body||{};
  if(!type||!customer?.name||!customer?.aadhar)
    return res.status(400).json({error:'Missing fields'});

  const nums=cylinder_numbers_input.split(',').map(x=>x.trim()).filter(Boolean);
  let cust=db.prepare('SELECT * FROM customers WHERE aadhar=?').get(customer.aadhar);
  if(!cust){
    const r=db.prepare(
      'INSERT INTO customers (name,aadhar,phone) VALUES (?,?,?)'
    ).run(customer.name,customer.aadhar,customer.phone||null);
    cust=db.prepare('SELECT * FROM customers WHERE id=?').get(r.lastInsertRowid);
  }

  const upd=db.prepare('UPDATE cylinders SET status=?,customer_id=? WHERE cylinder_number=?');
  const hist=db.prepare(
    'INSERT INTO history (action,cylinder_number,cylinder_type,customer_id,customer_name,aadhar,phone,created_at) VALUES (?,?,?,?,?,?,?,?)'
  );

  try{
    const assigned=[];
    for(const cn of nums){
      const r=db.prepare('SELECT * FROM cylinders WHERE cylinder_number=?').get(cn);
      if(!r||r.status!=='inactive'||r.type!==type)
        throw new Error('Invalid cylinder '+cn);
      upd.run('active',cust.id,cn);
      hist.run('sell',cn,type,cust.id,cust.name,cust.aadhar,cust.phone,nowISO());
      assigned.push(cn);
    }
    res.json({success:true,assigned});
  }catch(e){res.status(400).json({error:e.message});}
});

/* ================= RETURN ================= */
app.post('/api/return',(req,res)=>{
  const {cylinder_number}=req.body||{};
  const r=db.prepare('SELECT * FROM cylinders WHERE cylinder_number=?').get(cylinder_number);
  if(!r||r.status!=='active')
    return res.status(400).json({error:'Invalid return'});
  const c=db.prepare('SELECT * FROM customers WHERE id=?').get(r.customer_id);
  db.prepare(
    'UPDATE cylinders SET status="inactive",customer_id=NULL WHERE cylinder_number=?'
  ).run(cylinder_number);
  db.prepare(
    'INSERT INTO history (action,cylinder_number,cylinder_type,customer_id,customer_name,aadhar,phone,created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run('return',cylinder_number,r.type,c?.id,c?.name,c?.aadhar,c?.phone,nowISO());
  res.json({success:true});
});

/* ================= SEARCH ================= */
app.get('/api/search',(req,res)=>{
  const q=(req.query.q||'').trim();
  if(!q) return res.status(400).json({error:'Missing'});
  const cust=db.prepare('SELECT * FROM customers WHERE aadhar=?').get(q);
  if(cust){
    const counts={};
    db.prepare(
      "SELECT type,COUNT(*) cnt FROM cylinders WHERE customer_id=? AND status='active' GROUP BY type"
    ).all(cust.id).forEach(r=>counts[r.type]=r.cnt);
    const history=db.prepare(
      'SELECT * FROM history WHERE customer_id=? ORDER BY created_at DESC'
    ).all(cust.id);
    return res.json({type:'customer',customer:cust,counts,history});
  }
  const cyl=db.prepare('SELECT * FROM cylinders WHERE cylinder_number=?').get(q);
  if(cyl){
    const history=db.prepare(
      'SELECT * FROM history WHERE cylinder_number=? ORDER BY created_at DESC'
    ).all(q);
    return res.json({type:'cylinder',cylinder:cyl,history});
  }
  res.status(404).json({error:'Not found'});
});

/* ================= COUNTS ================= */
app.get('/api/counts', (req, res) => {
  const rows = db.prepare(`
    SELECT type,
           SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_count,
           SUM(CASE WHEN status='inactive' THEN 1 ELSE 0 END) AS inactive_count
    FROM cylinders
    GROUP BY type
  `).all();

  // Map DB results by type
  const map = {};
  for (const r of rows) {
    map[r.type] = {
      active_count: r.active_count || 0,
      inactive_count: r.inactive_count || 0
    };
  }

  // Force GAS_ORDER + zero-safe counts
  const result = GAS_ORDER.map(type => ({
    type,
    active_count: map[type]?.active_count || 0,
    inactive_count: map[type]?.inactive_count || 0
  }));

  res.json(result);
});


app.get('/api/active-customers',(req,res)=>{
  const rows=db.prepare(
    "SELECT DISTINCT c.id,c.name,c.aadhar,c.phone FROM customers c JOIN cylinders cy ON c.id=cy.customer_id WHERE cy.type=? AND cy.status='active'"
  ).all(req.query.type);
  res.json(rows);
});

app.get('/api/history',(req,res)=>{
  res.json(db.prepare('SELECT * FROM history ORDER BY created_at DESC').all());
});

app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'..','frontend','index.html'));
});



seedCylindersIfNeeded();
const PORT=process.env.PORT||4000;
app.listen(PORT,'0.0.0.0',()=>console.log('Server started on port',PORT));
