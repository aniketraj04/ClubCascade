const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer'); // NEW: Handles physical file uploads
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Create an 'uploads' directory locally if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// 2. Expose the 'uploads' folder to the internet so phones can render the images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 3. Configure Multer to securely name and save incoming images
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});
const upload = multer({ storage: storage });

// Database Connection
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
  const sqlQuery = 'SELECT * FROM users WHERE email = ? AND password = ?';
  db.query(sqlQuery, [email, password], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length > 0) res.json({ success: true, message: `Welcome back, ${results[0].name}!`, user: results[0] });
    else res.json({ success: false, message: 'Invalid email or password' });
  });
});

// SIGNUP API
app.post('/api/signup', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.json({ success: false, message: 'Please provide all details.' });

  const sqlQuery = 'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)';
  db.query(sqlQuery, [name, email, password, role || 'student'], (err) => {
    if (err && err.code === 'ER_DUP_ENTRY') return res.json({ success: false, message: 'Email already exists' });
    else if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true, message: 'Account securely created!' });
  });
});

// FETCH EVENTS API
app.get('/api/events', (req, res) => {
  const sqlQuery = 'SELECT * FROM events ORDER BY date ASC';
  db.query(sqlQuery, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true, events: results });
  });
});

// CREATE EVENT API (Now handles File Uploads from the Gallery!)
app.post('/api/events', upload.single('poster'), (req, res) => {
  const { title, description, date, venue, club_id, limit_participants } = req.body;

  console.log("-> Processing new event:", title);

  // If a physical file was uploaded from the gallery, generate the exact URL for it
  let finalImageUrl = req.body.image_url || null;
  if (req.file) {
    // 10.118.76.100 is your laptop's IP! So the phone knows where to load the image from.
    finalImageUrl = `http://10.118.76.100:3000/uploads/${req.file.filename}`;
    console.log("-> Successfully saved gallery image locally:", req.file.filename);
  }

  const sqlQuery = 'INSERT INTO events (title, description, date, venue, club_id, limit_participants, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)';
  const values = [title, description, date, venue, club_id || null, limit_participants || 0, finalImageUrl];

  db.query(sqlQuery, values, (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database refused to save: ' + err.message });
    res.json({ success: true, message: 'Event successfully published with Poster!' });
  });
});

app.listen(3000, () => {
  console.log('🚀 Server running on port 3000');
});
