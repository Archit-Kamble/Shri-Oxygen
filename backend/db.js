const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'cylinder.db'));
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// default login
db.prepare(
  'INSERT OR IGNORE INTO users (username,password) VALUES (?,?)'
).run('Vijay','1234');

// gases (ONLY THESE)
const GASES = [
  'Oxygen','M Oxygen','Argon','Callgas','Acetylene','Zerogas',
  'Carbon Dioxide','Ethylene','Helium','Hydraulic','Mixture',
  'Other Gas 1','Other Gas 2','Other Gas 3','Other Gas 4','Other Gas 5'
];

// seed cylinders ONCE
const count = db.prepare('SELECT COUNT(*) c FROM cylinders').get().c;
if (count === 0) {
  const ins = db.prepare(
    'INSERT INTO cylinders (cylinder_number,type,status) VALUES (?,?,?)'
  );
  const tx = db.transaction(()=>{
    for (const g of GASES) {
      const base = g.replace(/[^A-Za-z]/g,'').toUpperCase().slice(0,4);
      for (let i=1;i<=1000;i++) {
        ins.run(base+String(i).padStart(4,'0'), g, 'inactive');
      }
    }
  });
  tx();
}

module.exports = db;
