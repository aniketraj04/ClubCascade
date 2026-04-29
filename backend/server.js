require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer'); // NEW: Handles physical file uploads
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

const { Server } = require("socket.io");
const http = require("http");
const fetch = require('node-fetch');

// ─── Gmail SMTP Transporter ───────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// ─── In-Memory OTP Store { email -> { otp, expiresAt } } ─────────────
const otpStore = new Map();

// ─── Expo Push Notification Helper ────────────────────────────────────
async function sendPushNotification(tokens, title, body) {
  if (!tokens || tokens.length === 0) return;
  const validTokens = tokens.filter(t => t && t.startsWith('ExponentPushToken'));
  if (validTokens.length === 0) return;
  const messages = validTokens.map(token => ({ to: token, sound: 'default', title, body, priority: 'high', channelId: 'default' }));
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
      body: JSON.stringify(messages),
    });
  } catch (e) { console.error('Push notification error:', e.message); }
}

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
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'ClubCascade'
});

db.connect((err) => {
  if (err) {
    console.error('❌ Error connecting to MySQL:', err);
    return;
  }
  console.log('✅ Successfully connected to the MySQL ClubCascade Database!');
});


// ===================================================================
// AUTH MIDDLEWARES
// ===================================================================
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(403).json({ success: false, message: 'No token provided' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ success: false, message: 'Unauthorized access' });
    req.user = decoded;
    next();
  });
};

const verifyAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Requires Admin Privileges' });
    next();
  });
};

const verifyOrganizer = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.role !== 'organizer' && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Requires Organizer Privileges' });
    next();
  });
};

// SAVE PUSH TOKEN API
app.post('/api/users/:id/push-token', verifyToken, (req, res) => {
  const { push_token } = req.body;
  if (!push_token) return res.json({ success: false });
  db.query('UPDATE users SET push_token = ? WHERE id = ?', [push_token, req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true });
  });
});

// ─── ORGANIZER PROFILE ENDPOINTS ──────────────────────────────────────

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────

// Step 1: Send OTP to email
app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: 'Email is required.' });

  db.query('SELECT id, name FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    if (results.length === 0) return res.json({ success: false, message: 'No account found with this email.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(email, { otp, expiresAt });

    try {
      await transporter.sendMail({
        from: `"ClubCascade 🎪" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Your ClubCascade Password Reset OTP',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;background:#F5F3FF;border-radius:16px">
            <h2 style="color:#7C3AED;margin-bottom:8px">🔒 Password Reset</h2>
            <p style="color:#374151">Hi ${results[0].name},</p>
            <p style="color:#374151">Use the OTP below to reset your ClubCascade password. It expires in <b>10 minutes</b>.</p>
            <div style="background:#7C3AED;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
              <span style="font-size:36px;font-weight:900;color:#FFF;letter-spacing:8px">${otp}</span>
            </div>
            <p style="color:#9CA3AF;font-size:12px">If you did not request this, please ignore this email.</p>
          </div>
        `,
      });
      res.json({ success: true, message: 'OTP sent to your email!' });
    } catch (e) {
      console.error('Email error:', e.message);
      res.status(500).json({ success: false, message: 'Failed to send email. Check Gmail credentials.' });
    }
  });
});

// Step 2: Verify OTP + set new password
app.post('/api/reset-password', (req, res) => {
  const { email, otp, new_password } = req.body;
  if (!email || !otp || !new_password) return res.json({ success: false, message: 'All fields required.' });

  const record = otpStore.get(email);
  if (!record) return res.json({ success: false, message: 'No OTP found. Please request a new one.' });
  if (Date.now() > record.expiresAt) {
    otpStore.delete(email);
    return res.json({ success: false, message: 'OTP has expired. Please request a new one.' });
  }
  if (record.otp !== otp.trim()) return res.json({ success: false, message: 'Incorrect OTP. Please try again.' });

  db.query('UPDATE users SET password = ? WHERE email = ?', [new_password, email], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Could not update password.' });
    otpStore.delete(email); // Clear OTP after use
    res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
  });
});

app.get('/api/organizer/:id/profile-stats', verifyToken, (req, res) => {
  const orgId = req.params.id;
  const statsQuery = `
    SELECT
      u.name, u.email, u.profile_picture_url,
      u.club_name, u.club_role,
      cp.bio, cp.instagram_handle, cp.whatsapp_link, cp.logo_url,
      COUNT(DISTINCT e.event_id)        AS total_events,
      COUNT(DISTINCT r.registration_id) AS total_attendees,
      ROUND(AVG(ef.rating), 1)          AS avg_rating
    FROM users u
    LEFT JOIN club_profiles cp ON cp.organizer_id = u.id
    LEFT JOIN events e         ON e.organizer_id = u.id
    LEFT JOIN registrations r  ON r.event_id = e.event_id
    LEFT JOIN event_feedback ef ON ef.event_id = e.event_id
    WHERE u.id = ?
    GROUP BY u.id
  `;
  db.query(statsQuery, [orgId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    res.json({ success: true, profile: results[0] || {} });
  });
});

