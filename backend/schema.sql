DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS cylinders;
DROP TABLE IF EXISTS history;

CREATE TABLE users (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  aadhar TEXT UNIQUE NOT NULL,
  phone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cylinders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cylinder_number TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  status TEXT CHECK(status IN ('active','inactive')) NOT NULL,
  customer_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT CHECK(action IN ('sell','return')) NOT NULL,
  cylinder_number TEXT NOT NULL,
  cylinder_type TEXT NOT NULL,
  customer_id INTEGER,
  customer_name TEXT,
  aadhar TEXT,
  phone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
