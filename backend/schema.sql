CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  aadhar TEXT UNIQUE,
  phone TEXT
);

CREATE TABLE IF NOT EXISTS cylinders (
  cylinder_number TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  customer_id INTEGER
);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT,
  cylinder_number TEXT,
  cylinder_type TEXT,
  customer_name TEXT,
  created_at TEXT
);