// PUT update organizer profile (bio, social links, photo)
app.put('/api/organizer/:id/profile', verifyToken, upload.single('photo'), (req, res) => {
  const orgId = req.params.id;
  const { bio, instagram_handle, whatsapp_link } = req.body;
  const SERVER_IP = process.env.SERVER_IP || '10.169.91.100';
  const PORT = process.env.PORT || 3000;
  const logoUrl = req.file
    ? `http://${SERVER_IP}:${PORT}/uploads/${req.file.filename}`
    : (req.body.logo_url || null);

  // Upsert into club_profiles
  const sql = `
    INSERT INTO club_profiles (organizer_id, bio, instagram_handle, whatsapp_link, logo_url)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      bio = VALUES(bio),
      instagram_handle = VALUES(instagram_handle),
      whatsapp_link = VALUES(whatsapp_link),
      logo_url = COALESCE(VALUES(logo_url), logo_url)
  `;
  db.query(sql, [orgId, bio || '', instagram_handle || '', whatsapp_link || '', logoUrl], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Could not save profile' });
    res.json({ success: true, message: 'Profile updated!' });
  });
});

// POST change organizer password
app.post('/api/organizer/:id/change-password', verifyToken, (req, res) => {
  const orgId = req.params.id;
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.json({ success: false, message: 'Both fields required' });
  db.query('SELECT password FROM users WHERE id = ?', [orgId], (err, results) => {
    if (err || !results.length) return res.status(500).json({ success: false, message: 'User not found' });
    if (results[0].password !== current_password) return res.json({ success: false, message: 'Current password is incorrect' });
    db.query('UPDATE users SET password = ? WHERE id = ?', [new_password, orgId], (err2) => {
      if (err2) return res.status(500).json({ success: false, message: 'Could not update password' });
      res.json({ success: true, message: 'Password changed successfully!' });
    });
  });
});


// LOGIN API 
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const sqlQuery = 'SELECT * FROM users WHERE email = ? AND password = ?';
  db.query(sqlQuery, [email, password], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length > 0) {
      if (results[0].account_status === 'pending') {
        return res.json({ success: false, message: 'Your account is pending Admin approval.' });
      }
      const token = jwt.sign({ id: results[0].id, role: results[0].role }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ success: true, message: `Welcome back, ${results[0].name}!`, user: results[0], token });
    }
    else res.json({ success: false, message: 'Invalid email or password' });
  });
});

// UPDATE PROFILE PICTURE
app.post('/api/users/:id/avatar', upload.single('avatar'), (req, res) => {
  const userId = req.params.id;
  if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });
  
  const imageUrl = `http://${process.env.SERVER_IP || '10.169.91.100'}:${process.env.PORT || 3000}/uploads/${req.file.filename}`;
  
  const sql = 'UPDATE users SET profile_picture_url = ? WHERE id = ?';
  db.query(sql, [imageUrl, userId], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, message: 'Profile picture updated', url: imageUrl });
  });
});

// ─── SIGNUP OTP & VERIFICATION ────────────────────────────────────────

// Step 1: Send OTP for Signup
app.post('/api/send-signup-otp', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: 'Email is required.' });

  // First check if email already exists
  db.query('SELECT id FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    if (results.length > 0) return res.json({ success: false, message: 'Email is already registered.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(email + '_signup', { otp, expiresAt });

    try {
      await transporter.sendMail({
        from: `"ClubCascade 🎪" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Verify your ClubCascade account!',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;background:#F5F3FF;border-radius:16px">
            <h2 style="color:#7C3AED;margin-bottom:8px">👋 Welcome to ClubCascade!</h2>
            <p style="color:#374151">Use the OTP below to verify your email and complete your registration. It expires in <b>10 minutes</b>.</p>
            <div style="background:#7C3AED;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
              <span style="font-size:36px;font-weight:900;color:#FFF;letter-spacing:8px">${otp}</span>
            </div>
            <p style="color:#9CA3AF;font-size:12px">If you didn't request this, you can ignore this email.</p>
          </div>
        `,
      });
      res.json({ success: true, message: 'OTP sent to your email!' });
    } catch (e) {
      console.error('Email error:', e.message);
      res.status(500).json({ success: false, message: 'Failed to send email. Check Gmail credentials.' });
    }
  });
});

// SIGNUP API (Step 2: Verify OTP and Create Account)
app.post('/api/signup', (req, res) => {
  const { name, email, password, role, phone, club_name, club_role, department, student_id, study_year, otp } = req.body;
  if (!name || !email || !password || !otp) return res.json({ success: false, message: 'Please provide all details including OTP.' });

  // 1. Verify OTP
  const record = otpStore.get(email + '_signup');
  if (!record) return res.json({ success: false, message: 'No OTP found. Please request a new one.' });
  if (Date.now() > record.expiresAt) {
    otpStore.delete(email + '_signup');
    return res.json({ success: false, message: 'OTP has expired. Please request a new one.' });
  }
  if (record.otp !== otp.trim()) return res.json({ success: false, message: 'Incorrect OTP. Please try again.' });

  if (role === 'organizer') {
    if (!phone || !club_name || !club_role || !department || !student_id || !study_year) {
      return res.json({ success: false, message: 'Organizers must strictly provide all verification details.' });
    }
  }

  const accountStatus = role === 'organizer' ? 'pending' : 'approved';
  // Use user_id since SQL complains if we try to insert null mapping for Auto Increment, wait, we are inserting into 'users' not 'user_id' but id. 
  const sqlQuery = 'INSERT INTO users (name, email, password, role, account_status, phone, club_name, club_role, department, student_id, study_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.query(sqlQuery, [name, email, password, role || 'student', accountStatus, phone || null, club_name || null, club_role || null, department || null, student_id || null, study_year || null], (err, result) => {
    if (err && err.code === 'ER_DUP_ENTRY') return res.json({ success: false, message: 'Email already exists' });
    else if (err) return res.status(500).json({ error: 'Database error' });

    if (role === 'organizer') return res.json({ success: true, message: 'Application submitted! Waiting for Admin approval.' });

    // For students, generate a token immediately
    const token = jwt.sign({ id: result.insertId, role: role || 'student' }, JWT_SECRET, { expiresIn: '7d' });
    otpStore.delete(email + '_signup'); // Clear the OTP after successful registration
    res.json({ success: true, message: 'Account securely created!', token });
  });
});

