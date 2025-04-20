const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const twilio = require("twilio");
const jwt = require("jsonwebtoken");
const http = require("http");
const { Server } = require("socket.io");
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



app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], (err, results) => {
    if (err) return res.status(500).json({ message: "Server error" });

    if (results.length === 0) {
      return res.status(401).json({ message: "Incorrect email or password" });
    }

    const user = results[0];

    bcrypt.compare(password, user.password_hash, (err, match) => {
      if (err) return res.status(500).json({ message: "Authentication failed" });

      if (!match) {
        return res.status(401).json({ message: "Incorrect email or password" });
      }

      // Optional: generate JWT token for future authentication
      const token = jwt.sign({ userId: user.id, role: user.role }, "secretkey");

      res.json({
        message: "Login successful",
        role: user.role, // ← send back the role
        user_id: user.user_id // optional, useful later
      });
      
    });
  });
});

// Get trainer-specific client requests
app.get("/trainer-requests/:trainerId", (req, res) => {
    const { trainerId } = req.params;
  
    const sql = `
      SELECT r.id, u.full_name, r.request_detail
      FROM trainer_requests r
      JOIN users u ON r.user_id = u.id
      WHERE r.trainer_id = ? AND r.status = 'Pending'
    `;
  
    db.query(sql, [trainerId], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });
  
  // Respond to client request
  app.post("/respond-request", (req, res) => {
    const { id, approved } = req.body;
    const status = approved ? "Approved" : "Rejected";
  
    db.query("UPDATE trainer_requests SET status = ? WHERE id = ?", [status, id], (err) => {
      if (err) return res.status(500).json({ message: "Failed to update request" });
      res.json({ message: `Request ${status.toLowerCase()} successfully.` });
    });
  });
  
  // Get upcoming clients for trainer
  app.get("/trainer-upcoming-clients/:trainerId", (req, res) => {
    const { trainerId } = req.params;
  
    const sql = `
      SELECT b.date, b.time_slot, u.full_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.trainer_id = ? AND b.date >= CURDATE()
      ORDER BY b.date, b.time_slot
    `;
  
    db.query(sql, [trainerId], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });
  

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

app.post("/book-slot", authenticateToken, (req, res) => {
    const { date, time_slot, trainer_id } = req.body;
    const userId = req.user.userId;

    const sql = `
        INSERT INTO bookings (user_id, trainer_id, date, time_slot)
        VALUES (?, ?, ?, ?)`;

    db.query(sql, [userId, trainer_id, date, time_slot], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        const bookingId = result.insertId;
        res.status(201).json({ message: "Booking successful", bookingId });
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
  
        db.query("INSERT INTO gym_visits (user_id) VALUES (?)", [userId], (err) => {
          if (err) return res.status(500).json({ error: err.message });
  
          res.json({ message: "Check-in successful" });
  
          // Emit real-time event with user info
          db.query("SELECT full_name, role FROM users WHERE id = ?", [userId], (err, result) => {
            if (!err && result.length > 0) {
              const user = result[0];
              io.emit("checkin", {
                userId,
                full_name: user.full_name,
                role: user.role
              });
            }
          });
  
          // Auto-check-out after 45 mins
          setTimeout(() => {
            db.query("UPDATE gym_visits SET check_out = CURRENT_TIMESTAMP WHERE user_id = ? AND check_out IS NULL", [userId], (err) => {
              if (!err) {
                db.query("SELECT phone, full_name, role FROM users WHERE id = ?", [userId], (err, result) => {
                  if (!err && result.length > 0) {
                    const { phone, full_name, role } = result[0];
  
                    // Notify admin and user
                    io.emit("checkout", {
                      userId,
                      full_name,
                      role
                    });
  
                    sendSMS(phone, "Your gym session has ended. Thank you for visiting MyUWIGym!");
                    console.log(`Admin notified: User ${userId} auto checked out.`);
                  }
                });
              }
            });
          }, 45 * 60 * 1000);
        });
      });
    });
  });

  
  app.post("/check-out", authenticateToken, (req, res) => {
    const userId = req.user.userId;
  
    db.query("UPDATE gym_visits SET check_out = CURRENT_TIMESTAMP WHERE user_id = ? AND check_out IS NULL", [userId], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) return res.status(400).json({ message: "User is not checked in" });
  
      // Emit to admin dashboard
      db.query("SELECT full_name, role FROM users WHERE id = ?", [userId], (err, result) => {
        if (!err && result.length > 0) {
          const user = result[0];
          io.emit("checkout", {
            userId,
            full_name: user.full_name,
            role: user.role
          });
        }
      });
  
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

app.get("/trainers", (req, res) => {
    const sql = "SELECT user_id, full_name, profile_image FROM users WHERE role = 'Trainer'";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post("/request-trainer", (req, res) => {
    const { bookingId, trainerId } = req.body;
  
    const sql = `
      INSERT INTO trainer_requests (booking_id, trainer_id)
      VALUES (?, ?)`;
  
    db.query(sql, [bookingId, trainerId], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Trainer request submitted!" });
    });
  });
  
  app.get("/trainer-requests/:trainerId", (req, res) => {
    const { trainerId } = req.params;
    const sql = `
      SELECT tr.id, b.date, b.time_slot, u.full_name, tr.request_detail
      FROM trainer_requests tr
      JOIN bookings b ON tr.booking_id = b.id
      JOIN users u ON b.user_id = u.user_id
      WHERE tr.trainer_id = ? AND tr.status = 'Pending'
    `;
    db.query(sql, [trainerId], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });
  
  
  app.post("/respond-trainer-request", (req, res) => {
    const { requestId, response } = req.body;
  
    if (!['Accepted', 'Denied'].includes(response)) {
      return res.status(400).json({ error: "Invalid status" });
    }
  
    db.query("UPDATE trainer_requests SET status = ? WHERE id = ?", [response, requestId], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Request ${response.toLowerCase()}` });
    });
 });

 app.get("/trainer-upcoming-clients/:trainerId", (req, res) => {
    const trainerId = req.params.trainerId;
    const sql = `
      SELECT b.date, b.time_slot, u.full_name
      FROM trainer_requests tr
      JOIN bookings b ON tr.booking_id = b.id
      JOIN users u ON b.user_id = u.user_id
      WHERE tr.trainer_id = ? AND tr.status = 'Accepted'
      ORDER BY b.date, b.time_slot
    `;
    db.query(sql, [trainerId], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });
  

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // or set to your frontend URL
    methods: ["GET", "POST"]
  }
});

server.listen(5000, () => {
  console.log("Server running on port 5000...");
});

