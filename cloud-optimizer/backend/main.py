"""
main.py — FastAPI Backend
==========================
CloudOptimizer AI  |  Layer 3: API Bridge

Endpoints:
    GET  /                        — Health check
    GET  /api/health              — DB connectivity
    GET  /api/live-metrics        — Current usage (polled every 5s by dashboard)
    GET  /api/anomaly-data        — Raw vs cleaned timeseries for chart
    GET  /api/cost-history        — Savings history for bar chart
    POST /api/detect              — Run anomaly detection only
    POST /api/predict             — Train ML + 168-hour forecast
    POST /api/optimize            — Run PSO optimizer
    POST /api/full-pipeline       — Detect → Predict → Optimize in one call
    GET  /api/anomalies           — Anomaly log
    GET  /api/predictions/{c}/{r} — Best model predictions
    GET  /api/optimization/{c}    — Active optimization config
    GET  /api/savings             — Cumulative savings summary

Run:
    pip install fastapi uvicorn scikit-learn numpy scipy
    uvicorn main:app --reload --port 8000
"""

import os, sys, uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

sys.path.insert(0, os.path.dirname(__file__))
from database  import CloudOptimizerDB
from simulator import TMSDataSimulator
from detector  import TwoStageAnomalyFilter
from predictor import CloudPredictor, MIN_TRAIN_ROWS
from optimizer import IntegerPSOOptimizer, TIER_CATALOG, CAPACITY_KEY, _BASELINE_COSTS

# ─────────────────────────────────────────────────────────────────────────────
# APP + SINGLETONS
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="CloudOptimizer AI", version="1.0.0",
              description="Anomaly Detection, ML Forecasting, PSO Cost Optimization.")

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "cloud_optimizer.db")
db  = CloudOptimizerDB(_DB_PATH)
sim = TMSDataSimulator()


# ─────────────────────────────────────────────────────────────────────────────
# PYDANTIC MODELS
# ─────────────────────────────────────────────────────────────────────────────

class RawMetricPoint(BaseModel):
    timestamp: str
    value: float

class DetectRequest(BaseModel):
    component: str = Field(..., example="paas_payment")
    resource:  str = Field(..., example="acu")
    raw_series: Optional[list[RawMetricPoint]] = None

class PredictRequest(BaseModel):
    component:      str = Field(..., example="paas_payment")
    resource:       str = Field(..., example="acu")
    cleaned_series: Optional[list[RawMetricPoint]] = None

class OptimizeRequest(BaseModel):
    component:        str   = Field(..., example="paas_payment")
    resource:         str   = Field(default="acu")
    demand_series:    Optional[list[float]] = None
    n_particles:      int   = Field(default=30,  ge=5,   le=500)
    n_epochs:         int   = Field(default=50,  ge=5,   le=1000)
    stability_factor: float = Field(default=0.4, ge=0.0, le=1.0)

class FullPipelineRequest(BaseModel):
    component:        str   = Field(..., example="paas_payment")
    resource:         str   = Field(..., example="acu")
    raw_series:       Optional[list[RawMetricPoint]] = None
    n_particles:      int   = Field(default=30,  ge=5,  le=500)
    n_epochs:         int   = Field(default=50,  ge=5,  le=1000)
    stability_factor: float = Field(default=0.4, ge=0.0, le=1.0)


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _to_dict(pts):
    return None if pts is None else [{"timestamp": p.timestamp, "value": p.value} for p in pts]

def _to_cleaned_dict(pts):
    return None if pts is None else [{"timestamp": p.timestamp, "cleaned_value": p.value} for p in pts]


# ─────────────────────────────────────────────────────────────────────────────
# HEALTH
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def root():
    return {"service": "CloudOptimizer AI", "version": "1.0.0", "status": "running",
            "endpoints": ["/api/live-metrics", "/api/anomaly-data", "/api/cost-history",
                          "/api/detect", "/api/predict", "/api/optimize", "/api/full-pipeline"]}

@app.get("/api/health", tags=["Health"])
def health():
    try: db.get_anomaly_count(); db_ok = True
    except: db_ok = False
    return {"database": "ok" if db_ok else "error",
            "timestamp": datetime.now(timezone.utc).isoformat()}


# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD ENDPOINTS (called by React frontend)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/live-metrics", tags=["Dashboard"])
def live_metrics():
    """
    Current simulated resource usage for all 3 components.
    Called every 5 seconds by the React Live Monitor tab.
    Produces a new reading on every call (microsecond seed variation).
    """
    c = sim.get_current_usage()
    return {
        "timestamp": c["timestamp"],
        "components": {
            "paas_payment":  {"acu": c["paas_payment_acu"],  "ram":  c["paas_payment_ram"]},
            "iaas_webpage":  {"acu": c["iaas_webpage_acu"],  "iops": c["iaas_webpage_iops"]},
            "saas_database": {"dtu": c["saas_database_dtu"], "storage": c["saas_database_storage"]},
        },
        "summary": {
            "avg_utilization": round((c["paas_payment_acu"] +
                                      c["iaas_webpage_acu"] +
                                      c["saas_database_dtu"]) / 3, 1),
            "components_count": 3,
            "resources_count":  6,
        },
    }


@app.get("/api/anomaly-data", tags=["Dashboard"])
def anomaly_data(
    component: str = Query(..., example="saas_database"),
    resource:  str = Query(..., example="dtu"),
    hours:     int = Query(default=168, ge=1, le=720),
):
    """
    Raw vs cleaned values + anomaly markers for the Anomaly Panel chart.
    Falls back to raw-only if detector hasn't run yet.
    """
    cleaned_rows = db.get_cleaned_data(component, resource, hours=hours)
    if cleaned_rows:
        return {
            "component": component, "resource": resource,
            "hours": hours, "has_cleaned": True,
            "data": [{"timestamp": r["timestamp"], "raw_value": r["raw_value"],
                      "cleaned_value": r["cleaned_value"], "was_anomaly": r["was_anomaly"],
                      "anomaly_score": r["anomaly_score"]} for r in cleaned_rows],
            "anomaly_count": sum(1 for r in cleaned_rows if r["was_anomaly"] == 1),
            "total_points":  len(cleaned_rows),
        }
    raw_rows = db.get_raw_data(component, resource, hours=hours)
    return {
        "component": component, "resource": resource,
        "hours": hours, "has_cleaned": False,
        "data": [{"timestamp": r["timestamp"], "raw_value": r["value"],
                  "cleaned_value": r["value"], "was_anomaly": 0,
                  "anomaly_score": 0.0} for r in raw_rows],
        "anomaly_count": 0, "total_points": len(raw_rows),
    }


@app.get("/api/cost-history", tags=["Dashboard"])
def cost_history(
    component_type: Optional[str] = Query(default=None, example="paas_payment"),
    days: int = Query(default=30, ge=1, le=365),
):
    """
    Baseline vs optimized cost history for the Cost Panel bar chart.
    Returns theoretical baseline estimate if optimizer hasn't run yet.
    """
    hours = days * 24
    rows  = db.get_cost_history(component_type, hours) if hasattr(db, "get_cost_history") else []
    if rows:
        total_b = sum(r["baseline_cost"] for r in rows)
        total_o = sum(r["optimized_cost"] for r in rows)
        total_s = sum(r["savings"] for r in rows)
        return {
            "component_type": component_type, "days": days, "has_data": True,
            "history": rows,
            "summary": {"total_baseline_cost": round(total_b, 2),
                        "total_optimized_cost": round(total_o, 2),
                        "total_savings": round(total_s, 2),
                        "avg_savings_pct": round(total_s / total_b * 100 if total_b else 0, 1)},
        }
    comps = [component_type] if component_type else list(_BASELINE_COSTS.keys())
    baseline_monthly = sum(_BASELINE_COSTS[c] * 24 * 30 for c in comps)
    return {
        "component_type": component_type, "days": days, "has_data": False, "history": [],
        "summary": {"total_baseline_cost": round(baseline_monthly, 2),
                    "total_optimized_cost": 0.0, "total_savings": 0.0, "avg_savings_pct": 0.0,
                    "note": "Run /api/optimize to generate real cost history"},
    }


# ─────────────────────────────────────────────────────────────────────────────
# PIPELINE ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/detect", tags=["Pipeline"])
def detect(request: DetectRequest):
    """Two-Stage Anomaly Filter. Saves to cleaned_metrics + anomaly_log."""
    try:
        result = TwoStageAnomalyFilter(db=db).run(
            component=request.component, resource=request.resource,
            raw_series=_to_dict(request.raw_series))
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"status": "success", "component": request.component,
            "resource": request.resource, "total_points": result["total"],
            "anomaly_count": result["anomaly_count"],
            "anomaly_rate_pct": round(result["anomaly_count"] / max(result["total"], 1) * 100, 2),
            "anomaly_indices": result["anomalies"][:50],
            "anomaly_log": result["log"][:10]}


