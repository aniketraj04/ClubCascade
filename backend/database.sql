-- Open your MySQL Tool and run ONLY these two statements to update our table!

USE ClubCascade;

ALTER TABLE users 
ADD COLUMN name VARCHAR(255) NOT NULL AFTER id,
ADD COLUMN role ENUM('student', 'organizer', 'admin') DEFAULT 'student' AFTER password;
