"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  Kaushal Drishty — Labour Market Intelligence System (LMIS)                ║
║  Backend API for the Ministry of Skill Development & Entrepreneurship      ║
║                                                                            ║
║  This module implements a demand-supply intelligence engine that fuses      ║
║  three heterogeneous labour-market data sources into a single, normalised  ║
║  "Demand Severity Score" (DSS) per NSQF-aligned job role. The score        ║
║  drives early-warning alerts and scheme target-setting recommendations.    ║
║                                                                            ║
║  Data Sources (mock, production would use live APIs):                       ║
║    1. NCS Portal — National Career Service job postings                    ║
║    2. e-Shram    — Unorganised worker registrations (supply proxy)         ║
║    3. LinkedIn   — Private-sector demand signals via scraping/API          ║
║                                                                            ║
║  Mathematical Methodology: see docstring on `calculate_demand_index()`     ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  APP INITIALISATION & CORS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app = FastAPI(
    title="Kaushal Drishty LMIS API",
    version="1.0.0",
    description=(
        "Labour Market Intelligence System — fuses NCS, e-Shram, and "
        "LinkedIn data into actionable demand-supply analytics for the "
        "Ministry of Skill Development & Entrepreneurship."
    ),
)

# Allow the Vite React frontend (default port 5173) and any government
# sub-domain to call this API without CORS blocks.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",      # Vite dev server
        "http://localhost:3000",      # alternate dev server
        "https://kaushaldrishty.gov.in",   # production domain (placeholder)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PYDANTIC RESPONSE SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class RoleScore(BaseModel):
    """Individual job-role demand assessment."""

    nsqf_role: str = Field(..., description="NSQF-aligned job role title")
    nsqf_level: int = Field(..., ge=1, le=10, description="NSQF qualification level (1-10)")
    sector: str = Field(..., description="Sector Skill Council mapping")

    # Raw source values
    ncs_job_postings: int = Field(..., description="Active vacancies on NCS portal")
    e_shram_registrations: int = Field(..., description="Registered workers in this trade on e-Shram")
    linkedin_job_signals: int = Field(..., description="LinkedIn job postings / demand signals")

    # Normalised scores (0-1 range)
    ncs_normalised: float = Field(..., description="Min-max normalised NCS score")
    e_shram_normalised: float = Field(..., description="Inverse-normalised e-Shram score (supply proxy)")
    linkedin_normalised: float = Field(..., description="Min-max normalised LinkedIn score")

    # Final composite
    demand_severity_score: float = Field(
        ..., ge=1.0, le=10.0,
        description="Weighted composite Demand Severity Score (1=low, 10=critical)"
    )
    demand_label: str = Field(..., description="Human-readable severity label")
    recommendation: str = Field(..., description="Policy recommendation for scheme planners")


class DemandIndexResponse(BaseModel):
    """Response envelope for /api/v1/demand-index."""

    api_version: str = "1.0.0"
    generated_at: str
    methodology_version: str = "DSS-v1.0"
    data_sources: list[str]
    total_roles_analysed: int
    roles: list[RoleScore]


class TargetSettingRow(BaseModel):
    """Flat row for direct ingestion into scheme target-setting workflows."""

    nsqf_role: str
    nsqf_level: int
    sector: str
    demand_severity_score: float
    demand_label: str
    recommended_annual_target: int = Field(
        ..., description="Suggested annual training target (seats)"
    )
    current_estimated_supply: int
    estimated_industry_demand: int
    gap: int = Field(..., description="Demand minus supply — positive = deficit")
    priority_rank: int = Field(..., description="1 = highest priority")
    recommendation: str
    fiscal_year: str


class TargetSettingResponse(BaseModel):
    """Response envelope for /api/v1/export/target-setting."""

    api_version: str = "1.0.0"
    generated_at: str
    fiscal_year: str
    total_roles: int
    export_format: str = "flat_json"
    rows: list[TargetSettingRow]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MOCK DATA SOURCES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# In production these would be live API calls or database queries.
# Each source provides a dict mapping NSQF role → numeric signal.

def _get_ncs_portal_jobs() -> dict[str, dict[str, Any]]:
    """
    Source 1 — National Career Service (NCS) Portal
    ------------------------------------------------
    Represents *formal* labour demand: government and private job postings
    filed through the NCS portal.  Higher value ⟹ greater employer demand.
    """
    return {
        "Solar PV Installer": {
            "postings": 12400, "sector": "Green Energy", "nsqf_level": 4,
        },
        "Drone Pilot / Technician": {
            "postings": 8900, "sector": "Green Energy", "nsqf_level": 5,
        },
        "Electronics Mechanic": {
            "postings": 6200, "sector": "Electronics", "nsqf_level": 4,
        },
        "IoT Technician": {
            "postings": 9800, "sector": "Electronics", "nsqf_level": 5,
        },
        "Warehouse Operations Associate": {
            "postings": 7100, "sector": "Logistics", "nsqf_level": 3,
        },
        "EV Battery Technician": {
            "postings": 11200, "sector": "Green Energy", "nsqf_level": 5,
        },
        "General Duty Assistant (Healthcare)": {
            "postings": 14500, "sector": "Healthcare", "nsqf_level": 4,
        },
        "Medical Lab Technician": {
            "postings": 10300, "sector": "Healthcare", "nsqf_level": 6,
        },
        "Data Entry Operator": {
            "postings": 2100, "sector": "IT / ITES", "nsqf_level": 3,
        },
        "Full-Stack Developer": {
            "postings": 13800, "sector": "IT / ITES", "nsqf_level": 7,
        },
        "AI/ML Engineer": {
            "postings": 15200, "sector": "IT / ITES", "nsqf_level": 8,
        },
        "Cybersecurity Analyst": {
            "postings": 11700, "sector": "IT / ITES", "nsqf_level": 7,
        },
    }


def _get_e_shram_registrations() -> dict[str, int]:
    """
    Source 2 — e-Shram Unorganised Worker Database
    -----------------------------------------------
    Represents *available supply*: the number of workers registered in each
    trade on the e-Shram portal.  A HIGH registration count relative to
    demand signals indicates oversupply; a LOW count indicates shortage.

    Note: this is an INVERSE signal — more registrations ⟹ lower demand
    severity (the market is already saturated with trained workers).
    """
    return {
        "Solar PV Installer": 3200,
        "Drone Pilot / Technician": 1100,
        "Electronics Mechanic": 8500,
        "IoT Technician": 2400,
        "Warehouse Operations Associate": 5600,
        "EV Battery Technician": 1800,
        "General Duty Assistant (Healthcare)": 4200,
        "Medical Lab Technician": 2900,
        "Data Entry Operator": 42000,   # massive oversupply
        "Full-Stack Developer": 6100,
        "AI/ML Engineer": 2200,
        "Cybersecurity Analyst": 3100,
    }


