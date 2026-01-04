CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  aadhar TEXT UNIQUE,
  phone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cylinders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cylinder_number TEXT UNIQUE,
  type TEXT,
  status TEXT,
  customer_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT,
  cylinder_number TEXT,
  cylinder_type TEXT,
  customer_id INTEGER,
  customer_name TEXT,
  aadhar TEXT,
  phone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