// FETCH EVENTS API
app.get('/api/events', verifyToken, (req, res) => {
  const sqlQuery = `
    SELECT e.*, COUNT(r.registration_id) AS current_registered
    FROM events e
    LEFT JOIN registrations r ON e.event_id = r.event_id
    GROUP BY e.event_id
    ORDER BY e.event_id DESC
  `;
  db.query(sqlQuery, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true, events: results });
  });
});

// FETCH ISOLATED ORGANIZER EVENTS API
app.get('/api/organizers/:org_id/events', verifyOrganizer, (req, res) => {
  const orgId = req.params.org_id;
  const sqlQuery = 'SELECT * FROM events WHERE organizer_id = ? ORDER BY date ASC';
  db.query(sqlQuery, [orgId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error fetching your events' });
    res.json({ success: true, events: results });
  });
});

// ===================================================================
// NEW: UPDATE EVENT API (PUT)
// ===================================================================
app.put('/api/events/:event_id', verifyOrganizer, upload.single('poster'), (req, res) => {
  const eventId = req.params.event_id;
  const { title, description, venue, limit_participants, category, date } = req.body;

  // ⚡ CONFLICT CHECK: Allow updating own event, but no overlapping with others
  db.query('SELECT event_id, title FROM events WHERE date = ? AND event_id != ?', [date, eventId], (err, conflicts) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error checking conflicts.' });
    if (conflicts.length > 0) {
      return res.json({
        success: false,
        message: `⚠️ Time conflict! "${conflicts[0].title}" is already scheduled at this exact time.`
      });
    }

    let finalImageUrl = req.body.image_url || null;
    const serverIp = process.env.SERVER_IP || '10.169.91.100';
    if (req.file) {
      finalImageUrl = `http://${serverIp}:${process.env.PORT || 3000}/uploads/${req.file.filename}`;
    }

    const sqlQuery = 'UPDATE events SET title = ?, description = ?, venue = ?, limit_participants = ?, category = ?, image_url = ?, date = ?, duration = ? WHERE event_id = ?';
    db.query(sqlQuery, [title, description, venue, limit_participants, category, finalImageUrl, date, duration || '1hr', eventId], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error while updating event.' });
      if (result.affectedRows === 0) return res.json({ success: false, message: 'Event not found.' });

      // Identify all students specifically registered for THIS event to notify them
      db.query('SELECT DISTINCT user_id FROM registrations WHERE event_id = ?', [eventId], (err2, registrants) => {
        const msg = `📣 [${title}] Event details (Time/Venue) have been updated by the Organizer!`;

        io.emit('new_event_alert', { message: msg }); // Global visual blip

        if (!err2 && registrants.length > 0) {
          const insertValues = registrants.map(r => [r.user_id, msg]);
          db.query('INSERT INTO notifications (user_id, message) VALUES ?', [insertValues], () => {
            res.json({ success: true, message: 'Event updated & Attendees notified! ✨' });
          });
        } else {
          res.json({ success: true, message: 'Event flawlessly updated!' });
        }
      });
    });
  });
});

// ===================================================================
// NEW: DELETE EVENT API
// ===================================================================
app.delete('/api/events/:event_id', verifyOrganizer, (req, res) => {
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

app.post('/api/events', verifyOrganizer, upload.single('poster'), (req, res) => {
  const { title, description, date, venue, club_id, limit_participants, category, organizer_id, duration } = req.body;

  console.log("-> Processing new categorized event:", title);

  // ⚡ CONFLICT CHECK: No two events at the exact same date & time
  db.query('SELECT event_id, title FROM events WHERE date = ?', [date], (err, conflicts) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error checking conflicts.' });
    if (conflicts.length > 0) {
      return res.json({
        success: false,
        message: `⚠️ Time conflict! "${conflicts[0].title}" is already scheduled at this exact time. Please choose a different time slot.`
      });
    }

    // If a physical file was uploaded from the gallery, generate the exact URL for it
    let finalImageUrl = req.body.image_url || null;
    if (req.file) {
      finalImageUrl = `http://${process.env.SERVER_IP || '10.169.91.100'}:${process.env.PORT || 3000}/uploads/${req.file.filename}`;
      console.log("-> Successfully saved gallery image locally:", req.file.filename);
    }

    const sqlQuery = 'INSERT INTO events (title, description, date, venue, club_id, limit_participants, image_url, category, organizer_id, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    // Always use the JWT-verified user id as organizer_id so stats work correctly
    const resolvedOrganizerId = req.user.id || organizer_id || null;
    const values = [title, description, date, venue, club_id || null, limit_participants || 0, finalImageUrl, category || 'General', resolvedOrganizerId, duration || '1hr'];

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
    }); // end INSERT events
  }); // end conflict check
}); // end POST /api/events

