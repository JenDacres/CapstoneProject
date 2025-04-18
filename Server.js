const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const twilio = require("twilio");
require("dotenv").config({ path: "myuwigym.env" });

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "Kaykay1607",
    database: "myuwigym"
});

db.connect(err => {
    if (err) throw err;
    console.log("MySQL Connected...");
});

const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

function sendSMS(to, message) {
    return twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE,
        to: to
    });
}

function generateUserId(role, id) {
    let prefix = "";
    if (role === "Member") prefix = "M-";
    else if (role === "Trainer") prefix = "T-";
    else if (role === "Administrator") prefix = "A-";
    return `${prefix}${id.toString().padStart(4, '0')}`;
}

app.post("/register", (req, res) => {
    const { full_name, email, role, phone, password } = req.body;
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.json({ error: err });
        const sql = "INSERT INTO users (full_name, email, role, phone, password_hash) VALUES (?, ?, ?, ?, ?)";
        db.query(sql, [full_name, email, role, phone, hash], (err, result) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });
            const newUserId = generateUserId(role, result.insertId);
            db.query("UPDATE users SET user_id = ? WHERE id = ?", [newUserId, result.insertId], (err) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                res.json({ message: "User registered successfully!", user_id: newUserId });
            });
        });
    });
});

app.post("/book-slot", authenticateToken, (req, res) => {
    const { date, time_slot } = req.body;
    const userId = req.user.userId;
    db.query("INSERT INTO bookings (user_id, date, time_slot) VALUES (?, ?, ?)", [userId, date, time_slot], (err, result) => {
        if (err) return res.status(500).send(err);
        res.status(201).send("Booking successful");
    });
});

app.get("/my-bookings", authenticateToken, (req, res) => {
    const userId = req.user.userId;
    db.query("SELECT * FROM bookings WHERE user_id = ?", [userId], (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

app.delete("/cancel-booking/:id", authenticateToken, (req, res) => {
    const bookingId = req.params.id;
    const userId = req.user.userId;
    db.query("DELETE FROM bookings WHERE id = ? AND user_id = ?", [bookingId, userId], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send("Booking cancelled");
    });
});

app.post("/check-in", authenticateToken, (req, res) => {
    const userId = req.user.userId;
    db.query("SELECT COUNT(*) AS occupancy FROM gym_visits WHERE check_out IS NULL", (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        const currentOccupancy = result[0].occupancy;
        if (currentOccupancy >= 25) {
            return res.status(403).json({ message: "Gym is at full capacity. Please wait." });
        }
        db.query("SELECT * FROM gym_visits WHERE user_id = ? AND check_out IS NULL", [userId], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (result.length > 0) return res.status(400).json({ message: "User already checked in" });
            db.query("INSERT INTO gym_visits (user_id) VALUES (?)", [userId], (err, insertResult) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: "Check-in successful" });

                setTimeout(() => {
                    db.query("UPDATE gym_visits SET check_out = CURRENT_TIMESTAMP WHERE user_id = ? AND check_out IS NULL", [userId], (err) => {
                        if (!err) {
                            db.query("SELECT phone FROM users WHERE id = ?", [userId], (err, result) => {
                                if (!err && result.length > 0) {
                                    const phone = result[0].phone;
                                    sendSMS(phone, "Your gym session has ended. Thank you for visiting MyUWIGym!");
                                    console.log(`Admin notified: User ${userId} auto checked out.`);
                                }
                            });
                        }
                    });
                }, 45 * 60 * 1000); // 45 minutes
            });
        });
    });
});

app.post("/check-out", authenticateToken, (req, res) => {
    const userId = req.user.userId;
    db.query("UPDATE gym_visits SET check_out = CURRENT_TIMESTAMP WHERE user_id = ? AND check_out IS NULL", [userId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.affectedRows === 0) return res.status(400).json({ message: "User is not checked in" });
        res.json({ message: "Check-out successful" });
    });
});

app.get("/live-occupancy", (req, res) => {
    db.query("SELECT COUNT(*) AS occupancy FROM gym_visits WHERE check_out IS NULL", (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        const currentOccupancy = result[0].occupancy;
        const remainingSpots = 25 - currentOccupancy;
        res.json({ occupancy: currentOccupancy, remaining: remainingSpots > 0 ? remainingSpots : 0 });
    });
});

app.listen(5000, () => {
    console.log("Server running on port 5000...");
});
