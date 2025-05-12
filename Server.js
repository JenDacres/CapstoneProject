require("dotenv").config({ path: "myuwigym.env" });
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

// Configure Multer Storage
const storage = multer.diskStorage({
    destination: "./uploads/profile_pics", // Folder to store uploaded files
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

// File Upload Settings
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Max file size: 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPEG, PNG, and JPG images are allowed"));
        }
    },
});

// Email sending function
function sendEmail(to, subject, text) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        text
    };
    return transporter.sendMail(mailOptions);
}

//For live Twilio integration (disabled for capstone demo)
/*function sendWhatsApp(to, message) {
    return twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_WHATSAPP, // Twilio's Sandbox or your approved WhatsApp number
        to: `whatsapp:${to}` // Prefixing with 'whatsapp:'
    });
}
*/

// Simulated WhatsApp message function
function sendWhatsAppSimulated(phone, message) {
    console.log(`[SIMULATED WhatsApp to ${phone}]: ${message}`);
}

// Generate random password for trainer
function generateRandomPassword(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}


// Generate user_id based on role and AUTO_INCREMENT value
function generateUserId(role, nextId) {
    const rolePrefix = { Member: "M", Trainer: "T", Administrator: "A" };
    return rolePrefix[role] + nextId;  // e.g., M101
}


// Generate JWT Token
function generateToken(user) {
    return jwt.sign(
        { userId: user.user_id, role: user.role },
        process.env.JWT_SECRET || "secretkey",
        { expiresIn: "1h" }
    );
}


// Generate Refresh Token
function generateRefreshToken(user) {
    return jwt.sign(
        { userId: user.user_id },
        process.env.REFRESH_SECRET || "refreshkey",
        { expiresIn: "7d" }
    );
}


// Middleware to Authenticate Token
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ message: "Authorization token required" });

    jwt.verify(token, process.env.JWT_SECRET || "secretkey", (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid token" });
        req.user = user;
        next();
    });
}

// Refresh Token Route
app.post("/refresh-token", (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: "Refresh token required" });

    jwt.verify(refreshToken, process.env.REFRESH_SECRET || "refreshkey", (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid refresh token" });

        const newToken = generateToken(user);
        res.json({ token: newToken });
    });
});
// --- ROUTES ---

