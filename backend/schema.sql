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
  aadhar TEXT UNIQUE,
  phone TEXT
);

CREATE TABLE cylinders (
  cylinder_number TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  customer_id INTEGER
);

CREATE TABLE history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT,
  cylinder_number TEXT,
  cylinder_type TEXT,
  customer_name TEXT,
  aadhar TEXT,
  created_at TEXT
);
