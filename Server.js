const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "myuwigym"
});

db.connect(err => {
    if (err) throw err;
    console.log("MySQL Connected...");
});

// Function to generate user_id based on role
function generateUserId(role, id) {
    let prefix = "";
    if (role === "Member") prefix = "M-";
    else if (role === "Trainer") prefix = "T-";
    else if (role === "Administrator") prefix = "A-";

    return `${prefix}${id.toString().padStart(4, '0')}`;
}

// User Registration Route
app.post("/register", (req, res) => {
    const { full_name, email, role, phone, password } = req.body;

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.json({ error: err });

        // Insert into database (without user_id)
        const sql = "INSERT INTO users (full_name, email, role, phone, password_hash) VALUES (?, ?, ?, ?, ?)";
        db.query(sql, [full_name, email, role, phone, hash], (err, result) => {
            if (err) return res.status(500).json({ error: err.sqlMessage });

            const newUserId = generateUserId(role, result.insertId);

            // Update user_id with formatted ID
            db.query("UPDATE users SET user_id = ? WHERE id = ?", [newUserId, result.insertId], (err) => {
                if (err) return res.status(500).json({ error: err.sqlMessage });
                res.json({ message: "User registered successfully!", user_id: newUserId });
            });
        });
    });
});

app.listen(5000, () => {
    console.log("Server running on port 5000...");
});
