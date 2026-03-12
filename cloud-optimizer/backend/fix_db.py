import sqlite3

conn = sqlite3.connect('../data/cloud_optimizer.db')

# Check current counts
print('raw_metrics:    ', conn.execute('SELECT COUNT(*) FROM raw_metrics').fetchone()[0])
print('cleaned_metrics:', conn.execute('SELECT COUNT(*) FROM cleaned_metrics').fetchone()[0])
print('anomaly_log:    ', conn.execute('SELECT COUNT(*) FROM anomaly_log').fetchone()[0])

print()
print('Anomalies per component/resource:')
rows = conn.execute('SELECT component, resource, COUNT(*) FROM anomaly_log GROUP BY component, resource').fetchall()
for r in rows:
    print(' ', r)

# Delete the 2024 test record
conn.execute("DELETE FROM anomaly_log WHERE timestamp = '2024-01-01 11:00:00'")
conn.commit()

print()
print('Test record deleted.')
print('anomaly_log rows remaining:', conn.execute('SELECT COUNT(*) FROM anomaly_log').fetchone()[0])

conn.close()