// ===================================================================
// NEW: REGISTER FOR EVENT API (For Students)
// ===================================================================
app.post('/api/register', verifyToken, (req, res) => {
  const { user_id, event_id } = req.body;
  if (!user_id || !event_id) return res.json({ success: false, message: 'Missing user or event ID' });

  // 1. Check if the event is completely full!
  db.query('SELECT limit_participants, (SELECT COUNT(*) FROM registrations WHERE event_id = ?) as current_count FROM events WHERE event_id = ?', [event_id, event_id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error deciding limits.' });
    if (results.length === 0) return res.json({ success: false, message: 'Event not found.' });

    const event = results[0];
    if (event.limit_participants > 0 && event.current_count >= event.limit_participants) {
      db.query('SELECT * FROM event_waitlist WHERE student_id = ? AND event_id = ?', [user_id, event_id], (err, wlResults) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error checking waitlist.' });
        if (wlResults.length > 0) return res.json({ success: false, message: 'You are already on the waitlist for this event!' });
        
        db.query('INSERT INTO event_waitlist (student_id, event_id) VALUES (?, ?)', [user_id, event_id], (err) => {
          if (err) return res.status(500).json({ success: false, message: 'Database error adding to waitlist.' });
          return res.json({ success: true, waitlisted: true, message: 'Event full. You are on the waitlist!' });
        });
      });
      return;
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
app.delete('/api/cancel-registration/:registration_id', verifyToken, (req, res) => {
  const regId = req.params.registration_id;

  db.query('SELECT event_id FROM registrations WHERE registration_id = ?', [regId], (err, results) => {
    if (err || results.length === 0) return res.json({ success: false, message: 'Ticket not found!' });
    const event_id = results[0].event_id;

    db.query('DELETE FROM registrations WHERE registration_id = ?', [regId], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error while cancelling.' });
      
      // Auto-promote next person on the waitlist
      db.query('SELECT waitlist_id, student_id FROM event_waitlist WHERE event_id = ? ORDER BY joined_at ASC LIMIT 1', [event_id], (err, wlResults) => {
        if (wlResults && wlResults.length > 0) {
          const nextStudent = wlResults[0];
          db.query('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)', [nextStudent.student_id, event_id], (err) => {
            if (!err) {
              db.query('DELETE FROM event_waitlist WHERE waitlist_id = ?', [nextStudent.waitlist_id]);
              const promotedMsg = 'A spot opened up! You have been automatically registered from the waitlist.';
              io.emit('waitlist_promoted', { student_id: nextStudent.student_id, event_id: event_id, message: promotedMsg });
              // Send push notification to the promoted student
              db.query('SELECT push_token FROM users WHERE id = ?', [nextStudent.student_id], (e, rows) => {
                if (!e && rows.length > 0 && rows[0].push_token) {
                  sendPushNotification([rows[0].push_token], '🎉 You got in!', promotedMsg);
                }
              });
            }
          });
        }
      });

      res.json({ success: true, message: 'Ticket successfully withdrawn! We have freed up your slot.' });
    });
  });
});
// ===================================================================


// ===================================================================
// NEW: FETCH STUDENT'S TICKETS API (For QR Codes)
// ===================================================================
app.get('/api/tickets/:user_id', verifyToken, (req, res) => {
  const userId = req.params.user_id;

  const sqlQuery = `
    SELECT events.event_id, events.title, events.date, events.venue, events.image_url,
           registrations.registration_id, registrations.attended,
           (SELECT COUNT(*) FROM event_feedback WHERE event_feedback.event_id = events.event_id AND event_feedback.user_id = ?) as has_feedback
    FROM registrations
    JOIN events ON registrations.event_id = events.event_id
    WHERE registrations.user_id = ?
    ORDER BY events.date ASC
  `;

  db.query(sqlQuery, [userId, userId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, tickets: results });
  });
});

// ===================================================================
// NEW: EVENT FEEDBACK API
// ===================================================================
app.post('/api/events/:event_id/feedback', verifyToken, (req, res) => {
  const { event_id } = req.params;
  const { user_id, rating, comments } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.json({ success: false, message: 'Invalid rating.' });

  const query = 'INSERT INTO event_feedback (event_id, user_id, rating, comments) VALUES (?, ?, ?, ?)';
  db.query(query, [event_id, user_id, rating, comments], (err) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.json({ success: false, message: 'You already submitted feedback for this event.' });
      return res.status(500).json({ success: false, message: 'Database error while submitting feedback.' });
    }
    res.json({ success: true, message: 'Thank you! Your anonymous feedback has been sent to the organizer.' });
  });
});

