const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const DB_FILE = path.join(__dirname, 'cylinder.db');
const db = new Database(DB_FILE);

const schema = fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');
db.exec(schema);

const u = db.prepare('SELECT COUNT(*) AS c FROM users').get();
if (!u || u.c===0) db.prepare('INSERT OR IGNORE INTO users (username,password) VALUES (?,?)').run('Vijay','1234');

const types = ["Hp(In)", "LPG(In)", "Oxygen", "Carbon Dioxide", "Nitrogen", "Hydrogen", "Helium", "Acetylene", "Propane", "Butane", "Chlorine", "Ammonia", "Sulfur Dioxide", "Methane", "Nitrous Oxide", "Fluorine", "Neon", "Argon", "Krypton"];
const ccount = db.prepare('SELECT COUNT(*) AS c FROM cylinders').get();
if (!ccount || ccount.c===0) {
  const insert = db.prepare('INSERT INTO cylinders (cylinder_number,type,status) VALUES (?,?,?)');
  for (const t of types) {
    const base = t.replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase();
    for (let i=1;i<=1000;i++) {
      const num = base + String(i).padStart(4,'0');
      insert.run(num, t, 'inactive');
    }
  }
}

module.exports = db;
