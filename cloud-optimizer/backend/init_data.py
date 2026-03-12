"""
CloudOptimizer AI — init_data.py
=================================
One-time database seeding script. Run this ONCE before the demo.
To reset: delete ../data/cloud_optimizer.db and run again.
"""

import sys
import os
import random
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database  import CloudOptimizerDB
from simulator import TMSDataSimulator
from detector  import TwoStageAnomalyFilter
from predictor import CloudPredictor
from optimizer import IntegerPSOOptimizer, _BASELINE_COSTS

GREEN  = "\033[92m"; YELLOW = "\033[93m"; RED  = "\033[91m"
CYAN   = "\033[96m"; BOLD   = "\033[1m";  RESET = "\033[0m"

def ok(msg):     print(f"  {GREEN}[OK]{RESET}   {msg}")
def info(msg):   print(f"  {CYAN}[INFO]{RESET} {msg}")
def warn(msg):   print(f"  {YELLOW}[WARN]{RESET} {msg}")
def err(msg):    print(f"  {RED}[ERR]{RESET}  {msg}")
def header(msg): print(f"\n{BOLD}{CYAN}{msg}{RESET}")

DB_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "data", "cloud_optimizer.db"
)

COMPONENTS = {
    "paas_payment":  ["acu", "ram"],
    "iaas_webpage":  ["acu", "iops"],
    "saas_database": ["dtu", "storage"],
}

# Primary resource per component — used by optimizer
PRIMARY_RESOURCE = {
    "paas_payment":  "acu",
    "iaas_webpage":  "acu",
    "saas_database": "dtu",   # ← FIX: was defaulting to "acu" which doesn't exist
}

HOURS = 720


def _get_anomaly_count(result: dict) -> int:
    """
    FIX: the detector.py on disk returns different key names depending
    on version. Support both so init_data.py works regardless.
      New version: result['anomaly_count']
      Old version: result['anomaly_count'] OR len(result['anomalies'])
                   OR len(result['log'])
    """
    if "anomaly_count" in result:
        return result["anomaly_count"]
    if "anomalies" in result:
        return len(result["anomalies"])
    if "log" in result:
        return len(result["log"])
    return 0


def _get_total_points(result: dict) -> int:
    """Support both 'total_points' (new) and 'total' (old) key."""
    if "total_points" in result:
        return result["total_points"]
    if "total" in result:
        return result["total"]
    return 0


def _get_cleaned_values(result: dict) -> list:
    """Support both 'cleaned_values' (new) and 'cleaned' (old) key."""
    if "cleaned_values" in result:
        return result["cleaned_values"]
    if "cleaned" in result:
        return result["cleaned"]
    return []


def _make_timestamps(n: int) -> list:
    """
    FIX: original code produced '2026-01-01 100:00:00' for hour >= 24
    because it used {i:02d} as the hour field.
    Correct version: use a real base datetime + timedelta.
    """
    base = datetime(2026, 1, 1, 0, 0, 0)
    return [(base + timedelta(hours=i)).strftime("%Y-%m-%d %H:%M:%S")
            for i in range(n)]


