CREATE DATABASE myuwigym;

USE myuwigym;

-- Users Table
CREATE TABLE users(
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(20) UNIQUE NOT NULL,  -- Auto-generated formatted ID
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role ENUM('Member', 'Trainer', 'Administrator') NOT NULL.
    phone VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bookings Table
CREATE TABLE bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    date DATE NOT NULL,
    time_slot VARCHAR(20) NOT NULL,
    status ENUM('Booked', 'Cancelled') DEFAULT 'Booked',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Live Occupancy Table
CREATE TABLE occupancy (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date DATE NOT NULL,
    time_slot VARCHAR(20) NOT NULL,
    occupancy_count INT DEFAULT 0
);