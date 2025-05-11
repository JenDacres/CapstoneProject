const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const path = require('path');

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'check_in.html'));
});

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

const db = mysql.createConnection({
  host: "192.168.0.13",
  user: "admin",
  password: "uwigym",
  database: "myuwigym"
});

db.connect((err) => {
  if (err) {
    console.error('MySQL connection error:', err);
  } else {
    console.log('Connected to MySQL database.');
  }
});

// Utility function to calculate priority score
function calculatePriorityScore(waitTime, cancellations, checkinsThisMonth) {
  const membershipBonus = checkinsThisMonth > 10 ? 10 : 0; // VIP bonus
  const cancellationPenalty = cancellations * 5;
  const minutesWaiting = Math.floor((Date.now() - new Date(waitTime)) / 60000);
  return (minutesWaiting * 2) + membershipBonus - cancellationPenalty;
}

// Check-in route
app.post('/api/checkin', (req, res) => {
  const { user_id, session_time } = req.body;

  if (!user_id || !session_time) {
    return res.status(400).json({ message: 'User ID and session time are required.' });
  }

  // Update check-in count
  const updateSql = 'UPDATE users SET monthly_checkins = monthly_checkins + 1 WHERE id = ?';
  db.query(updateSql, [user_id], (err, result) => {
    if (err) {
      console.error('Error updating check-in count:', err);
      return res.status(500).json({ message: 'Error during check-in.' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Insert into active check-ins
    const insertSql = 'INSERT INTO active_checkins (user_id, checkin_time) VALUES (?, NOW())';
    db.query(insertSql, [user_id], (err) => {
      if (err) {
        console.error('Error inserting into active_checkins:', err);
        return res.status(500).json({ message: 'Error recording active check-in.' });
      }

      // Check session capacity
      db.query('SELECT * FROM sessions WHERE session_time = ?', [session_time], (err, sessionResults) => {
        if (err || sessionResults.length === 0) {
          return res.status(500).json({ message: 'Error checking session capacity.' });
        }

        const session = sessionResults[0];

        if (session.booked < session.capacity) {
          const sql = 'UPDATE sessions SET booked = booked + 1 WHERE id = ?';
          db.query(sql, [session.id], (err) => {
            if (err) {
              console.error('Error booking session:', err);
              return res.status(500).json({ message: 'Error booking session.' });
            }

            return res.json({ message: 'Check-in and session booking successful!' });
          });
        } else {
          // Add to waitlist if session is full
          db.query('SELECT monthly_checkins, cancellations FROM users WHERE id = ?', [user_id], (err, userResults) => {
            if (err || userResults.length === 0) {
              return res.status(500).json({ message: 'Error fetching user data.' });
            }

            const { monthly_checkins, cancellations } = userResults[0];
            const waitTime = new Date();

            const insertWaitlist = 'INSERT INTO waitlist (user_id, session_time, wait_time) VALUES (?, ?, NOW())';
            db.query(insertWaitlist, [user_id, session_time], (err, waitlistResult) => {
              if (err) {
                return res.status(500).json({ message: 'Error adding to waitlist.' });
              }

              const priorityScore = calculatePriorityScore(waitTime, cancellations, monthly_checkins);
              const updatePriority = 'UPDATE waitlist SET priority_score = ? WHERE id = ?';
              db.query(updatePriority, [priorityScore, waitlistResult.insertId], (err) => {
                if (err) {
                  return res.status(500).json({ message: 'Error updating priority score.' });
                }
                res.json({ message: 'Session full. Added to waitlist.', priorityScore });
              });
            });
          });
        }
      });
    });
  });
});

// Live occupancy route
app.get('/api/active-count', (req, res) => {
  const sql = `
    SELECT COUNT(*) AS count
    FROM active_checkins
    WHERE checkin_time >= NOW() - INTERVAL 1 HOUR
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching active check-in count:', err);
      return res.status(500).json({ message: 'Failed to fetch active check-ins.' });
    }

    res.json({ count: results[0].count });
  });
});

// Auto-cleanup of expired check-ins every 5 minutes
setInterval(() => {
  const sql = 'DELETE FROM active_checkins WHERE checkin_time < NOW() - INTERVAL 1 HOUR';
  db.query(sql, (err, result) => {
    if (err) {
      console.error('Error cleaning expired check-ins:', err);
    } else if (result.affectedRows > 0) {
      console.log(`Auto-removed ${result.affectedRows} expired check-ins.`);
    }
  });
}, 5 * 60 * 1000); // every 5 minutes

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
