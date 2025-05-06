const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const twilio = require("twilio");
const jwt = require("jsonwebtoken");
const http = require("http");
const { Server } = require("socket.io");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: "myuwigym.env" });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
    }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploaded images

const db = mysql.createConnection({
    host: "192.168.0.13",
    user: "admin",
    password: "uwigym",
    database: "myuwigym"
});


const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});
const upload = multer({ storage: storage });

function sendEmail(to, subject, text) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        text
    };
    return transporter.sendMail(mailOptions);
}

function sendWhatsApp(to, message) {
    return twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_WHATSAPP, // Twilio's Sandbox or your approved WhatsApp number
        to: `whatsapp:${to}` // Prefixing with 'whatsapp:'
    });
}


function generateUserId(role, insertId) {
    const rolePrefix = {
        Member: 'M',
        Trainer: 'T',
        Administrator: 'A'
    };
    return rolePrefix[role] + insertId; // e.g., M101
}



function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET || "secretkey", (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// --- ROUTES ---

// Registration
app.post("/register", (req, res) => {
    const { full_name, email, phone, password } = req.body;
    const role = "Member"; // Default role
    const formattedPhone = `+${phone.replace(/\D/g, "")}`; // Clean phone number

    // Step 1: Hash password
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: "Password hashing failed" });

        // Step 2: Get next AUTO_INCREMENT value
        const getNextIdSql = `
            SELECT AUTO_INCREMENT 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = 'myuwigym' AND TABLE_NAME = 'users'
        `;
        db.query(getNextIdSql, (err2, results) => {
            if (err2 || results.length === 0) {
                return res.status(500).json({ error: "Failed to generate user ID" });
            }

            const nextId = results[0].AUTO_INCREMENT;
            const newUserId = generateUserId(role, nextId); // e.g., M101

            // Step 3: Insert user WITH user_id
            const insertSql = `
                INSERT INTO users (user_id, full_name, email, role, phone, password_hash)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            db.query(insertSql, [newUserId, full_name, email, role, formattedPhone, hash], (err3, result) => {
                if (err3) {
                    return res.status(500).json({ error: err3.sqlMessage });
                }

                res.json({ message: "User registered successfully!", user_id: newUserId });
            });
        });
    });
});


// Login
app.post("/login", (req, res) => {
    const { email, password } = req.body;
    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) return res.status(500).json({ message: "Server error" });
        if (results.length === 0) return res.status(401).json({ message: "Incorrect email or password" });

        const user = results[0];
        bcrypt.compare(password, user.password_hash, (err, match) => {
            if (!match) return res.status(401).json({ message: "Incorrect email or password" });

            const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || "secretkey");
            res.json({ message: "Login successful", role: user.role, user_id: user.user_id, token });
        });
    });
});


// Book a slot
app.post("/book-slot", authenticateToken, (req, res) => {
    const { date, time_slot, trainer_id } = req.body;
    const userId = req.user.userId;
    const sql = "INSERT INTO bookings (user_id, trainer_id, date, time_slot) VALUES (?, ?, ?, ?)";
    db.query(sql, [userId, trainer_id, date, time_slot], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: "Booking successful", bookingId: result.insertId });
    });
});

// Send alert to all members
app.post("/send-alert", async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required." });

    const sql = "SELECT phone FROM users WHERE role = 'Member'";
    db.query(sql, async (err, results) => {
        if (err) return res.status(500).json({ error: "Database error." });

        try {
            const sendPromises = results.map(row => sendWhatsApp(row.phone, message));
            await Promise.all(sendPromises);
            res.json({ message: "Alert sent to all members." });
        } catch (twilioErr) {
            console.error("WhatsApp send error:", twilioErr);
            res.status(500).json({ error: "Failed to send WhatsApp messages." });
        }
    });
});


app.get("/my-bookings", authenticateToken, (req, res) => {
    db.query("SELECT * FROM bookings WHERE user_id = ?", [req.user.userId], (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

app.delete("/cancel-booking/:id", authenticateToken, (req, res) => {
    db.query("DELETE FROM bookings WHERE id = ? AND user_id = ?", [req.params.id, req.user.userId], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send("Booking cancelled");
    });
});

// Check-in
app.post("/check-in", authenticateToken, (req, res) => {
    const userId = req.user.userId;
    db.query("SELECT COUNT(*) AS occupancy FROM gym_visits WHERE check_out IS NULL", (err, result) => {
        if (result[0].occupancy >= 25) return res.status(403).json({ message: "Gym is full" });

        db.query("SELECT * FROM gym_visits WHERE user_id = ? AND check_out IS NULL", [userId], (err, result) => {
            if (result.length > 0) return res.status(400).json({ message: "Already checked in" });

            db.query("INSERT INTO gym_visits (user_id) VALUES (?)", [userId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                db.query("SELECT full_name, role FROM users WHERE id = ?", [userId], (err, result) => {
                    io.emit("checkin", { userId, full_name: result[0].full_name, role: result[0].role });
                });
                res.json({ message: "Check-in successful" });

                setTimeout(() => {
                    db.query("UPDATE gym_visits SET check_out = CURRENT_TIMESTAMP WHERE user_id = ? AND check_out IS NULL", [userId]);
                    db.query("SELECT phone, full_name, role FROM users WHERE id = ?", [userId], (err, result) => {
                        const { phone, full_name, role } = result[0];
                        io.emit("checkout", { userId, full_name, role });
                        sendWhatsApp(phone, "Your gym session has ended. Thank you!");
                    });
                }, 45 * 60 * 1000);
            });
        });
    });
});


// Live occupancy
app.get("/live-occupancy", (req, res) => {
    db.query("SELECT COUNT(*) AS occupancy FROM gym_visits WHERE check_out IS NULL", (err, result) => {
        res.json({ occupancy: result[0].occupancy });
    });
});


// Hourly summary
app.get("/live-occupancy-summary", (req, res) => {
    db.query(`SELECT HOUR(check_in) AS hour, COUNT(*) AS count FROM gym_visits WHERE DATE(check_in) = CURDATE() GROUP BY hour`, (err, results) => {
        const hours = Array.from({ length: 24 }, (_, h) => h);
        const summary = hours.map(h => {
            const match = results.find(r => r.hour === h);
            return { hour: `${h}:00`, count: match ? match.count : 0 };
        });
        db.query("SELECT COUNT(*) AS current FROM gym_visits WHERE check_out IS NULL", (err2, result2) => {
            res.json({ current: result2[0].current, summary });
        });
    });
});


// Trainer list
app.get("/trainers", (req, res) => {
    db.query("SELECT user_id, full_name, profile_image FROM users WHERE role = 'Trainer'", (err, results) => {
        res.json(results);
    });
});


// Request trainer
app.post("/request-trainer", (req, res) => {
    const { bookingId, trainerId } = req.body;
    db.query("INSERT INTO trainer_requests (booking_id, trainer_id) VALUES (?, ?)", [bookingId, trainerId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Trainer request submitted!" });
    });
});


// Trainer requests
app.get("/trainer-requests/:trainerId", (req, res) => {
    const { trainerId } = req.params;
    const sql = `
      SELECT tr.id, b.date, b.time_slot, u.full_name
      FROM trainer_requests tr
      JOIN bookings b ON tr.booking_id = b.id
      JOIN users u ON b.user_id = u.user_id
      WHERE tr.trainer_id = ? AND tr.status = 'Pending'
    `;
    db.query(sql, [trainerId], (err, results) => {
        res.json(results);
    });
});


// Trainer responds
app.post("/respond-trainer-request", (req, res) => {
    const { requestId, response } = req.body;
    if (!["Accepted", "Denied"].includes(response)) return res.status(400).json({ error: "Invalid response" });
    db.query("UPDATE trainer_requests SET status = ? WHERE id = ?", [response, requestId], (err) => {
        res.json({ message: `Request ${response.toLowerCase()}` });
    });
});

// Send WhatsApp after trainer acceptance
app.post("/send-trainer-alert", (req, res) => {
    const { requestId } = req.body;

    const sql = `
      SELECT u.phone, u.full_name, b.date, b.time_slot 
      FROM trainer_requests tr
      JOIN bookings b ON tr.booking_id = b.id
      JOIN users u ON b.user_id = u.user_id
      WHERE tr.id = ?
    `;

    db.query(sql, [requestId], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ error: "Could not fetch client info" });
        }

        const { phone, full_name, date, time_slot } = results[0];
        const message = `Hi ${full_name}, your training session on ${date} at ${time_slot} has been accepted!`;

        try {
            await sendWhatsApp(phone, message);
            res.json({ message: "WhatsApp alert sent" });
        } catch (e) {
            console.error("WhatsApp error:", e);
            res.status(500).json({ error: "Failed to send WhatsApp message" });
        }
    });
});


// Upcoming trainer clients
app.get("/trainer-upcoming-clients/:trainerId", (req, res) => {
    const { trainerId } = req.params;
    const sql = `
      SELECT b.date, b.time_slot, u.full_name
      FROM trainer_requests tr
      JOIN bookings b ON tr.booking_id = b.id
      JOIN users u ON b.user_id = u.user_id
      WHERE tr.trainer_id = ? AND tr.status = 'Accepted'
      ORDER BY b.date, b.time_slot
    `;
    db.query(sql, [trainerId], (err, results) => {
        res.json(results);
    });
});


// Admin - Get pending users for approval
app.get("/admin/pending-users", (req, res) => {
    db.query("SELECT id, full_name, email, role FROM users WHERE status = 'Pending'", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});


// Admin - Get all bookings
app.get("/admin/bookings", (req, res) => {
    const sql = `
        SELECT users.full_name, bookings.date, bookings.time_slot, bookings.status
        FROM bookings
        JOIN users ON bookings.user_id = users.user_id
        ORDER BY bookings.date DESC
      `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});


// Admin - View user reports
app.get("/admin/reports", (req, res) => {
    const sql = `
        SELECT users.full_name, reports.message, reports.created_at
        FROM reports
        JOIN users ON reports.user_id = users.user_id
        ORDER BY reports.created_at DESC
      `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});


app.get("/my-sessions", authenticateToken, (req, res) => {
    const userId = req.user.userId;
    db.query("SELECT date, time_slot FROM bookings WHERE user_id = ? AND date >= CURDATE() ORDER BY date, time_slot", [userId], (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});


app.get("/profile", authenticateToken, (req, res) => {
    const userId = req.user.userId;
    db.query("SELECT full_name FROM users WHERE user_id = ?", [userId], (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results[0]);
    });
});



// Admin Approve User (FINAL version with email notification)
app.post("/admin/approve-user", (req, res) => {
    const { id, approve } = req.body;
    const status = approve ? 'Approved' : 'Rejected';

    db.query("UPDATE users SET status = ? WHERE id = ?", [status, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        db.query("SELECT email, full_name FROM users WHERE id = ?", [id], (err2, result) => {
            if (err2 || result.length === 0) {
                return res.json({ message: `User ${status}, but email not sent.` });
            }
            const { email, full_name } = result[0];
            const subject = `Your account has been ${status}`;
            const text = `Hi ${full_name},\n\nYour account has been ${status.toLowerCase()} by the admin.\n\nThank you,\nMyUWIGym`;

            sendEmail(email, subject, text)
                .then(() => res.json({ message: `User ${status} and email sent.` }))
                .catch(emailErr => res.status(500).json({ error: `User ${status} but email failed: ${emailErr.message}` }));
        });
    });
});

// Update Profile Picture
app.post("/update-profile-picture", authenticateToken, upload.single("profile_picture"), (req, res) => {
    const userId = req.user.userId;
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded." });
    }
    const profilePicUrl = req.file.filename;
    db.query("UPDATE users SET profile_image = ? WHERE user_id = ?", [profilePicUrl, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Profile picture updated successfully!" });
    });
});

// Change Password
app.post("/change-password", authenticateToken, (req, res) => {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;
    db.query("SELECT password_hash FROM users WHERE user_id = ?", [userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: "User not found." });

        const hash = results[0].password_hash;
        bcrypt.compare(currentPassword, hash, (err, match) => {
            if (!match) return res.status(400).json({ message: "Current password incorrect." });

            bcrypt.hash(newPassword, 10, (err, newHash) => {
                if (err) return res.status(500).json({ error: err.message });
                db.query("UPDATE users SET password_hash = ? WHERE user_id = ?", [newHash, userId], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ message: "Password changed successfully!" });
                });
            });
        });
    });
});

// Promisify DB connect
function connectToDatabase() {
    return new Promise((resolve, reject) => {
        db.connect(err => {
            if (err) {
                reject(err);
            } else {
                console.log("MySQL Connected...");
                resolve();
            }
        });
    });
}

// Socket.IO connection
io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.id);
    });
});



// Start server only after DB connects
const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        await connectToDatabase();
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to connect to database:", error);
        process.exit(1);
    }
}

startServer();