app.get('/api/events/:event_id/feedback', verifyOrganizer, (req, res) => {
  const { event_id } = req.params;
  const query = 'SELECT rating, comments, created_at FROM event_feedback WHERE event_id = ? ORDER BY created_at DESC';
  db.query(query, [event_id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error fetching feedback.' });
    let avg = 0;
    if (results.length > 0) {
      const sum = results.reduce((acc, curr) => acc + curr.rating, 0);
      avg = (sum / results.length).toFixed(1);
    }
    res.json({ success: true, average_rating: avg, feedback: results });
  });
});
// ===================================================================

// ===================================================================
// NEW: SCAN QR TICKET API (For Organizers)
// ===================================================================
app.post('/api/checkin', verifyOrganizer, (req, res) => {
  const { registration_id } = req.body;

  const sqlQuery = 'UPDATE registrations SET attended = TRUE WHERE registration_id = ?';

  db.query(sqlQuery, [registration_id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });

    if (result.affectedRows === 0) {
      return res.json({ success: false, message: 'Invalid Ticket! Not found in system.' });
    }

    if (result.changedRows === 0) {
      return res.json({ success: false, message: 'Ticket already scanned! This QR code has expired ❌' });
    }

    res.json({ success: true, message: `Ticket Scanned! Student #${registration_id} marked as Attended! ✅` });
  });
});
// ===================================================================


// ===================================================================
// NEW: LIVE EVENT STATS API (For Organizers)
// ===================================================================
app.get('/api/stats', verifyOrganizer, (req, res) => {
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
app.get('/api/attendees/:event_id', verifyOrganizer, (req, res) => {
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
app.get('/api/notifications/:user_id', verifyToken, (req, res) => {
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
app.post('/api/notifications/read/:id', verifyToken, (req, res) => {
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
app.get('/api/queries/:event_id', verifyToken, (req, res) => {
  const eventId = req.params.event_id;

  // We fetch everything, including the parent_query_id for replies
  db.query('SELECT * FROM event_queries WHERE event_id = ? ORDER BY created_at ASC', [eventId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error fetching queries.' });
    res.json({ success: true, queries: results });
  });
});
// ===================================================================

// ===================================================================
// NEW: POST A NEW Q&A CHAT MESSAGE API
// ===================================================================
app.post('/api/queries', verifyToken, (req, res) => {
  const { event_id, user_id, user_name, message, parent_query_id } = req.body;
  if (!message) return res.json({ success: false, message: 'Message cannot be empty.' });

  const sql = 'INSERT INTO event_queries (event_id, user_id, user_name, message, parent_query_id) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [event_id, user_id, user_name, message, parent_query_id || null], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error sending message.' });

    const newQueryId = result.insertId;
    const now = new Date();

    // Enriched broadcast! We send IDs and timestamps so the UI can render instantly
    io.emit('new_event_query', {
      query_id: newQueryId,
      event_id,
      user_id,
      user_name,
      message,
      parent_query_id: parent_query_id || null,
      created_at: now
    });

    res.json({ success: true, message: 'Message securely sent!', query_id: newQueryId });
  });
});
// ===================================================================

// ===================================================================
// BROADCAST BLAST API (Organizer -> All Registrants)
// ===================================================================
app.post('/api/events/:event_id/broadcast', verifyOrganizer, (req, res) => {
  const eventId = req.params.event_id;
  const { message, eventTitle } = req.body;
  if (!message) return res.json({ success: false, message: 'Message cannot be empty.' });

  db.query(
    'SELECT DISTINCT u.id as user_id, u.push_token FROM registrations r JOIN users u ON r.user_id = u.id WHERE r.event_id = ?',
    [eventId],
    (err, registrants) => {
      if (err) return res.status(500).json({ success: false, message: 'DB error fetching registrants.' });
      if (registrants.length === 0) return res.json({ success: false, message: 'No registrants for this event.' });

      const fullMsg = `📣 [${eventTitle}] ${message}`;
      const insertValues = registrants.map(r => [r.user_id, fullMsg]);

      db.query('INSERT INTO notifications (user_id, message) VALUES ?', [insertValues], (err2) => {
        if (err2) return res.status(500).json({ success: false, message: 'DB error sending notifications.' });

        // Real-time WebSocket for online users
        io.emit('new_event_alert', { message: fullMsg });

        // Push Notifications for offline users
        const tokens = registrants.map(r => r.push_token);
        sendPushNotification(tokens, `📣 ${eventTitle}`, message);

        res.json({ success: true, message: `Blast sent to ${registrants.length} registrant(s)!` });
      });
    }
  );
});
// ===================================================================

// ===================================================================
// WISHLIST / SAVED EVENTS APIS
// ===================================================================

// Toggle save/unsave an event
app.post('/api/wishlist/toggle', verifyToken, (req, res) => {
  const { user_id, event_id } = req.body;
  db.query('SELECT * FROM saved_events WHERE user_id = ? AND event_id = ?', [user_id, event_id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    if (results.length > 0) {
      // Already saved -> unsave
      db.query('DELETE FROM saved_events WHERE user_id = ? AND event_id = ?', [user_id, event_id], (err2) => {
        if (err2) return res.status(500).json({ success: false, message: 'DB error removing' });
        res.json({ success: true, saved: false, message: 'Removed from wishlist' });
      });
    } else {
      // Not saved -> save
      db.query('INSERT INTO saved_events (user_id, event_id) VALUES (?, ?)', [user_id, event_id], (err2) => {
        if (err2) return res.status(500).json({ success: false, message: 'DB error saving' });
        res.json({ success: true, saved: true, message: 'Added to wishlist!' });
      });
    }
  });
});

// Get user's saved event IDs (for highlighting bookmarks)
app.get('/api/wishlist/:user_id', verifyToken, (req, res) => {
  const userId = req.params.user_id;
  db.query('SELECT event_id FROM saved_events WHERE user_id = ?', [userId], (err, results) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, saved_ids: results.map(r => r.event_id) });
  });
});

// Get full saved event details for profile page
app.get('/api/wishlist/:user_id/events', verifyToken, (req, res) => {
  const userId = req.params.user_id;
  const sql = `SELECT e.* FROM events e 
               INNER JOIN saved_events se ON e.event_id = se.event_id 
               WHERE se.user_id = ? ORDER BY se.saved_at DESC`;
  db.query(sql, [userId], (err, results) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, events: results });
  });
});
// ===================================================================