@app.post("/api/predict", tags=["Pipeline"])
def predict(request: PredictRequest):
    """Train 4 ML models, pick best by RMSE, forecast 168 hours."""
    try:
        result = CloudPredictor(db=db).run(
            component=request.component, resource=request.resource,
            cleaned_series=_to_cleaned_dict(request.cleaned_series))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"status": "success", "run_id": result["run_id"],
            "component": request.component, "resource": request.resource,
            "best_model": result["best_model"], "rmse_table": result["rmse_table"],
            "feature_names": result["feature_names"],
            "forecast_hours": len(result["forecast"]),
            "forecast_preview": result["forecast"][:24]}


@app.post("/api/optimize", tags=["Pipeline"])
def optimize(request: OptimizeRequest):
    """Integer-PSO tier optimization. Supports all 3 components and 5 resources."""
    if request.component not in TIER_CATALOG:
        raise HTTPException(400, f"Unknown component. Valid: {list(TIER_CATALOG.keys())}")
    try:
        result = IntegerPSOOptimizer(db=db, n_particles=request.n_particles,
                                     n_epochs=request.n_epochs,
                                     stability_factor=request.stability_factor).run(
            component=request.component, resource=request.resource,
            demand_series=request.demand_series)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"status": "success", "opt_id": result["opt_id"],
            "component": result["component"], "resource": result["resource"],
            "cost_per_hour": result["cost_per_hour"],
            "monthly_cost": result["monthly_cost"],
            "baseline_cost": result["baseline_cost"],
            "savings_pct": result["savings_pct"],
            "tier_assignments": result["best_tiers"][:24],
            "pso_details": result["details"]}


@app.post("/api/full-pipeline", tags=["Pipeline"])
def full_pipeline(request: FullPipelineRequest):
    """Detect → Predict → Optimize in one call."""
    pipeline_id = f"pipeline_{uuid.uuid4().hex[:8]}"

    try:
        det_result = TwoStageAnomalyFilter(db=db).run(
            component=request.component, resource=request.resource,
            raw_series=_to_dict(request.raw_series))
    except Exception as e:
        raise HTTPException(500, f"[detect] {e}")

    cleaned_records = det_result.get("cleaned_records", [])
    if len(cleaned_records) < MIN_TRAIN_ROWS:
        raise HTTPException(400,
            f"Insufficient data: {len(cleaned_records)} rows (need {MIN_TRAIN_ROWS}).")

    try:
        pred_result = CloudPredictor(db=db).run(
            component=request.component, resource=request.resource,
            cleaned_series=cleaned_records)
    except Exception as e:
        raise HTTPException(500, f"[predict] {e}")

    try:
        opt_result = IntegerPSOOptimizer(db=db, n_particles=request.n_particles,
                                         n_epochs=request.n_epochs,
                                         stability_factor=request.stability_factor).run(
            component=request.component, resource=request.resource,
            demand_series=[f["predicted_value"] for f in pred_result["forecast"]])
    except Exception as e:
        raise HTTPException(500, f"[optimize] {e}")

    return {
        "status": "success", "pipeline_id": pipeline_id,
        "component": request.component, "resource": request.resource,
        "detect": {"total_points": det_result["total"],
                   "anomaly_count": det_result["anomaly_count"],
                   "anomaly_rate_pct": round(det_result["anomaly_count"] /
                                             max(det_result["total"], 1) * 100, 2)},
        "predict": {"run_id": pred_result["run_id"],
                    "best_model": pred_result["best_model"],
                    "rmse_table": pred_result["rmse_table"],
                    "forecast_hours": len(pred_result["forecast"]),
                    "forecast_preview": pred_result["forecast"][:24]},
        "optimize": {"opt_id": opt_result["opt_id"],
                     "cost_per_hour": opt_result["cost_per_hour"],
                     "monthly_cost": opt_result["monthly_cost"],
                     "baseline_cost": opt_result["baseline_cost"],
                     "savings_pct": opt_result["savings_pct"],
                     "tier_assignments": opt_result["best_tiers"][:24]},
    }


# ─────────────────────────────────────────────────────────────────────────────
# DATA READ ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/anomalies", tags=["Data"])
def get_anomalies(component: Optional[str] = None):
    return {"anomalies": db.get_anomalies(component), "count": db.get_anomaly_count(component)}

@app.get("/api/predictions/{component}/{resource}", tags=["Data"])
def get_predictions(component: str, resource: str):
    return {"predictions": db.get_best_predictions(component, resource),
            "component": component, "resource": resource}

@app.get("/api/optimization/{component}", tags=["Data"])
def get_optimization(component: str):
    result = db.get_active_optimization(component)
    if not result:
        raise HTTPException(404, f"No active optimization for '{component}'")
    return result

@app.get("/api/savings", tags=["Data"])
def get_savings(component: Optional[str] = None):
    return db.get_total_savings(component)
