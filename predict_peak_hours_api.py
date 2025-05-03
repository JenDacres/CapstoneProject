from flask import Flask, jsonify
import pandas as pd
import mysql.connector
from sklearn.linear_model import LinearRegression
from datetime import datetime

app = Flask(__name__)

# Database connection details
DB_CONFIG = {
    'host': 'localhost',
    'user': 'admin',
    'password': 'uwigym',
    'database': 'myuwigym'
}

@app.route("/api/predict-peak-hours", methods=['GET'])
def predict_peak_hours():
    try:
        db = mysql.connector.connect(**DB_CONFIG)

        query = """
        SELECT check_in FROM gym_visits
        WHERE check_in IS NOT NULL AND check_in >= NOW() - INTERVAL 30 DAY
        """
        df = pd.read_sql(query, db)
        db.close()

        # Feature engineering
        df['hour'] = df['check_in'].dt.hour
        df['day_of_week'] = df['check_in'].dt.dayofweek
        df['count'] = 1

        grouped = df.groupby(['day_of_week', 'hour']).count().reset_index()
        X = grouped[['day_of_week', 'hour']]
        y = grouped['count']

        model = LinearRegression()
        model.fit(X, y)

        predictions = []
        for day in range(7):
            for hour in range(24):
                pred = model.predict([[day, hour]])[0]
                predictions.append({
                    'day': day,
                    'hour': hour,
                    'predicted_checkins': round(pred, 2)
                })

        return jsonify(predictions)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(port=5001, debug=True)
