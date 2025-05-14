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
require('./check_in')(app);


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

function calculatePriorityScore(waitTime, cancellations, checkinsThisMonth) {
    const membershipBonus = checkinsThisMonth > 10 ? 10 : 0;
    const cancellationPenalty = cancellations * 5;

    // Ensure UTC conversion to avoid timezone mismatch
    const waitTimeUTC = new Date(waitTime).getTime();  // in ms
    const nowUTC = Date.now(); // also in ms

    const minutesWaiting = Math.floor((nowUTC - waitTimeUTC) / 60000);
    return (minutesWaiting * 2) + membershipBonus - cancellationPenalty;
    console.log(`WaitTime: ${waitTime}, Minutes Waiting: ${minutesWaiting}`);
}

// 
function updateWaitlistPriorities() {
    const query = `
    SELECT w.id, w.wait_time, u.cancellations, u.monthly_checkins, w.user_id
    FROM waitlist w
    JOIN users u ON w.user_id = u.user_id
  `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching waitlist entries:", err);
            return;
        }

        results.forEach(entry => {
            const { id, wait_time, cancellations, monthly_checkins } = entry;

            const newScore = calculatePriorityScore(wait_time, cancellations, monthly_checkins);

            db.query(`UPDATE waitlist SET priority_score = ? WHERE id = ?`, [newScore, id], err => {
                if (err) {
                    console.error(`Error updating score for waitlist ID ${id}:`, err);
                }
            });
        });
        console.log("Waitlist priorities updated.");
    });
}

// ⏱️ Call every 5 minutes
setInterval(updateWaitlistPriorities, 1 * 60 * 1000);


function fillCancelledSlot(date, time_slot) {
    const sessionTime = new Date(`${date}T${time_slot}`);

    // Step 1: Check how many bookings exist for that date
    const countQuery = `
        SELECT COUNT(*) AS count
        FROM bookings
        WHERE date = ? AND status = 'Booked'
    `;

    db.query(countQuery, [date], (err, countResult) => {
        if (err) {
            console.error("Error checking booking count:", err);
            return;
        }

        const bookingCount = countResult[0].count;

        if (bookingCount >= 25) {
            console.log(`No slots available on ${date} — bookings full (${bookingCount}/25).`);
            return;
        }

        // Step 2: Find the highest priority user for that session
        const waitlistQuery = `
            SELECT * FROM waitlist
            WHERE session_time = ?
            ORDER BY priority_score DESC, wait_time ASC
            LIMIT 1
        `;

        db.query(waitlistQuery, [sessionTime], (err, waitlistResults) => {
            if (err) {
                console.error("Error fetching waitlist:", err);
                return;
            }

            if (waitlistResults.length === 0) {
                console.log(`No users in waitlist for ${date} ${time_slot}`);
                return;
            }

            const userToPromote = waitlistResults[0];

            // Step 3: Promote the user
            const insertBooking = `
                INSERT INTO bookings (user_id, date, time_slot, status)
                VALUES (?, ?, ?, 'Booked')
            `;

            db.query(insertBooking, [userToPromote.user_id, date, time_slot], (err) => {
                if (err) {
                    console.error("Error inserting booking from waitlist:", err);
                    return;
                }

                // Step 4: Remove the user from waitlist
                const deleteQuery = `DELETE FROM waitlist WHERE id = ?`;

                db.query(deleteQuery, [userToPromote.id], (err) => {
                    if (err) {
                        console.error("Error deleting user from waitlist:", err);
                    } else {
                        console.log(`User ${userToPromote.user_id} promoted to booking for ${date} ${time_slot}`);
                    }
                });
            });
        });
    });
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

//Logout
app.post("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: "Logout failed" });
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out successfully" });
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
    const user_id = req.user.userId;

    if (!date || !time_slot) {
        return res.status(400).json({ message: 'Missing date or time_slot' });
    }

    const checkQuery = `
        SELECT COUNT(*) AS count
        FROM bookings
        WHERE date = ? AND time_slot = ? AND status = 'Booked'
    `;

    db.query(checkQuery, [date, time_slot], (err, results) => {
        if (err) {
            console.error("Database error during count:", err);
            return res.status(500).json({ message: 'Database error', error: err });
        }

        const count = results[0].count;
        console.log(`Count of bookings for ${date} ${time_slot}: ${count}`);

        if (count >= 25) {
            // Slot is full — insert into waitlist
            const session_time = `${date} ${time_slot}`;
            const insertWait = `
                INSERT INTO waitlist (user_id, session_time)
                VALUES (?, ?)
            `;
            db.query(insertWait, [user_id, session_time], (err) => {
                if (err) {
                    console.error("Waitlist insert error:", err);
                    return res.status(500).json({ message: 'Waitlist failed', error: err });
                }
                return res.status(200).json({ message: 'Added to waitlist' });
            });
        } else {
            // Slot available — insert into bookings with NULL trainer_id
            const insertBooking = `
                INSERT INTO bookings (user_id, date, time_slot)
                VALUES (?, ?, ?)
            `;
            db.query(insertBooking, [user_id, date, time_slot], (err, bookingResult) => {
                if (err) {
                    console.error("Booking insert error:", err);
                    return res.status(500).json({ message: 'Booking failed', error: err });
                }

                const booking_id = bookingResult.insertId;

                // If a trainer was selected, create a pending trainer request
                if (trainer_id) {
                    const insertTrainerRequest = `
                        INSERT INTO trainer_requests (booking_id, trainer_id)
                        VALUES (?, ?)
                    `;
                    db.query(insertTrainerRequest, [booking_id, trainer_id], (err) => {
                        if (err) {
                            console.error("Trainer request insert error:", err);
                            return res.status(500).json({ message: 'Trainer request failed', error: err });
                        }

                        return res.status(200).json({ message: 'Slot booked and trainer request sent' });
                    });
                } else {
                    return res.status(200).json({ message: 'Slot booked without trainer' });
                }
            });
        }
    });
});


