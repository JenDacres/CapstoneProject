-- Active: 1743564584943@@127.0.0.1@3306@myuwigym
-- SET search_path TO myuwigym;  -- Uncomment if using PostgreSQL

-- Users Table
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
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,  -- Matches the users table
    date DATE NOT NULL,
    time_slot VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'Booked' CHECK (status IN ('Booked', 'Cancelled')),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE  -- Fixed foreign key reference
);

-- Live Occupancy Table
CREATE TABLE occupancy (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    time_slot VARCHAR(20) NOT NULL,
    occupancy_count INT DEFAULT 0,
    UNIQUE(date, time_slot)  -- Prevents duplicate entries
);
