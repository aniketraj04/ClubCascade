const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer'); // NEW: Handles physical file uploads
const path = require('path');
const fs = require('fs');

const { Server } = require("socket.io"); // NEW
const http = require("http"); // NEW

const app = express();
const server = http.createServer(app); // NEW: Our Real-Time Streaming Server wrapper
const io = new Server(server, { cors: { origin: "*" } }); // NEW: Accepts all phone connections

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

// ===================================================================
// NEW: UPDATE EVENT API (PUT)
// ===================================================================
app.put('/api/events/:event_id', upload.single('poster'), (req, res) => {
  const eventId = req.params.event_id;
  const { title, description, venue, limit_participants, category } = req.body;

  let finalImageUrl = req.body.image_url || null;
  if (req.file) {
    finalImageUrl = `http://10.126.236.100:3000/uploads/${req.file.filename}`;
  }

  const sqlQuery = 'UPDATE events SET title = ?, description = ?, venue = ?, limit_participants = ?, category = ?, image_url = ? WHERE event_id = ?';
  db.query(sqlQuery, [title, description, venue, limit_participants, category, finalImageUrl, eventId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error while updating event.' });
    if (result.affectedRows === 0) return res.json({ success: false, message: 'Event not found.' });
    
    // Broadcast edit natively
    io.emit('new_event_alert', { message: `Important: The event "${title}" has been recently updated by the Organizer!` });
    res.json({ success: true, message: 'Event flawlessly updated!' });
  });
});

// ===================================================================
// NEW: DELETE EVENT API
// ===================================================================
app.delete('/api/events/:event_id', (req, res) => {
  const eventId = req.params.event_id;

  // Manually delete foreign keys first to ensure older systems without ON DELETE CASCADE don't violently crash!
  db.query('DELETE FROM registrations WHERE event_id = ?', [eventId], () => {
    db.query('DELETE FROM event_queries WHERE event_id = ?', [eventId], () => {
      db.query('DELETE FROM events WHERE event_id = ?', [eventId], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error while deleting.' });
        if (result.affectedRows === 0) return res.json({ success: false, message: 'Event not found!' });
        
        // Broadcast delete natively
        io.emit('new_event_alert', { message: `Alert: An event has been unexpectedly canceled and physically removed.` });
        res.json({ success: true, message: 'Event totally eradicated from the database!' });
      });
    });
  });
});
// ===================================================================

// CREATE EVENT API (Now handles File Uploads from the Gallery and Categorization!)
app.post('/api/events', upload.single('poster'), (req, res) => {
  const { title, description, date, venue, club_id, limit_participants, category } = req.body;

  console.log("-> Processing new categorized event:", title);

  // If a physical file was uploaded from the gallery, generate the exact URL for it
  let finalImageUrl = req.body.image_url || null;
  if (req.file) {
    // 10.126.236.100 is your laptop's IP! So the phone knows where to load the image from.
    finalImageUrl = `http://10.126.236.100:3000/uploads/${req.file.filename}`;
    console.log("-> Successfully saved gallery image locally:", req.file.filename);
  }

  const sqlQuery = 'INSERT INTO events (title, description, date, venue, club_id, limit_participants, image_url, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  const values = [title, description, date, venue, club_id || null, limit_participants || 0, finalImageUrl, category || 'General'];

  db.query(sqlQuery, values, (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database refused to save: ' + err.message });



    // NEW: Phase 5 - Broadcast Notifications!
    const msg = `🔔 New Event Alert: ${title} is happening at ${venue}!`;

    db.query('SELECT id FROM users WHERE role = "student"', (err, students) => {
      if (err || students.length === 0) {
        return res.json({ success: true, message: 'Event successfully published! (No students to notify)' });
      }

      // Bulk insert a notification row for every single student
      const insertValues = students.map(s => [s.id, msg]);
      db.query('INSERT INTO notifications (user_id, message) VALUES ?', [insertValues], (err) => {
        if (err) console.error("Notification broadcast error", err);

        // Broadcast the live websocket signal!
        io.emit('new_event_alert', { title, message: msg });
        res.json({ success: true, message: 'Event published & Students Notified!' });
      });
    });
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
// NEW: CANCEL REGISTRATION API
// ===================================================================
app.delete('/api/cancel-registration/:registration_id', (req, res) => {
  const regId = req.params.registration_id;

  db.query('DELETE FROM registrations WHERE registration_id = ?', [regId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error while cancelling.' });
    if (result.affectedRows === 0) return res.json({ success: false, message: 'Ticket not found!' });
    res.json({ success: true, message: 'Ticket successfully withdrawn! We have freed up your slot.' });
  });
});
// ===================================================================

// ===================================================================
// NEW: CANCEL REGISTRATION API
// ===================================================================
app.delete('/api/cancel-registration/:registration_id', (req, res) => {
  const regId = req.params.registration_id;

  db.query('DELETE FROM registrations WHERE registration_id = ?', [regId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error while cancelling.' });
    if (result.affectedRows === 0) return res.json({ success: false, message: 'Ticket not found!' });
    res.json({ success: true, message: 'Ticket successfully withdrawn! We have freed up your slot.' });
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

// ===================================================================
// NEW: FETCH NOTIFICATIONS API (For Students)
// ===================================================================
app.get('/api/notifications/:user_id', (req, res) => {
  const userId = req.params.user_id;

  const sqlQuery = `
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
  `;

  db.query(sqlQuery, [userId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error fetching notifications.' });
    res.json({ success: true, notifications: results });
  });
});
// ===================================================================

// ===================================================================
// NEW: MARK NOTIFICATION AS READ API
// ===================================================================
app.post('/api/notifications/read/:id', (req, res) => {
  const notificationId = req.params.id;

  const sqlQuery = 'UPDATE notifications SET is_read = TRUE WHERE notification_id = ?';

  db.query(sqlQuery, [notificationId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error marking notification as read.' });
    res.json({ success: true });
  });
});
// ===================================================================

// Track connected socket clients
io.on("connection", (socket) => {
  console.log(`📡 New active Student Phone connected to WebSockets: ${socket.id}`);
  socket.on("disconnect", () => console.log(`🔌 Phone disconnected: ${socket.id}`));
});

// ===================================================================
// NEW: FETCH Q&A BOARD FOR AN EVENT API
// ===================================================================
app.get('/api/queries/:event_id', (req, res) => {
  const eventId = req.params.event_id;

  db.query('SELECT * FROM event_queries WHERE event_id = ? ORDER BY created_at ASC', [eventId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error fetching queries.' });
    res.json({ success: true, queries: results });
  });
});
// ===================================================================

// ===================================================================
// NEW: POST A NEW Q&A CHAT MESSAGE API
// ===================================================================
app.post('/api/queries', (req, res) => {
  const { event_id, user_id, user_name, message } = req.body;
  if (!message) return res.json({ success: false, message: 'Message cannot be empty.' });

  db.query('INSERT INTO event_queries (event_id, user_id, user_name, message) VALUES (?, ?, ?, ?)',
    [event_id, user_id, user_name, message],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error sending message.' });

      // Because we have our WebSockets Server running, we can broadcast the new message instantly!
      io.emit('new_event_query', { event_id, user_name, message });
      res.json({ success: true, message: 'Message securely sent!' });
    }
  );
});
// ===================================================================


// We must call `server.listen` instead of `app.listen` so WebSockets and HTTP work identically together!
server.listen(3000, '0.0.0.0', () => {
  console.log('🚀 Real-Time WebSockets Server running on port 3000');
});
