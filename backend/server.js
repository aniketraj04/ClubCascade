const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'ClubCascade'
});

db.connect((err) => {
  if (err) {
    console.error('❌ Error connecting to MySQL:', err);
    return;
  }
  console.log('✅ Successfully connected to the MySQL ClubCascade Database!');
});

// LOGIN API
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  // Find matching email and password
  const sqlQuery = 'SELECT * FROM users WHERE email = ? AND password = ?';
  db.query(sqlQuery, [email, password], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    // If we found the user
    if (results.length > 0) {
      const user = results[0];
      res.json({ success: true, message: `Welcome back, ${user.name}! (Role: ${user.role})`, user: user });
    } else {
      res.json({ success: false, message: 'Invalid email or password' });
    }
  });
});

// SIGNUP API
app.post('/api/signup', (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.json({ success: false, message: 'Please provide a name, email, and password.' });
  }

  // Default to student if no role is picked
  const definitiveRole = role || 'student';

  // Save the Name, Email, Password, and Role to the database
  const sqlQuery = 'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)';
  db.query(sqlQuery, [name, email, password, definitiveRole], (err, results) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.json({ success: false, message: 'Email already exists' });
      }
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ success: true, message: 'Account created with Roles!' });
  });
});

app.listen(3000, () => {
  console.log('🚀 Server running on port 3000');
});
