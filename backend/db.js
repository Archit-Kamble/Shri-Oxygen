const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'cylinder.db'));
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

db.prepare(
  'INSERT INTO users (username,password) VALUES (?,?)'
).run('Vijay', '1234');

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

const ins = db.prepare(
  'INSERT INTO cylinders (cylinder_number,type,status) VALUES (?,?,?)'
);

for (const type of GAS_ORDER) {
  for (let i=1;i<=1000;i++) {
    ins.run(PREFIX[type]+String(i).padStart(4,'0'), type, 'inactive');
  }
}

module.exports = db;