def main():
    print(f"\n{BOLD}{'=' * 58}")
    print(f"  CloudOptimizer AI — Database Initialisation")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'=' * 58}{RESET}")

    # ── STEP 1: database ──────────────────────────────────────────────────────
    header("STEP 1 — Initialising database")
    try:
        db = CloudOptimizerDB(DB_PATH)
        ok(f"All 6 tables ready")
        info(f"DB: {os.path.abspath(DB_PATH)}")
    except Exception as e:
        err(f"Database init failed: {e}"); sys.exit(1)

    # ── STEP 2: simulate ──────────────────────────────────────────────────────
    header("STEP 2 — Generating simulated Azure SaaS data")
    try:
        sim = TMSDataSimulator()
        info(f"Generating {HOURS} hours × 6 resources ...")
        df = sim.generate_usage(hours=HOURS)
        ok(f"DataFrame shape: {df.shape}  ({HOURS} hrs × 6 resources)")
    except Exception as e:
        err(f"Simulation failed: {e}"); sys.exit(1)

    # ── STEP 3: raw_metrics ───────────────────────────────────────────────────
    header("STEP 3 — Saving raw data to raw_metrics")
    try:
        records = sim.to_db_records(df)
        db.insert_raw_batch(records)
        with db.get_conn() as conn:
            count = conn.execute("SELECT COUNT(*) FROM raw_metrics").fetchone()[0]
        ok(f"raw_metrics: {count:,} rows")
    except Exception as e:
        err(f"Raw insert failed: {e}"); sys.exit(1)

    # ── STEP 4: anomaly detection ─────────────────────────────────────────────
    # FIX 1: pass raw_series= directly from DataFrame (bypasses DB reload)
    # FIX 2: build proper timestamps using timedelta, not {i:02d} hour format
    # FIX 3: use _get_anomaly_count() to support both old/new detector keys
    header("STEP 4 — Running 2-stage anomaly filter on all 6 resources")
    det = TwoStageAnomalyFilter(db=db)
    total_anomalies = 0
    timestamps_720  = _make_timestamps(HOURS)   # proper timestamps for all 720 hrs

    for comp, resources in COMPONENTS.items():
        for res in resources:
            try:
                col = f"{comp}_{res}"
                if col not in df.columns:
                    warn(f"Column {col} not found — skipping"); continue

                # Build list of dicts with correct timestamps (not bare floats)
                # This avoids the broken timestamp synthesis inside detector._load_raw()
                raw_series_dicts = [
                    {"timestamp": timestamps_720[i], "value": float(df[col].iloc[i])}
                    for i in range(HOURS)
                ]

                result = det.run(
                    component=comp,
                    resource=res,
                    raw_series=raw_series_dicts,   # dicts with real timestamps
                )

                n_anom  = _get_anomaly_count(result)
                n_total = _get_total_points(result)
                pct     = round(n_anom / n_total * 100, 1) if n_total > 0 else 0.0
                total_anomalies += n_anom

                info(
                    f"{comp:20s} / {res:8s}  "
                    f"points={n_total:4d}  "
                    f"anomalies={n_anom:3d}  ({pct:.1f}%)"
                )
            except Exception as e:
                import traceback
                warn(f"Detection failed for {comp}/{res}: {e}")
                traceback.print_exc()

    ok(f"Anomaly detection complete — {total_anomalies} total anomalies")
    with db.get_conn() as conn:
        cm = conn.execute("SELECT COUNT(*) FROM cleaned_metrics").fetchone()[0]
        al = conn.execute("SELECT COUNT(*) FROM anomaly_log").fetchone()[0]
    info(f"cleaned_metrics: {cm:,}  |  anomaly_log: {al:,}")

    # ── STEP 5: ML predictions ────────────────────────────────────────────────
    header("STEP 5 — Training ML models & generating 168-hour forecasts")
    pred = CloudPredictor(db=db)

    for comp, resources in COMPONENTS.items():
        for res in resources:
            info(f"Training {comp} / {res} ...")
            try:
                result = pred.run(component=comp, resource=res)
                best = result["best_model"]
                rmse = result["rmse_table"][best]
                ok(f"  {comp:20s} / {res:8s}  best={best}  RMSE={rmse:.3f}  "
                   f"forecast={len(result['forecast'])} hrs")
            except Exception as e:
                warn(f"ML training failed for {comp}/{res}: {e}")

    # ── STEP 6: PSO optimisation ──────────────────────────────────────────────
    # FIX: use PRIMARY_RESOURCE per component so saas_database uses "dtu" not "acu"
    header("STEP 6 — Running PSO optimiser for all 3 components")
    opt = IntegerPSOOptimizer(db=db, n_particles=150, n_epochs=300)
    opt_results = {}

    for comp in ["paas_payment", "iaas_webpage", "saas_database"]:
        primary_res = PRIMARY_RESOURCE[comp]
        info(f"Optimising {comp} (resource={primary_res}) ...")
        try:
            result = opt.run(component=comp, resource=primary_res)
            opt_results[comp] = result
            ok(f"  {comp:20s}  baseline=${result['baseline_cost']:.2f}/mo  "
               f"optimised=${result['monthly_cost']:.2f}/mo  "
               f"savings={result['savings_pct']:.1f}%")
        except Exception as e:
            warn(f"PSO failed for {comp}: {e}")

    # ── STEP 7: cost tracking ─────────────────────────────────────────────────
    header("STEP 7 — Seeding 30-day cost tracking history")
    now = datetime.now(timezone.utc)
    random.seed(42)

    for comp in ["paas_payment", "iaas_webpage", "saas_database"]:
        baseline_hr  = _BASELINE_COSTS[comp]
        optimized_hr = opt_results.get(comp, {}).get("cost_per_hour", baseline_hr * 0.55)

        for h in range(HOURS, 0, -1):
            ts       = now - timedelta(hours=h)
            variance = random.uniform(0.92, 1.08)
            b_val    = round(baseline_hr  * variance, 6)
            o_val    = round(optimized_hr * variance, 6)
            s_val    = round(b_val - o_val, 6)
            s_pct    = round((s_val / b_val) * 100, 2) if b_val > 0 else 0.0

            db.insert_cost({
                "timestamp":      ts.strftime("%Y-%m-%d %H:%M:%S"),
                "component_type": comp,
                "baseline_cost":  b_val,
                "optimized_cost": o_val,
                "savings":        s_val,
                "savings_pct":    s_pct,
            })
        ok(f"  {comp:20s}  {HOURS} hourly tracking rows seeded")

    # ── FINAL SUMMARY ─────────────────────────────────────────────────────────
    header("DATABASE READY")
    print(f"  {'=' * 56}")
    tables = [
        "raw_metrics", "cleaned_metrics", "anomaly_log",
        "ml_predictions", "optimization_results", "cost_tracking",
    ]
    with db.get_conn() as conn:
        for t in tables:
            count = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            bar   = "=" * min(40, count // 100)
            print(f"  {t:25s}  {count:6,d} rows  {GREEN}{bar}{RESET}")

    print(f"\n  {GREEN}{BOLD}All tables populated. Run the demo!{RESET}")
    print(f"\n  Start backend:  {CYAN}uvicorn main:app --reload{RESET}")
    print(f"  Start frontend: {CYAN}npm start (from frontend/){RESET}")
    print(f"  API docs:       {CYAN}http://localhost:8000/docs{RESET}")
    print(f"  Dashboard:      {CYAN}http://localhost:3000{RESET}\n")


if __name__ == "__main__":
    main()