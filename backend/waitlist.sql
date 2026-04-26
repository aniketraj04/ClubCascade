CREATE TABLE IF NOT EXISTS event_waitlist (
    waitlist_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT,
    student_id INT,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);