// ===================================================================
// NEW (PHASE 9): ADMIN ROUTES
// ===================================================================
app.get('/api/admin/users', verifyAdmin, (req, res) => {
  db.query('SELECT id AS user_id, name, email, role, account_status, phone, club_name, club_role, department, student_id, study_year, created_at FROM users ORDER BY created_at DESC', (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error fetching users.' });
    res.json({ success: true, users: results });
  });
});

app.delete('/api/admin/users/:user_id', verifyAdmin, (req, res) => {
  const userId = req.params.user_id;

  // We must cascade delete registrations and queries manually if needed, or let DB handle if ON DELETE CASCADE is set
  // To be safe, we will manually delete dependencies first:
  db.query('DELETE FROM registrations WHERE user_id = ?', [userId], () => {
    db.query('DELETE FROM event_queries WHERE user_id = ?', [userId], () => {
      db.query('DELETE FROM users WHERE id = ?', [userId], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error deleting user.' });
        if (result.affectedRows === 0) return res.json({ success: false, message: 'User not found!' });

        io.emit('new_event_alert', { message: 'A user has been permanently banned by the Admin.' });
        res.json({ success: true, message: 'User eradicated from the system!' });
      });
    });
  });
});

app.delete('/api/admin/events/:event_id', verifyAdmin, (req, res) => {
  const eventId = req.params.event_id;

  db.query('DELETE FROM registrations WHERE event_id = ?', [eventId], () => {
    db.query('DELETE FROM event_queries WHERE event_id = ?', [eventId], () => {
      db.query('DELETE FROM events WHERE event_id = ?', [eventId], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error deleting event.' });
        if (result.affectedRows === 0) return res.json({ success: false, message: 'Event not found!' });

        io.emit('new_event_alert', { message: 'Admin Override: An event has been forcefully removed.' });
        res.json({ success: true, message: 'Event completely annihilated by Admin!' });
      });
    });
  });
});

// ===================================================================
// NEW (PHASE 9.5): ADVANCED ADMIN LOGIC
// ===================================================================

app.put('/api/admin/events/:event_id/approve', verifyAdmin, (req, res) => {
  const eventId = req.params.event_id;
  db.query("UPDATE events SET status = 'approved' WHERE event_id = ?", [eventId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error approving event.' });

    io.emit('new_event_alert', { message: '📣 An Organizer just launched a brand new EVENT! Check it out.' });
    res.json({ success: true, message: 'Event successfully published live!' });
  });
});

app.put('/api/admin/users/:user_id/approve', verifyAdmin, (req, res) => {
  const userId = req.params.user_id;
  db.query("UPDATE users SET account_status = 'approved' WHERE id = ?", [userId], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error approving user.' });
    res.json({ success: true, message: 'Account has been verified and approved!' });
  });
});

app.put('/api/admin/users/:user_id/role', verifyAdmin, (req, res) => {
  const userId = req.params.user_id;
  db.query("UPDATE users SET role = 'organizer' WHERE id = ?", [userId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error assigning role.' });
    res.json({ success: true, message: 'Student successfully promoted to Organizer!' });
  });
});

app.get('/api/admin/stats', verifyAdmin, (req, res) => {
  const stats = {};
  db.query("SELECT COUNT(*) AS totalEvents FROM events", (err, eRes) => {
    if (!err) stats.totalEvents = eRes[0].totalEvents;
    db.query("SELECT COUNT(*) AS totalRegs, SUM(attended) AS totalAttendance FROM registrations", (err, rRes) => {
      if (!err) {
        stats.totalRegistrations = rRes[0].totalRegs;
        stats.attendanceRate = rRes[0].totalRegs ? Math.round((rRes[0].totalAttendance / rRes[0].totalRegs) * 100) : 0;
      }
      db.query("SELECT COUNT(*) AS totalQueries FROM event_queries", (err, qRes) => {
        if (!err) stats.totalEngagement = qRes[0].totalQueries;
        res.json({ success: true, stats });
      });
    });
  });
});
// ===================================================================
// NEW (PHASE 10): SOCIAL NETWORK MECHANICS (CLUBS & FOLLOWING)
// ===================================================================

