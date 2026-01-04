const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// absolute frontend path (IMPORTANT)
const FRONTEND_PATH = path.join(__dirname, '..', 'frontend');

// serve static files
app.use(express.static(FRONTEND_PATH));

// health check (debug)
app.get('/api/ping', (req, res) => {
  res.json({ ok: true });
});

// ROOT ROUTE — EXPLICIT (FIXES 502)
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

// fallback (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('RUNNING on port', PORT);
});
