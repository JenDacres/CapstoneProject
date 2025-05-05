const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'gym123',
  database: 'gym_checkin'
});

db.connect((err) => {
  if (err) {
    console.error('MySQL connection error:', err);
  } else {
    console.log('Connected to MySQL database.');
  }
});

// Utility function to calculate priority score
function calculatePriorityScore(userId, waitTime, cancellations, checkinsThisMonth) {
  const membershipBonus = checkinsThisMonth > 10 ? 10 : 0; // VIP bonus
  const cancellationPenalty = cancellations * 5; // -5 per cancellation
  const minutesWaiting = Math.floor((Date.now() - new Date(waitTime)) / 60000); // Calculate minutes waiting

  return (minutesWaiting * 2) + membershipBonus - cancellationPenalty; // Priority score formula
}

// Check slot availability and book a session
app.post('/api/book-session', (req, res) => {
  const { user_id, session_time } = req.body;

  // Check if the session is full
  db.query('SELECT * FROM sessions WHERE session_time = ?', [session_time], (err, sessionResults) => {
    if (err) {
      console.error('Error fetching session data:', err);
      return res.status(500).json({ message: 'Error fetching session data.' });
    }

    if (sessionResults.length === 0) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    const session = sessionResults[0];

    if (session.booked < session.capacity) {
      // Book the slot
      const sql = 'UPDATE sessions SET booked = booked + 1 WHERE id = ?';
      db.query(sql, [session.id], (err) => {
        if (err) {
          console.error('Error booking session:', err);
          return res.status(500).json({ message: 'Error booking session.' });
        }

        // Add the user to the session's bookings (additional logic can be added here)
        res.json({ message: 'Session booked successfully!' });
      });
    } else {
      // Add the user to the waitlist if session is full
      db.query('SELECT monthly_checkins, cancellations FROM users WHERE id = ?', [user_id], (err, userResults) => {
        if (err) {
          console.error('Error fetching user data:', err);
          return res.status(500).json({ message: 'Error fetching user data.' });
        }

        if (userResults.length === 0) {
          return res.status(404).json({ message: 'User not found.' });
        }

        const { monthly_checkins, cancellations } = userResults[0];

        // Add user to the waitlist
        const waitlistSql = 'INSERT INTO waitlist (user_id, session_time) VALUES (?, ?)';
        db.query(waitlistSql, [user_id, session_time], (err, waitlistResult) => {
          if (err) {
            console.error('Error adding to waitlist:', err);
            return res.status(500).json({ message: 'Error adding user to waitlist.' });
          }

          const priorityScore = calculatePriorityScore(user_id, waitlistResult.insertId, cancellations, monthly_checkins);

          // Update the priority score for this user on the waitlist
          const updateWaitlistSql = 'UPDATE waitlist SET priority_score = ? WHERE id = ?';
          db.query(updateWaitlistSql, [priorityScore, waitlistResult.insertId], (err) => {
            if (err) {
              console.error('Error updating priority score:', err);
              return res.status(500).json({ message: 'Error updating priority score.' });
            }

            res.json({ message: 'You have been added to the waitlist.', priorityScore });
          });
        });
      });
    }
  });
});

// Handle user cancellations
app.post('/api/cancel-booking', (req, res) => {
  const { user_id, session_time } = req.body;

  // Check the session and free a slot
  db.query('SELECT * FROM sessions WHERE session_time = ?', [session_time], (err, sessionResults) => {
    if (err) {
      console.error('Error fetching session data:', err);
      return res.status(500).json({ message: 'Error fetching session data.' });
    }

    if (sessionResults.length === 0) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    const session = sessionResults[0];

    if (session.booked > 0) {
      // Free up one slot in the session
      const sql = 'UPDATE sessions SET booked = booked - 1 WHERE id = ?';
      db.query(sql, [session.id], (err) => {
        if (err) {
          console.error('Error cancelling session:', err);
          return res.status(500).json({ message: 'Error cancelling session.' });
        }

        // Now process the next person in the waitlist
        db.query('SELECT * FROM waitlist WHERE session_time = ? ORDER BY priority_score DESC LIMIT 1', [session_time], (err, waitlistResults) => {
          if (err) {
            console.error('Error fetching waitlist:', err);
            return res.status(500).json({ message: 'Error fetching waitlist.' });
          }

          if (waitlistResults.length > 0) {
            const nextUser = waitlistResults[0];

            // Remove user from waitlist and book the session
            const deleteWaitlistSql = 'DELETE FROM waitlist WHERE id = ?';
            db.query(deleteWaitlistSql, [nextUser.id], (err) => {
              if (err) {
                console.error('Error removing user from waitlist:', err);
                return res.status(500).json({ message: 'Error removing user from waitlist.' });
              }

              // Add to session's bookings
              const bookWaitlistUserSql = 'UPDATE sessions SET booked = booked + 1 WHERE id = ?';
              db.query(bookWaitlistUserSql, [session.id], (err) => {
                if (err) {
                  console.error('Error booking user from waitlist:', err);
                  return res.status(500).json({ message: 'Error booking user from waitlist.' });
                }

                res.json({ message: `User ${nextUser.user_id} has been booked into the session.` });
              });
            });
          } else {
            res.json({ message: 'No users in the waitlist for this session.' });
          }
        });
      });
    } else {
      res.status(400).json({ message: 'No bookings to cancel.' });
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
