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

// ===================================================================
// NEW: REGISTER FOR EVENT API (For Students)
// ===================================================================
app.post('/api/register', (req, res) => {
  const { user_id, event_id } = req.body;
  if (!user_id || !event_id) return res.json({ success: false, message: 'Missing user or event ID' });

  // 1. Check if the event is completely full!
  db.query('SELECT limit_participants, (SELECT COUNT(*) FROM registrations WHERE event_id = ?) as current_count FROM events WHERE event_id = ?', [event_id, event_id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error deciding limits.' });
    if (results.length === 0) return res.json({ success: false, message: 'Event not found.' });

    const event = results[0];
    if (event.limit_participants > 0 && event.current_count >= event.limit_participants) {
      return res.json({ success: false, message: 'Sorry, this event is completely full!' });
    }

    // 2. Check if the student is ALREADY registered
    db.query('SELECT * FROM registrations WHERE user_id = ? AND event_id = ?', [user_id, event_id], (err, regResults) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error checking registration.' });
      if (regResults.length > 0) {
        return res.json({ success: false, message: 'You are already registered for this event!' });
      }

      // 3. Register the student!
      db.query('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)', [user_id, event_id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error saving registration.' });
        res.json({ success: true, message: 'Successfully registered! We will see you there.' });
      });
    });
  });
});
// ===================================================================

// ===================================================================
// NEW: FETCH STUDENT'S TICKETS API (For QR Codes)
// ===================================================================
app.get('/api/tickets/:user_id', (req, res) => {
  const userId = req.params.user_id;

  const sqlQuery = `
    SELECT events.title, events.date, events.venue, events.image_url, registrations.registration_id, registrations.attended
    FROM registrations
    JOIN events ON registrations.event_id = events.event_id
    WHERE registrations.user_id = ?
    ORDER BY events.date ASC
  `;

  db.query(sqlQuery, [userId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, tickets: results });
  });
});
// ===================================================================

// ===================================================================
// NEW: SCAN QR TICKET API (For Organizers)
// ===================================================================
app.post('/api/checkin', (req, res) => {
  const { registration_id } = req.body;

  // We simply flip the `attended` switch from FALSE to TRUE!
  const sqlQuery = 'UPDATE registrations SET attended = TRUE WHERE registration_id = ?';

  db.query(sqlQuery, [registration_id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });

    // Safety check just in case they scanned an invalid or non-existent QR ticket
    if (result.affectedRows === 0) {
      return res.json({ success: false, message: 'Invalid Ticket! Not found in system.' });
    }

    res.json({ success: true, message: `Ticket Scanned! Student #${registration_id} marked as Attended! ✅` });
  });
});
// ===================================================================


// ===================================================================
// NEW: LIVE EVENT STATS API (For Organizers)
// ===================================================================
app.get('/api/stats', (req, res) => {
  // We use "LEFT JOIN" and "GROUP BY" to count exactly how many students registered, and calculate how many had their QR code scanned!
  const sqlQuery = `
    SELECT e.event_id, e.title, e.limit_participants,
           COUNT(r.registration_id) as total_registered,
           SUM(CASE WHEN r.attended = TRUE THEN 1 ELSE 0 END) as total_attended
    FROM events e
    LEFT JOIN registrations r ON e.event_id = r.event_id
    GROUP BY e.event_id
    ORDER BY e.date ASC
  `;

  db.query(sqlQuery, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, stats: results });
  });
});
// ===================================================================

// ===================================================================
// NEW: FETCH ACTUAL NAMES AND EMAILS OF ATTENDEES (For Teachers)
// ===================================================================
app.get('/api/attendees/:event_id', (req, res) => {
  const eventId = req.params.event_id;

  // We JOIN the Users table with Registrations to pull their real identity!
  // We strictly only select students where attended = TRUE
  const sqlQuery = `
    SELECT users.name, users.email 
    FROM registrations
    JOIN users ON registrations.user_id = users.id
    WHERE registrations.event_id = ? AND registrations.attended = TRUE
  `;

  db.query(sqlQuery, [eventId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, attendees: results });
  });
});
// ===================================================================


app.listen(3000, () => {
  console.log('🚀 Server running on port 3000');
});