//To count how many bookings are already made for a slot
/* app.get('/booked-counts', (req, res) => {
   const {date} = req.query;

   if(!date) {
       return res,status(400).json({message: 'Missing date parameter'});
   }

   const query = `
       SELECT time_slot, COUNT(*) AS count
       FROM bookings
       WHERE date = ? AND status = 'Booked'
       GROUP BY time_slot
   `;

   db.query(query, [date], (err, results) => {
       if(err) {
           console.error('Error fetching booked counts:', err);
           return res.status(500).json({message: 'Database error', error: err});
       }

       const counts = {};
       results.forEach(row => {
           counts[row.time_slot] = row.count;
       });

       res.json(counts);
   });
});*/

// Assuming Express and db connection are already set up


app.post("/cancel-booking/:bookingId", authenticateToken, (req, res) => {
    const bookingId = req.params.bookingId;
    const user_id = req.query.user_id;


    console.log("Received request to cancel booking");
    console.log("User ID:", user_id);
    console.log("Booking ID:", bookingId);


    if (!bookingId) {
        console.error("Missing booking ID");
        return res.status(400).json({ message: "Booking ID is required" });
    }


    // Step 1: First fetch booking details
    const fetchBooking = `SELECT date, time_slot FROM bookings WHERE id = ? AND user_id = ?`;
    db.query(fetchBooking, [bookingId, user_id], (err, bookingResult) => {
        if (err || bookingResult.length === 0) {
            console.error("Booking not found or error fetching:", err);
            return res.status(404).json({ message: "Booking not found or unauthorized" });
        }


        const date = bookingResult[0].date;
        const time_slot = bookingResult[0].time_slot;


        // Step 2: Proceed with deletion
        const sql = `DELETE FROM bookings WHERE id = ? AND user_id = ?`;
        db.query(sql, [bookingId, user_id], (err, result) => {
            if (err) {
                console.error("Error cancelling booking:", err);
                return res.status(500).json({ message: "Server error" });
            }


            if (result.affectedRows === 0) {
                console.warn("No booking found or unauthorized");
                return res.status(404).json({ message: "Booking not found or unauthorized" });
            }


            // Step 3: Update user cancellations
            db.query(
                `UPDATE users SET cancellations = cancellations + 1 WHERE user_id = ?`,
                [user_id],
                (err) => {
                    if (err) console.error("Error updating cancellations count:", err);
                }
            );


            // Step 4: Try to fill cancelled slot
            fillCancelledSlot(date, time_slot);


            console.log("Booking successfully deleted");
            res.json({ message: "Booking successfully deleted" });
        });
    });
});

