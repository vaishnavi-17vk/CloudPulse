"""Quick verification script — checks all tables and row counts."""
import sqlite3

conn = sqlite3.connect('../data/cloud_optimizer.db')

# List all tables and indexes
print("=" * 50)
print("DATABASE OBJECTS")
print("=" * 50)
rows = conn.execute(
    "SELECT type, name FROM sqlite_master WHERE type IN ('table','index') ORDER BY type, name"
).fetchall()
for r in rows:
    print(f"  {r[0]:8} | {r[1]}")

# Count rows in each table
print("\n" + "=" * 50)
print("ROW COUNTS")
print("=" * 50)
tables = [
    'raw_metrics', 'cleaned_metrics', 'anomaly_log',
    'ml_predictions', 'optimization_results', 'cost_tracking'
]
for t in tables:
    count = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    print(f"  {t:25} → {count} rows")

conn.close()
print("\nVerification complete!")
