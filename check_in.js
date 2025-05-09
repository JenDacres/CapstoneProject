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

/* const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'gym123',
  database: 'gym_checkin' //CHANGE DETAILS BEFORE RUNNING
}); */

db.connect((err) => {
  if (err) {
    console.error('MySQL connection error:', err);
  } else {
    console.log('Connected to MySQL database.');
  }
});

// Check-in route
app.post('/api/checkin', (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  const updateSql = 'UPDATE users SET monthly_checkins = monthly_checkins + 1 WHERE id = ?';

  db.query(updateSql, [user_id], (err, result) => {
    if (err) {
      console.error('Error updating check-in count:', err);
      return res.status(500).json({ message: 'Error during check-in.' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const insertSql = 'INSERT INTO active_checkins (user_id, checkin_time) VALUES (?, NOW())';
    db.query(insertSql, [user_id], (err) => {
      if (err) {
        console.error('Error inserting into active_checkins:', err);
        return res.status(500).json({ message: 'Error recording active check-in.' });
      }

      res.json({ message: 'Check-in successful!' });
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
