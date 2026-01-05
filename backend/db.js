const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "database.sqlite");

const db = new sqlite3.Database(dbPath, err => {
  if (err) {
    console.error("SQLite connection error:", err);
  } else {
    console.log("SQLite database connected");
  }
});

/* Create table if not exists */
db.run(`
  CREATE TABLE IF NOT EXISTS cylinders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL
  )
`);

module.exports = db;
