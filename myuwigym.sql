h- Active: 1743564584943@@127.0.0.1@3306@myuwigym
-- SET search_path TO myuwigym;  -- Uncomment if using PostgreSQL

-- Users Table
-- This table stores user information including their role and hashed password
-- The user_id is auto-generated in a specific format (e.g., M-12345 for Member, T-1234 for Trainer, A-123 for Administrator)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) UNIQUE NOT NULL,  -- Auto-generated formatted ID
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bookings Table
-- This table tracks bookings made by users for gym slots
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,  -- Matches the users table
    date DATE NOT NULL,
    time_slot VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'Booked' CHECK (status IN ('Booked', 'Cancelled')),
    FOREIGN KEY (trainer_id) REFERENCES users(user_id)
  );


-- Trainer Requests Table
-- This table tracks requests made by users to book trainers
CREATE TABLE trainer_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  trainer_id VARCHAR(20) NOT NULL,
  status ENUM('Pending', 'Accepted', 'Denied') DEFAULT 'Pending',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (trainer_id) REFERENCES users(user_id) ON DELETE CASCADE
);


-- Report Table
-- This table stores reports made by users about trainers or other gym equipment
CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(20),
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Adding a new column to track monthly visits
-- This column will be updated at the end of each month to reset the count
ALTER TABLE users
ADD COLUMN monthly_visits INT DEFAULT 0,                     --drop
ADD COLUMN last_reset_month INT DEFAULT MONTH(CURRENT_DATE); --drop

ALTER TABLE users ADD COLUMN profile_picture VARCHAR(255);

ALTER TABLE users ADD monthly_checkins INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_time DATETIME NOT NULL,
  capacity INT NOT NULL,   
  booked INT DEFAULT 0 
  );

 ALTER TABLE users ADD COLUMN cancellations INT DEFAULT 0; 

 CREATE TABLE active_checkins (
  user_id INT NOT NULL,
  checkin_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS waitlist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    session_time DATETIME,
    wait_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    cancellations INT DEFAULT 0, 
    priority_score INT DEFAULT 0, 
    FOREIGN KEY (user_id) REFERENCES users(id)
);