// 1. FETCH INDIVIDUAL CLUB PROFILE
app.get('/api/clubs/:org_id', verifyToken, (req, res) => {
  const orgId = req.params.org_id;
  db.query(`
    SELECT cp.*, u.name as organizer_name, u.club_name, u.club_role 
    FROM users u 
    LEFT JOIN club_profiles cp ON u.id = cp.organizer_id 
    WHERE u.id = ? AND (u.role = 'organizer' OR u.role = 'admin')
  `, [orgId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB Error' });
    if (results.length === 0) return res.json({ success: false, message: 'Club not found' });

    // Fetch Stats
    db.query('SELECT count(*) as followersCount FROM followers WHERE organizer_id = ?', [orgId], (err2, fRes) => {
      db.query('SELECT count(*) as eventsHosted FROM events WHERE organizer_id = ?', [orgId], (err3, eRes) => {
        const profile = results[0];
        profile.followersCount = fRes ? fRes[0].followersCount : 0;
        profile.eventsHosted = eRes ? eRes[0].eventsHosted : 0;
        res.json({ success: true, profile });
      });
    });
  });
});

// 2. UPDATE CLUB PROFILE (Organizer Only)
app.put('/api/clubs/profile', verifyOrganizer, upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), (req, res) => {
  const organizerId = req.user.id;
  const bio = req.body.bio || '';
  const instagram_handle = req.body.instagram_handle || '';
  
  const serverIp = process.env.SERVER_IP || '10.169.91.100';
  let finalLogo = req.body.logo_url || null;
  let finalBanner = req.body.banner_url || null;

  if (req.files && req.files.logo && req.files.logo.length > 0) {
    finalLogo = `http://${serverIp}:${process.env.PORT || 3000}/uploads/${req.files.logo[0].filename}`;
  }
  if (req.files && req.files.banner && req.files.banner.length > 0) {
    finalBanner = `http://${serverIp}:${process.env.PORT || 3000}/uploads/${req.files.banner[0].filename}`;
  }

  db.query('SELECT * FROM club_profiles WHERE organizer_id = ?', [organizerId], (err, results) => {
     if (results.length > 0) {
        db.query('UPDATE club_profiles SET bio=?, logo_url=?, banner_url=?, instagram_handle=? WHERE organizer_id=?',
           [bio, finalLogo, finalBanner, instagram_handle, organizerId], (err2) => {
             if (err2) return res.status(500).json({ success: false, message: 'DB Error updating profile.' });
             res.json({ success: true, message: 'Profile gracefully updated! ✨' });
        });
     } else {
        db.query('INSERT INTO club_profiles (organizer_id, bio, logo_url, banner_url, instagram_handle) VALUES (?, ?, ?, ?, ?)',
           [organizerId, bio, finalLogo, finalBanner, instagram_handle], (err2) => {
             if (err2) return res.status(500).json({ success: false, message: 'DB Error creating profile.' });
             res.json({ success: true, message: 'Profile created! 🎉' });
        });
     }
  });
});

// 3. FOLLOW / UNFOLLOW A CLUB
app.post('/api/clubs/:org_id/follow', verifyToken, (req, res) => {
  const studentId = req.user.id;
  const orgId = req.params.org_id;

  db.query('SELECT * FROM followers WHERE student_id = ? AND organizer_id = ?', [studentId, orgId], (err, results) => {
    if (results.length > 0) {
      db.query('DELETE FROM followers WHERE student_id = ? AND organizer_id = ?', [studentId, orgId], () => {
        res.json({ success: true, following: false, message: 'Unfollowed' });
      });
    } else {
      db.query('INSERT INTO followers (student_id, organizer_id) VALUES (?, ?)', [studentId, orgId], () => {
        // Notify the organizer natively!
        db.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [orgId, `🎉 Someone new started following your club!`], () => {
          io.emit('new_event_alert', { message: `🎉 Buzz: Abstract social update detected!` });
          res.json({ success: true, following: true, message: 'You are now following this Club! 🔔' });
        });
      });
    }
  });
});

// 4. CHECK IF STUDENT IS FOLLOWING A CLUB
app.get('/api/clubs/:org_id/isFollowing', verifyToken, (req, res) => {
  const orgId = req.params.org_id;
  const studentId = req.user.id;
  db.query('SELECT * FROM followers WHERE student_id = ? AND organizer_id = ?', [studentId, orgId], (err, results) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, following: results.length > 0 });
  });
});

// 5. GET SMART FEED (ONLY EVENTS FROM FOLLOWED CLUBS)
app.get('/api/feed/following', verifyToken, (req, res) => {
  const studentId = req.user.id;
  db.query(`
     SELECT e.* FROM events e
     JOIN followers f ON e.organizer_id = f.organizer_id
     WHERE f.student_id = ?
     ORDER BY e.date ASC
   `, [studentId], (err, results) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, events: results });
  });
});

// 6. FETCH CLUB PHOTO GALLERY
app.get('/api/clubs/:org_id/photos', verifyToken, (req, res) => {
  const orgId = req.params.org_id;
  db.query('SELECT * FROM club_photos WHERE organizer_id = ? ORDER BY created_at DESC', [orgId], (err, results) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, photos: results });
  });
});

