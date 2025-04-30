-- Active: 1743564584943@@127.0.0.1@3306@myuwigym
-- SET search_path TO myuwigym;  -- Uncomment if using PostgreSQL

-- Users Table
-- This table stores user information including their role and hashed password
-- The user_id is auto-generated in a specific format (e.g., UWI-0001)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) UNIQUE NOT NULL,  -- Auto-generated formatted ID
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('Member', 'Trainer', 'Administrator')),  -- Fixed ENUM issue
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
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE  -- Fixed foreign key reference
);

-- Live Occupancy Table
-- This table tracks the number of users in the gym at any given time
-- It is updated in real-time and can be used to manage capacity
CREATE TABLE occupancy (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    time_slot VARCHAR(20) NOT NULL,
    occupancy_count INT DEFAULT 0,
    UNIQUE(date, time_slot)  -- Prevents duplicate entries
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

-- Trainer Availability Table
-- This table tracks the availability of trainers for bookings
CREATE TABLE trainer_availability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  trainer_id VARCHAR(20),
  day_of_week VARCHAR(10),  -- e.g. Monday, Tuesday
  time_slot VARCHAR(20),     -- e.g. 09:00 - 10:00
  available BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (trainer_id) REFERENCES users(user_id)
);

-- Report Table
-- This table stores reports made by users about trainers or other users
CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(20),
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Adding a new column to track monthly visits
-- This column will be updated at the end of each month to reset the count
ALTER TABLE users
ADD COLUMN monthly_visits INT DEFAULT 0,
ADD COLUMN last_reset_month INT DEFAULT MONTH(CURRENT_DATE);