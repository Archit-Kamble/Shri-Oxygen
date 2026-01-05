const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Cylinder Shop API running (SQLite)");
});

/* GET */
app.get("/cylinders", (req, res) => {
  db.all("SELECT * FROM cylinders", [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
});

/* POST */
app.post("/cylinders", (req, res) => {
  const { type, quantity, price } = req.body;

  db.run(
    "INSERT INTO cylinders (type, quantity, price) VALUES (?, ?, ?)",
    [type, quantity, price],
    err => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Cylinder added" });
    }
  );
});

app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
