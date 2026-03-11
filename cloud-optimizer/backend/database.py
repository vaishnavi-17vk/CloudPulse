import sqlite3
import os
import json
from contextlib import contextmanager


class CloudOptimizerDB:
    """
    Database layer for CloudOptimizer AI.

    Manages all reads and writes to the SQLite database.
    No business logic — only data storage and retrieval.

    Based on: "Resource Usage Cost Optimization in Cloud Computing
    Using Machine Learning" (Osypanka & Nawrocki, 2022)

    Tables (6):
        1. raw_metrics          — ground truth hourly readings
        2. cleaned_metrics      — anomaly-filtered data for ML
        3. anomaly_log          — audit trail of detected spikes
        4. ml_predictions       — forecasts from 4 ML models
        5. optimization_results — PSO-optimized Azure configs
        6. cost_tracking        — hour-by-hour savings log

    Indexes (4):
        idx_raw_ts_comp, idx_clean_comp_res,
        idx_pred_run, idx_cost_ts_comp
    """

    def __init__(self, db_path='../data/cloud_optimizer.db'):
        """Initialize database: create data/ folder, create schema, print status."""
        self.db_path = db_path

        # Create the data/ folder if it doesn't exist
        db_folder = os.path.dirname(self.db_path)
        if db_folder:
            os.makedirs(db_folder, exist_ok=True)

        # Create all tables and indexes on startup
        self.init_schema()

        print("Database initialized successfully!")
        print(f"DB file: {os.path.abspath(db_path)}")

    # ==========================================================
    # CONNECTION MANAGEMENT
    # ==========================================================

    @contextmanager
    def get_conn(self):
        """Open a connection, yield it, commit on success, rollback on error, always close."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    # ==========================================================
    # SCHEMA CREATION
    # ==========================================================

    def init_schema(self):
        """Create all 6 tables and 4 indexes. Safe to call multiple times."""
        with self.get_conn() as conn:
            conn.executescript("""

                -- =============================================
                -- TABLE 1: raw_metrics
                -- Ground truth — every data point as received
                -- =============================================
                CREATE TABLE IF NOT EXISTS raw_metrics (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp   TEXT NOT NULL,
                    component   TEXT NOT NULL,
                    resource    TEXT NOT NULL,
                    value       REAL NOT NULL,
                    source      TEXT DEFAULT 'simulated',
                    UNIQUE(timestamp, component, resource)
                );

                -- =============================================
                -- TABLE 2: cleaned_metrics
                -- Data after anomaly filtering (ML trains here)
                -- =============================================
                CREATE TABLE IF NOT EXISTS cleaned_metrics (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp       TEXT NOT NULL,
                    component       TEXT NOT NULL,
                    resource        TEXT NOT NULL,
                    raw_value       REAL NOT NULL,
                    cleaned_value   REAL NOT NULL,
                    was_anomaly     INTEGER DEFAULT 0,
                    anomaly_score   REAL DEFAULT 0,
                    UNIQUE(timestamp, component, resource)
                );

                -- =============================================
                -- TABLE 3: anomaly_log
                -- Audit trail of every detected anomaly
                -- NO UNIQUE constraint — anomalies are always
                -- new events and should never be blocked
                -- =============================================
                CREATE TABLE IF NOT EXISTS anomaly_log (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp       TEXT NOT NULL,
                    component       TEXT NOT NULL,
                    resource        TEXT NOT NULL,
                    anomalous_value REAL NOT NULL,
                    replacement     REAL NOT NULL,
                    anomaly_type    TEXT
                );

                -- =============================================
                -- TABLE 4: ml_predictions
                -- Forecasts from all 4 ML models
                -- UNIQUE constraint prevents duplicate predictions
                -- for the same (run + component + resource + time + model)
                -- =============================================
                CREATE TABLE IF NOT EXISTS ml_predictions (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id           TEXT NOT NULL,
                    component        TEXT NOT NULL,
                    resource         TEXT NOT NULL,
                    target_timestamp TEXT NOT NULL,
                    predicted_value  REAL NOT NULL,
                    model_name       TEXT NOT NULL,
                    is_best          INTEGER DEFAULT 0,
                    UNIQUE(run_id, component, resource, target_timestamp, model_name)
                );

                -- =============================================
                -- TABLE 5: optimization_results
                -- PSO optimization outputs (cheapest Azure configs)
                -- =============================================
                CREATE TABLE IF NOT EXISTS optimization_results (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    opt_id           TEXT NOT NULL UNIQUE,
                    component_type   TEXT NOT NULL,
                    selected_configs TEXT NOT NULL,
                    cost_per_hour    REAL NOT NULL,
                    monthly_cost     REAL NOT NULL,
                    baseline_cost    REAL NOT NULL,
                    savings_pct      REAL NOT NULL,
                    valid_from       TEXT NOT NULL,
                    valid_until      TEXT
                );

                -- =============================================
                -- TABLE 6: cost_tracking
                -- Hour-by-hour cost savings log
                -- =============================================
                CREATE TABLE IF NOT EXISTS cost_tracking (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp       TEXT NOT NULL,
                    component_type  TEXT NOT NULL,
                    baseline_cost   REAL NOT NULL,
                    optimized_cost  REAL NOT NULL,
                    savings         REAL NOT NULL,
                    savings_pct     REAL NOT NULL,
                    UNIQUE(timestamp, component_type)
                );

                -- =============================================
                -- INDEXES — speed up common queries
                -- =============================================

                CREATE INDEX IF NOT EXISTS idx_raw_ts_comp
                    ON raw_metrics(timestamp, component);

                CREATE INDEX IF NOT EXISTS idx_clean_comp_res
                    ON cleaned_metrics(component, resource, timestamp);

                CREATE INDEX IF NOT EXISTS idx_pred_run
                    ON ml_predictions(run_id, target_timestamp);

                CREATE INDEX IF NOT EXISTS idx_cost_ts_comp
                    ON cost_tracking(timestamp, component_type);
            """)

    # ==========================================================
    # TABLE 1: raw_metrics — INSERT & READ
    # ==========================================================

    def insert_raw_batch(self, records):
        """Insert raw metric readings. Silently skips duplicates via INSERT OR IGNORE."""
        with self.get_conn() as conn:
            conn.executemany(
                """INSERT OR IGNORE INTO raw_metrics
                   (timestamp, component, resource, value, source)
                   VALUES (:timestamp, :component, :resource, :value, :source)""",
                records
            )

    def get_raw_data(self, component, resource, hours=720):
        """Get the most recent raw readings. Returns list of dicts ordered by timestamp ASC."""
        with self.get_conn() as conn:
            rows = conn.execute(
                """SELECT timestamp, value FROM raw_metrics
                   WHERE component = ? AND resource = ?
                   ORDER BY timestamp ASC
                   LIMIT ?""",
                (component, resource, hours)
            ).fetchall()
        return [dict(row) for row in rows]

    # ==========================================================
    # TABLE 2: cleaned_metrics — INSERT & READ
    # ==========================================================

    def insert_cleaned_batch(self, records):
        """Insert or replace cleaned metric readings. Updates existing rows on conflict."""
        with self.get_conn() as conn:
            conn.executemany(
                """INSERT OR REPLACE INTO cleaned_metrics
                   (timestamp, component, resource, raw_value,
                    cleaned_value, was_anomaly, anomaly_score)
                   VALUES (:timestamp, :component, :resource, :raw_value,
                           :cleaned_value, :was_anomaly, :anomaly_score)""",
                records
            )

    def get_cleaned_data(self, component, resource, hours=720):
        """Get cleaned readings. Returns list of dicts ordered by timestamp ASC."""
        with self.get_conn() as conn:
            rows = conn.execute(
                """SELECT timestamp, raw_value, cleaned_value, was_anomaly
                   FROM cleaned_metrics
                   WHERE component = ? AND resource = ?
                   ORDER BY timestamp ASC
                   LIMIT ?""",
                (component, resource, hours)
            ).fetchall()
        return [dict(row) for row in rows]

    # ==========================================================
    # TABLE 3: anomaly_log — INSERT & READ
    # ==========================================================

    def insert_anomaly(self, record):
        """Log a single detected anomaly. Plain INSERT — anomalies are always new events."""
        with self.get_conn() as conn:
            conn.execute(
                """INSERT INTO anomaly_log
                   (timestamp, component, resource,
                    anomalous_value, replacement, anomaly_type)
                   VALUES (:timestamp, :component, :resource,
                           :anomalous_value, :replacement, :anomaly_type)""",
                record
            )

    def get_anomalies(self, component=None):
        """Get anomaly log entries. Filter by component or get all. Returns list of dicts."""
        with self.get_conn() as conn:
            if component:
                rows = conn.execute(
                    """SELECT * FROM anomaly_log
                       WHERE component = ?
                       ORDER BY timestamp DESC""",
                    (component,)
                ).fetchall()
            else:
                rows = conn.execute(
                    """SELECT * FROM anomaly_log
                       ORDER BY timestamp DESC"""
                ).fetchall()
        return [dict(row) for row in rows]

    def get_anomaly_count(self, component=None):
        """Get the total number of anomalies. Returns an integer."""
        with self.get_conn() as conn:
            if component:
                row = conn.execute(
                    "SELECT COUNT(*) FROM anomaly_log WHERE component = ?",
                    (component,)
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT COUNT(*) FROM anomaly_log"
                ).fetchone()
        return int(row[0])

    # ==========================================================
    # TABLE 4: ml_predictions — INSERT & READ
    # ==========================================================

    def insert_predictions(self, records):
        """Insert ML predictions. Uses INSERT OR REPLACE to update on duplicate keys."""
        with self.get_conn() as conn:
            conn.executemany(
                """INSERT OR REPLACE INTO ml_predictions
                   (run_id, component, resource, target_timestamp,
                    predicted_value, model_name, is_best)
                   VALUES (:run_id, :component, :resource, :target_timestamp,
                           :predicted_value, :model_name, :is_best)""",
                records
            )

    def get_best_predictions(self, component, resource):
        """Get predictions from the best model only (is_best=1). Returns list of dicts."""
        with self.get_conn() as conn:
            rows = conn.execute(
                """SELECT target_timestamp, predicted_value, model_name
                   FROM ml_predictions
                   WHERE component = ? AND resource = ? AND is_best = 1
                   ORDER BY target_timestamp ASC""",
                (component, resource)
            ).fetchall()
        return [dict(row) for row in rows]

    def get_all_predictions(self, component, resource, run_id=None):
        """Get all predictions for a component+resource. Optionally filter by run_id."""
        with self.get_conn() as conn:
            if run_id:
                rows = conn.execute(
                    """SELECT * FROM ml_predictions
                       WHERE component = ? AND resource = ? AND run_id = ?
                       ORDER BY model_name, target_timestamp ASC""",
                    (component, resource, run_id)
                ).fetchall()
            else:
                rows = conn.execute(
                    """SELECT * FROM ml_predictions
                       WHERE component = ? AND resource = ?
                       ORDER BY model_name, target_timestamp ASC""",
                    (component, resource)
                ).fetchall()
        return [dict(row) for row in rows]

    # ==========================================================
    # TABLE 5: optimization_results — INSERT & READ
    # ==========================================================

    def insert_optimization(self, record):
        """Insert a new PSO result. Deactivates old config first, then inserts new one."""
        with self.get_conn() as conn:
            # Step 1: Deactivate the previous active config for this component
            conn.execute(
                """UPDATE optimization_results
                   SET valid_until = datetime('now')
                   WHERE component_type = ? AND valid_until IS NULL""",
                (record['component_type'],)
            )
            # Step 2: Insert the new active config (valid_until starts as NULL)
            conn.execute(
                """INSERT OR REPLACE INTO optimization_results
                   (opt_id, component_type, selected_configs,
                    cost_per_hour, monthly_cost, baseline_cost,
                    savings_pct, valid_from, valid_until)
                   VALUES (:opt_id, :component_type, :selected_configs,
                           :cost_per_hour, :monthly_cost, :baseline_cost,
                           :savings_pct, :valid_from, NULL)""",
                record
            )

    def get_active_optimization(self, component_type):
        """Get the currently active config (valid_until IS NULL). Returns dict or None."""
        with self.get_conn() as conn:
            row = conn.execute(
                """SELECT * FROM optimization_results
                   WHERE component_type = ? AND valid_until IS NULL
                   ORDER BY valid_from DESC LIMIT 1""",
                (component_type,)
            ).fetchone()
        return dict(row) if row else None

    def get_optimization_history(self, component_type):
        """Get full optimization history for a component. Returns list of dicts."""
        with self.get_conn() as conn:
            rows = conn.execute(
                """SELECT * FROM optimization_results
                   WHERE component_type = ?
                   ORDER BY valid_from DESC""",
                (component_type,)
            ).fetchall()
        return [dict(row) for row in rows]

    # ==========================================================
    # TABLE 6: cost_tracking — INSERT & READ
    # ==========================================================

    def insert_cost(self, record):
        """Insert or replace a single hourly cost record. Safe to re-run."""
        with self.get_conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO cost_tracking
                   (timestamp, component_type, baseline_cost,
                    optimized_cost, savings, savings_pct)
                   VALUES (:timestamp, :component_type, :baseline_cost,
                           :optimized_cost, :savings, :savings_pct)""",
                record
            )

    def get_cost_history(self, component_type, days=30):
        """Get daily cost savings grouped by date. Returns list of dicts."""
        with self.get_conn() as conn:
            rows = conn.execute(
                """SELECT date(timestamp) as date,
                          SUM(savings) * 24 as daily_savings,
                          AVG(savings_pct) as avg_pct
                   FROM cost_tracking
                   WHERE component_type = ?
                   GROUP BY date(timestamp)
                   ORDER BY date DESC
                   LIMIT ?""",
                (component_type, days)
            ).fetchall()
        return [dict(row) for row in rows]

    def get_total_savings(self, component_type=None):
        """Get total cumulative savings. Filter by component or get all. Returns dict."""
        with self.get_conn() as conn:
            if component_type:
                row = conn.execute(
                    """SELECT SUM(savings) as total_savings,
                              AVG(savings_pct) as avg_savings_pct
                       FROM cost_tracking
                       WHERE component_type = ?""",
                    (component_type,)
                ).fetchone()
            else:
                row = conn.execute(
                    """SELECT SUM(savings) as total_savings,
                              AVG(savings_pct) as avg_savings_pct
                       FROM cost_tracking"""
                ).fetchone()
        return dict(row) if row else {'total_savings': 0, 'avg_savings_pct': 0}


