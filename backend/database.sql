-- Open your MySQL Tool and run ONLY these two statements to update our table!

USE ClubCascade;

ALTER TABLE users 
ADD COLUMN name VARCHAR(255) NOT NULL AFTER id,
ADD COLUMN role ENUM('student', 'organizer', 'admin') DEFAULT 'student' AFTER password;

-- --------------------------------------------------------
-- PHASE 5: REAL-TIME NOTIFICATIONS TABLE
-- --------------------------------------------------------
CREATE TABLE notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  message VARCHAR(500) NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==========================================
-- NEW: The Live Student Event Q&A Board!
-- ==========================================
CREATE TABLE IF NOT EXISTS events (
  event_id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  date DATETIME NOT NULL,
  venue VARCHAR(100) NOT NULL,
  club_id INT,
  limit_participants INT DEFAULT 0,
  image_url VARCHAR(255),
  category VARCHAR(50) DEFAULT 'General'
);

CREATE TABLE IF NOT EXISTS event_queries (
    query_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,               -- Links message to the exact Event
    user_id INT NOT NULL,                -- Links message to the exact Student
    user_name VARCHAR(100) NOT NULL,     -- We store their name instantly to render it fast
    message TEXT NOT NULL,               -- The actual chat text!
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- --------------------------------------------------------
-- PHASE 6: SOCIAL NETWORK MECHANICS
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS club_profiles (
  profile_id INT AUTO_INCREMENT PRIMARY KEY,
  organizer_id INT NOT NULL UNIQUE,
  bio TEXT,
  logo_url VARCHAR(500),
  banner_url VARCHAR(500),
  instagram_handle VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS followers (
  follow_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  organizer_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, organizer_id),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS club_photos (
  photo_id INT AUTO_INCREMENT PRIMARY KEY,
  organizer_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  caption VARCHAR(300),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- --------------------------------------------------------
-- PHASE 7: INSTAGRAM EXPERIENCE (MUTUALS)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_friends (
  friendship_id INT AUTO_INCREMENT PRIMARY KEY,
  student_1_id INT NOT NULL,
  student_2_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_1_id, student_2_id),
  FOREIGN KEY (student_1_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (student_2_id) REFERENCES users(id) ON DELETE CASCADE
);

-- --------------------------------------------------------
-- PHASE 8: EVENT LIKES & TRENDING
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_likes (
  like_id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  student_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, student_id),
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);