// 7. POST A NEW PHOTO TO CLUB GALLERY (Organizer Only)
app.post('/api/clubs/photos', verifyOrganizer, upload.single('photo'), (req, res) => {
  if (!req.file) return res.json({ success: false, message: 'No photo uploaded!' });
  const organizerId = req.user.id;
  const imageUrl = `http://${process.env.SERVER_IP || '10.169.91.100'}:${process.env.PORT || 3000}/uploads/${req.file.filename}`;
  const caption = req.body.caption || '';

  db.query('INSERT INTO club_photos (organizer_id, image_url, caption) VALUES (?, ?, ?)', [organizerId, imageUrl, caption], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'DB Error saving photo' });

    // Alert all followers that a new photo dropped!
    db.query('SELECT student_id FROM followers WHERE organizer_id = ?', [organizerId], (err2, followers) => {
      if (!err2 && followers.length > 0) {
        const msg = `📷 A club you follow just posted a new gallery photo!`;
        const insertValues = followers.map(f => [f.student_id, msg]);
        db.query('INSERT INTO notifications (user_id, message) VALUES ?', [insertValues], () => {
          res.json({ success: true, message: 'Photo uploaded and followers alerted! 📸', photo: { image_url: imageUrl, caption } });
        });
      } else {
        res.json({ success: true, message: 'Photo uploaded! 📸', photo: { image_url: imageUrl, caption } });
      }
    });
  });
});

// ===================================================================

// 8. GET MUTUAL FRIENDS FOLLOWING THIS CLUB
app.get('/api/clubs/:org_id/mutuals', verifyToken, (req, res) => {
  const orgId = req.params.org_id;
  const studentId = req.user.id;
  db.query(`
    SELECT u.id, u.name 
    FROM followers f
    JOIN users u ON f.student_id = u.id
    JOIN student_friends sf ON (sf.student_1_id = ? AND sf.student_2_id = u.id) OR (sf.student_2_id = ? AND sf.student_1_id = u.id)
    WHERE f.organizer_id = ?
  `, [studentId, studentId, orgId], (err, results) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, mutuals: results });
  });
});

// 9. GET CLUB PAST SUCCESSFUL EVENTS
app.get('/api/clubs/:org_id/history', verifyToken, (req, res) => {
  const orgId = req.params.org_id;
  db.query('SELECT * FROM events WHERE organizer_id = ? AND date < NOW() ORDER BY date DESC', [orgId], (err, results) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, events: results });
  });
});

// 10. ADD A FRIEND (For Simulation)
app.post('/api/friends/add', verifyToken, (req, res) => {
  const { friend_id } = req.body;
  const myId = req.user.id;
  db.query('INSERT IGNORE INTO student_friends (student_1_id, student_2_id) VALUES (?, ?)', [myId, friend_id], (err) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, message: 'Friend added!' });
  });
});
// ===================================================================

// ===================================================================

// ─── PHASE 8: EVENT LIKES & TRENDING ──────────────────────────────────

// 11. TOGGLE LIKE ON AN EVENT
app.post('/api/events/:id/like', verifyToken, (req, res) => {
  const studentId = req.user.id;
  const eventId = req.params.id;
  db.query('SELECT * FROM event_likes WHERE event_id = ? AND student_id = ?', [eventId, studentId], (err, rows) => {
    if (err) return res.status(500).json({ success: false });
    if (rows.length > 0) {
      db.query('DELETE FROM event_likes WHERE event_id = ? AND student_id = ?', [eventId, studentId], () => {
        db.query('SELECT COUNT(*) AS cnt FROM event_likes WHERE event_id = ?', [eventId], (e, r) => {
          res.json({ success: true, liked: false, likes: r[0].cnt });
        });
      });
    } else {
      db.query('INSERT INTO event_likes (event_id, student_id) VALUES (?, ?)', [eventId, studentId], () => {
        db.query('SELECT COUNT(*) AS cnt FROM event_likes WHERE event_id = ?', [eventId], (e, r) => {
          res.json({ success: true, liked: true, likes: r[0].cnt });
        });
      });
    }
  });
});

// 12. GET TRENDING EVENTS (Top 5 most liked upcoming events)
app.get('/api/events/trending', verifyToken, (req, res) => {
  db.query(`
    SELECT e.*, COUNT(el.like_id) AS likes_count,
           (SELECT 1 FROM event_likes WHERE event_id = e.event_id AND student_id = ?) AS user_liked
    FROM events e
    LEFT JOIN event_likes el ON e.event_id = el.event_id
    WHERE e.date >= NOW() AND (e.status IS NULL OR e.status != 'pending')
    GROUP BY e.event_id
    ORDER BY likes_count DESC
    LIMIT 5
  `, [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, events: results });
  });
});

// 13. GET LIKE COUNT + USER LIKE STATUS FOR A EVENT
app.get('/api/events/:id/likes', verifyToken, (req, res) => {
  const studentId = req.user.id;
  const eventId = req.params.id;
  db.query(`
    SELECT COUNT(*) AS cnt,
    (SELECT 1 FROM event_likes WHERE event_id = ? AND student_id = ?) AS user_liked
    FROM event_likes WHERE event_id = ?
  `, [eventId, studentId, eventId], (err, rows) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, likes: rows[0].cnt, liked: !!rows[0].user_liked });
  });
});
// ===================================================================

// We must call `server.listen` instead of `app.listen` so WebSockets and HTTP work identically together!
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Real-Time WebSockets Server running on port ${PORT}`);
});