# ==============================================================
# TEST BLOCK — run with: python database.py
# ==============================================================
if __name__ == '__main__':

    # ---- FRESH START: delete old .db and recreate ----
    db_file = '../data/cloud_optimizer.db'
    if os.path.exists(db_file):
        os.remove(db_file)

    db = CloudOptimizerDB(db_file)

    # ---- Test 1: raw_metrics ----
    test_raw = [{
        'timestamp': '2024-01-01 10:00:00',
        'component': 'saas_database',
        'resource': 'dtu',
        'value': 67.5,
        'source': 'simulated'
    }]
    db.insert_raw_batch(test_raw)
    result1 = db.get_raw_data('saas_database', 'dtu')
    # Insert same record again — should be silently ignored
    db.insert_raw_batch(test_raw)
    result2 = db.get_raw_data('saas_database', 'dtu')
    assert len(result1) == 1, "raw_metrics: expected 1 row"
    assert len(result2) == 1, "raw_metrics: duplicate was NOT blocked"
    print("[raw_metrics]          PASS — 1 row, duplicate blocked")

    # ---- Test 2: cleaned_metrics ----
    test_cleaned = [{
        'timestamp': '2024-01-01 10:00:00',
        'component': 'saas_database',
        'resource': 'dtu',
        'raw_value': 67.5,
        'cleaned_value': 65.0,
        'was_anomaly': 0,
        'anomaly_score': 2.5
    }]
    db.insert_cleaned_batch(test_cleaned)
    result = db.get_cleaned_data('saas_database', 'dtu')
    assert len(result) == 1, "cleaned_metrics: expected 1 row"
    print("[cleaned_metrics]      PASS")

    # ---- Test 3: anomaly_log ----
    test_anomaly = {
        'timestamp': '2024-01-01 11:00:00',
        'component': 'paas_payment',
        'resource': 'acu',
        'anomalous_value': 94.7,
        'replacement': 33.2,
        'anomaly_type': 'severe'
    }
    db.insert_anomaly(test_anomaly)
    anomalies = db.get_anomalies('paas_payment')
    count = db.get_anomaly_count('paas_payment')
    assert len(anomalies) == 1, "anomaly_log: expected 1 row"
    assert count == 1, "anomaly_log: count should be 1"
    print(f"[anomaly_log]          PASS — count: {count}")

    # ---- Test 4: ml_predictions ----
    test_predictions = [
        {
            'run_id': 'test_run_001',
            'component': 'saas_database',
            'resource': 'dtu',
            'target_timestamp': '2024-01-02 10:00:00',
            'predicted_value': 69.8,
            'model_name': 'BL',
            'is_best': 0
        },
        {
            'run_id': 'test_run_001',
            'component': 'saas_database',
            'resource': 'dtu',
            'target_timestamp': '2024-01-02 10:00:00',
            'predicted_value': 71.2,
            'model_name': 'DF',
            'is_best': 1
        }
    ]
    db.insert_predictions(test_predictions)
    # Insert the SAME records again — should replace, not duplicate
    db.insert_predictions(test_predictions)
    best = db.get_best_predictions('saas_database', 'dtu')
    all_preds = db.get_all_predictions('saas_database', 'dtu', run_id='test_run_001')
    assert len(best) == 1, "ml_predictions: expected 1 best row"
    assert best[0]['model_name'] == 'DF', "ml_predictions: best should be DF"
    assert len(all_preds) == 2, "ml_predictions: expected 2 total rows (not duplicated)"
    print(f"[ml_predictions]       PASS — best model: {best[0]['model_name']}, {len(best)} row")

    # ---- Test 5: optimization_results ----
    test_opt_1 = {
        'opt_id': 'opt_saas_db_v1',
        'component_type': 'saas_database',
        'selected_configs': json.dumps([{"name": "S1", "count": 1, "price": 0.20}]),
        'cost_per_hour': 0.20,
        'monthly_cost': 144.0,
        'baseline_cost': 935.0,
        'savings_pct': 84.6,
        'valid_from': '2024-01-01 00:00:00'
    }
    db.insert_optimization(test_opt_1)
    active1 = db.get_active_optimization('saas_database')
    assert active1 is not None, "optimization: should have active config"
    assert active1['valid_until'] is None, "optimization: active should have valid_until=None"

    # Insert a SECOND optimization — should deactivate the first
    test_opt_2 = {
        'opt_id': 'opt_saas_db_v2',
        'component_type': 'saas_database',
        'selected_configs': json.dumps([{"name": "S2", "count": 1, "price": 0.10}]),
        'cost_per_hour': 0.10,
        'monthly_cost': 72.0,
        'baseline_cost': 935.0,
        'savings_pct': 92.3,
        'valid_from': '2024-01-15 00:00:00'
    }
    db.insert_optimization(test_opt_2)
    active2 = db.get_active_optimization('saas_database')
    history = db.get_optimization_history('saas_database')
    assert active2['opt_id'] == 'opt_saas_db_v2', "optimization: active should be v2"
    assert active2['valid_until'] is None, "optimization: new active has valid_until=None"
    assert len(history) == 2, "optimization: history should have 2 entries"
    assert history[1]['valid_until'] is not None, "optimization: old config should be deactivated"
    print(f"[optimization_results] PASS — history: {len(history)}, active: 1")

    # ---- Test 6: cost_tracking ----
    test_costs = [
        {
            'timestamp': '2024-01-01 14:00:00',
            'component_type': 'saas_database',
            'baseline_cost': 0.935,
            'optimized_cost': 0.020,
            'savings': 0.915,
            'savings_pct': 97.8
        },
        {
            'timestamp': '2024-01-02 14:00:00',
            'component_type': 'saas_database',
            'baseline_cost': 0.935,
            'optimized_cost': 0.018,
            'savings': 0.917,
            'savings_pct': 98.1
        }
    ]
    for cost in test_costs:
        db.insert_cost(cost)
    # Insert first record again — should replace, not duplicate
    db.insert_cost(test_costs[0])
    cost_history = db.get_cost_history('saas_database')
    total = db.get_total_savings('saas_database')
    assert len(cost_history) == 2, "cost_tracking: expected 2 daily records, not 3"
    print("[cost_tracking]        PASS")

    # ---- FINAL SUMMARY ----
    print("============================================")
    print("ALL TESTS PASSED — database.py is complete")
    print("============================================")
    print(f"DB file: {os.path.abspath(db_file)}")
    print("Open DB Browser to visually inspect all 6 tables")
    print("You are ready to build simulator.py next")
