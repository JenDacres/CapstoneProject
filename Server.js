const express = require("express");
const mysql = require("mysql");
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
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Kaykay1607",
  database: "myuwigym"
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




const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function sendEmail(to, subject, text) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text
  };

  return transporter.sendMail(mailOptions);
}


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
  let prefix = role === "Member" ? "M-" :
               role === "Trainer" ? "T-" : "A-";
  return `${prefix}${id.toString().padStart(4, '0')}`;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, "secretkey", (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Registration
app.post("/register", (req, res) => {
  const { full_name, email, role, area_code, phone, password } = req.body;
  const fullPhone = `${area_code}${phone}`;
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.json({ error: err });
    const sql = "INSERT INTO users (full_name, email, role, phone, password_hash) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [full_name, email, role, fullPhone, hash], (err, result) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      const newUserId = generateUserId(role, result.insertId);
      db.query("UPDATE users SET user_id = ? WHERE id = ?", [newUserId, result.insertId], (err) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json({ message: "User registered successfully!", user_id: newUserId });
      });
    });
  });
});

// Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], (err, results) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (results.length === 0) return res.status(401).json({ message: "Incorrect email or password" });
    const user = results[0];
    bcrypt.compare(password, user.password_hash, (err, match) => {
      if (!match) return res.status(401).json({ message: "Incorrect email or password" });
      const token = jwt.sign({ userId: user.id, role: user.role }, "secretkey");
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
            sendSMS(phone, "Your gym session has ended. Thank you!");
          });
        }, 45 * 60 * 1000);
      });
    });
  });
});

// Check-out
app.post("/check-out", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  db.query("UPDATE gym_visits SET check_out = CURRENT_TIMESTAMP WHERE user_id = ? AND check_out IS NULL", [userId], (err, result) => {
    if (result.affectedRows === 0) return res.status(400).json({ message: "Not checked in" });
    db.query("SELECT full_name, role FROM users WHERE id = ?", [userId], (err, result) => {
      const { full_name, role } = result[0];
      io.emit("checkout", { userId, full_name, role });
    });
    res.json({ message: "Check-out successful" });
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
  
  // Admin - Approve or reject user accounts
    app.post("/admin/approve-user", (req, res) => {
    const { id, approve } = req.body;
    const status = approve ? 'Approved' : 'Rejected';
  
    db.query("UPDATE users SET status = ? WHERE id = ?", [status, id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `User ${status}` });
    });
  });
  

// Admin - Approve or reject user accounts and send email
    app.post("/admin/approve-user", (req, res) => {
    const { id, approve } = req.body;
    const status = approve ? 'Approved' : 'Rejected';
  
    db.query("UPDATE users SET status = ? WHERE id = ?", [status, id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
  
      // Get user's email
      db.query("SELECT email, full_name FROM users WHERE id = ?", [id], (err2, result) => {
        if (!err2 && result.length > 0) {
          const { email, full_name } = result[0];
          const subject = `Your account has been ${status}`;
          const text = `Hi ${full_name},\n\nYour account has been ${status.toLowerCase()} by the admin.\n\nThank you,\nMyUWIGym`;
  
          sendEmail(email, subject, text)
            .then(() => res.json({ message: `User ${status} and email sent.` }))
            .catch(emailErr => res.status(500).json({ error: `User ${status} but email failed: ${emailErr.message}` }));
        } else {
          res.json({ message: `User ${status}, but email not sent.` });
        }
      });
    });
  });

    // Get all competitions (public and admin-created)
    app.get("/competitions", (req, res) => {
    db.query("SELECT * FROM competitions ORDER BY start_date DESC", (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });
  
  // Create a new competition (by admin or trainer)
    app.post("/competitions", (req, res) => {
    const { name, description, start_date, end_date, visibility, created_by } = req.body;
    if (!name || !description || !start_date || !end_date || !visibility || !created_by) {
      return res.status(400).json({ message: "Missing required fields" });
    }
  
    const sql = `
      INSERT INTO competitions (name, description, start_date, end_date, visibility, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.query(sql, [name, description, start_date, end_date, visibility, created_by], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: "Competition created successfully", id: result.insertId });
    });
  });
  
  // Edit an existing competition
  app.put("/competitions/:id", (req, res) => {
    const { name, description, start_date, end_date, visibility } = req.body;
    const { id } = req.params;
  
    const sql = `
      UPDATE competitions 
      SET name = ?, description = ?, start_date = ?, end_date = ?, visibility = ?
      WHERE id = ?
    `;
  
    db.query(sql, [name, description, start_date, end_date, visibility, id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Competition updated successfully" });
    });
  });

  // Get competition details
  app.get("/competitions/:id/leaderboard", (req, res) => {
    const challengeId = req.params.id;
    const sql = `
      SELECT u.full_name, p.progress, c.goal
      FROM competition_progress p
      JOIN users u ON p.user_id = u.user_id
      JOIN competitions c ON p.competition_id = c.id
      WHERE p.competition_id = ?
      ORDER BY p.progress DESC
    `;
    db.query(sql, [challengeId], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });
  
   // Get competition details
  app.get("/competitions", (req, res) => {
    db.query("SELECT * FROM competitions", (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });
  
  //Update Profile Picture
  app.post("/update-profile-picture", authenticateToken, upload.single("profile_picture"), (req, res) => {
    const userId = req.user.userId;
  
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }
  
    const profilePicUrl = req.file.filename; // Just save filename
    
    const sql = "UPDATE users SET profile_image = ? WHERE user_id = ?";
    db.query(sql, [profilePicUrl, userId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Profile picture updated successfully!" });
    });
  });
  
  //Change Password
  app.post("/change-password", authenticateToken, (req, res) => {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;
  
    const sql = "SELECT password_hash FROM users WHERE user_id = ?";
    db.query(sql, [userId], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) return res.status(404).json({ message: "User not found." });
  
      const hash = results[0].password_hash;
  
      bcrypt.compare(currentPassword, hash, (err, match) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!match) return res.status(400).json({ message: "Current password incorrect." });
  
        bcrypt.hash(newPassword, 10, (err, newHash) => {
          if (err) return res.status(500).json({ error: err.message });
  
          db.query("UPDATE users SET password_hash = ? WHERE user_id = ?", [newHash, userId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Password changed successfully!" });
          });
        });
      });
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
    
  

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

server.listen(5000, () => {
  console.log("Server running on port 5000...");
});