// Get bookings
app.get("/my-bookings/:user_id", async (req, res) => {
    //const userId = req.user.id;  // Extract the user ID from the decoded JWT token
    const userId = req.params.user_id;

    console.log("Fetching bookings for user ID:", userId);

    if (!userId) {
        console.error("User ID is required");
        return res.status(400).json({ message: "User ID is required" });
    }

    const query = `SELECT id,user_id, date, time_slot, status FROM bookings WHERE user_id = ?`;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
        return res.json(results);
    });
});




app.get('/api/active-checkins-count', async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            "SELECT COUNT(*) AS count FROM active_checkins WHERE checkin_time >= NOW() - INTERVAL 1 HOUR"
        );
        res.json({ count: rows[0].count });
    } catch (err) {
        console.error("Error fetching active check-ins:", err);
        res.status(500).json({ error: "Internal server error" });
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

        const [booked] = await db.promise().query("SELECT time_slot FROM bookings WHERE date = ?", [date]);
        const bookedSlots = booked.map(b => b.time_slot);

        const availableSlots = allSlots.filter(slot => !bookedSlots.includes(slot));

        res.json(availableSlots);
    } catch (err) {
        console.error("Error fetching available times:", err);
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


        res.status(200).json({ message: "Trainer response recorded successfully." }); //Respond early


        // Send email asynchronously (after response is sent)
        if (requestData.length > 0) {
            const { email, full_name, date, time_slot } = requestData[0];


            if (response === "Accepted") {
                sendEmail(
                    email,
                    "Trainer Request Approved",
                    `Hello ${full_name},\n\nYour trainer has accepted your session request for ${date} at ${time_slot}.\n\nSee you at the gym!\n\n- MyUWIGym`
                ).catch(console.error);
            }


            if (response === "Denied") {
                sendEmail(
                    email,
                    "Trainer Request Denied",
                    `Hello ${full_name},\n\nYour trainer has denied your session request for ${date} at ${time_slot}.\n\nSee you at the gym!\n\n- MyUWIGym`
                ).catch(console.error);
            }
        }


    } catch (err) {
        console.error("Trainer response error:", err);
        res.status(500).json({ error: "Internal server error" });
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
        res.status(500).json({ error: "Server error" });
    }
});





// Admin - Get pending users for approval
app.get("/admin/pending-users", (req, res) => {
    db.query("SELECT id, full_name, email, role FROM users WHERE status = 'Pending' AND role = 'Member'", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});


// Admin - Get all bookings with full user info
app.get("/admin/bookings", (req, res) => {
  const sql = `
    SELECT 
      b.id, 
      u.full_name, 
      b.date, 
      b.time_slot, 
      b.status, 
      b.trainer_id
    FROM bookings b
    JOIN users u ON b.user_id = u.user_id
    ORDER BY b.id DESC
  `;


  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching bookings:", err);
      return res.status(500).json({ error: "Database error" });
    }


    res.json(results);
  });
});




app.post('/report-issue', authenticateToken, (req, res) => {
    const user_id = req.user.userId;
    const { message } = req.body;

    if (!message || message.trim() === "") {
        return res.status(400).json({ message: 'Report message is required.' });
    }

    const insertQuery = `
        INSERT INTO reports (user_id, message)
        VALUES (?, ?)
    `;

    db.query(insertQuery, [user_id, message], (err) => {
        if (err) {
            console.error("Error inserting report:", err);
            return res.status(500).json({ message: 'Database error while reporting issue.' });
        }

        return res.status(200).json({ message: 'Report submitted successfully.' });
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
app.post("/send-alert", async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required." });

    db.query("SELECT email FROM users WHERE role = 'Member'", async (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        try {
            const emailPromises = results.map(row =>
                sendEmail(row.email, "Gym Alert", message)
            );

            await Promise.all(emailPromises);
            res.json({ message: "Alert sent to all members via email" });
        } catch (err) {
            console.error("Email send error:", err);
            res.status(500).json({ error: "Failed to send email alerts." });
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

// Periodic Waitlist Promotion
setInterval(() => {
    console.log("Checking waitlist for open booking slots...");

    const query = `
        SELECT DISTINCT DATE(session_time) AS date, TIME(session_time) AS time_slot
        FROM waitlist
    `;

    db.query(query, (err, sessions) => {
        if (err) return console.error("Error fetching waitlist sessions:", err);

        sessions.forEach(session => {
            const date = session.date.toISOString().split("T")[0];
            const time_slot = session.time_slot;
            fillCancelledSlot(date, time_slot);
        });
    });
}, 60 * 1000); // every minute


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