// Registration
app.post("/register", (req, res) => {
    const { full_name, email, phone, password } = req.body;
    const role = "Member";
    const formattedPhone = `+${phone.replace(/\D/g, "")}`;

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: "Password hashing failed" });

        db.query("SELECT MAX(id) AS max_id FROM users", (err2, results) => {
            if (err2 || results.length === 0) return res.status(500).json({ error: "Failed to generate user ID" });

            const nextId = (results[0].max_id || 0) + 1;
            const newUserId = generateUserId(role, nextId);

            const insertSql = `
                INSERT INTO users (user_id, full_name, email, role, phone, password_hash)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            db.query(insertSql, [newUserId, full_name, email, role, formattedPhone, hash], (err3) => {
                if (err3) return res.status(500).json({ error: err3.sqlMessage });

                // Send welcome email dynamically
                sendEmail(email, "Welcome to UWI Gym!",
                    `Hello ${full_name}, thanks for signing up! 
                    If you are a UWI student, please bring your ID card with you to the gym!`)
                    .then(() => res.json({ message: "User registered successfully! Email sent." }))
                    .catch(() => res.status(500).json({ error: "Registration successful, but email could not be sent." }));
            });
        });
    });
});

// Profile Picture Upload 
app.post("/update-profile-picture", upload.single("profile_picture"), (req, res) => {
    console.log("User data:", req.user);
    if (!req.user || !req.user.user_id) {
        return res.status(400).json({ message: "User not authenticated" });
    }
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    try {
        // Generate profile picture URL (assuming static file serving)
        const fileUrl = `/uploads/profile_pics/${req.file.filename}`;

        // Update profile picture in Database (Example SQL)
        const updateQuery = `UPDATE users SET profile_picture = $1 WHERE user_id = $2 RETURNING *`;
        const values = [fileUrl, req.user.user_id]; // Ensure `req.user` contains authenticated user info

        // Execute DB query (pseudo-code)
        db.query(updateQuery, values, (err, result) => {
            if (err) {
                return res.status(500).json({ message: "Database update failed" });
            }
            res.status(200).json({ message: "Profile picture updated successfully", profile_picture: fileUrl });
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Serve Static Profile Pictures
app.use("/uploads/profile_pics", express.static(path.join(__dirname, "uploads/profile_pics")));


// Login Route
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) return res.status(500).json({ message: "Server error" });
        if (results.length === 0) return res.status(401).json({ message: "Incorrect email or password" });

        const user = results[0];

        bcrypt.compare(password, user.password_hash, (err, match) => {
            if (err) return res.status(500).json({ message: "Password verification error" });
            if (!match) return res.status(401).json({ message: "Incorrect email or password" });

            const token = generateToken(user);           // ✅ 1-hour access token
            const refreshToken = generateRefreshToken(user); // ✅ 7-day refresh token

            res.json({
                message: "Login successful",
                role: user.role,
                user_id: user.user_id,
                full_name: user.full_name,
                token,
                refreshToken
            });
        });
    });
});


// Book a slot

app.post('/book-slot', authenticateToken, (req, res) => {
    const { date, time_slot, trainer_id } = req.body;
    console.log("User Object:", req.user);
    const user_id = req.user.userId;
    console.log("Extracted user id:", user_id);

    if (!date || !time_slot) {
        return res.status(400).json({ message: 'Missing date or time_slot' });
    }

    // Check if slot is already full (e.g., 5 people max per slot)
    const checkQuery = `SELECT COUNT(*) AS count FROM bookings WHERE date = ? AND time_slot = ? AND status = 'Booked'`;
    db.query(checkQuery, [date, time_slot], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });

        const count = results[0].count;
        if (count >= 5) {
            return res.status(409).json({ message: 'This time slot is full. You are added to waitlist.' });
        }

        // Insert the booking
        const insertBooking = `INSERT INTO bookings (user_id, date, time_slot) VALUES (?, ?, ?)`;
        db.query(insertBooking, [user_id, date, time_slot], (err, bookingResult) => {
            console.error("SQL Insert Error:", err);
            if (err) return res.status(500).json({ message: 'Booking failed', error: err });

            const booking_id = bookingResult.insertId;

            if (trainer_id) {
                const insertTrainerReq = `INSERT INTO trainer_requests (booking_id, trainer_id) VALUES (?, ?)`;
                db.query(insertTrainerReq, [booking_id, trainer_id], (err) => {
                    if (err) return res.status(500).json({ message: 'Trainer request failed', error: err });
                    return res.json({ message: 'Slot booked and trainer request sent!' });
                });
            } else {
                return res.json({ message: 'Slot booked successfully without trainer' });
            }
        });
    });
});


// Get bookings
app.get("/my-bookings", authenticateToken, (req, res) => {
    console.log("Fetching bookings for user:", req.user);
    const userId = req.user.id;

    try {
        const [rows] = db.query("SELECT * FROM bookings WHERE user_id = ? ORDER BY date DESC", [userId]);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching bookings:", err);
        res.status(500).json({ message: "Server error" });
    }
});


// Get Available Slots
app.get("/available-times/:date", authenticateToken, async (req, res) => {
    const { date } = req.params;

    try {
        const allSlots = [
            "05:00-06:00", "06:00-07:00", "07:00-08:00", "08:00-09:00",
            "09:00-10:00", "10:00-11:00", "11:00-12:00", "12:00-13:00",
            "13:00-14:00", "14:00-15:00", "15:00-16:00", "16:00-17:00",
            "17:00-18:00", "18:00-19:00", "19:00-20:00", "20:00-21:00",
            "21:00-22:00", "22:00-23:00"
        ];

        const [booked] = await db.query("SELECT time_slot FROM bookings WHERE date = ?", [date]);
        const bookedSlots = booked.map(b => b.time_slot);

        const availableSlots = allSlots.filter(slot => !bookedSlots.includes(slot));

        res.json(availableSlots);
    } catch (err) {
        console.error("Error fetching available times:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Update Booking
app.patch("/update-booking/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { time_slot } = req.body;
    const userId = req.user.id;

    try {
        const [booking] = await db.query("SELECT * FROM bookings WHERE id = ? AND user_id = ?", [id, userId]);

        if (booking.length === 0) {
            return res.status(404).json({ message: "Booking not found or unauthorized." });
        }

        await db.query("UPDATE bookings SET time_slot = ? WHERE id = ?", [time_slot, id]);

        res.json({ message: "Booking updated successfully." });
    } catch (err) {
        console.error("Error updating booking:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Delete Booking
app.delete("/cancel-booking/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const [booking] = await db.query("SELECT * FROM bookings WHERE id = ? AND user_id = ?", [id, userId]);

        if (booking.length === 0) {
            return res.status(404).json({ message: "Booking not found or unauthorized." });
        }

        await db.query("DELETE FROM bookings WHERE id = ?", [id]);
        res.send("Booking cancelled successfully.");
    } catch (err) {
        console.error("Error cancelling booking:", err);
        res.status(500).json({ message: "Server error" });
    }
});



// Create Trainer
app.post("/admin/add-trainer", async (req, res) => {
    const { firstName, lastName, email } = req.body;

    if (!firstName || !lastName || !email) {
        return res.status(400).json({ message: "All fields are required." });
    }

    const fullName = `${firstName} ${lastName}`;
    const phone = "+1234567890"; // Replace with actual if needed

    const rawPassword = generateRandomPassword();
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const insertSql = `
      INSERT INTO users (full_name, email, role, phone, password_hash)
      VALUES (?, ?, 'Trainer', ?, ?)
    `;
    db.query(insertSql, [fullName, email, phone, passwordHash], (err, result) => {
        if (err) {
            // 🔍 Improved logging here
            console.error("Insert error:", err);
            return res.status(500).json({ message: "Failed to add trainer.", error: err.message });
        }

        const insertId = result.insertId;
        const userId = generateUserId("Trainer", insertId);

        db.query("UPDATE users SET user_id = ? WHERE id = ?", [userId, insertId]);

        const loginInfoMessage = `
Hi ${fullName},

Your trainer account has been created.

Login ID: ${email}
Password: ${rawPassword}

Please change your password after first login.
        `.trim();

        // Simulate WhatsApp
        sendWhatsAppSimulated(phone, loginInfoMessage);

        // Send Email using external function
        sendEmail(email, "Trainer Account Created", loginInfoMessage)
            .then(() => {
                return res.json({ message: "Trainer created and notified via email and WhatsApp (simulated)." });
            })
            .catch(err => {
                console.error("Email error:", err);
                return res.status(500).json({ message: "Trainer added, but failed to send email." });
            });
    });
});


// Trainer list
app.get("/trainers", (req, res) => {
    db.query("SELECT user_id, full_name FROM users WHERE role = 'Trainer'", (err, results) => {
        res.json(results);
    });
});


// Trainer requests
app.get("/trainer-requests/:trainerId", (req, res) => {
    const trainerId = req.params.trainerId;

    const query = `
    SELECT tr.id, u.full_name, b.date, b.time_slot
    FROM trainer_requests tr
    JOIN bookings b ON tr.booking_id = b.id
    JOIN users u ON b.user_id = u.user_id
    WHERE tr.trainer_id = ? AND tr.status = 'Pending'
    ORDER BY b.date, b.time_slot;
  `;

    db.query(query, [trainerId], (err, results) => {
        if (err) {
            console.error("Error fetching trainer requests:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});


// Trainer responds
app.post("/respond-trainer-request", async (req, res) => {
  const { id, response } = req.body;

  try {
    // Update trainer request status
    await db.promise().query(
      "UPDATE trainer_requests SET status = ? WHERE id = ?",
      [response, id]
    );

    // Fetch related data
    const [requestData] = await db.promise().query(
      `SELECT tr.*, u.email, u.full_name, b.date, b.time_slot
       FROM trainer_requests tr
       JOIN bookings b ON tr.booking_id = b.id
       JOIN users u ON b.user_id = u.user_id
       WHERE tr.id = ?`,
      [id]
    );

    if (requestData.length > 0) {
      const {
        email,
        full_name,
        date,
        time_slot
      } = requestData[0];

      if (response === "Accepted") {
        await sendEmail(
          email,
          "Trainer Request Approved",
          `Hello ${full_name},\n\nYour trainer has accepted your session request for ${date} at ${time_slot}.\n\nSee you at the gym!\n\n- MyUWIGym`
        );
      }
      // No need to update bookings.status
    }

    res.status(200).json({ message: "Trainer response recorded successfully." });
  } catch (err) {
    console.error("Trainer response error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Trainer - Get upcoming clients
app.get("/trainer-upcoming-clients/:trainerId", async (req, res) => {
  const { trainerId } = req.params;
  console.log("Fetching upcoming clients for trainer ID:", trainerId);

  try {
    const [results] = await db.promise().query(
      `SELECT u.full_name, b.date, b.time_slot
       FROM trainer_requests tr
       JOIN bookings b ON tr.booking_id = b.id
       JOIN users u ON b.user_id = u.user_id
       WHERE tr.trainer_id = ?
         AND tr.status = 'Accepted'
         AND CONCAT(b.date, ' ', b.time_slot) > NOW()
       ORDER BY b.date, b.time_slot`,
      [trainerId]
    );

    console.log("Query result:", results);
    res.json(results);
  } catch (err) {
    console.error("Error fetching upcoming clients:", err);
    res.status(500).json({ error: "Server error" });
  }
});





// Admin - Get pending users for approval
app.get("/admin/pending-users", (req, res) => {
    db.query("SELECT id, full_name, email, role FROM users WHERE status = 'Pending' AND role = 'Member'", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});


// Admin - Get all bookings with full details
app.get("/admin/bookings", (req, res) => {
    const sql = `
    SELECT id, user_id, date, time_slot, status, trainer_id
    FROM bookings
    ORDER BY date DESC
  `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});



//Member - Report an issue
app.post("/report-issue", authenticateToken, upload.single("image"), (req, res) => {
    const userId = req.user.userId;
    const { report } = req.body;
    const imagePath = req.file ? req.file.filename : null; // Save image path if uploaded

    const sql = "INSERT INTO reports (user_id, message, image_path) VALUES (?, ?, ?)";
    db.query(sql, [userId, report, imagePath], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Report submitted successfully!" });
    });
});


// Admin - View user reports (updated for table view)
app.get("/admin/reports", (req, res) => {
    const sql = `
    SELECT id, message, created_at
    FROM reports
    ORDER BY created_at DESC
  `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});


//Member sessions
app.get("/my-sessions", authenticateToken, (req, res) => {
    const userId = req.user.userId;
    db.query("SELECT date, time_slot FROM bookings WHERE user_id = ? AND date >= CURDATE() ORDER BY date, time_slot", [userId], (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

//Admin - Send alerts to all users
app.post("/send-alert", async(req, res) => {
    const {message} = req.body;
    if(!message) return res.status(400).json({error: "Message is required."});

    db.query("SELECT email FROM users WHERE role = 'Member'", async(err, results) => {
        if (err) return res.status(500).json({error: "Database error"});

        try{
            const emailPromises = results.map(row =>
                sendEmail(row.email, "Gym Alert", message)
            );

            await Promise.all(emailPromises);
            res.json({message: "Alert sent to all members via email"});
        }catch (err){
            console.error("Email send error:", err);
            res.status(500).json({error: "Failed to send email alerts."});
        }
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