def _get_linkedin_scraping() -> dict[str, int]:
    """
    Source 3 — LinkedIn Private-Sector Demand Signals
    --------------------------------------------------
    Represents *private-sector / emerging* demand: job postings and hiring
    activity scraped (or accessed via LinkedIn's API) from the platform.
    Higher values ⟹ stronger private-sector demand.

    This source captures demand that may NOT appear on NCS — startups,
    MNCs, and the gig economy.
    """
    return {
        "Solar PV Installer": 8700,
        "Drone Pilot / Technician": 7200,
        "Electronics Mechanic": 3100,
        "IoT Technician": 6400,
        "Warehouse Operations Associate": 4800,
        "EV Battery Technician": 9300,
        "General Duty Assistant (Healthcare)": 5600,
        "Medical Lab Technician": 7800,
        "Data Entry Operator": 800,     # almost no private-sector demand
        "Full-Stack Developer": 14200,
        "AI/ML Engineer": 16500,
        "Cybersecurity Analyst": 12100,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CORE ALGORITHM — DEMAND SEVERITY SCORE (DSS)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def calculate_demand_index(
    ncs_data: dict[str, dict[str, Any]],
    e_shram_data: dict[str, int],
    linkedin_data: dict[str, int],
) -> list[dict[str, Any]]:
    """
    Compute the Demand Severity Score (DSS) for every NSQF job role.

    ╔════════════════════════════════════════════════════════════════════════╗
    ║                  DOCUMENTED METHODOLOGY  (DSS v1.0)                  ║
    ╚════════════════════════════════════════════════════════════════════════╝

    OVERVIEW
    --------
    The DSS is a weighted composite index that fuses three heterogeneous
    data sources into a single 1-10 severity score.  The score answers the
    question: "How urgently does the skilling ecosystem need to scale up
    training for this particular NSQF role?"

    A score of 10 means CRITICAL demand (severe shortage of trained workers).
    A score of 1 means LOW demand (market is saturated / oversupplied).

    STEP 1 — MIN-MAX NORMALISATION
    --------------------------------
    Each raw signal is normalised to the [0, 1] range using standard
    min-max scaling across all roles:

        normalised(x) = (x - x_min) / (x_max - x_min)

    This ensures all three sources are on a comparable scale regardless
    of their original units (postings vs registrations).

    IMPORTANT: e-Shram registrations represent SUPPLY, not demand.
    We therefore INVERT the normalisation:

        e_shram_normalised(x) = 1 - (x - x_min) / (x_max - x_min)

    This means: fewer registrations → score closer to 1 (high shortage) →
    contributes more to overall demand severity.

    STEP 2 — WEIGHTED COMBINATION
    --------------------------------
    The three normalised signals are combined using a weighted average
    with the following rationale:

        W_ncs      = 0.40   (40%)  — Government job portal; most reliable,
                                      covers formal economy demand.
        W_linkedin = 0.35   (35%)  — Private-sector / emerging demand;
                                      captures gig economy & MNC hiring.
        W_e_shram  = 0.25   (25%)  — Supply-side inverse proxy; tempers the
                                      score when ample workers already exist.

    Composite = W_ncs × NCS_norm + W_linkedin × LI_norm + W_e_shram × eS_norm

    These weights were calibrated based on:
      • Data coverage: NCS has the widest NSQF-aligned role taxonomy.
      • Signal freshness: LinkedIn postings update daily vs monthly on NCS.
      • Inverse nature: e-Shram is a dampener, so it receives less weight
        to avoid over-penalising roles with high registrations that may
        still face genuine demand.

    STEP 3 — SCALING TO 1-10 RANGE
    --------------------------------
    The raw composite (range 0-1) is scaled to [1, 10]:

        DSS = 1 + composite × 9

    We then apply a mild sigmoid squeeze to prevent extreme clustering
    at the boundaries.  The logistic transform centres scores around the
    midpoint for more discriminative power:

        adjusted = 1 / (1 + e^(-k × (DSS - midpoint)))
        final_DSS = 1 + adjusted × 9

    where k = 1.8 (steepness) and midpoint = 5.5.

    STEP 4 — LABELLING & RECOMMENDATIONS
    ----------------------------------------
        DSS ≥ 8.0  →  "Critical"     →  "Increase Target Allocation urgently"
        DSS ≥ 6.0  →  "High"         →  "Expand training capacity"
        DSS ≥ 4.0  →  "Moderate"     →  "Monitor and review next quarter"
        DSS ≥ 2.5  →  "Low"          →  "Maintain current allocation"
        DSS <  2.5 →  "Oversupplied" →  "Freeze Batch Sanctions"

    Parameters
    ----------
    ncs_data : dict
        NCS portal job postings keyed by role name.
    e_shram_data : dict
        e-Shram registrations keyed by role name.
    linkedin_data : dict
        LinkedIn demand signals keyed by role name.

    Returns
    -------
    list[dict]
        List of role-level demand assessments with all intermediate values.
    """

    # ── STEP 0: Collect all role names present in ANY source ──────────────
    all_roles = sorted(
        set(ncs_data.keys()) | set(e_shram_data.keys()) | set(linkedin_data.keys())
    )

    # ── STEP 1a: Extract raw numeric arrays for min-max normalisation ────
    # We need global min/max across all roles for each source.
    ncs_values = [ncs_data[r]["postings"] for r in all_roles if r in ncs_data]
    e_shram_values = [e_shram_data[r] for r in all_roles if r in e_shram_data]
    linkedin_values = [linkedin_data[r] for r in all_roles if r in linkedin_data]

    # Compute min and max for each source.
    # We add a small epsilon (1e-9) to prevent division by zero if all values
    # in a source are identical (edge case but important for robustness).
    ncs_min, ncs_max = min(ncs_values), max(ncs_values)
    es_min, es_max = min(e_shram_values), max(e_shram_values)
    li_min, li_max = min(linkedin_values), max(linkedin_values)
    epsilon = 1e-9

    # ── STEP 1b: Define the normalisation helpers ────────────────────────
    def _min_max_norm(value: float, v_min: float, v_max: float) -> float:
        """Standard min-max normalisation → [0, 1]."""
        return (value - v_min) / (v_max - v_min + epsilon)

    def _inverse_norm(value: float, v_min: float, v_max: float) -> float:
        """Inverse min-max normalisation → [0, 1].
        Higher raw value ⟹ lower normalised score (supply dampener)."""
        return 1.0 - _min_max_norm(value, v_min, v_max)

    # ── STEP 2: Define source weights ────────────────────────────────────
    # These weights sum to 1.0 and reflect each source's reliability and
    # informational value for estimating *unmet* labour demand.
    W_NCS = 0.40       # Government portal — broadest coverage, formal sector
    W_LINKEDIN = 0.35  # Private sector — captures emerging/gig demand
    W_E_SHRAM = 0.25   # Supply inverse — dampens score when workers exist

    # ── STEP 3: Define the sigmoid squeeze parameters ────────────────────
    # k controls steepness: higher k → sharper separation between roles.
    # midpoint is the inflection point of the sigmoid curve.
    SIGMOID_K = 1.8
    SIGMOID_MIDPOINT = 5.5

    def _sigmoid_rescale(raw_dss: float) -> float:
        """
        Apply a logistic (sigmoid) transformation to spread scores away
        from the extremes and improve discriminative power.

        Without this, min-max scaling tends to cluster most roles near 4-6,
        making it hard for planners to distinguish priority tiers.  The
        sigmoid stretches the middle range while compressing the tails.

        Formula:
            σ(x) = 1 / (1 + e^(-k × (x - midpoint)))
            final = 1 + σ(x) × 9
        """
        logit = -SIGMOID_K * (raw_dss - SIGMOID_MIDPOINT)
        sigma = 1.0 / (1.0 + math.exp(logit))
        # Map sigmoid output (≈0-1) back to 1-10 scale
        return round(1.0 + sigma * 9.0, 2)

    # ── STEP 4: Compute per-role scores ──────────────────────────────────
    results: list[dict[str, Any]] = []

    for role in all_roles:
        # Retrieve raw values with safe defaults for missing data.
        # If a role is absent from a source, we use the source's median
        # as a neutral imputation so it neither inflates nor deflates DSS.
        ncs_raw = ncs_data[role]["postings"] if role in ncs_data else int(
            (ncs_min + ncs_max) / 2
        )
        sector = ncs_data[role]["sector"] if role in ncs_data else "Unknown"
        nsqf_level = ncs_data[role]["nsqf_level"] if role in ncs_data else 4
        es_raw = e_shram_data.get(role, int((es_min + es_max) / 2))
        li_raw = linkedin_data.get(role, int((li_min + li_max) / 2))

        # ── Normalise each source ──
        ncs_norm = _min_max_norm(ncs_raw, ncs_min, ncs_max)
        es_norm = _inverse_norm(es_raw, es_min, es_max)   # INVERSE for supply
        li_norm = _min_max_norm(li_raw, li_min, li_max)

        # ── Weighted composite (range 0-1) ──
        composite = (
            W_NCS * ncs_norm
            + W_LINKEDIN * li_norm
            + W_E_SHRAM * es_norm
        )

        # ── Linear scaling to 1-10 ──
        raw_dss = 1.0 + composite * 9.0

        # ── Sigmoid squeeze for better discrimination ──
        final_dss = _sigmoid_rescale(raw_dss)

        # ── STEP 5: Assign label & recommendation ────────────────────────
        if final_dss >= 8.0:
            label = "Critical"
            recommendation = (
                "Acute Shortage: Increase Target Allocation urgently. "
                "Recommend expedited batch sanctions and new centre approvals."
            )
        elif final_dss >= 6.0:
            label = "High"
            recommendation = (
                "Significant Demand: Expand training capacity. "
                "Prioritise in upcoming PMKVY / Jan Shikshan target allocation."
            )
        elif final_dss >= 4.0:
            label = "Moderate"
            recommendation = (
                "Balanced Market: Monitor and review next quarter. "
                "No immediate scaling action required."
            )
        elif final_dss >= 2.5:
            label = "Low"
            recommendation = (
                "Adequate Supply: Maintain current allocation. "
                "Consider redirecting new trainees to higher-demand trades."
            )
        else:
            label = "Oversupplied"
            recommendation = (
                "Oversupply Warning: Freeze Batch Sanctions. "
                "Halt new admissions and redirect candidates to shortage trades."
            )

        results.append({
            "nsqf_role": role,
            "nsqf_level": nsqf_level,
            "sector": sector,
            "ncs_job_postings": ncs_raw,
            "e_shram_registrations": es_raw,
            "linkedin_job_signals": li_raw,
            "ncs_normalised": round(ncs_norm, 4),
            "e_shram_normalised": round(es_norm, 4),
            "linkedin_normalised": round(li_norm, 4),
            "demand_severity_score": final_dss,
            "demand_label": label,
            "recommendation": recommendation,
        })

    # Sort by descending severity so the most critical roles appear first
    results.sort(key=lambda r: r["demand_severity_score"], reverse=True)

    return results


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  API ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@app.get("/", tags=["Health"])
async def health_check():
    """Root health-check endpoint."""
    return {
        "status": "healthy",
        "service": "Kaushal Drishty LMIS API",
        "version": "1.0.0",
    }


@app.get(
    "/api/v1/demand-index",
    response_model=DemandIndexResponse,
    tags=["Demand Intelligence"],
    summary="Composite Demand Severity Index",
    description=(
        "Returns the Demand Severity Score (DSS) for all NSQF job roles, "
        "computed by fusing NCS, e-Shram, and LinkedIn data sources using "
        "a weighted normalisation methodology (DSS v1.0)."
    ),
)
async def get_demand_index(
    sector: str | None = Query(
        None,
        description="Optional sector filter (e.g., 'Green Energy', 'IT / ITES')",
    ),
):
    # ── Fetch data from all three sources ──
    ncs_data = _get_ncs_portal_jobs()
    e_shram_data = _get_e_shram_registrations()
    linkedin_data = _get_linkedin_scraping()

    # ── Run the core algorithm ──
    roles = calculate_demand_index(ncs_data, e_shram_data, linkedin_data)

    # ── Apply optional sector filter ──
    if sector:
        roles = [r for r in roles if r["sector"].lower() == sector.lower()]

    return DemandIndexResponse(
        generated_at=datetime.now(timezone.utc).isoformat(),
        data_sources=["ncs_portal_jobs", "e_shram_registrations", "linkedin_scraping"],
        total_roles_analysed=len(roles),
        roles=[RoleScore(**r) for r in roles],
    )


@app.get(
    "/api/v1/export/target-setting",
    response_model=TargetSettingResponse,
    tags=["Export — Scheme Planning"],
    summary="Target-Setting Forecast Export",
    description=(
        "Outputs forecast recommendations in a clean, flat JSON structure "
        "designed for direct ingestion into government scheme target-setting "
        "workflows (PMKVY, NAPS, Jan Shikshan Sansthan, etc.)."
    ),
)
async def export_target_setting(
    fiscal_year: str = Query(
        "2026-27",
        description="Fiscal year for target projections (e.g., '2026-27')",
    ),
):
    # ── Fetch and compute scores ──
    ncs_data = _get_ncs_portal_jobs()
    e_shram_data = _get_e_shram_registrations()
    linkedin_data = _get_linkedin_scraping()
    roles = calculate_demand_index(ncs_data, e_shram_data, linkedin_data)

    # ── Transform into flat target-setting rows ──
    # The recommended annual target is derived from the gap between
    # estimated industry demand and current supply (e-Shram registrations).
    # We use a simple heuristic:
    #   recommended_target = max(gap × scaling_factor, minimum_batch_size)
    # where scaling_factor accounts for the fact that not all trained
    # workers will enter the exact same occupation (leakage rate ≈ 30%).
    LEAKAGE_MULTIPLIER = 1.3   # 30% expected career-path leakage
    MINIMUM_BATCH = 500        # no recommendation below 500 seats

    rows: list[TargetSettingRow] = []

    for rank, role in enumerate(roles, start=1):
        supply = role["e_shram_registrations"]
        # Estimated industry demand is the average of NCS and LinkedIn signals
        # (representing formal + private-sector demand).
        demand_estimate = (role["ncs_job_postings"] + role["linkedin_job_signals"]) // 2
        gap = demand_estimate - supply

        if gap > 0:
            # Deficit: recommend enough seats to close the gap plus leakage
            recommended = max(int(gap * LEAKAGE_MULTIPLIER), MINIMUM_BATCH)
        else:
            # Surplus: recommend minimum maintenance batch only
            recommended = MINIMUM_BATCH

        rows.append(TargetSettingRow(
            nsqf_role=role["nsqf_role"],
            nsqf_level=role["nsqf_level"],
            sector=role["sector"],
            demand_severity_score=role["demand_severity_score"],
            demand_label=role["demand_label"],
            recommended_annual_target=recommended,
            current_estimated_supply=supply,
            estimated_industry_demand=demand_estimate,
            gap=gap,
            priority_rank=rank,
            recommendation=role["recommendation"],
            fiscal_year=fiscal_year,
        ))

    return TargetSettingResponse(
        generated_at=datetime.now(timezone.utc).isoformat(),
        fiscal_year=fiscal_year,
        total_roles=len(rows),
        rows=rows,
    )


class EarlyWarningResponse(BaseModel):
    api_version: str = "1.0.0"
    generated_at: str
    total_warnings: int
    warnings: list[dict]

@app.get(
    "/api/v1/early-warnings",
    response_model=EarlyWarningResponse,
    tags=["Demand Intelligence"],
    summary="Early Warning System",
    description="Returns high-priority alerts for critical shortages and oversupplies.",
)
async def get_early_warnings(
    state: str | None = Query(None, description="Optional state filter"),
):
    # Fetch base data
    ncs_data = _get_ncs_portal_jobs()
    e_shram_data = _get_e_shram_registrations()
    linkedin_data = _get_linkedin_scraping()

    # If state is provided and not National, scale data by state demographic share
    if state and state != "National":
        prof = STATE_DEMOGRAPHICS.get(state)
        share = prof["share"] if prof else 0.02
        for d in [ncs_data]:
            for k in d: d[k]["postings"] = max(5, int(d[k]["postings"] * share))
        for k in e_shram_data: e_shram_data[k] = max(5, int(e_shram_data[k] * share))
        for k in linkedin_data: linkedin_data[k] = max(5, int(linkedin_data[k] * share))

    roles = calculate_demand_index(ncs_data, e_shram_data, linkedin_data)
    
    warnings = []
    for i, role in enumerate(roles):
        # critical shortage
        if role["demand_severity_score"] >= 8.0:
            warnings.append({
                "id": i + 1,
                "trade": role["nsqf_role"],
                "nsqf_level": role["nsqf_level"],
                "type": "shortage",
                "severity": "critical",
                "messageKey": "alerts.acute_shortage",
                "recommendationKey": "alerts.increase_target",
                "gap": "−" + str(int((role["ncs_job_postings"] + role["linkedin_job_signals"])/2 - role["e_shram_registrations"])),
                "hoursAgo": (i % 12) + 1
            })
        # high shortage
        elif role["demand_severity_score"] >= 6.0:
            warnings.append({
                "id": i + 1,
                "trade": role["nsqf_role"],
                "nsqf_level": role["nsqf_level"],
                "type": "shortage",
                "severity": "high",
                "messageKey": "alerts.moderate_shortage",
                "recommendationKey": "alerts.increase_target",
                "gap": "−" + str(int((role["ncs_job_postings"] + role["linkedin_job_signals"])/2 - role["e_shram_registrations"])),
                "hoursAgo": (i % 12) + 1
            })
        # oversupply
        elif role["demand_severity_score"] < 2.5:
            warnings.append({
                "id": i + 1,
                "trade": role["nsqf_role"],
                "nsqf_level": role["nsqf_level"],
                "type": "oversupply",
                "severity": role["demand_severity_score"] < 1.5 and "critical" or "high",
                "messageKey": "alerts.oversupply",
                "recommendationKey": "alerts.freeze_batch",
                "gap": "+" + str(int(role["e_shram_registrations"] - (role["ncs_job_postings"] + role["linkedin_job_signals"])/2)),
                "hoursAgo": (i % 12) + 1
            })
            
    return EarlyWarningResponse(
        generated_at=datetime.now(timezone.utc).isoformat(),
        total_warnings=len(warnings),
        warnings=warnings
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  STATE DEMOGRAPHICS & REALISTIC SHARES (ALL 36 STATES/UTS + NATIONAL)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STATE_DEMOGRAPHICS: dict[str, dict[str, Any]] = {
    "National":               {"share": 1.0,     "centres": 14200, "sscs": 38, "bias": [1.0, 1.0, 1.0, 1.0, 1.0]},
    "Uttar Pradesh":          {"share": 0.165,   "centres": 2340,  "sscs": 34, "bias": [0.95, 0.75, 1.20, 1.05, 0.65]},
    "Maharashtra":            {"share": 0.105,   "centres": 1490,  "sscs": 36, "bias": [0.85, 1.15, 1.25, 0.95, 1.35]},
    "Bihar":                  {"share": 0.086,   "centres": 1220,  "sscs": 22, "bias": [0.75, 0.55, 0.90, 0.85, 0.45]},
    "West Bengal":            {"share": 0.072,   "centres": 1020,  "sscs": 28, "bias": [0.70, 0.85, 1.05, 0.95, 0.75]},
    "Madhya Pradesh":         {"share": 0.060,   "centres": 850,   "sscs": 26, "bias": [1.15, 0.65, 0.85, 0.75, 0.55]},
    "Tamil Nadu":             {"share": 0.068,   "centres": 965,   "sscs": 35, "bias": [0.95, 1.30, 1.10, 1.05, 1.25]},
    "Rajasthan":              {"share": 0.058,   "centres": 820,   "sscs": 25, "bias": [1.35, 0.65, 0.90, 0.75, 0.55]},
    "Karnataka":              {"share": 0.064,   "centres": 910,   "sscs": 34, "bias": [0.85, 1.25, 1.05, 0.95, 1.45]},
    "Gujarat":                {"share": 0.062,   "centres": 880,   "sscs": 32, "bias": [1.25, 1.05, 1.30, 0.85, 0.95]},
    "Andhra Pradesh":         {"share": 0.046,   "centres": 650,   "sscs": 28, "bias": [1.05, 1.10, 0.95, 0.85, 1.05]},
    "Odisha":                 {"share": 0.038,   "centres": 540,   "sscs": 22, "bias": [0.95, 0.65, 0.85, 0.75, 0.55]},
    "Telangana":              {"share": 0.042,   "centres": 595,   "sscs": 30, "bias": [0.75, 1.05, 0.95, 0.95, 1.35]},
    "Kerala":                 {"share": 0.032,   "centres": 455,   "sscs": 27, "bias": [0.65, 0.75, 0.85, 1.35, 1.05]},
    "Jharkhand":              {"share": 0.028,   "centres": 400,   "sscs": 20, "bias": [0.85, 0.65, 0.75, 0.65, 0.45]},
    "Assam":                  {"share": 0.026,   "centres": 370,   "sscs": 18, "bias": [0.75, 0.55, 0.85, 0.75, 0.45]},
    "Punjab":                 {"share": 0.025,   "centres": 355,   "sscs": 24, "bias": [0.85, 0.75, 1.10, 0.95, 0.65]},
    "Chhattisgarh":           {"share": 0.022,   "centres": 310,   "sscs": 18, "bias": [1.05, 0.55, 0.75, 0.65, 0.45]},
    "Haryana":                {"share": 0.024,   "centres": 340,   "sscs": 26, "bias": [0.95, 1.05, 1.25, 0.85, 1.05]},
    "Delhi":                  {"share": 0.026,   "centres": 370,   "sscs": 32, "bias": [0.45, 0.85, 1.05, 1.05, 1.55]},
    "Jammu & Kashmir":        {"share": 0.012,   "centres": 170,   "sscs": 14, "bias": [0.75, 0.45, 0.65, 0.85, 0.55]},
    "Uttarakhand":            {"share": 0.011,   "centres": 155,   "sscs": 18, "bias": [0.95, 0.65, 0.75, 0.85, 0.75]},
    "Himachal Pradesh":       {"share": 0.008,   "centres": 115,   "sscs": 15, "bias": [1.05, 0.55, 0.65, 0.75, 0.55]},
    "Tripura":                {"share": 0.004,   "centres": 55,    "sscs": 10, "bias": [0.65, 0.45, 0.55, 0.75, 0.35]},
    "Meghalaya":              {"share": 0.0035,  "centres": 50,    "sscs": 9,  "bias": [0.75, 0.35, 0.55, 0.65, 0.35]},
    "Manipur":                {"share": 0.0032,  "centres": 45,    "sscs": 8,  "bias": [0.55, 0.35, 0.45, 0.75, 0.35]},
    "Nagaland":               {"share": 0.0025,  "centres": 35,    "sscs": 7,  "bias": [0.55, 0.35, 0.45, 0.65, 0.35]},
    "Goa":                    {"share": 0.0022,  "centres": 30,    "sscs": 12, "bias": [0.55, 0.65, 0.75, 0.85, 0.95]},
    "Arunachal Pradesh":      {"share": 0.0018,  "centres": 25,    "sscs": 6,  "bias": [0.85, 0.25, 0.35, 0.55, 0.25]},
    "Puducherry":             {"share": 0.0016,  "centres": 22,    "sscs": 10, "bias": [0.45, 0.65, 0.55, 0.75, 0.85]},
    "Mizoram":                {"share": 0.0014,  "centres": 20,    "sscs": 6,  "bias": [0.55, 0.35, 0.35, 0.65, 0.35]},
    "Chandigarh":             {"share": 0.0015,  "centres": 21,    "sscs": 12, "bias": [0.35, 0.75, 0.65, 0.85, 1.05]},
    "Sikkim":                 {"share": 0.0010,  "centres": 14,    "sscs": 5,  "bias": [0.75, 0.25, 0.35, 0.55, 0.35]},
    "Dadra & Nagar Haveli":   {"share": 0.0008,  "centres": 11,    "sscs": 5,  "bias": [0.45, 0.85, 0.65, 0.45, 0.35]},
    "Andaman & Nicobar":      {"share": 0.0006,  "centres": 8,     "sscs": 4,  "bias": [0.65, 0.25, 0.45, 0.55, 0.25]},
    "Ladakh":                 {"share": 0.0004,  "centres": 6,     "sscs": 3,  "bias": [0.85, 0.15, 0.25, 0.45, 0.25]},
    "Lakshadweep":            {"share": 0.0002,  "centres": 3,     "sscs": 2,  "bias": [0.55, 0.15, 0.35, 0.45, 0.15]},
}

BASE_SECTORS = [
    {"sector": "Green Energy", "baseCap": 82000, "baseDem": 125000},
    {"sector": "Electronics",  "baseCap": 110000, "baseDem": 95000},
    {"sector": "Logistics",    "baseCap": 72000, "baseDem": 118000},
    {"sector": "Healthcare",   "baseCap": 98000, "baseDem": 140000},
    {"sector": "IT / ITES",    "baseCap": 135000, "baseDem": 112000},
]


class StateDemandResponse(BaseModel):
    api_version: str = "1.0.0"
    generated_at: str
    state: str
    sectors: list[dict]
    metrics: dict


@app.get(
    "/api/v1/geo/state-demand",
    response_model=StateDemandResponse,
    tags=["Demand Intelligence"],
    summary="State-Level Demand Analytics",
    description="Returns aggregated supply/demand metrics grouped by sector for a given state.",
)
async def get_state_demand(
    state: str = Query(..., description="Target state/UT or 'National'"),
):
    prof = STATE_DEMOGRAPHICS.get(state)
    if not prof:
        import hashlib
        seed = int(hashlib.md5(state.encode()).hexdigest(), 16) % 10000 / 10000.0
        prof = {"share": max(0.001, seed * 0.03), "centres": max(10, int(14200 * seed * 0.03)), "sscs": 15, "bias": [1.0, 1.0, 1.0, 1.0, 1.0]}
    
    is_national = (state == "National")
    share = 1.0 if is_national else prof["share"]
    biases = [1.0, 1.0, 1.0, 1.0, 1.0] if is_national else prof["bias"]
    
    sectors = []
    total_cap = 0
    total_dem = 0
    
    for idx, s in enumerate(BASE_SECTORS):
        bias = biases[idx]
        cap = int(s["baseCap"] * share * bias)
        dem = int(s["baseDem"] * share * bias)
        sectors.append({
            "sector": s["sector"],
            "capacity": cap,
            "demand": dem
        })
        total_cap += cap
        total_dem += dem
        
    gap = total_dem - total_cap
    gap_is_deficit = gap > 0
    
    centres_count = 14200 if is_national else prof["centres"]
    sscs_count = 38 if is_national else prof["sscs"]
    
    metrics = {
        "trainingSeats": {
            "value": f"{total_cap:,}",
            "change": "+3.2%" if is_national else "+4.1%",
            "trend": "up",
            "centres": f"{centres_count:,}"
        },
        "industryDemand": {
            "value": f"{total_dem:,}",
            "change": "+8.7%" if is_national else "+7.5%",
            "trend": "up",
            "sscs": str(sscs_count)
        },
        "gap": {
            "value": f"{abs(gap):,}",
            "change": f"{'+' if gap_is_deficit else '−'}5.1%",
            "trend": "up" if gap_is_deficit else "down"
        }
    }
    
    return StateDemandResponse(
        generated_at=datetime.now(timezone.utc).isoformat(),
        state=state,
        sectors=sectors,
        metrics=metrics
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TIME-SERIES TREND ENDPOINT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get(
    "/api/v1/trend/time-series",
    tags=["Demand Intelligence"],
    summary="Supply vs Demand vs Gap over Time",
    description="Returns 12-month rolling supply/demand/gap time-series for a given state.",
)
async def get_time_series(
    state: str = Query("National", description="State or 'National'"),
):
    prof = STATE_DEMOGRAPHICS.get(state)
    if not prof:
        import hashlib
        seed = int(hashlib.md5(state.encode()).hexdigest(), 16) % 10000 / 10000.0
        prof = {"share": max(0.001, seed * 0.03), "centres": max(10, int(14200 * seed * 0.03)), "sscs": 15, "bias": [1.0, 1.0, 1.0, 1.0, 1.0]}
    
    is_national = (state == "National")
    share = 1.0 if is_national else prof["share"]
    biases = [1.0, 1.0, 1.0, 1.0, 1.0] if is_national else prof["bias"]
    
    # Current (Mar'26) exact baseline numbers
    final_cap = sum(int(s["baseCap"] * share * biases[i]) for i, s in enumerate(BASE_SECTORS))
    final_dem = sum(int(s["baseDem"] * share * biases[i]) for i, s in enumerate(BASE_SECTORS))
    
    months = [
        "Apr'25","May'25","Jun'25","Jul'25","Aug'25","Sep'25",
        "Oct'25","Nov'25","Dec'25","Jan'26","Feb'26","Mar'26"
    ]
    # Realistic 12-month FY progression factors
    cap_factors = [0.902, 0.911, 0.920, 0.928, 0.937, 0.947, 0.956, 0.966, 0.975, 0.984, 0.992, 1.000]
    dem_factors = [0.865, 0.876, 0.888, 0.902, 0.919, 0.933, 0.949, 0.963, 0.976, 0.985, 0.993, 1.000]
    
    data = []
    for i, month in enumerate(months):
        cap = int(final_cap * cap_factors[i])
        dem = int(final_dem * dem_factors[i])
        data.append({
            "month": month,
            "supply": cap,
            "demand": dem,
            "gap": dem - cap
        })
        
    return {
        "api_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "state": state,
        "data": data,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SECTOR FORECAST ENDPOINT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTOR_META = {
    "Green Energy": {
        "description": "Solar, wind, EV, and sustainable energy trades",
        "top_trades": ["Solar PV Installer", "EV Battery Technician", "Wind Turbine Tech"],
        "growth_rate": 0.032, "saturation_risk": "Low", "ncvet_aligned": True,
    },
    "Electronics": {
        "description": "Consumer electronics, IoT, embedded systems",
        "top_trades": ["Electronics Mechanic", "IoT Technician", "PCB Assembler"],
        "growth_rate": 0.018, "saturation_risk": "Medium", "ncvet_aligned": True,
    },
    "Logistics": {
        "description": "Warehousing, last-mile delivery, supply chain",
        "top_trades": ["Warehouse Operations Associate", "Logistics Coordinator", "Cold Chain Tech"],
        "growth_rate": 0.025, "saturation_risk": "Low", "ncvet_aligned": True,
    },
    "Healthcare": {
        "description": "Allied health, paramedics, rural health workers",
        "top_trades": ["General Duty Assistant", "Medical Lab Technician", "Phlebotomist"],
        "growth_rate": 0.028, "saturation_risk": "Low", "ncvet_aligned": True,
    },
    "IT / ITES": {
        "description": "Software, AI/ML, cybersecurity, BPO",
        "top_trades": ["Full-Stack Developer", "AI/ML Engineer", "Cybersecurity Analyst"],
        "growth_rate": 0.041, "saturation_risk": "Low", "ncvet_aligned": True,
    },
}


@app.get(
    "/api/v1/sector/forecast",
    tags=["Demand Intelligence"],
    summary="Sector-wise 6-Month Demand Forecast",
    description="Returns predicted capacity vs demand for next 6 months for a specific sector.",
)
async def get_sector_forecast(
    sector: str = Query(..., description="Sector name e.g. 'Green Energy'"),
    state: str = Query("National", description="State or 'National'"),
):
    prof = STATE_DEMOGRAPHICS.get(state)
    if not prof:
        import hashlib
        seed = int(hashlib.md5(state.encode()).hexdigest(), 16) % 10000 / 10000.0
        prof = {"share": max(0.001, seed * 0.03), "centres": 100, "sscs": 15, "bias": [1.0, 1.0, 1.0, 1.0, 1.0]}
        
    is_national = (state == "National")
    share = 1.0 if is_national else prof["share"]
    
    sector_idx_map = {"Green Energy": 0, "Electronics": 1, "Logistics": 2, "Healthcare": 3, "IT / ITES": 4}
    idx = sector_idx_map.get(sector, 0)
    bias = 1.0 if is_national else prof["bias"][idx]
    
    meta = SECTOR_META.get(sector, SECTOR_META["Green Energy"])
    growth = meta["growth_rate"]
    base_caps = {"Green Energy": 82000, "Electronics": 110000, "Logistics": 72000, "Healthcare": 98000, "IT / ITES": 135000}
    base_dems = {"Green Energy": 125000, "Electronics": 95000, "Logistics": 118000, "Healthcare": 140000, "IT / ITES": 112000}
    
    cap = max(10, int(base_caps.get(sector, 80000) * share * bias))
    dem = max(15, int(base_dems.get(sector, 100000) * share * bias))
    
    months = ["Apr'26", "May'26", "Jun'26", "Jul'26", "Aug'26", "Sep'26"]
    forecast = []
    for i, month in enumerate(months):
        cap = int(cap * (1 + 0.006 + (i * 0.001)))
        dem = int(dem * (1 + growth))
        forecast.append({
            "month": month,
            "predicted_capacity": cap,
            "predicted_demand": dem,
            "predicted_gap": dem - cap,
            "confidence": 0.85,
        })
    return {
        "api_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sector": sector, "state": state, "meta": meta, "forecast": forecast,
        "recommendation": (
            "Scale up training capacity urgently — demand is outpacing local supply."
            if forecast[-1]["predicted_gap"] > 0
            else "Maintain current training allocations; monitor completion rates to prevent saturation."
        ),
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TRAINING CENTRES ENDPOINT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get(
    "/api/v1/training-centres",
    tags=["Demand Intelligence"],
    summary="Training Centre Details",
    description="Returns training centre breakdown with utilization rates for a state.",
)
async def get_training_centres(
    state: str = Query("National", description="State or 'National'"),
):
    prof = STATE_DEMOGRAPHICS.get(state)
    if not prof:
        import hashlib
        seed = int(hashlib.md5(state.encode()).hexdigest(), 16) % 10000 / 10000.0
        prof = {"share": max(0.001, seed * 0.03), "centres": 100, "sscs": 15, "bias": [1.0, 1.0, 1.0, 1.0, 1.0]}
        
    is_national = (state == "National")
    total = 14200 if is_national else prof["centres"]
    
    sectors = [
        {"sector": "Green Energy",  "share": 0.14, "util": 0.88, "batch": 30},
        {"sector": "Electronics",   "share": 0.20, "util": 0.72, "batch": 28},
        {"sector": "Logistics",     "share": 0.16, "util": 0.81, "batch": 35},
        {"sector": "Healthcare",    "share": 0.18, "util": 0.84, "batch": 25},
        {"sector": "IT / ITES",     "share": 0.22, "util": 0.76, "batch": 32},
        {"sector": "Construction",  "share": 0.06, "util": 0.65, "batch": 40},
        {"sector": "Agriculture",   "share": 0.04, "util": 0.58, "batch": 22},
    ]
    details = []
    for s in sectors:
        count = max(1, int(total * s["share"]))
        throughput = count * s["batch"]
        details.append({
            "sector": s["sector"],
            "centre_count": count,
            "utilisation_rate": s["util"],
            "avg_batch_size": s["batch"],
            "monthly_throughput": throughput,
            "status": "Overloaded" if s["util"] > 0.85 else "Active" if s["util"] > 0.65 else "Underutilised",
        })
    return {
        "api_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "state": state, "total_centres": total,
        "average_utilisation": round(sum(c["utilisation_rate"] for c in details) / len(details), 2),
        "monthly_total_throughput": sum(c["monthly_throughput"] for c in details),
        "centres_by_sector": details,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SECTOR-SEGREGATED JOB ROLES, PREDICTIONS & HISTORICAL TIME SERIES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

JOB_REGISTRY = [
    # ── Green Energy ──
    {
        "id": "solar-pv-installer",
        "trade": "Solar PV Installer",
        "sector": "Green Energy",
        "nsqf_level": 4,
        "nco_code": "7421.0101",
        "base_demand": 38000,
        "base_supply": 22000,
        "growth_rate": 0.28,
        "hiring_velocity": "High (+28% YoY)",
        "saturation_risk": "Low",
        "future_dss": 8.7,
        "future_status": "Acute Shortage",
        "recommendation": "Expand rooftop solar & utility installer batch allocations by 35% in state ITIs.",
    },
    {
        "id": "drone-pilot-technician",
        "trade": "Drone Pilot / Technician",
        "sector": "Green Energy",
        "nsqf_level": 5,
        "nco_code": "3154.0201",
        "base_demand": 24000,
        "base_supply": 8500,
        "growth_rate": 0.35,
        "hiring_velocity": "Accelerating (+35% YoY)",
        "saturation_risk": "Low",
        "future_dss": 9.1,
        "future_status": "Critical Shortage",
        "recommendation": "Establish DGCA-certified remote pilot training facilities in partnership with drone startups.",
    },
    {
        "id": "ev-battery-technician",
        "trade": "EV Battery Technician",
        "sector": "Green Energy",
        "nsqf_level": 5,
        "nco_code": "7412.0302",
        "base_demand": 31000,
        "base_supply": 14000,
        "growth_rate": 0.32,
        "hiring_velocity": "Rapid (+32% YoY)",
        "saturation_risk": "Low",
        "future_dss": 8.9,
        "future_status": "Acute Shortage",
        "recommendation": "Fund dedicated battery pack diagnostics labs and BMS safety certification modules.",
    },
    {
        "id": "wind-turbine-tech",
        "trade": "Wind Turbine Maintenance Tech",
        "sector": "Green Energy",
        "nsqf_level": 5,
        "nco_code": "7412.0401",
        "base_demand": 16000,
        "base_supply": 9200,
        "growth_rate": 0.18,
        "hiring_velocity": "Steady (+18% YoY)",
        "saturation_risk": "Low",
        "future_dss": 7.8,
        "future_status": "Moderate Shortage",
        "recommendation": "Focus capacity building in coastal and arid wind energy corridors.",
    },

    # ── Electronics ──
    {
        "id": "electronics-mechanic",
        "trade": "Electronics Mechanic",
        "sector": "Electronics",
        "nsqf_level": 4,
        "nco_code": "7421.0200",
        "base_demand": 28000,
        "base_supply": 36000,
        "growth_rate": 0.08,
        "hiring_velocity": "Moderate (+8% YoY)",
        "saturation_risk": "High",
        "future_dss": 3.2,
        "future_status": "Mild Oversupply",
        "recommendation": "Modernize legacy syllabus towards SMD repair and power electronics to clear inventory glut.",
    },
    {
        "id": "iot-technician",
        "trade": "IoT Technician",
        "sector": "Electronics",
        "nsqf_level": 5,
        "nco_code": "7421.0501",
        "base_demand": 29000,
        "base_supply": 13500,
        "growth_rate": 0.26,
        "hiring_velocity": "High (+26% YoY)",
        "saturation_risk": "Low",
        "future_dss": 8.4,
        "future_status": "Acute Shortage",
        "recommendation": "Deploy smart-factory hardware simulation kits across accredited PMKK centres.",
    },
    {
        "id": "pcb-assembly-operator",
        "trade": "PCB Assembly Operator",
        "sector": "Electronics",
        "nsqf_level": 3,
        "nco_code": "8212.0101",
        "base_demand": 34000,
        "base_supply": 26000,
        "growth_rate": 0.16,
        "hiring_velocity": "Active (+16% YoY)",
        "saturation_risk": "Medium",
        "future_dss": 6.8,
        "future_status": "Moderate Shortage",
        "recommendation": "Coordinate apprenticeship pipelines directly with mobile and EMS manufacturing clusters.",
    },
    {
        "id": "embedded-systems-associate",
        "trade": "Embedded Systems Associate",
        "sector": "Electronics",
        "nsqf_level": 6,
        "nco_code": "2152.0301",
        "base_demand": 22000,
        "base_supply": 11000,
        "growth_rate": 0.22,
        "hiring_velocity": "High (+22% YoY)",
        "saturation_risk": "Low",
        "future_dss": 8.1,
        "future_status": "Acute Shortage",
        "recommendation": "Create bridge courses for diploma engineers in RTOS and ARM microcontrollers.",
    },

    # ── Logistics ──
    {
        "id": "warehouse-operations-associate",
        "trade": "Warehouse Operations Associate",
        "sector": "Logistics",
        "nsqf_level": 3,
        "nco_code": "4321.0100",
        "base_demand": 42000,
        "base_supply": 28000,
        "growth_rate": 0.20,
        "hiring_velocity": "Strong (+20% YoY)",
        "saturation_risk": "Low",
        "future_dss": 7.9,
        "future_status": "Moderate Shortage",
        "recommendation": "Scale automated storage and WMS handheld scanner skilling programs.",
    },
    {
        "id": "logistics-coordinator",
        "trade": "Logistics Coordinator",
        "sector": "Logistics",
        "nsqf_level": 4,
        "nco_code": "4323.0101",
        "base_demand": 31000,
        "base_supply": 21000,
        "growth_rate": 0.17,
        "hiring_velocity": "Active (+17% YoY)",
        "saturation_risk": "Low",
        "future_dss": 7.5,
        "future_status": "Moderate Shortage",
        "recommendation": "Incorporate freight ERP and multi-modal transport management modules.",
    },
    {
        "id": "cold-chain-technician",
        "trade": "Cold Chain Technician",
        "sector": "Logistics",
        "nsqf_level": 5,
        "nco_code": "7127.0201",
        "base_demand": 21000,
        "base_supply": 9500,
        "growth_rate": 0.25,
        "hiring_velocity": "High (+25% YoY)",
        "saturation_risk": "Low",
        "future_dss": 8.6,
        "future_status": "Acute Shortage",
        "recommendation": "Target pharma and agri-perishable clusters with subsidized refrigeration maintenance seats.",
    },
    {
        "id": "supply-chain-analyst",
        "trade": "Supply Chain Analyst",
        "sector": "Logistics",
        "nsqf_level": 6,
        "nco_code": "2421.0401",
        "base_demand": 24000,
        "base_supply": 13500,
        "growth_rate": 0.24,
        "hiring_velocity": "High (+24% YoY)",
        "saturation_risk": "Low",
        "future_dss": 8.2,
        "future_status": "Acute Shortage",
        "recommendation": "Offer advanced skilling in inventory optimization and demand forecasting software.",
    },

    # ── Healthcare ──
    {
        "id": "general-duty-assistant",
        "trade": "General Duty Assistant (Healthcare)",
        "sector": "Healthcare",
        "nsqf_level": 4,
        "nco_code": "5321.0101",
        "base_demand": 56000,
        "base_supply": 38000,
        "growth_rate": 0.22,
        "hiring_velocity": "Robust (+22% YoY)",
        "saturation_risk": "Low",
        "future_dss": 8.0,
        "future_status": "Moderate Shortage",
        "recommendation": "Partner with tier-2 district hospital networks for 6-month clinical internships.",
    },
    {
        "id": "medical-lab-technician",
        "trade": "Medical Lab Technician",
        "sector": "Healthcare",
        "nsqf_level": 6,
        "nco_code": "3212.0101",
        "base_demand": 38000,
        "base_supply": 23000,
        "growth_rate": 0.24,
        "hiring_velocity": "High (+24% YoY)",
        "saturation_risk": "Low",
        "future_dss": 8.5,
        "future_status": "Acute Shortage",
        "recommendation": "Scale up diagnostics lab accreditation and molecular pathology technician seats.",
    },
    {
        "id": "emergency-medical-technician",
        "trade": "Emergency Medical Technician / Paramedic",
        "sector": "Healthcare",
        "nsqf_level": 5,
        "nco_code": "3258.0101",
        "base_demand": 27000,
        "base_supply": 12000,
        "growth_rate": 0.29,
        "hiring_velocity": "Rapid (+29% YoY)",
        "saturation_risk": "Low",
        "future_dss": 8.9,
        "future_status": "Acute Shortage",
        "recommendation": "Integrate advanced cardiac life support (ACLS) simulation labs in state ambulance trusts.",
    },
    {
        "id": "phlebotomist",
        "trade": "Phlebotomist",
        "sector": "Healthcare",
        "nsqf_level": 4,
        "nco_code": "3212.0201",
        "base_demand": 19000,
        "base_supply": 16000,
        "growth_rate": 0.12,
        "hiring_velocity": "Steady (+12% YoY)",
        "saturation_risk": "Medium",
        "future_dss": 5.9,
        "future_status": "Balanced",
        "recommendation": "Maintain baseline quota while enhancing sample preservation protocol training.",
    },

    # ── IT / ITES ──
    {
        "id": "full-stack-developer",
        "trade": "Full-Stack Developer",
        "sector": "IT / ITES",
        "nsqf_level": 7,
        "nco_code": "2512.0101",
        "base_demand": 48000,
        "base_supply": 26000,
        "growth_rate": 0.27,
        "hiring_velocity": "High (+27% YoY)",
        "saturation_risk": "Low",
        "future_dss": 8.6,
        "future_status": "Acute Shortage",
        "recommendation": "Transition basic coding bootcamps into cloud-native microservices and React/Node curricula.",
    },
    {
        "id": "ai-ml-engineer",
        "trade": "AI/ML Engineer",
        "sector": "IT / ITES",
        "nsqf_level": 8,
        "nco_code": "2519.0101",
        "base_demand": 42000,
        "base_supply": 14000,
        "growth_rate": 0.42,
        "hiring_velocity": "Exponential (+42% YoY)",
        "saturation_risk": "Low",
        "future_dss": 9.6,
        "future_status": "Critical Shortage",
        "recommendation": "Scale national AI skilling missions with GPU cloud access and prompt-engineering capstones.",
    },
    {
        "id": "cybersecurity-analyst",
        "trade": "Cybersecurity Analyst",
        "sector": "IT / ITES",
        "nsqf_level": 7,
        "nco_code": "2529.0101",
        "base_demand": 33000,
        "base_supply": 16000,
        "growth_rate": 0.31,
        "hiring_velocity": "Accelerating (+31% YoY)",
        "saturation_risk": "Low",
        "future_dss": 9.0,
        "future_status": "Critical Shortage",
        "recommendation": "Deploy SOC defense simulation ranges across national skill academies.",
    },
    {
        "id": "cloud-solutions-architect",
        "trade": "Cloud Solutions Architect",
        "sector": "IT / ITES",
        "nsqf_level": 8,
        "nco_code": "2523.0101",
        "base_demand": 31000,
        "base_supply": 15000,
        "growth_rate": 0.30,
        "hiring_velocity": "Rapid (+30% YoY)",
        "saturation_risk": "Low",
        "future_dss": 8.8,
        "future_status": "Acute Shortage",
        "recommendation": "Subsidize multi-cloud professional certifications (AWS, Azure, GCP) for final year trainees.",
    },
    {
        "id": "data-entry-operator",
        "trade": "Data Entry Operator",
        "sector": "IT / ITES",
        "nsqf_level": 3,
        "nco_code": "4132.0100",
        "base_demand": 9500,
        "base_supply": 52000,
        "growth_rate": -0.18,
        "hiring_velocity": "Declining (-18% YoY)",
        "saturation_risk": "Severe",
        "future_dss": 1.1,
        "future_status": "Severe Oversupply",
        "recommendation": "Freeze new batch approvals immediately; redirect trainees to AI annotation and data curation.",
    },
]


@app.get(
    "/api/v1/jobs/roles",
    tags=["Demand Intelligence"],
    summary="Sector-Segregated Job Roles, Predictions & Historical Time Series",
    description="Returns all NSQF job roles segregated by sector with future predictions and 12-month historical supply/demand/gap series.",
)
async def get_job_roles(
    state: str = Query("National", description="Target state or 'National'"),
    sector: str | None = Query(None, description="Optional sector filter"),
):
    prof = STATE_DEMOGRAPHICS.get(state)
    if not prof:
        import hashlib
        seed = int(hashlib.md5(state.encode()).hexdigest(), 16) % 10000 / 10000.0
        prof = {"share": max(0.001, seed * 0.03), "centres": 100, "sscs": 15, "bias": [1.0, 1.0, 1.0, 1.0, 1.0]}

    is_national = (state == "National")
    share = 1.0 if is_national else prof["share"]
    sector_idx_map = {"Green Energy": 0, "Electronics": 1, "Logistics": 2, "Healthcare": 3, "IT / ITES": 4}

    months = ["Apr'25","May'25","Jun'25","Jul'25","Aug'25","Sep'25","Oct'25","Nov'25","Dec'25","Jan'26","Feb'26","Mar'26"]
    cap_factors = [0.902, 0.911, 0.920, 0.928, 0.937, 0.947, 0.956, 0.966, 0.975, 0.984, 0.992, 1.000]
    dem_factors = [0.865, 0.876, 0.888, 0.902, 0.919, 0.933, 0.949, 0.963, 0.976, 0.985, 0.993, 1.000]

    filtered = [j for j in JOB_REGISTRY if (sector is None or j["sector"].lower() == sector.lower())]

    jobs = []
    for j in filtered:
        idx = sector_idx_map.get(j["sector"], 0)
        bias = 1.0 if is_national else prof["bias"][idx]

        scaled_cap = max(5, int(j["base_supply"] * share * bias))
        scaled_dem = max(5, int(j["base_demand"] * share * bias))
        curr_gap = scaled_dem - scaled_cap

        # Future 6-month & 12-month projections
        pred_dem_6m = max(5, int(scaled_dem * (1 + j["growth_rate"] * 0.5)))
        pred_cap_6m = max(5, int(scaled_cap * 1.025))
        pred_gap_6m = pred_dem_6m - pred_cap_6m

        pred_dem_12m = max(5, int(scaled_dem * (1 + j["growth_rate"])))
        pred_cap_12m = max(5, int(scaled_cap * 1.055))
        pred_gap_12m = pred_dem_12m - pred_cap_12m

        # Historical 12-month series (Apr'25 to Mar'26)
        history = []
        for i, m in enumerate(months):
            c = max(1, int(scaled_cap * cap_factors[i]))
            d = max(1, int(scaled_dem * dem_factors[i]))
            history.append({
                "month": m,
                "supply": c,
                "demand": d,
                "gap": d - c
            })

        jobs.append({
            "id": j["id"],
            "trade": j["trade"],
            "sector": j["sector"],
            "nsqf_level": j["nsqf_level"],
            "nco_code": j["nco_code"],
            "current_supply": scaled_cap,
            "current_demand": scaled_dem,
            "current_gap": curr_gap,
            "growth_rate_pct": round(j["growth_rate"] * 100, 1),
            "hiring_velocity": j["hiring_velocity"],
            "saturation_risk": j["saturation_risk"],
            "future_dss": j["future_dss"],
            "future_status": j["future_status"],
            "recommendation": j["recommendation"],
            "future_prediction": {
                "six_month": {
                    "projected_demand": pred_dem_6m,
                    "projected_supply": pred_cap_6m,
                    "projected_gap": pred_gap_6m,
                },
                "twelve_month": {
                    "projected_demand": pred_dem_12m,
                    "projected_supply": pred_cap_12m,
                    "projected_gap": pred_gap_12m,
                },
                "hiring_trajectory": "Accelerating" if j["growth_rate"] > 0.2 else "Stable" if j["growth_rate"] > 0 else "Declining",
                "risk_profile": j["saturation_risk"],
            },
            "history": history
        })

    # Group by sectors
    sectors_map: dict[str, list] = {}
    for j in jobs:
        sectors_map.setdefault(j["sector"], []).append(j)

    return {
        "api_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "state": state,
        "total_jobs": len(jobs),
        "sectors": list(sectors_map.keys()),
        "jobs": jobs,
        "grouped_by_sector": sectors_map,
    }

