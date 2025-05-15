const bodyParser = require('body-parser');
const mysql = require('mysql2');
const path = require('path');
const express = require('express');

module.exports = function (app) {
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

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'check_in.html'));
  });

  function calculatePriorityScore(waitTime, cancellations, checkinsThisMonth) {
    const membershipBonus = checkinsThisMonth > 10 ? 10 : 0;
    const cancellationPenalty = cancellations * 5;
    const minutesWaiting = Math.floor((Date.now() - new Date(waitTime)) / 60000);
    return (minutesWaiting * 2) + membershipBonus - cancellationPenalty;
  }

  app.post('/api/checkin', (req, res) => {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ message: 'User ID is required.' });
    }

    // Check if the user is already checked in
    const checkActiveSql = 'SELECT * FROM active_checkins WHERE user_id = ?';
    db.query(checkActiveSql, [user_id], (err, results) => {
      if (err) {
        console.error('Error checking active check-ins:', err);
        return res.status(500).json({ message: 'Error checking session status.' });
      }

      if (results.length > 0) {
        return res.status(400).json({ message: 'User is already checked in.' });
      }

      // Get the current time for session_time
      const session_time = new Date();

      // Update check-in count
      const updateSql = 'UPDATE users SET monthly_checkins = monthly_checkins + 1 WHERE user_id = ?';
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

          // Send basic success response
          return res.json({ message: 'Check-in successful!' });

        });
      });
    });
  });

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

  setInterval(() => {
    const sql = 'DELETE FROM active_checkins WHERE checkin_time < NOW() - INTERVAL 1 HOUR';
    db.query(sql, (err, result) => {
      if (err) {
        console.error('Error cleaning expired check-ins:', err);
      } else if (result.affectedRows > 0) {
        console.log(`Auto-removed ${result.affectedRows} expired check-ins.`);
      }
    });
  }, 5 * 60 * 1000);
};
