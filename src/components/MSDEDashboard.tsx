import { useState, useEffect, useRef, useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  Area,
  AreaChart,
  LineChart,
  Line,
} from 'recharts';
import {
  ChevronDown,
  Globe,
  Download,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  Factory,
  Activity,
  Shield,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  CircleAlert,
  CircleCheck,
  Zap,
  MapPin,
  Search,
  Check,
  Copy,
  X,
  Key,
  Building2,
  BarChart2,
  ChevronRight,
  Layers,
  Target,
  Briefcase,
  GraduationCap,
} from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import JobRolesMenuModal from './JobRolesMenuModal';

/* ================================================================== */
/*  TYPES                                                             */
/* ================================================================== */

interface SectorRow {
  sector: string;
  capacity: number;
  demand: number;
}

interface MetricSet {
  trainingSeats: { value: string; change: string; trend: 'up' | 'down'; centres: string };
  industryDemand: { value: string; change: string; trend: 'up' | 'down'; sscs: string };
  gap: { value: string; change: string; trend: 'up' | 'down' };
}

interface AlertItem {
  id: number;
  trade: string;
  nsqf_level?: number;
  type: 'oversupply' | 'shortage';
  severity: 'critical' | 'high' | 'medium';
  messageKey: string;
  recommendationKey: string;
  gap: string;
  hoursAgo: number;
}

interface StateData {
  sectors: SectorRow[];
  metrics: MetricSet;
  alerts: AlertItem[];
}

interface TimeSeriesPoint {
  month: string;
  supply: number;
  demand: number;
  gap: number;
}

interface ForecastPoint {
  month: string;
  predicted_capacity: number;
  predicted_demand: number;
  predicted_gap: number;
  confidence: number;
}

interface SectorMeta {
  description: string;
  top_trades: string[];
  growth_rate: number;
  saturation_risk: string;
  ncvet_aligned: boolean;
}

interface SectorForecastData {
  sector: string;
  state: string;
  meta: SectorMeta;
  forecast: ForecastPoint[];
  recommendation: string;
}

interface TrainingCentreDetail {
  sector: string;
  centre_count: number;
  utilisation_rate: number;
  avg_batch_size: number;
  monthly_throughput: number;
  status: string;
}

interface TrainingCentreDistrict {
  district: string;
  centre_count: number;
  seat_capacity: number;
  utilisation_rate: number;
  primary_sectors: string[];
  key_hubs: string;
}

interface TrainingInstituteLocation {
  id: string;
  name: string;
  district: string;
  state: string;
  location_address: string;
  type: string;
  sector: string;
  specialized_trades: string[];
  sanctioned_seats: number;
  active_enrolment: number;
  utilisation_rate: number;
  status: string;
  ncvet_grade: string;
}

interface TrainingCentresData {
  state: string;
  total_centres: number;
  average_utilisation: number;
  monthly_total_throughput: number;
  centres_by_sector: TrainingCentreDetail[];
  district_distribution?: TrainingCentreDistrict[];
  institutes?: TrainingInstituteLocation[];
}

/* ================================================================== */
/*  SECTOR i18n KEY MAPPING                                           */
/* ================================================================== */

const SECTOR_KEY_MAP: Record<string, string> = {
  'Green Energy': 'sectors.green_energy',
  'Electronics': 'sectors.electronics',
  'Logistics': 'sectors.logistics',
  'Healthcare': 'sectors.healthcare',
  'IT / ITES': 'sectors.it_ites',
};

/* ================================================================== */
/*  INDIAN STATES — with population-based scale weights               */
/*  Weight 1.0 ≈ Uttar Pradesh (largest). Scale controls all numbers. */
/* ================================================================== */

interface StateProfile {
  name: string;
  /** Relative population scale (UP=1.0) — governs all data volumes */
  weight: number;
  /** Sector strength bias: which sectors are dominant in this state
   *  [greenEnergy, electronics, logistics, healthcare, IT] each 0.5–1.5 */
  sectorBias: [number, number, number, number, number];
  /** Number of training centres (realistic) */
  centres: number;
  /** Number of active SSCs mapped to this state */
  sscs: number;
}

const STATE_PROFILES: Record<string, StateProfile> = {
  'Uttar Pradesh':          { name: 'Uttar Pradesh',          weight: 0.165,  sectorBias: [0.95, 0.75, 1.20, 1.05, 0.65], centres: 2340, sscs: 34 },
  'Maharashtra':            { name: 'Maharashtra',            weight: 0.105,  sectorBias: [0.85, 1.15, 1.25, 0.95, 1.35], centres: 1490, sscs: 36 },
  'Bihar':                  { name: 'Bihar',                  weight: 0.086,  sectorBias: [0.75, 0.55, 0.90, 0.85, 0.45], centres: 1220, sscs: 22 },
  'West Bengal':            { name: 'West Bengal',            weight: 0.072,  sectorBias: [0.70, 0.85, 1.05, 0.95, 0.75], centres: 1020, sscs: 28 },
  'Madhya Pradesh':         { name: 'Madhya Pradesh',         weight: 0.060,  sectorBias: [1.15, 0.65, 0.85, 0.75, 0.55], centres: 850,  sscs: 26 },
  'Tamil Nadu':             { name: 'Tamil Nadu',             weight: 0.068,  sectorBias: [0.95, 1.30, 1.10, 1.05, 1.25], centres: 965,  sscs: 35 },
  'Rajasthan':              { name: 'Rajasthan',              weight: 0.058,  sectorBias: [1.35, 0.65, 0.90, 0.75, 0.55], centres: 820,  sscs: 25 },
  'Karnataka':              { name: 'Karnataka',              weight: 0.064,  sectorBias: [0.85, 1.25, 1.05, 0.95, 1.45], centres: 910,  sscs: 34 },
  'Gujarat':                { name: 'Gujarat',                weight: 0.062,  sectorBias: [1.25, 1.05, 1.30, 0.85, 0.95], centres: 880,  sscs: 32 },
  'Andhra Pradesh':         { name: 'Andhra Pradesh',         weight: 0.046,  sectorBias: [1.05, 1.10, 0.95, 0.85, 1.05], centres: 650,  sscs: 28 },
  'Odisha':                 { name: 'Odisha',                 weight: 0.038,  sectorBias: [0.95, 0.65, 0.85, 0.75, 0.55], centres: 540,  sscs: 22 },
  'Telangana':              { name: 'Telangana',              weight: 0.042,  sectorBias: [0.75, 1.05, 0.95, 0.95, 1.35], centres: 595,  sscs: 30 },
  'Kerala':                 { name: 'Kerala',                 weight: 0.032,  sectorBias: [0.65, 0.75, 0.85, 1.35, 1.05], centres: 455,  sscs: 27 },
  'Jharkhand':              { name: 'Jharkhand',              weight: 0.028,  sectorBias: [0.85, 0.65, 0.75, 0.65, 0.45], centres: 400,  sscs: 20 },
  'Assam':                  { name: 'Assam',                  weight: 0.026,  sectorBias: [0.75, 0.55, 0.85, 0.75, 0.45], centres: 370,  sscs: 18 },
  'Punjab':                 { name: 'Punjab',                 weight: 0.025,  sectorBias: [0.85, 0.75, 1.10, 0.95, 0.65], centres: 355,  sscs: 24 },
  'Chhattisgarh':           { name: 'Chhattisgarh',           weight: 0.022,  sectorBias: [1.05, 0.55, 0.75, 0.65, 0.45], centres: 310,  sscs: 18 },
  'Haryana':                { name: 'Haryana',                weight: 0.024,  sectorBias: [0.95, 1.05, 1.25, 0.85, 1.05], centres: 340,  sscs: 26 },
  'Delhi':                  { name: 'Delhi',                  weight: 0.026,  sectorBias: [0.45, 0.85, 1.05, 1.05, 1.55], centres: 370,  sscs: 32 },
  'Jammu & Kashmir':        { name: 'Jammu & Kashmir',        weight: 0.012,  sectorBias: [0.75, 0.45, 0.65, 0.85, 0.55], centres: 170,  sscs: 14 },
  'Uttarakhand':            { name: 'Uttarakhand',            weight: 0.011,  sectorBias: [0.95, 0.65, 0.75, 0.85, 0.75], centres: 155,  sscs: 18 },
  'Himachal Pradesh':       { name: 'Himachal Pradesh',       weight: 0.008,  sectorBias: [1.05, 0.55, 0.65, 0.75, 0.55], centres: 115,  sscs: 15 },
  'Tripura':                { name: 'Tripura',                weight: 0.004,  sectorBias: [0.65, 0.45, 0.55, 0.75, 0.35], centres: 55,   sscs: 10 },
  'Meghalaya':              { name: 'Meghalaya',              weight: 0.0035, sectorBias: [0.75, 0.35, 0.55, 0.65, 0.35], centres: 50,   sscs: 9  },
  'Manipur':                { name: 'Manipur',                weight: 0.0032, sectorBias: [0.55, 0.35, 0.45, 0.75, 0.35], centres: 45,   sscs: 8  },
  'Nagaland':               { name: 'Nagaland',               weight: 0.0025, sectorBias: [0.55, 0.35, 0.45, 0.65, 0.35], centres: 35,   sscs: 7  },
  'Goa':                    { name: 'Goa',                    weight: 0.0022, sectorBias: [0.55, 0.65, 0.75, 0.85, 0.95], centres: 30,   sscs: 12 },
  'Arunachal Pradesh':      { name: 'Arunachal Pradesh',      weight: 0.0018, sectorBias: [0.85, 0.25, 0.35, 0.55, 0.25], centres: 25,   sscs: 6  },
  'Puducherry':             { name: 'Puducherry',             weight: 0.0016, sectorBias: [0.45, 0.65, 0.55, 0.75, 0.85], centres: 22,   sscs: 10 },
  'Mizoram':                { name: 'Mizoram',                weight: 0.0014, sectorBias: [0.55, 0.35, 0.35, 0.65, 0.35], centres: 20,   sscs: 6  },
  'Chandigarh':             { name: 'Chandigarh',             weight: 0.0015, sectorBias: [0.35, 0.75, 0.65, 0.85, 1.05], centres: 21,   sscs: 12 },
  'Sikkim':                 { name: 'Sikkim',                 weight: 0.0010, sectorBias: [0.75, 0.25, 0.35, 0.55, 0.35], centres: 14,   sscs: 5  },
  'Dadra & Nagar Haveli':   { name: 'Dadra & Nagar Haveli',   weight: 0.0008, sectorBias: [0.45, 0.85, 0.65, 0.45, 0.35], centres: 11,   sscs: 5  },
  'Andaman & Nicobar':      { name: 'Andaman & Nicobar',      weight: 0.0006, sectorBias: [0.65, 0.25, 0.45, 0.55, 0.25], centres: 8,    sscs: 4  },
  'Ladakh':                 { name: 'Ladakh',                 weight: 0.0004, sectorBias: [0.85, 0.15, 0.25, 0.45, 0.25], centres: 6,    sscs: 3  },
  'Lakshadweep':            { name: 'Lakshadweep',            weight: 0.0002, sectorBias: [0.55, 0.15, 0.35, 0.45, 0.15], centres: 3,    sscs: 2  },
};

const INDIAN_STATES = Object.keys(STATE_PROFILES).sort();

/* ================================================================== */
/*  SEEDED RANDOM — deterministic per-state data                      */
/* ================================================================== */

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/* ================================================================== */
/*  DATA GENERATOR — population-weighted, realistic numbers           */
/* ================================================================== */

/**
 * National baseline per sector (capacity/demand per weight-unit).
 * A state with weight 1.0 would have approximately these values.
 * Smaller states scale linearly down from here.
 */
const NATIONAL_BASE = {
  'Green Energy': { baseCap: 82000,  baseDem: 125000 },
  'Electronics':  { baseCap: 110000, baseDem: 95000 },
  'Logistics':    { baseCap: 72000,  baseDem: 118000 },
  'Healthcare':   { baseCap: 98000,  baseDem: 140000 },
  'IT / ITES':    { baseCap: 135000, baseDem: 112000 },
};

const SECTOR_KEYS = ['Green Energy', 'Electronics', 'Logistics', 'Healthcare', 'IT / ITES'] as const;

function generateStateData(stateName: string): StateData {
  if (stateName === 'National') return NATIONAL_DATA;

  const profile = STATE_PROFILES[stateName];
  if (!profile) {
    return generateStateData('Goa');
  }

  const share = profile.weight;
  const biases = profile.sectorBias;

  // ── Sector data ──
  const sectors: SectorRow[] = SECTOR_KEYS.map((sector, idx) => {
    const base = NATIONAL_BASE[sector];
    const bias = biases[idx];
    return {
      sector,
      capacity: Math.round(base.baseCap * share * bias),
      demand:   Math.round(base.baseDem * share * bias),
    };
  });

  // ── Aggregated metrics ──
  const totalCap = sectors.reduce((s, x) => s + x.capacity, 0);
  const totalDem = sectors.reduce((s, x) => s + x.demand, 0);
  const gap = totalDem - totalCap;
  const gapIsDeficit = gap > 0;

  const metrics: MetricSet = {
    trainingSeats: {
      value: totalCap.toLocaleString('en-IN'),
      change: '+4.1%',
      trend: 'up',
      centres: profile.centres.toLocaleString('en-IN'),
    },
    industryDemand: {
      value: totalDem.toLocaleString('en-IN'),
      change: '+7.5%',
      trend: 'up',
      sscs: String(profile.sscs),
    },
    gap: {
      value: Math.abs(gap).toLocaleString('en-IN'),
      change: `${gapIsDeficit ? '+' : '−'}5.1%`,
      trend: gapIsDeficit ? 'up' : 'down',
    },
  };

  // ── Alerts ──
  const maxAlertGap = Math.max(30, Math.round(profile.weight * 42000));
  const minAlertGap = Math.max(10, Math.round(profile.weight * 1200));

  const trades = [
    { trade: 'Data Entry Operator',      type: 'oversupply' as const, sev: 'critical' as const },
    { trade: 'Drone Technology',          type: 'shortage'   as const, sev: 'critical' as const },
    { trade: 'Solar Panel Installation',  type: 'shortage'   as const, sev: 'high'     as const },
    { trade: 'Domestic Data Entry',       type: 'oversupply' as const, sev: 'high'     as const },
    { trade: 'EV Battery Technician',     type: 'shortage'   as const, sev: 'medium'   as const },
    { trade: 'Basic Computer Course',     type: 'oversupply' as const, sev: 'medium'   as const },
    { trade: 'Robotic Process Automation',type: 'shortage'   as const, sev: 'high'     as const },
    { trade: 'Sewing Machine Operator',   type: 'oversupply' as const, sev: 'medium'   as const },
    { trade: 'CNC Machine Operator',      type: 'shortage'   as const, sev: 'high'     as const },
    { trade: 'Plumber (General)',         type: 'shortage'   as const, sev: 'medium'   as const },
  ];

  const rng = seededRandom(hashString(stateName));
  const alertCount = Math.min(
    trades.length,
    Math.max(2, Math.round(2 + profile.weight * 8))
  );
  const shuffled = [...trades].sort(() => rng() - 0.5).slice(0, alertCount);

  const alerts: AlertItem[] = shuffled.map((tr, i) => {
    const gapVal = Math.round(minAlertGap + rng() * (maxAlertGap - minAlertGap));
    return {
      id: i + 1,
      trade: tr.trade,
      type: tr.type,
      severity: tr.sev,
      messageKey: tr.type === 'oversupply'
        ? 'alerts.oversupply'
        : tr.sev === 'medium' ? 'alerts.moderate_shortage' : 'alerts.acute_shortage',
      recommendationKey: tr.type === 'oversupply' ? 'alerts.freeze_batch' : 'alerts.increase_target',
      gap: `${tr.type === 'oversupply' ? '+' : '−'}${gapVal.toLocaleString('en-IN')}`,
      hoursAgo: Math.round(1 + rng() * 11),
    };
  });

  return { sectors, metrics, alerts };
}

/* ================================================================== */
/*  NATIONAL (ALL-INDIA) DATA                                         */
/* ================================================================== */

const NATIONAL_DATA: StateData = {
  sectors: [
    { sector: 'Green Energy', capacity: 82000, demand: 125000 },
    { sector: 'Electronics', capacity: 110000, demand: 95000 },
    { sector: 'Logistics', capacity: 72000, demand: 118000 },
    { sector: 'Healthcare', capacity: 98000, demand: 140000 },
    { sector: 'IT / ITES', capacity: 135000, demand: 112000 },
  ],
  metrics: {
    trainingSeats: { value: '4,97,000', change: '+3.2%', trend: 'up', centres: '14,200' },
    industryDemand: { value: '5,90,000', change: '+8.7%', trend: 'up', sscs: '38' },
    gap: { value: '93,000', change: '+5.1%', trend: 'up' },
  },
  alerts: [
    { id: 1, trade: 'Data Entry Operator', type: 'oversupply', severity: 'critical', messageKey: 'alerts.oversupply', recommendationKey: 'alerts.freeze_batch', gap: '+42,000', hoursAgo: 2 },
    { id: 2, trade: 'Drone Technology', type: 'shortage', severity: 'critical', messageKey: 'alerts.acute_shortage', recommendationKey: 'alerts.increase_target', gap: '−18,500', hoursAgo: 3 },
    { id: 3, trade: 'Solar Panel Installation', type: 'shortage', severity: 'high', messageKey: 'alerts.acute_shortage', recommendationKey: 'alerts.increase_target', gap: '−12,300', hoursAgo: 4 },
    { id: 4, trade: 'Domestic Data Entry', type: 'oversupply', severity: 'high', messageKey: 'alerts.oversupply', recommendationKey: 'alerts.freeze_batch', gap: '+31,200', hoursAgo: 5 },
    { id: 5, trade: 'EV Battery Technician', type: 'shortage', severity: 'medium', messageKey: 'alerts.moderate_shortage', recommendationKey: 'alerts.increase_target', gap: '−8,900', hoursAgo: 6 },
    { id: 6, trade: 'Basic Computer Course', type: 'oversupply', severity: 'medium', messageKey: 'alerts.oversupply', recommendationKey: 'alerts.freeze_batch', gap: '+22,100', hoursAgo: 7 },
    { id: 7, trade: 'Robotic Process Automation', type: 'shortage', severity: 'high', messageKey: 'alerts.acute_shortage', recommendationKey: 'alerts.increase_target', gap: '−15,700', hoursAgo: 8 },
    { id: 8, trade: 'Sewing Machine Operator', type: 'oversupply', severity: 'medium', messageKey: 'alerts.oversupply', recommendationKey: 'alerts.freeze_batch', gap: '+19,400', hoursAgo: 9 },
  ],
};

// Cache generated state data so it doesn't regenerate on every render
const stateDataCache: Record<string, StateData> = {};
function getStateData(stateName: string): StateData {
  if (!stateDataCache[stateName]) {
    stateDataCache[stateName] = generateStateData(stateName);
  }
  return stateDataCache[stateName];
}

/* ================================================================== */
/*  TRADE TO SECTOR MAPPING & DRILL-DOWN HELPERS                      */
/* ================================================================== */

const TRADE_SECTOR_MAP: Record<string, string> = {
  'Data Entry Operator': 'Electronics',
  'Domestic Data Entry': 'Electronics',
  'Basic Computer Course': 'Electronics',
  'Solar Panel Installation': 'Green Energy',
  'EV Battery Technician': 'Green Energy',
  'Drone Technology': 'Electronics',
  'Robotic Process Automation': 'IT / ITES',
  'Sewing Machine Operator': 'Logistics',
  'Solar PV Installer': 'Green Energy',
  'Wind Turbine Tech': 'Green Energy',
  'Electronics Mechanic': 'Electronics',
  'IoT Technician': 'Electronics',
  'PCB Assembler': 'Electronics',
  'Warehouse Operations Associate': 'Logistics',
  'Logistics Coordinator': 'Logistics',
  'Cold Chain Tech': 'Logistics',
  'General Duty Assistant': 'Healthcare',
  'Medical Lab Technician': 'Healthcare',
  'Phlebotomist': 'Healthcare',
  'Full-Stack Developer': 'IT / ITES',
  'AI/ML Engineer': 'IT / ITES',
  'Cybersecurity Analyst': 'IT / ITES',
};

function getSectorForTrade(trade: string): string {
  if (TRADE_SECTOR_MAP[trade]) return TRADE_SECTOR_MAP[trade];
  const t = trade.toLowerCase();
  if (t.includes('solar') || t.includes('battery') || t.includes('wind') || t.includes('ev') || t.includes('energy')) return 'Green Energy';
  if (t.includes('electronics') || t.includes('iot') || t.includes('pcb') || t.includes('computer') || t.includes('data')) return 'Electronics';
  if (t.includes('logistics') || t.includes('warehouse') || t.includes('supply chain') || t.includes('delivery')) return 'Logistics';
  if (t.includes('health') || t.includes('medical') || t.includes('nurse') || t.includes('lab') || t.includes('duty')) return 'Healthcare';
  if (t.includes('ai') || t.includes('ml') || t.includes('developer') || t.includes('cyber') || t.includes('robotic')) return 'IT / ITES';
  return 'Green Energy';
}

function generateLocalTimeSeries(state: string): TimeSeriesPoint[] {
  const isNational = state === 'National';
  const prof = STATE_PROFILES[state] || { weight: 0.05, sectorBias: [1, 1, 1, 1, 1], centres: 500, sscs: 20 };
  const share = isNational ? 1.0 : prof.weight;
  const biases = isNational ? [1, 1, 1, 1, 1] : prof.sectorBias;

  const baseCaps = [82000, 110000, 72000, 98000, 135000];
  const baseDems = [125000, 95000, 118000, 140000, 112000];

  const finalCap = baseCaps.reduce((acc, cap, i) => acc + Math.round(cap * share * biases[i]), 0);
  const finalDem = baseDems.reduce((acc, dem, i) => acc + Math.round(dem * share * biases[i]), 0);

  const months = ["Apr'25","May'25","Jun'25","Jul'25","Aug'25","Sep'25","Oct'25","Nov'25","Dec'25","Jan'26","Feb'26","Mar'26"];
  const capFactors = [0.902, 0.911, 0.920, 0.928, 0.937, 0.947, 0.956, 0.966, 0.975, 0.984, 0.992, 1.000];
  const demFactors = [0.865, 0.876, 0.888, 0.902, 0.919, 0.933, 0.949, 0.963, 0.976, 0.985, 0.993, 1.000];

  return months.map((month, i) => {
    const supply = Math.round(finalCap * capFactors[i]);
    const demand = Math.round(finalDem * demFactors[i]);
    return {
      month,
      supply,
      demand,
      gap: demand - supply,
    };
  });
}

function generateLocalSectorForecast(sector: string, state: string): SectorForecastData {
  const metaMap: Record<string, SectorMeta> = {
    'Green Energy': {
      description: 'Solar, wind, EV, and sustainable energy trades',
      top_trades: ['Solar PV Installer', 'EV Battery Technician', 'Wind Turbine Tech'],
      growth_rate: 0.032,
      saturation_risk: 'Low',
      ncvet_aligned: true,
    },
    'Electronics': {
      description: 'Consumer electronics, IoT, embedded systems',
      top_trades: ['Electronics Mechanic', 'IoT Technician', 'PCB Assembler'],
      growth_rate: 0.018,
      saturation_risk: 'Medium',
      ncvet_aligned: true,
    },
    'Logistics': {
      description: 'Warehousing, last-mile delivery, supply chain',
      top_trades: ['Warehouse Operations Associate', 'Logistics Coordinator', 'Cold Chain Tech'],
      growth_rate: 0.025,
      saturation_risk: 'Low',
      ncvet_aligned: true,
    },
    'Healthcare': {
      description: 'Allied health, paramedics, rural health workers',
      top_trades: ['General Duty Assistant', 'Medical Lab Technician', 'Phlebotomist'],
      growth_rate: 0.028,
      saturation_risk: 'Low',
      ncvet_aligned: true,
    },
    'IT / ITES': {
      description: 'Software, AI/ML, cybersecurity, BPO',
      top_trades: ['Full-Stack Developer', 'AI/ML Engineer', 'Cybersecurity Analyst'],
      growth_rate: 0.041,
      saturation_risk: 'Low',
      ncvet_aligned: true,
    },
  };
  const meta = metaMap[sector] || metaMap['Green Energy'];
  const isNational = state === 'National';
  const prof = STATE_PROFILES[state] || { weight: 0.05, sectorBias: [1, 1, 1, 1, 1], centres: 500, sscs: 20 };
  const share = isNational ? 1.0 : prof.weight;
  const sectorIdxMap: Record<string, number> = { 'Green Energy': 0, 'Electronics': 1, 'Logistics': 2, 'Healthcare': 3, 'IT / ITES': 4 };
  const idx = sectorIdxMap[sector] ?? 0;
  const bias = isNational ? 1.0 : (prof.sectorBias[idx] ?? 1.0);

  const baseCaps: Record<string, number> = { 'Green Energy': 82000, 'Electronics': 110000, 'Logistics': 72000, 'Healthcare': 98000, 'IT / ITES': 135000 };
  const baseDems: Record<string, number> = { 'Green Energy': 125000, 'Electronics': 95000, 'Logistics': 118000, 'Healthcare': 140000, 'IT / ITES': 112000 };
  let cap = Math.max(10, Math.round((baseCaps[sector] || 80000) * share * bias));
  let dem = Math.max(15, Math.round((baseDems[sector] || 100000) * share * bias));
  const months = ["Apr'26", "May'26", "Jun'26", "Jul'26", "Aug'26", "Sep'26"];
  const forecast: ForecastPoint[] = months.map((m, i) => {
    cap = Math.round(cap * (1 + 0.006 + (i * 0.002)));
    dem = Math.round(dem * (1 + meta.growth_rate));
    return {
      month: m,
      predicted_capacity: cap,
      predicted_demand: dem,
      predicted_gap: dem - cap,
      confidence: Math.round((0.82 + (i % 3) * 0.04) * 100) / 100,
    };
  });

  return {
    sector,
    state,
    meta,
    forecast,
    recommendation: forecast[forecast.length - 1].predicted_gap > 0
      ? 'Scale up training capacity urgently — demand is outpacing local supply by 25%+.'
      : 'Maintain current seat allocations; monitor course completion rates to avoid saturation.',
  };
}

const LOCAL_DISTRICT_CONFIGS: Record<string, Array<{ district: string; share: number; sectors: string[]; hubs: string }>> = {
  'National': [
    { district: 'Bengaluru Urban (Karnataka)', share: 0.082, sectors: ['IT / ITES', 'Electronics'], hubs: 'Electronic City, Whitefield, Peenya Industrial Area' },
    { district: 'Pune (Maharashtra)', share: 0.076, sectors: ['Green Energy', 'Electronics', 'IT / ITES'], hubs: 'Bhosari MIDC, Chakan Auto Cluster, Hinjawadi' },
    { district: 'Delhi NCR (Gurugram / Noida)', share: 0.088, sectors: ['Logistics', 'IT / ITES', 'Healthcare'], hubs: 'Okhla Phase-3, Udyog Vihar, Noida Sector 62' },
    { district: 'Mumbai & Thane (Maharashtra)', share: 0.078, sectors: ['Healthcare', 'Logistics', 'IT / ITES'], hubs: 'Kurla NSTI, Andheri MIDC, Navi Mumbai Logistics Hub' },
    { district: 'Hyderabad (Telangana)', share: 0.065, sectors: ['IT / ITES', 'Healthcare', 'Electronics'], hubs: 'HITEC City, Genome Valley, Cherlapally' },
    { district: 'Chennai (Tamil Nadu)', share: 0.068, sectors: ['Electronics', 'Green Energy', 'Logistics'], hubs: 'Sriperumbudur EMS Hub, Guindy Industrial Estate' },
    { district: 'Ahmedabad & Surat (Gujarat)', share: 0.062, sectors: ['Green Energy', 'Logistics', 'Healthcare'], hubs: 'Sanand Industrial Park, Sachin GIDC' },
    { district: 'Lucknow & Kanpur (Uttar Pradesh)', share: 0.072, sectors: ['Logistics', 'Healthcare', 'Green Energy'], hubs: 'Panki Industrial Estate, Transport Nagar, Amausi' },
    { district: 'Kolkata & Howrah (West Bengal)', share: 0.054, sectors: ['Logistics', 'Healthcare', 'Electronics'], hubs: 'Salt Lake Sector V, Taratala Industrial Area' },
    { district: 'Jaipur & Jodhpur (Rajasthan)', share: 0.048, sectors: ['Green Energy', 'Electronics'], hubs: 'Sitapura Industrial Area, Boranada Solar SEZ' },
  ],
  'Maharashtra': [
    { district: 'Pune', share: 0.28, sectors: ['Green Energy', 'Electronics', 'IT / ITES'], hubs: 'Aundh Model ITI, Bhosari MIDC, Chakan Auto Hub, Hinjawadi' },
    { district: 'Mumbai Suburban', share: 0.22, sectors: ['Healthcare', 'IT / ITES', 'Logistics'], hubs: 'NSTI Kurla, Andheri SEZ, Chembur Technical Institute' },
    { district: 'Nagpur', share: 0.16, sectors: ['Logistics', 'Green Energy', 'Healthcare'], hubs: 'MIHAN SEZ, Hingna MIDC, Butibori Multimodal Park' },
    { district: 'Thane', share: 0.14, sectors: ['Logistics', 'Healthcare', 'Electronics'], hubs: 'Bhiwandi Logistics Hub, Wagle Industrial Estate' },
    { district: 'Nashik', share: 0.10, sectors: ['Electronics', 'Green Energy'], hubs: 'Ambad MIDC, Satpur Industrial Area' },
    { district: 'Chhatrapati Sambhajinagar', share: 0.10, sectors: ['Green Energy', 'Electronics'], hubs: 'Shendra DMIC, Waluj Industrial Area' },
  ],
  'Uttar Pradesh': [
    { district: 'Lucknow', share: 0.24, sectors: ['Healthcare', 'IT / ITES', 'Logistics'], hubs: 'Alambagh ITI, Gomti Nagar Knowledge Park, Amausi' },
    { district: 'Kanpur Nagar', share: 0.18, sectors: ['Logistics', 'Green Energy', 'Healthcare'], hubs: 'Panki Industrial Area, Fazalganj ITI Corridor' },
    { district: 'Gautam Buddha Nagar (Noida)', share: 0.22, sectors: ['Electronics', 'IT / ITES', 'Logistics'], hubs: 'Noida Sector 62 CoE, Greater Noida EcoTech Hub' },
    { district: 'Varanasi', share: 0.14, sectors: ['Logistics', 'Healthcare', 'Green Energy'], hubs: 'Karaundi Government ITI, Kashi Skill Training Centre' },
    { district: 'Agra', share: 0.12, sectors: ['Logistics', 'Healthcare'], hubs: 'Foundry Nagar Industrial Complex, Sikandra Centre' },
    { district: 'Meerut', share: 0.10, sectors: ['Electronics', 'Logistics'], hubs: 'Partapur Industrial Estate, Delhi-Meerut Expressway Hub' },
  ],
  'Karnataka': [
    { district: 'Bengaluru Urban', share: 0.44, sectors: ['IT / ITES', 'Electronics', 'Green Energy'], hubs: 'Peenya Industrial Area, Electronic City, Hosur Road ITI' },
    { district: 'Mysuru', share: 0.18, sectors: ['Electronics', 'Healthcare', 'IT / ITES'], hubs: 'Hebbal Industrial Area, Belagola PMKK Hub' },
    { district: 'Dharwad / Hubballi', share: 0.14, sectors: ['Green Energy', 'Logistics'], hubs: 'Tarihal Industrial Estate, Rayapur Tech Zone' },
    { district: 'Dakshina Kannada (Mangaluru)', share: 0.12, sectors: ['Healthcare', 'Logistics'], hubs: 'Baikampady Industrial Area, Kadri Skill Academy' },
    { district: 'Belagavi', share: 0.12, sectors: ['Electronics', 'Green Energy'], hubs: 'Udyambag Aerospace & Auto Skilling Centre' },
  ],
  'Tamil Nadu': [
    { district: 'Chennai', share: 0.35, sectors: ['Electronics', 'IT / ITES', 'Healthcare'], hubs: 'Guindy Industrial Estate, Ambattur ITI, Taramani' },
    { district: 'Coimbatore', share: 0.25, sectors: ['Green Energy', 'Electronics'], hubs: 'SIDCO Industrial Estate, Peelamedu Tech Corridor' },
    { district: 'Kanchipuram & Sriperumbudur', share: 0.18, sectors: ['Electronics', 'Logistics'], hubs: 'Oragadam Auto Hub, Sriperumbudur EMS Corridor' },
    { district: 'Madurai', share: 0.12, sectors: ['Healthcare', 'Logistics'], hubs: 'Kappalur Industrial Estate, Madurai Govt ITI' },
    { district: 'Tiruchirappalli', share: 0.10, sectors: ['Green Energy', 'Logistics'], hubs: 'BHEL Thuvakudi Corridor, Ponmalai Skill Hub' },
  ],
  'Gujarat': [
    { district: 'Ahmedabad', share: 0.32, sectors: ['Logistics', 'Healthcare', 'IT / ITES'], hubs: 'Sanand GIDC, Naroda Industrial Area, Sarkhej' },
    { district: 'Surat', share: 0.24, sectors: ['Green Energy', 'Logistics'], hubs: 'Sachin GIDC, Hazira Industrial Belt, Katargam' },
    { district: 'Vadodara', share: 0.20, sectors: ['Green Energy', 'Electronics'], hubs: 'Makarpura GIDC, Savli Industrial Zone' },
    { district: 'Rajkot', share: 0.14, sectors: ['Electronics', 'Green Energy'], hubs: 'Metoda GIDC, Aji Industrial Area' },
    { district: 'Kutch', share: 0.10, sectors: ['Green Energy', 'Logistics'], hubs: 'Mundra Renewable Hub, Kandla Port Logistics Zone' },
  ],
  'Delhi': [
    { district: 'South Delhi', share: 0.28, sectors: ['IT / ITES', 'Healthcare'], hubs: 'Okhla Industrial Area Phase 1-3, Saket Tech Hub' },
    { district: 'North West Delhi', share: 0.26, sectors: ['Logistics', 'Electronics'], hubs: 'Wazirpur Industrial Area, Mangolpuri ITI' },
    { district: 'West Delhi', share: 0.24, sectors: ['Healthcare', 'Logistics'], hubs: 'Mayapuri Industrial Area, Kirti Nagar Tech Centre' },
    { district: 'New Delhi / Central', share: 0.22, sectors: ['IT / ITES', 'Healthcare'], hubs: 'Pusa ITI (Apex Institute), Mandir Marg PMKK' },
  ],
  'Goa': [
    { district: 'North Goa (Panaji & Bardez)', share: 0.58, sectors: ['Healthcare', 'IT / ITES', 'Logistics'], hubs: 'Panaji Model ITI, Mapusa Industrial Area, Tuem Electronic City' },
    { district: 'South Goa (Margao & Mormugao)', share: 0.42, sectors: ['Logistics', 'Green Energy', 'Healthcare'], hubs: 'Margao Govt ITI, Verna Industrial Estate, Mormugao Port Logistics Hub' },
  ],
};

function generateLocalCentresData(state: string): TrainingCentresData {
  const profile = STATE_PROFILES[state];
  const total = state === 'National' ? 14200 : (profile?.centres ?? 900);
  const sectors = [
    { sector: 'Green Energy', share: 0.14, util: 0.88, avgBatch: 30 },
    { sector: 'Electronics', share: 0.20, util: 0.72, avgBatch: 28 },
    { sector: 'Logistics', share: 0.16, util: 0.81, avgBatch: 35 },
    { sector: 'Healthcare', share: 0.18, util: 0.84, avgBatch: 25 },
    { sector: 'IT / ITES', share: 0.22, util: 0.76, avgBatch: 32 },
    { sector: 'Construction', share: 0.06, util: 0.65, avgBatch: 40 },
    { sector: 'Agriculture', share: 0.04, util: 0.58, avgBatch: 22 },
  ];
  const details: TrainingCentreDetail[] = sectors.map((s) => {
    const count = Math.max(1, Math.round(total * s.share));
    const monthlyThroughput = count * s.avgBatch;
    return {
      sector: s.sector,
      centre_count: count,
      utilisation_rate: s.util,
      avg_batch_size: s.avgBatch,
      monthly_throughput: monthlyThroughput,
      status: s.util > 0.85 ? 'Overloaded' : s.util > 0.65 ? 'Active' : 'Underutilised',
    };
  });

  const distConfigs = LOCAL_DISTRICT_CONFIGS[state] || [
    { district: `${state} Capital / Central`, share: 0.40, sectors: ['IT / ITES', 'Healthcare', 'Logistics'], hubs: `Central District Skill Academy, ${state} Model ITI` },
    { district: `${state} Industrial Zone`, share: 0.35, sectors: ['Green Energy', 'Electronics'], hubs: 'State Industrial Development Cluster' },
    { district: `${state} Regional Corridor`, share: 0.25, sectors: ['Logistics', 'Healthcare'], hubs: 'Regional Vocational Training Centre' },
  ];

  const districts: TrainingCentreDistrict[] = [];
  const institutes: TrainingInstituteLocation[] = [];
  const instTypes = ['Government ITI', 'PMKK (Pradhan Mantri Kaushal Kendra)', 'NSTI (National Skill Training Institute)', 'Industry CoE'];
  let instCounter = 1;

  for (const d of distConfigs) {
    const dCount = Math.max(1, Math.round(total * d.share));
    const dCapacity = dCount * 32;
    const dUtil = Math.round((0.72 + (hashString(d.district) % 20) * 0.01) * 100) / 100;
    districts.push({
      district: d.district,
      centre_count: dCount,
      seat_capacity: dCapacity,
      utilisation_rate: dUtil,
      primary_sectors: d.sectors,
      key_hubs: d.hubs,
    });

    const hubsList = d.hubs.split(',').map((h) => h.trim());
    for (let hIdx = 0; hIdx < Math.min(3, hubsList.length); hIdx++) {
      const hub = hubsList[hIdx];
      const itype = instTypes[hIdx % instTypes.length];
      const sec = d.sectors[hIdx % d.sectors.length];
      const cap = Math.max(60, Math.round(350 * (0.8 + (hashString(hub) % 5) * 0.1)));
      const enrolled = Math.round(cap * dUtil);
      const uPct = Math.round((enrolled / cap) * 100) / 100;

      institutes.push({
        id: `TC-${state.slice(0, 2).toUpperCase()}-${String(instCounter).padStart(3, '0')}`,
        name: `${itype} ${hub}`,
        district: d.district,
        state,
        location_address: `${hub}, ${d.district}, ${state}`,
        type: itype,
        sector: sec,
        specialized_trades: [
          `${sec} Specialist`,
          sec === 'Green Energy'
            ? 'Solar PV & EV Tech'
            : sec === 'Electronics'
            ? 'IoT & Embedded Tech'
            : sec === 'Logistics'
            ? 'Supply Chain Operations'
            : sec === 'Healthcare'
            ? 'Clinical Allied Support'
            : 'AI & Cloud Engineering',
        ],
        sanctioned_seats: cap,
        active_enrolment: enrolled,
        utilisation_rate: uPct,
        status: uPct > 0.85 ? 'Overloaded' : uPct > 0.65 ? 'Active' : 'Underutilised',
        ncvet_grade: uPct > 0.75 ? 'NCVET 5-Star' : 'NCVET 4-Star',
      });
      instCounter++;
    }
  }

  return {
    state,
    total_centres: total,
    average_utilisation: 0.77,
    monthly_total_throughput: details.reduce((sum, d) => sum + d.monthly_throughput, 0),
    centres_by_sector: details,
    district_distribution: districts,
    institutes,
  };
}

/* ================================================================== */
/*  CUSTOM CHART TOOLTIP                                              */
/* ================================================================== */

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
}

const CustomTooltip: FC<{
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}> = ({ active, payload, label }) => {
  const { t } = useTranslation();
  if (!active || !payload) return null;

  const translatedLabel = label && SECTOR_KEY_MAP[label]
    ? t(SECTOR_KEY_MAP[label])
    : label;

  return (
    <div className="rounded-xl border border-white/10 bg-navy-900/98 px-5 py-4 shadow-2xl">
      <p className="mb-2 text-sm font-semibold text-white">{translatedLabel}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-slate-400">
            {entry.dataKey === 'capacity'
              ? t('chart.training_capacity')
              : t('chart.industry_demand')}
            :
          </span>
          <span className="font-medium text-white">
            {entry.value.toLocaleString('en-IN')}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ================================================================== */
/*  TIME-SERIES TREND TOOLTIP (SUPPLY, DEMAND, GAP)                   */
/* ================================================================== */

const TrendTooltip: FC<{
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload) return null;

  const supplyItem = payload.find((p) => p.dataKey === 'supply');
  const demandItem = payload.find((p) => p.dataKey === 'demand');
  const gapItem = payload.find((p) => p.dataKey === 'gap');

  const gapVal = gapItem ? gapItem.value : 0;
  const isDeficit = gapVal > 0;

  return (
    <div className="rounded-xl border border-white/15 bg-navy-900/98 px-5 py-4 shadow-2xl">
      <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-accent-cyan">
        Rolling Time-Series • {label}
      </p>
      <div className="space-y-1.5 text-xs">
        {supplyItem && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-slate-400">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              Training Supply
            </span>
            <span className="font-semibold text-white">
              {supplyItem.value.toLocaleString('en-IN')}
            </span>
          </div>
        )}
        {demandItem && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-slate-400">
              <span className="h-2 w-2 rounded-full bg-purple-400" />
              Industry Demand
            </span>
            <span className="font-semibold text-white">
              {demandItem.value.toLocaleString('en-IN')}
            </span>
          </div>
        )}
        <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between gap-4">
          <span className="text-slate-300 font-medium">Net Gap:</span>
          <span
            className="font-bold text-xs px-2 py-0.5 rounded"
            style={{
              background: isDeficit ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
              color: isDeficit ? '#fbbf24' : '#4ade80',
            }}
          >
            {isDeficit ? '+' : '−'}{Math.abs(gapVal).toLocaleString('en-IN')} {isDeficit ? '(Deficit)' : '(Surplus)'}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ================================================================== */
/*  ALERT CARD (CLICKABLE FOR DRILL-DOWN)                             */
/* ================================================================== */

const AlertCard: FC<{
  alert: AlertItem;
  index: number;
  onClick?: () => void;
}> = ({ alert, index, onClick }) => {
  const { t } = useTranslation();
  const isOversupply = alert.type === 'oversupply';

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      title="Click to view sector intelligence & forecast"
      className="group relative cursor-pointer overflow-hidden rounded-xl border transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-white/30"
      style={{
        borderColor: isOversupply ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)',
        background: isOversupply
          ? 'linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(17,22,56,0.8) 100%)'
          : 'linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(17,22,56,0.8) 100%)',
        animationDelay: `${index * 80}ms`,
      }}
    >
      <div
        className="absolute left-0 top-0 h-full w-1"
        style={{
          background: isOversupply
            ? 'linear-gradient(to bottom, #ef4444, #dc2626)'
            : 'linear-gradient(to bottom, #22c55e, #16a34a)',
        }}
      />

      <div className="flex items-start gap-3 p-4 pl-5">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: isOversupply ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
          }}
        >
          {isOversupply ? (
            <CircleAlert className="h-5 w-5 text-alert-red" />
          ) : (
            <CircleCheck className="h-5 w-5 text-alert-green" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: isOversupply ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
                  color: isOversupply ? '#fca5a5' : '#86efac',
                }}
              >
                {t(`severity.${alert.severity}`)}
              </span>
              <span className="text-[11px] text-slate-400">
                {t('timestamps.hrs_ago', { count: alert.hoursAgo })}
              </span>
            </div>
            <span className="text-[10px] text-accent-cyan opacity-0 transition-opacity group-hover:opacity-100 flex items-center gap-0.5 font-medium">
              Inspect <ChevronRight className="h-3 w-3" />
            </span>
          </div>

          <p className="mb-1 truncate text-sm font-semibold text-white flex items-center gap-2">
            {alert.trade}
            {alert.nsqf_level && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-slate-300">
                NSQF L{alert.nsqf_level}
              </span>
            )}
          </p>

          <p
            className="mb-2 text-xs font-medium"
            style={{ color: isOversupply ? '#fca5a5' : '#86efac' }}
          >
            {t(alert.messageKey)}: {t(alert.recommendationKey)}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {isOversupply ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-alert-red" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5 text-alert-green" />
              )}
              <span className="text-xs font-semibold text-slate-300">
                {alert.gap} {t('alerts.trainees')}
              </span>
            </div>
            <span className="text-[10px] text-accent-cyan/80 group-hover:underline">Sector Data →</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ================================================================== */
/*  MAIN DASHBOARD COMPONENT                                          */
/* ================================================================== */

const MSDEDashboard: FC = () => {
  const { t } = useTranslation();
  const [scope, setScope] = useState<'national' | 'state'>('national');
  const [selectedState, setSelectedState] = useState<string>('Madhya Pradesh');
  const [scopeOpen, setScopeOpen] = useState(false);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [stateSearch, setStateSearch] = useState('');
  const [mounted] = useState(true);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activeData, setActiveData] = useState<StateData | null>(null);

  // Tab state for chart (default to 'trend' line graph on main screen)
  const [chartTab, setChartTab] = useState<'sectors' | 'trend'>('trend');
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesPoint[]>([]);

  // Sector Forecast Modal
  const [selectedSectorForForecast, setSelectedSectorForForecast] = useState<string | null>(null);
  const [sectorForecastData, setSectorForecastData] = useState<SectorForecastData | null>(null);
  const [loadingSectorForecast, setLoadingSectorForecast] = useState<boolean>(false);

  // Early Warning Drill-Down Modal
  const [selectedAlertForModal, setSelectedAlertForModal] = useState<AlertItem | null>(null);

  // Training Centres Modal
  const [trainingCentresModalOpen, setTrainingCentresModalOpen] = useState(false);
  const [trainingCentresData, setTrainingCentresData] = useState<TrainingCentresData | null>(null);
  const [loadingCentres, setLoadingCentres] = useState(false);
  const [trainingCentresTab, setTrainingCentresTab] = useState<'districts' | 'institutes' | 'sectors'>('districts');
  const [trainingCentresSearch, setTrainingCentresSearch] = useState<string>('');
  const [trainingCentresDistrictFilter, setTrainingCentresDistrictFilter] = useState<string>('all');
  const [trainingCentresTypeFilter, setTrainingCentresTypeFilter] = useState<string>('all');

  // Job Roles & Predictions Menu Modal
  const [jobRolesModalOpen, setJobRolesModalOpen] = useState(false);

  const scopeRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) {
        setScopeOpen(false);
      }
      if (stateRef.current && !stateRef.current.contains(e.target as Node)) {
        setStateDropdownOpen(false);
        setStateSearch('');
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCopyKey = () => {
    navigator.clipboard.writeText('kaushal_live_9f82d1c74a00b2e8813a48e7e190');
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleDownloadCredentialsFile = useCallback(() => {
    const credentials = {
      client_name: 'MSDE Nodal Integration Client',
      organization: 'Ministry of Skill Development & Entrepreneurship',
      environment: 'production',
      api_key: 'kaushal_live_9f82d1c74a00b2e8813a48e7e190',
      api_base_url: 'http://127.0.0.1:8000/api/v1',
      endpoints: {
        demand_index: '/api/v1/demand-index',
        target_setting_export: '/api/v1/export/target-setting',
      },
      issued_at: new Date().toISOString(),
      expires_at: '2027-10-01T00:00:00Z',
    };
    const blob = new Blob([JSON.stringify(credentials, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kaushal_drishty_msde_api_credentials.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Fetch active data set & time series
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      const stateQuery = scope === 'national' ? 'National' : selectedState;
      try {
        // Fetch state demand
        const demandRes = await fetch(`http://127.0.0.1:8000/api/v1/geo/state-demand?state=${encodeURIComponent(stateQuery)}`);
        const demandData = await demandRes.json();
        
        // Fetch early warnings
        const warnQuery = scope === 'national' ? '' : `?state=${encodeURIComponent(selectedState)}`;
        const warningsRes = await fetch(`http://127.0.0.1:8000/api/v1/early-warnings${warnQuery}`);
        const warningsData = await warningsRes.json();
        
        if (isMounted) {
          setActiveData({
            sectors: demandData.sectors,
            metrics: demandData.metrics,
            alerts: warningsData.warnings
          });
        }
      } catch (err) {
        console.error("Failed to fetch API data, falling back to local generated mock:", err);
        if (isMounted) {
          setActiveData(scope === 'national' ? NATIONAL_DATA : getStateData(selectedState));
        }
      }

      // Fetch rolling time series
      try {
        const timeRes = await fetch(`http://127.0.0.1:8000/api/v1/trend/time-series?state=${encodeURIComponent(stateQuery)}`);
        if (timeRes.ok) {
          const timeJson = await timeRes.json();
          if (isMounted) setTimeSeriesData(timeJson.data);
        } else {
          if (isMounted) setTimeSeriesData(generateLocalTimeSeries(stateQuery));
        }
      } catch {
        if (isMounted) setTimeSeriesData(generateLocalTimeSeries(stateQuery));
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [scope, selectedState]);

  // Fetch Sector Forecast when selected
  useEffect(() => {
    if (!selectedSectorForForecast) {
      setSectorForecastData(null);
      return;
    }
    let isMounted = true;
    setLoadingSectorForecast(true);
    const fetchForecast = async () => {
      const stateQuery = scope === 'national' ? 'National' : selectedState;
      try {
        const res = await fetch(
          `http://127.0.0.1:8000/api/v1/sector/forecast?sector=${encodeURIComponent(selectedSectorForForecast)}&state=${encodeURIComponent(stateQuery)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setSectorForecastData(data);
            setLoadingSectorForecast(false);
          }
          return;
        }
      } catch (err) {
        console.error("Forecast fetch error, using fallback:", err);
      }
      if (isMounted) {
        setSectorForecastData(generateLocalSectorForecast(selectedSectorForForecast, stateQuery));
        setLoadingSectorForecast(false);
      }
    };
    fetchForecast();
    return () => { isMounted = false; };
  }, [selectedSectorForForecast, scope, selectedState]);

  // Fetch Training Centres when modal opens
  useEffect(() => {
    if (!trainingCentresModalOpen) return;
    let isMounted = true;
    setLoadingCentres(true);
    const fetchCentres = async () => {
      const stateQuery = scope === 'national' ? 'National' : selectedState;
      try {
        const res = await fetch(
          `http://127.0.0.1:8000/api/v1/training-centres?state=${encodeURIComponent(stateQuery)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setTrainingCentresData(data);
            setLoadingCentres(false);
          }
          return;
        }
      } catch (err) {
        console.error("Centres fetch error, using fallback:", err);
      }
      if (isMounted) {
        setTrainingCentresData(generateLocalCentresData(stateQuery));
        setLoadingCentres(false);
      }
    };
    fetchCentres();
    return () => { isMounted = false; };
  }, [trainingCentresModalOpen, scope, selectedState]);

  const handleExportForecast = useCallback(async () => {
    if (!activeData) return;
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/export/target-setting');
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kaushal_drishty_target_setting_${scope === 'national' ? 'national' : selectedState.toLowerCase().replace(/\s+/g, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
    } catch {
      // offline fallback
    }
    const exportData = {
      scope,
      region: scope === 'national' ? 'National (All India)' : selectedState,
      timestamp: new Date().toISOString(),
      summary: activeData.metrics,
      sector_allocations: activeData.sectors.map((s) => ({
        sector: s.sector,
        current_capacity: s.capacity,
        projected_demand: s.demand,
        gap: s.demand - s.capacity,
        recommended_action:
          s.demand > s.capacity ? 'Increase Allocation' : 'Freeze Expansion',
      })),
      early_warnings: activeData.alerts,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kaushal_drishty_target_setting_${scope === 'national' ? 'national' : selectedState.toLowerCase().replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [scope, selectedState, activeData]);

  const filteredStates = stateSearch
    ? INDIAN_STATES.filter((s) =>
        s.toLowerCase().includes(stateSearch.toLowerCase())
      )
    : INDIAN_STATES;

  if (!activeData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-accent-cyan"></div>
          <p className="text-slate-400 font-medium text-sm">Syncing with Kaushal Drishty Intelligence Engine...</p>
        </div>
      </div>
    );
  }

  const isDeficit = !activeData.metrics.gap.change.startsWith('−');

  // Build metric cards from active data
  const metricCards = [
    {
      titleKey: 'metrics.total_active_training_seats',
      value: activeData.metrics.trainingSeats.value,
      change: activeData.metrics.trainingSeats.change,
      trend: activeData.metrics.trainingSeats.trend,
      icon: Users,
      color: '#3b82f6',
      subtitle: t('metrics.across_centres', { count: activeData.metrics.trainingSeats.centres }),
    },
    {
      titleKey: 'metrics.aggregated_industry_demand',
      value: activeData.metrics.industryDemand.value,
      change: activeData.metrics.industryDemand.change,
      trend: activeData.metrics.industryDemand.trend,
      icon: Factory,
      color: '#8b5cf6',
      subtitle: t('metrics.from_sscs', { count: activeData.metrics.industryDemand.sscs }),
    },
    {
      titleKey: 'metrics.overall_demand_supply_gap',
      value: activeData.metrics.gap.value,
      change: activeData.metrics.gap.change,
      trend: activeData.metrics.gap.trend,
      icon: Activity,
      color: '#f59e0b',
      subtitle: t(isDeficit ? 'metrics.net_deficit' : 'metrics.net_surplus'),
    },
  ];

  // Display label for current scope
  const scopeDisplayLabel =
    scope === 'national'
      ? t('nav.scope_national')
      : selectedState;

  // Memoized time-series forecast data to avoid repeated calculations during renders
  const activeTimeSeries = useMemo(() => {
    return timeSeriesData.length > 0
      ? timeSeriesData
      : generateLocalTimeSeries(scope === 'national' ? 'National' : selectedState);
  }, [timeSeriesData, scope, selectedState]);

  return (
    <div className="noise-overlay min-h-screen">
      {/* ── NAVBAR ─────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.05] bg-navy-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1920px] items-center justify-between px-6 py-2.5">
          {/* brand */}
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] shadow-lg shadow-accent-indigo/10">
              <img
                src="/logo.jpg"
                alt="Kaushal Drishty Logo"
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-accent-cyan/10 to-accent-purple/10" />
            </div>
            <div>
              <h1 className="text-gradient-brand text-lg font-extrabold leading-tight tracking-tight">
                {t('brand.title')}
              </h1>
              <p className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">
                {t('brand.subtitle')}
              </p>
            </div>
          </div>

          {/* controls */}
          <div className="flex items-center gap-2.5">
            {/* ── SCOPE DROPDOWN ── */}
            <div className="relative" ref={scopeRef}>
              <button
                id="scope-dropdown"
                onClick={() => setScopeOpen(!scopeOpen)}
                className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3.5 py-2 text-[13px] font-medium text-slate-300 transition-all hover:bg-white/[0.06] hover:border-white/[0.12]"
              >
                <Globe className="h-3.5 w-3.5 text-accent-cyan" />
                {scope === 'national' ? t('nav.scope_national') : t('nav.scope_state')}
                <ChevronDown
                  className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-200 ${scopeOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {scopeOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-navy-800/98 py-1 shadow-2xl">
                  <button
                    onClick={() => {
                      setScope('national');
                      setScopeOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] transition hover:bg-white/[0.05] ${
                      scope === 'national' ? 'font-semibold text-accent-cyan' : 'text-slate-400'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {t('nav.scope_national')}
                  </button>
                  <button
                    onClick={() => {
                      setScope('state');
                      setScopeOpen(false);
                      if (!selectedState) setStateDropdownOpen(true);
                    }}
                    className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] transition hover:bg-white/[0.05] ${
                      scope === 'state' ? 'font-semibold text-accent-cyan' : 'text-slate-400'
                    }`}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {t('nav.scope_state')}
                  </button>
                </div>
              )}
            </div>

            {/* ── STATE SELECTOR ── */}
            {scope === 'state' && (
              <div className="relative" ref={stateRef}>
                <button
                  id="state-selector"
                  onClick={() => setStateDropdownOpen(!stateDropdownOpen)}
                  className="flex items-center gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/[0.08] px-3.5 py-2 text-[13px] font-semibold text-accent-cyan transition-all hover:bg-accent-cyan/[0.14] hover:border-accent-cyan/50 shadow-sm shadow-accent-cyan/10"
                >
                  <MapPin className="h-3.5 w-3.5 text-accent-cyan" />
                  <span>{selectedState}</span>
                  <span className="rounded bg-accent-cyan/20 px-1.5 py-0.5 text-[10px] font-bold text-accent-cyan">
                    36 States
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${stateDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {stateDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-80 overflow-hidden rounded-xl border border-white/[0.12] bg-navy-900/98 shadow-2xl z-50">
                    <div className="border-b border-white/[0.08] p-3 bg-navy-950/60">
                      <div className="flex items-center gap-2 rounded-lg bg-white/[0.05] border border-white/[0.08] px-3 py-2">
                        <Search className="h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search 36 States & UTs…"
                          value={stateSearch}
                          onChange={(e) => setStateSearch(e.target.value)}
                          className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
                          autoFocus
                        />
                        {stateSearch && (
                          <button
                            onClick={() => setStateSearch('')}
                            className="text-[10px] text-slate-400 hover:text-white"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto py-1 divide-y divide-white/[0.03]">
                      {filteredStates.length === 0 && (
                        <p className="px-4 py-4 text-xs text-slate-500 text-center">No states found</p>
                      )}
                      {filteredStates.map((state) => {
                        const prof = STATE_PROFILES[state];
                        const isSelected = selectedState === state;
                        return (
                          <button
                            key={state}
                            onClick={() => {
                              setSelectedState(state);
                              setStateDropdownOpen(false);
                              setStateSearch('');
                            }}
                            className={`flex w-full items-center justify-between px-4 py-2.5 text-[13px] transition hover:bg-white/[0.06] ${
                              isSelected
                                ? 'bg-accent-cyan/[0.12] font-semibold text-accent-cyan'
                                : 'text-slate-300'
                            }`}
                          >
                            <span className="flex items-center gap-2.5 truncate">
                              <MapPin
                                className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-accent-cyan' : 'text-slate-500'}`}
                              />
                              <span className="truncate">{state}</span>
                            </span>
                            {prof && (
                              <span className="text-[10px] font-medium text-slate-500 shrink-0 ml-2">
                                {prof.centres.toLocaleString('en-IN')} centres
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="h-6 w-px bg-white/[0.06]" />
            <LanguageSwitcher />

            {/* notification bell */}
            <div className="relative" ref={notifRef}>
              <button
                id="notifications-btn"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] transition-all hover:bg-white/[0.06]"
              >
                <Bell className="h-4 w-4 text-slate-400" />
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-alert-red to-red-600 text-[9px] font-bold text-white shadow-sm shadow-alert-red/30">
                  {activeData.alerts.length}
                </span>
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-2xl border border-white/[0.1] bg-navy-900/98 shadow-2xl z-50">
                  <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3 bg-navy-950/60">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-alert-red" />
                      Active Early Warnings
                    </span>
                    <span className="rounded-full bg-alert-red/20 px-2 py-0.5 text-[10px] font-bold text-alert-red">
                      {activeData.alerts.length} New
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-2 space-y-1.5 divide-y divide-white/[0.04]">
                    {activeData.alerts.map((al) => (
                      <div key={al.id} className="pt-1.5 px-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-white truncate max-w-[170px] flex items-center gap-1.5">
                            {al.trade}
                            {al.nsqf_level && (
                              <span className="text-[8px] text-slate-400">L{al.nsqf_level}</span>
                            )}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                            style={{
                              background: al.type === 'oversupply' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
                              color: al.type === 'oversupply' ? '#fca5a5' : '#86efac',
                            }}
                          >
                            {al.type}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                          {t(al.messageKey)}: {t(al.recommendationKey)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── JOB ROLES & TRADES INTELLIGENCE BUTTON ── */}
            <button
              id="job-roles-menu-btn"
              onClick={() => setJobRolesModalOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/[0.08] px-3.5 py-2 text-[13px] font-semibold text-accent-cyan shadow-sm shadow-accent-cyan/10 transition-all hover:bg-accent-cyan/[0.16] hover:border-accent-cyan/50 hover:scale-[1.02]"
              title="Open Sector-Segregated Job Roles, Predictions & Historical Time Series Menu"
            >
              <Briefcase className="h-4 w-4 text-accent-cyan" />
              <span className="hidden sm:inline">Job Roles & Forecasts</span>
              <span className="rounded bg-accent-cyan/20 px-1.5 py-0.5 text-[10px] font-bold text-accent-cyan">
                21 Trades
              </span>
            </button>

            <button
              id="download-api-keys"
              onClick={() => setApiKeyModalOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-accent-indigo to-accent-purple px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-accent-indigo/20 transition-all hover:shadow-accent-indigo/40 hover:brightness-110"
            >
              <Download className="h-4 w-4" />
              {t('nav.download_api_keys')}
            </button>
          </div>
        </div>
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-accent-indigo/40 to-transparent" />
      </nav>

      {/* ── MAIN CONTENT ────────────────────────────────── */}
      <main className="relative mx-auto max-w-[1920px] px-6 pt-7 pb-4">
        {/* sub-header */}
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-accent-cyan/70">
              {t('dashboard.realtime_subtitle')} • {scopeDisplayLabel}
            </p>
            <h2 className="text-[28px] font-extrabold leading-tight text-white flex items-center flex-wrap gap-2">
              <span>{t('dashboard.main_heading')}</span>
              {scope === 'state' && (
                <span className="text-xl font-semibold text-gradient-brand">
                  — {selectedState}
                </span>
              )}
            </h2>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              id="top-view-sectors-btn"
              onClick={() => {
                setChartTab('sectors');
                document.getElementById('main-chart-card')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="flex items-center gap-2 rounded-xl border border-accent-cyan/30 bg-accent-cyan/[0.08] px-3.5 py-2 text-xs font-semibold text-accent-cyan transition-all hover:bg-accent-cyan/[0.15] hover:border-accent-cyan/50 shadow-sm"
              title="Inspect Sector-Wise Workforce Segregation"
            >
              <BarChart2 className="h-3.5 w-3.5 text-accent-cyan" />
              <span>See Sector-Wise Segregation</span>
            </button>
            <button
              id="view-centres-btn"
              onClick={() => setTrainingCentresModalOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-accent-purple/30 bg-accent-purple/[0.08] px-3.5 py-2 text-xs font-semibold text-purple-300 transition-all hover:bg-accent-purple/[0.15] hover:border-accent-purple/50 shadow-sm"
              title="Inspect Training Infrastructure & Centres"
            >
              <Building2 className="h-3.5 w-3.5 text-accent-purple" />
              <span>View Training Centres</span>
            </button>
            <button
              id="export-forecast-btn"
              onClick={handleExportForecast}
              className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-slate-300 transition-all hover:bg-white/[0.07] hover:border-white/[0.15] hover:text-white shadow-sm"
              title="Export LMIS Target-Setting JSON"
            >
              <Download className="h-3.5 w-3.5 text-accent-cyan" />
              <span>Export Targets (JSON)</span>
            </button>
            <div className="flex items-center gap-2 rounded-full border border-alert-green/20 bg-alert-green/[0.06] px-3.5 py-1.5 text-xs text-alert-green">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-alert-green opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-alert-green" />
              </span>
              {t('dashboard.live_status')}
            </div>
          </div>
        </div>

        {/* ── METRIC CARDS ──────────────────────────────── */}
        <div className="mb-7 grid grid-cols-1 gap-5 md:grid-cols-3">
          {metricCards.map((m, idx) => {
            const Icon = m.icon;
            const glowClass =
              m.color === '#3b82f6' ? 'border-glow-blue' :
              m.color === '#8b5cf6' ? 'border-glow-purple' : 'border-glow-cyan';
            return (
              <div
                key={m.titleKey}
                className={`group relative overflow-hidden rounded-2xl glass-card-strong transition-all duration-500 hover:border-white/[0.12] ${glowClass}`}
                style={{
                  animation: mounted ? `fadeInUp 0.6s cubic-bezier(0.16,1,0.3,1) ${idx * 100}ms both` : 'none',
                }}
              >
                <div
                  className="h-[3px] w-full"
                  style={{ background: `linear-gradient(90deg, ${m.color}80, ${m.color}20)` }}
                />
                <div
                  className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 rounded-full animate-pulse-glow blur-2xl"
                  style={{ background: m.color, transform: 'translateZ(0)', willChange: 'opacity' }}
                />
                <div className="relative p-6">
                  <div className="mb-5 flex items-center justify-between">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl border"
                      style={{
                        background: `${m.color}10`,
                        borderColor: `${m.color}20`,
                      }}
                    >
                      <Icon className="h-5 w-5" style={{ color: m.color }} />
                    </div>
                    <span
                      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${
                        m.trend === 'up'
                          ? 'border-alert-green/20 bg-alert-green/[0.08] text-alert-green'
                          : 'border-alert-red/20 bg-alert-red/[0.08] text-alert-red'
                      }`}
                    >
                      {m.trend === 'up' ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {m.change}
                    </span>
                  </div>
                  <p className="mb-1 text-[13px] font-medium text-slate-400">
                    {t(m.titleKey)}
                  </p>
                  <p className="text-[32px] font-extrabold leading-none tracking-tight text-white">
                    {m.value}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-slate-400">{m.subtitle}</p>
                    {idx === 0 && (
                      <button
                        onClick={() => setTrainingCentresModalOpen(true)}
                        className="text-[11px] font-semibold text-accent-cyan hover:underline flex items-center gap-1 transition"
                      >
                        <Building2 className="h-3 w-3" />
                        <span>Centres breakdown →</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── CHART + SIDEBAR ───────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
          {/* chart area */}
          <div
            id="main-chart-card"
            className="overflow-hidden rounded-2xl glass-card-strong"
            style={{
              animation: mounted ? 'fadeInUp 0.7s cubic-bezier(0.16,1,0.3,1) 300ms both' : 'none',
            }}
          >
            {/* Chart Header */}
            <div className="flex items-center justify-between border-b border-white/[0.05] px-6 py-4 flex-wrap gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  {chartTab === 'trend' ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-accent-purple" />
                      <span>Workforce Supply & Industry Demand Trajectory (Line Graph)</span>
                    </>
                  ) : (
                    <>
                      <BarChart2 className="h-4 w-4 text-accent-cyan" />
                      <span>Sector-Wise Workforce Segregation (Capacity vs Demand)</span>
                    </>
                  )}
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {chartTab === 'trend'
                    ? `12-month rolling trend of capacity, demand, and net gap over time across ${scope === 'national' ? 'National Overview' : selectedState}`
                    : 'Sector-wise capacity vs demand · Click any sector below for 6-month predictive forecast'}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Primary Action Button: See Sector-Wise Segregation OR Back to Line Graph */}
                {chartTab === 'trend' ? (
                  <button
                    id="see-sector-wise-btn"
                    onClick={() => setChartTab('sectors')}
                    className="flex items-center gap-2 rounded-xl border border-accent-cyan/40 bg-accent-cyan/[0.1] px-3.5 py-1.5 text-xs font-bold text-accent-cyan transition-all hover:bg-accent-cyan/[0.18] hover:border-accent-cyan/60 hover:scale-[1.02] shadow-sm"
                    title="Click to view sector-by-sector capacity vs demand segregation"
                  >
                    <BarChart2 className="h-3.5 w-3.5" />
                    <span>See Sector-Wise Segregation</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                ) : (
                  <button
                    id="back-to-line-graph-btn"
                    onClick={() => setChartTab('trend')}
                    className="flex items-center gap-2 rounded-xl border border-accent-purple/40 bg-accent-purple/[0.1] px-3.5 py-1.5 text-xs font-bold text-purple-300 transition-all hover:bg-accent-purple/[0.18] hover:border-accent-purple/60 hover:scale-[1.02] shadow-sm"
                    title="Return to the main timeline line graph"
                  >
                    <TrendingUp className="h-3.5 w-3.5 text-accent-purple" />
                    <span>← Back to Line Graph (Main Screen)</span>
                  </button>
                )}

                {/* Quick Link to Job Roles Directory & Future Predictions */}
                <button
                  id="open-job-roles-quick"
                  onClick={() => setJobRolesModalOpen(true)}
                  className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300 shadow-sm transition-all hover:bg-white/[0.08] hover:text-white hover:scale-[1.02]"
                  title="View all 21 job roles segregated by sector with future predictions and historical data"
                >
                  <Briefcase className="h-3.5 w-3.5 text-accent-cyan" />
                  <span>Job Roles & Predictions</span>
                  <span className="text-[10px] text-accent-cyan bg-accent-cyan/20 px-1.5 py-0.2 rounded font-bold">21 Roles →</span>
                </button>

                {/* Legend */}
                <div className="hidden sm:flex items-center gap-4 text-xs text-slate-400">
                  {chartTab === 'trend' ? (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-blue-400" />
                        Training Supply
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-purple-400" />
                        Industry Demand
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                        Net Deficit (Gap)
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-[3px] bg-gradient-to-b from-blue-400 to-accent-blue" />
                        {t('chart.training_capacity')}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-[3px] bg-gradient-to-b from-purple-400 to-accent-purple" />
                        {t('chart.industry_demand')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Chart Body: Line Graph by default on Main Screen, Bar Chart when clicking See Sector-Wise Segregation */}
            {chartTab === 'trend' ? (
              <div className="px-4 pt-4 pb-2">
                <ResponsiveContainer width="100%" height={380} debounce={50}>
                  <LineChart
                    data={activeTimeSeries}
                    margin={{ top: 15, right: 15, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.035)" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => {
                        const abs = Math.abs(v);
                        if (abs >= 100000) return `${(v / 1000).toFixed(0)}K`;
                        if (abs >= 1000) return `${(v / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
                        return `${v}`;
                      }}
                    />
                    <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                    <Legend content={() => null} />
                    <Line
                      type="monotone"
                      dataKey="supply"
                      name="Training Supply"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      isAnimationActive={false}
                      dot={{ fill: '#3b82f6', r: 3.5, stroke: '#1e3a8a', strokeWidth: 1.5 }}
                      activeDot={{ r: 6, fill: '#60a5fa', stroke: '#1e3a8a', strokeWidth: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="demand"
                      name="Industry Demand"
                      stroke="#a855f7"
                      strokeWidth={3}
                      isAnimationActive={false}
                      dot={{ fill: '#a855f7', r: 3.5, stroke: '#581c87', strokeWidth: 1.5 }}
                      activeDot={{ r: 6, fill: '#c084fc', stroke: '#581c87', strokeWidth: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="gap"
                      name="Talent Deficit"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      strokeDasharray="5 5"
                      isAnimationActive={false}
                      dot={{ fill: '#f59e0b', r: 3.5, stroke: '#78350f', strokeWidth: 1.5 }}
                      activeDot={{ r: 6, fill: '#fbbf24', stroke: '#78350f', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="px-4 pt-4 pb-2">
                <ResponsiveContainer width="100%" height={380} debounce={50}>
                  <BarChart data={activeData?.sectors || []} barCategoryGap="22%" barGap={8}>
                    <defs>
                      <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={1} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.7} />
                      </linearGradient>
                      <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a78bfa" stopOpacity={1} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.7} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.035)" vertical={false} />
                    <XAxis
                      dataKey="sector"
                      tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                      tickLine={false}
                      tickFormatter={(value: string) =>
                        SECTOR_KEY_MAP[value] ? t(SECTOR_KEY_MAP[value]) : value
                      }
                    />
                    <YAxis
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => {
                        const abs = Math.abs(v);
                        if (abs >= 100000) return `${(v / 1000).toFixed(0)}K`;
                        if (abs >= 1000) return `${(v / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
                        return `${v}`;
                      }}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.025)' }} />
                    <Legend content={() => null} />
                    <Bar
                      dataKey="capacity"
                      name={t('chart.training_capacity')}
                      fill="url(#blueGrad)"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={48}
                      isAnimationActive={false}
                      className="cursor-pointer"
                      onClick={(entry: unknown) => {
                        const sec = (entry as { sector?: string })?.sector;
                        if (sec) setSelectedSectorForForecast(sec);
                      }}
                    >
                      {activeData?.sectors.map((_, i) => (<Cell key={`cap-${i}`} />))}
                    </Bar>
                    <Bar
                      dataKey="demand"
                      name={t('chart.industry_demand')}
                      fill="url(#purpleGrad)"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={48}
                      isAnimationActive={false}
                      className="cursor-pointer"
                      onClick={(entry: unknown) => {
                        const sec = (entry as { sector?: string })?.sector;
                        if (sec) setSelectedSectorForForecast(sec);
                      }}
                    >
                      {activeData?.sectors.map((_, i) => (<Cell key={`dem-${i}`} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Bottom Pill Section for Sector Segregation or Time Series Stats */}
            {chartTab === 'sectors' ? (
              <div className="border-t border-white/[0.04] px-6 py-3.5 bg-white/[0.01]">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    <span className="font-medium text-slate-300">Sector Segregation (Click sector for future prediction):</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {activeData?.sectors.map((s) => {
                      const gap = s.demand - s.capacity;
                      const isDeficit = gap > 0;
                      const formattedGap = Math.abs(gap) >= 1000
                        ? `${(Math.abs(gap) / 1000).toFixed(1)}K`
                        : Math.abs(gap).toLocaleString('en-IN');
                      return (
                        <button
                          key={s.sector}
                          onClick={() => setSelectedSectorForForecast(s.sector)}
                          className="group/pill inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] transition-all hover:bg-white/[0.08] hover:border-accent-cyan/40 hover:scale-[1.03]"
                          title={`Click to view 6-month prediction for ${s.sector}`}
                        >
                          <span className="text-slate-300 group-hover/pill:text-white font-medium">
                            {SECTOR_KEY_MAP[s.sector] ? t(SECTOR_KEY_MAP[s.sector]) : s.sector}
                          </span>
                          <span className="font-bold" style={{ color: isDeficit ? '#fbbf24' : '#4ade80' }}>
                            {isDeficit ? '+' : '−'}{formattedGap}
                          </span>
                          <span className="text-[9px] rounded bg-accent-cyan/20 px-1 py-0.2 text-accent-cyan font-bold">
                            Predict →
                          </span>
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setChartTab('trend')}
                      className="ml-auto text-[11px] font-semibold text-accent-purple hover:underline flex items-center gap-1 transition"
                    >
                      <TrendingUp className="h-3 w-3" />
                      <span>Back to Line Graph →</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-t border-white/[0.04] px-6 py-3.5 bg-white/[0.01]">
                <div className="flex items-center justify-between flex-wrap gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-alert-green animate-pulse" />
                    <span className="text-slate-400">Time-Series Forecast Model:</span>
                    <span className="text-slate-200 font-semibold">ARIMA + Gradient Boosted Demand Ensemble</span>
                  </div>
                  {(() => {
                    const activeSeries = activeTimeSeries;
                    const peakDeficit = activeSeries.length > 0
                      ? activeSeries.reduce((max, p) => (p.gap > max.gap ? p : max), activeSeries[0])
                      : { month: "Mar'26", gap: 0 };
                    const firstPt = activeSeries[0];
                    const lastPt = activeSeries[activeSeries.length - 1];
                    const supplyGrowth = (firstPt && lastPt && firstPt.supply > 0)
                      ? (((lastPt.supply - firstPt.supply) / firstPt.supply) * 100).toFixed(1)
                      : '10.9';
                    const demandGrowth = (firstPt && lastPt && firstPt.demand > 0)
                      ? (((lastPt.demand - firstPt.demand) / firstPt.demand) * 100).toFixed(1)
                      : '15.6';
                    return (
                      <div className="flex items-center gap-5">
                        <div>
                          <span className="text-slate-500">Peak Deficit: </span>
                          <span className="font-bold text-amber-400">
                            {peakDeficit.month} ({peakDeficit.gap > 0 ? '+' : ''}{peakDeficit.gap.toLocaleString('en-IN')})
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Supply Growth: </span>
                          <span className="font-bold text-accent-cyan">+{supplyGrowth}%</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Demand Growth: </span>
                          <span className="font-bold text-purple-400">+{demandGrowth}%</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT SIDEBAR — EARLY WARNINGS ─────────── */}
          <div
            className="flex flex-col overflow-hidden rounded-2xl glass-card-strong"
            style={{
              animation: mounted ? 'fadeInRight 0.7s cubic-bezier(0.16,1,0.3,1) 450ms both' : 'none',
            }}
          >
            <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-alert-red/20 bg-alert-red/[0.08]">
                  <AlertTriangle className="h-4 w-4 text-alert-red" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{t('early_warnings.title')}</h3>
                  <p className="text-[11px] text-slate-500">
                    {t('early_warnings.active_alerts', { count: activeData.alerts.length })} · Click to inspect
                  </p>
                </div>
              </div>
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-alert-red opacity-50" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-gradient-to-br from-alert-red to-red-600" />
              </span>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: 470 }}>
              {activeData.alerts.map((alert, i) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  index={i}
                  onClick={() => setSelectedAlertForModal(alert)}
                />
              ))}
            </div>

            <div className="border-t border-white/[0.05] px-5 py-3.5">
              <button
                id="view-all-alerts"
                onClick={() => setSelectedAlertForModal(activeData.alerts[0] || null)}
                className="w-full rounded-lg border border-white/[0.07] bg-white/[0.02] py-2.5 text-xs font-semibold text-slate-400 transition-all hover:bg-white/[0.06] hover:text-slate-200"
              >
                {t('early_warnings.view_all')}
              </button>
            </div>
          </div>
        </div>

        {/* ── FOOTER ────────────────────────────────────── */}
        <footer className="mt-10 border-t border-white/[0.04] pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src="/logo.jpg" alt="" className="h-7 w-7 rounded-md opacity-40" />
              <span className="text-xs text-slate-600">{t('footer.copyright')}</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-accent-cyan/60" />
                <span className="h-1.5 w-1.5 rounded-full bg-alert-green/70" />
                {t('footer.security')}
              </span>
              <span className="text-slate-700">v1.0.0</span>
            </div>
          </div>
        </footer>
      </main>

      {/* ── API KEYS MODAL ─────────────────────────────── */}
      {apiKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in-up">
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.12] bg-navy-900 shadow-2xl p-6">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-indigo/20 text-accent-indigo">
                  <Key className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">MSDE API Credentials</h3>
                  <p className="text-[11px] text-slate-400">Labour Market Intelligence System (LMIS)</p>
                </div>
              </div>
              <button
                onClick={() => setApiKeyModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.08] hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Live API Key</label>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-navy-950 px-3.5 py-2.5">
                  <code className="flex-1 font-mono text-xs text-accent-cyan truncate">
                    kaushal_live_9f82d1c74a00b2e8813a48e7e190
                  </code>
                  <button
                    onClick={handleCopyKey}
                    className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/[0.12] transition"
                  >
                    {copiedKey ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-alert-green" />
                        <span className="text-alert-green">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 space-y-2.5 text-xs">
                <div className="flex justify-between items-center text-slate-400">
                  <span className="font-medium">Base URL</span>
                  <code className="text-slate-200 bg-white/[0.04] px-2 py-0.5 rounded">http://127.0.0.1:8000/api/v1</code>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span className="font-medium">Demand Severity Score (DSS)</span>
                  <code className="text-accent-cyan bg-accent-cyan/[0.08] px-2 py-0.5 rounded">GET /demand-index</code>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span className="font-medium">Scheme Target-Setting Export</span>
                  <code className="text-accent-purple bg-accent-purple/[0.08] px-2 py-0.5 rounded">GET /export/target-setting</code>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleDownloadCredentialsFile}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-indigo to-accent-purple px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-accent-indigo/25 hover:brightness-110 transition"
                >
                  <Download className="h-4 w-4" />
                  Download Credentials JSON
                </button>
                <button
                  onClick={() => setApiKeyModalOpen(false)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/[0.08] hover:text-white transition"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTOR FORECAST MODAL ───────────────────────── */}
      {selectedSectorForForecast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in-up">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.12] bg-navy-900 shadow-2xl p-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-cyan/15 text-accent-cyan">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">
                      {selectedSectorForForecast} — 6-Month Predictive Forecast
                    </h3>
                    <span className="rounded bg-accent-cyan/20 px-2 py-0.5 text-[10px] font-bold text-accent-cyan uppercase">
                      {scope === 'national' ? 'National' : selectedState}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sector segregation & AI-powered labour demand forecasting (NCO/NSQF aligned)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSectorForForecast(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.08] hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingSectorForecast || !sectorForecastData ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-cyan" />
                <p className="text-xs text-slate-400 font-medium">Computing 6-month predictive model...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Metadata badges */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Saturation Risk:</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      sectorForecastData.meta.saturation_risk === 'Low'
                        ? 'bg-alert-green/20 text-alert-green'
                        : 'bg-amber-400/20 text-amber-400'
                    }`}>
                      {sectorForecastData.meta.saturation_risk} Risk
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Projected Monthly Growth:</span>
                    <span className="text-xs font-bold text-accent-cyan">
                      +{(sectorForecastData.meta.growth_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Standard:</span>
                    <span className="text-xs font-bold text-accent-purple flex items-center gap-1">
                      <CircleCheck className="h-3 w-3" /> NCVET Aligned
                    </span>
                  </div>
                </div>

                {/* Top Emerging Trades */}
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Top Priority Trades (NCO Standards)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sectorForecastData.meta.top_trades.map((tr) => (
                      <span
                        key={tr}
                        className="rounded-lg bg-navy-800 border border-white/[0.08] px-2.5 py-1 text-xs text-slate-200 font-medium"
                      >
                        ⚡ {tr}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Predictive Chart */}
                <div className="rounded-xl border border-white/[0.08] bg-navy-950/60 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-300">
                      Predicted Capacity vs Industry Demand (Apr'26 – Sep'26)
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-blue-400" /> Capacity
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-purple-400" /> Demand
                      </span>
                    </div>
                  </div>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%" debounce={100}>
                      <AreaChart data={sectorForecastData.forecast}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }}
                        />
                        <Area type="monotone" dataKey="predicted_capacity" name="Predicted Capacity" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} isAnimationActive={false} />
                        <Area type="monotone" dataKey="predicted_demand" name="Predicted Demand" stroke="#a855f7" fill="#a855f7" fillOpacity={0.2} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Policy Recommendation */}
                <div className="rounded-xl border border-accent-cyan/30 bg-accent-cyan/[0.05] p-3.5">
                  <div className="flex items-start gap-2.5">
                    <Target className="h-4 w-4 text-accent-cyan shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-accent-cyan">
                        MSDE / State Skill Mission Directive:
                      </p>
                      <p className="text-xs text-slate-300 mt-0.5">
                        {sectorForecastData.recommendation}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => setSelectedSectorForForecast(null)}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.08] transition"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(sectorForecastData, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `forecast_${selectedSectorForForecast.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-accent-indigo to-accent-purple px-4 py-2 text-xs font-bold text-white shadow-md hover:brightness-110 transition"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export Sector Forecast
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── EARLY WARNING DRILL-DOWN MODAL ─────────────── */}
      {selectedAlertForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in-up">
          <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.12] bg-navy-900 shadow-2xl p-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    background: selectedAlertForModal.type === 'oversupply' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                    color: selectedAlertForModal.type === 'oversupply' ? '#ef4444' : '#22c55e',
                  }}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">
                      Early Warning Intelligence Flag
                    </h3>
                    <span
                      className="rounded px-2 py-0.5 text-[10px] font-bold uppercase"
                      style={{
                        background: selectedAlertForModal.type === 'oversupply' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
                        color: selectedAlertForModal.type === 'oversupply' ? '#fca5a5' : '#86efac',
                      }}
                    >
                      {selectedAlertForModal.severity} {selectedAlertForModal.type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Identified {t('timestamps.hrs_ago', { count: selectedAlertForModal.hoursAgo })} · Sector: {getSectorForTrade(selectedAlertForModal.trade)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAlertForModal(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.08] hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Trade Details & Gap Banner */}
              <div
                className="rounded-xl border p-4"
                style={{
                  borderColor: selectedAlertForModal.type === 'oversupply' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)',
                  background: selectedAlertForModal.type === 'oversupply' ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-white flex items-center gap-2">
                      {selectedAlertForModal.trade}
                      {selectedAlertForModal.nsqf_level && (
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-slate-300 font-mono">
                          NSQF Level {selectedAlertForModal.nsqf_level}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {t(selectedAlertForModal.messageKey)} — {t(selectedAlertForModal.recommendationKey)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Trainee Delta</span>
                    <p
                      className="text-xl font-extrabold"
                      style={{ color: selectedAlertForModal.type === 'oversupply' ? '#f87171' : '#4ade80' }}
                    >
                      {selectedAlertForModal.gap}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sector Drill-down Connection */}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-accent-indigo" />
                    Connected Sector: <strong className="text-white ml-1">{getSectorForTrade(selectedAlertForModal.trade)}</strong>
                  </span>
                  <button
                    onClick={() => {
                      const s = getSectorForTrade(selectedAlertForModal.trade);
                      setSelectedAlertForModal(null);
                      setSelectedSectorForForecast(s);
                    }}
                    className="text-xs font-bold text-accent-cyan hover:underline flex items-center gap-1"
                  >
                    Open 6-Month Sector Prediction →
                  </button>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  This trade represents a high-priority node within the <strong>{getSectorForTrade(selectedAlertForModal.trade)}</strong> sector. The divergence between active industry hiring signals and training seat sanctions has crossed the 15% early warning threshold.
                </p>
              </div>

              {/* Actionable Policy Directives */}
              <div className="rounded-xl border border-white/[0.08] bg-navy-950/60 p-4 space-y-2.5">
                <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Mandated Policy Action for MSDE / SSDM
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-accent-cyan shrink-0 mt-0.5" />
                    <span>
                      {selectedAlertForModal.type === 'oversupply'
                        ? 'Temporarily freeze new batch sanctions in this trade to prevent youth unemployment.'
                        : 'Sanction accelerated special batches and fast-track trainer onboarding.'}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-accent-cyan shrink-0 mt-0.5" />
                    <span>
                      {selectedAlertForModal.type === 'oversupply'
                        ? 'Re-allocate unutilized lab infrastructure to high-demand adjacent green/electronics trades.'
                        : 'Notify local industry partners via NCS employer portal for apprenticeship tie-ups.'}
                    </span>
                  </li>
                </ul>
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setSelectedAlertForModal(null)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.08] transition"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => {
                    const s = getSectorForTrade(selectedAlertForModal.trade);
                    setSelectedAlertForModal(null);
                    setSelectedSectorForForecast(s);
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-accent-indigo to-accent-purple px-4 py-2 text-xs font-bold text-white shadow-md hover:brightness-110 transition"
                >
                  <span>View {getSectorForTrade(selectedAlertForModal.trade)} Forecast</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TRAINING CENTRES DETAILS MODAL ─────────────── */}
      {trainingCentresModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in-up">
          <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-navy-900 shadow-2xl p-5 sm:p-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-purple/30 to-accent-cyan/20 border border-accent-purple/40 text-accent-purple">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-white">
                      Training Infrastructure & Centre Geo-Locations
                    </h3>
                    <span className="rounded bg-accent-purple/20 px-2 py-0.5 text-[10px] font-bold text-accent-purple uppercase border border-accent-purple/30">
                      {scope === 'national' ? 'National Overview' : selectedState}
                    </span>
                    {trainingCentresData && (
                      <span className="rounded bg-accent-cyan/10 px-2 py-0.5 text-[10px] font-semibold text-accent-cyan border border-accent-cyan/20">
                        {trainingCentresData.total_centres.toLocaleString('en-IN')} Total Centres
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Physical centre locations, district clusters, accredited institute directories & seat telemetry
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTrainingCentresModalOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.08] hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingCentres || !trainingCentresData ? (
              <div className="py-24 flex flex-col items-center justify-center gap-3 flex-1">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
                <p className="text-xs text-slate-400 font-medium">Fetching accredited training centre telemetry & geo-locations...</p>
              </div>
            ) : (() => {
              const districts = trainingCentresData.district_distribution || [];
              const institutes = trainingCentresData.institutes || [];

              const uniqueDistricts = ['all', ...Array.from(new Set(institutes.map((i) => i.district)))];
              const uniqueTypes = ['all', ...Array.from(new Set(institutes.map((i) => i.type)))];

              const filteredDistricts = districts.filter((d) => {
                if (!trainingCentresSearch.trim()) return true;
                const q = trainingCentresSearch.toLowerCase();
                return (
                  d.district.toLowerCase().includes(q) ||
                  d.key_hubs.toLowerCase().includes(q) ||
                  d.primary_sectors.some((s) => s.toLowerCase().includes(q))
                );
              });

              const filteredInstitutes = institutes.filter((inst) => {
                const matchesSearch =
                  !trainingCentresSearch.trim() ||
                  inst.name.toLowerCase().includes(trainingCentresSearch.toLowerCase()) ||
                  inst.district.toLowerCase().includes(trainingCentresSearch.toLowerCase()) ||
                  inst.location_address.toLowerCase().includes(trainingCentresSearch.toLowerCase()) ||
                  inst.sector.toLowerCase().includes(trainingCentresSearch.toLowerCase()) ||
                  inst.specialized_trades.some((trade) => trade.toLowerCase().includes(trainingCentresSearch.toLowerCase()));

                const matchesDistrict =
                  trainingCentresDistrictFilter === 'all' ||
                  inst.district.toLowerCase() === trainingCentresDistrictFilter.toLowerCase();

                const matchesType =
                  trainingCentresTypeFilter === 'all' ||
                  inst.type.toLowerCase() === trainingCentresTypeFilter.toLowerCase();

                return matchesSearch && matchesDistrict && matchesType;
              });

              const totalSanctionedCapacity = districts.length > 0
                ? districts.reduce((acc, d) => acc + d.seat_capacity, 0)
                : trainingCentresData.total_centres * 32;

              return (
                <div className="flex flex-col flex-1 min-h-0 space-y-4">
                  {/* Top 4 KPI mini cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Total Centres</span>
                      <p className="text-xl font-extrabold text-white mt-0.5">
                        {trainingCentresData.total_centres.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px] text-accent-cyan mt-0.5">Accredited Nodes</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Sanctioned Seats</span>
                      <p className="text-xl font-extrabold text-white mt-0.5">
                        {totalSanctionedCapacity.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">District capacity</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Avg Utilisation</span>
                      <p className="text-xl font-extrabold text-alert-green mt-0.5">
                        {Math.round(trainingCentresData.average_utilisation * 100)}%
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Benchmarked at 80%</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Monthly Output</span>
                      <p className="text-xl font-extrabold text-white mt-0.5">
                        {trainingCentresData.monthly_total_throughput.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Certified trainees/mo</p>
                    </div>
                  </div>

                  {/* Navigation Tabs */}
                  <div className="flex items-center gap-2 border-b border-white/[0.08] pb-2 shrink-0 overflow-x-auto">
                    <button
                      onClick={() => setTrainingCentresTab('districts')}
                      className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition whitespace-nowrap ${
                        trainingCentresTab === 'districts'
                          ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      <span>District Locations & Hubs</span>
                      <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px]">
                        {districts.length}
                      </span>
                    </button>
                    <button
                      onClick={() => setTrainingCentresTab('institutes')}
                      className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition whitespace-nowrap ${
                        trainingCentresTab === 'institutes'
                          ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      <span>Accredited Institutes Directory</span>
                      <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px]">
                        {institutes.length}
                      </span>
                    </button>
                    <button
                      onClick={() => setTrainingCentresTab('sectors')}
                      className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition whitespace-nowrap ${
                        trainingCentresTab === 'sectors'
                          ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <BarChart2 className="h-3.5 w-3.5" />
                      <span>Sector Breakdown & Capacity</span>
                      <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px]">
                        {trainingCentresData.centres_by_sector.length}
                      </span>
                    </button>
                  </div>

                  {/* Search and Filters Toolbar for Districts / Institutes */}
                  {trainingCentresTab !== 'sectors' && (
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0 bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.06]">
                      <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={trainingCentresSearch}
                          onChange={(e) => setTrainingCentresSearch(e.target.value)}
                          placeholder={
                            trainingCentresTab === 'districts'
                              ? 'Search districts, corridors, or sectors...'
                              : 'Search institutes, addresses, districts, or trades...'
                          }
                          className="w-full rounded-lg border border-white/[0.08] bg-navy-950/80 pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-accent-purple focus:outline-none"
                        />
                        {trainingCentresSearch && (
                          <button
                            onClick={() => setTrainingCentresSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {trainingCentresTab === 'institutes' && (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-400">District:</span>
                            <select
                              value={trainingCentresDistrictFilter}
                              onChange={(e) => setTrainingCentresDistrictFilter(e.target.value)}
                              className="rounded-lg border border-white/[0.08] bg-navy-950 px-2.5 py-1.5 text-xs text-white focus:border-accent-purple focus:outline-none"
                            >
                              <option value="all">All Districts ({institutes.length})</option>
                              {uniqueDistricts.filter(d => d !== 'all').map((d) => (
                                <option key={d} value={d}>
                                  {d} ({institutes.filter(i => i.district === d).length})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-400">Type:</span>
                            <select
                              value={trainingCentresTypeFilter}
                              onChange={(e) => setTrainingCentresTypeFilter(e.target.value)}
                              className="rounded-lg border border-white/[0.08] bg-navy-950 px-2.5 py-1.5 text-xs text-white focus:border-accent-purple focus:outline-none"
                            >
                              <option value="all">All Types</option>
                              {uniqueTypes.filter(t => t !== 'all').map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>

                          {(trainingCentresDistrictFilter !== 'all' || trainingCentresTypeFilter !== 'all') && (
                            <button
                              onClick={() => {
                                setTrainingCentresDistrictFilter('all');
                                setTrainingCentresTypeFilter('all');
                              }}
                              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 transition"
                            >
                              Reset Filters
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Tab 1: District Locations & Industrial Hubs */}
                  {trainingCentresTab === 'districts' && (
                    <div className="flex-1 overflow-y-auto pr-1 space-y-3 max-h-[46vh]">
                      {filteredDistricts.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 text-xs">
                          No districts found matching &ldquo;{trainingCentresSearch}&rdquo;.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                          {filteredDistricts.map((d) => (
                            <div
                              key={d.district}
                              className="rounded-xl border border-white/[0.08] bg-navy-950/70 p-4 transition-all hover:border-accent-purple/40 hover:bg-navy-950/90 flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-accent-purple shrink-0 mt-0.5" />
                                    <div>
                                      <h4 className="text-sm font-bold text-white leading-tight">
                                        {d.district}
                                      </h4>
                                      <span className="text-[10px] text-slate-400 font-medium">
                                        {d.centre_count.toLocaleString('en-IN')} Training Centres
                                      </span>
                                    </div>
                                  </div>
                                  <span
                                    className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase shrink-0 ${
                                      d.utilisation_rate > 0.85
                                        ? 'bg-alert-red/20 text-alert-red'
                                        : d.utilisation_rate > 0.65
                                        ? 'bg-alert-green/20 text-alert-green'
                                        : 'bg-amber-400/20 text-amber-400'
                                    }`}
                                  >
                                    {Math.round(d.utilisation_rate * 100)}% Utilised
                                  </span>
                                </div>

                                {/* Capacity Bar */}
                                <div className="mt-3">
                                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                                    <span>Seat Capacity:</span>
                                    <span className="font-mono font-semibold text-white">
                                      {d.seat_capacity.toLocaleString('en-IN')} seats
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${Math.min(100, Math.round(d.utilisation_rate * 100))}%`,
                                        backgroundColor:
                                          d.utilisation_rate > 0.85
                                            ? '#ef4444'
                                            : d.utilisation_rate > 0.65
                                            ? '#22c55e'
                                            : '#f59e0b',
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* Key Industrial Corridors */}
                                <div className="mt-3">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                                    Key Industrial Corridors & Training Hubs:
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {d.key_hubs.split(',').map((hub, hIdx) => (
                                      <span
                                        key={hIdx}
                                        className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-300 border border-white/[0.06]"
                                      >
                                        {hub.trim()}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                {/* Primary Sectors */}
                                <div className="mt-2.5">
                                  <div className="flex flex-wrap gap-1">
                                    {d.primary_sectors.map((sec, sIdx) => (
                                      <span
                                        key={sIdx}
                                        className="rounded bg-accent-cyan/10 px-1.5 py-0.5 text-[9px] font-medium text-accent-cyan border border-accent-cyan/20"
                                      >
                                        {sec}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* Action Link to Institutes */}
                              <button
                                onClick={() => {
                                  setTrainingCentresDistrictFilter(d.district);
                                  setTrainingCentresTab('institutes');
                                }}
                                className="mt-3.5 flex items-center justify-between w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[11px] font-medium text-accent-purple hover:bg-accent-purple/[0.1] hover:border-accent-purple/30 transition"
                              >
                                <span>View Institutes ({institutes.filter(i => i.district === d.district).length || 'All'})</span>
                                <ChevronRight className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 2: Accredited Institutes Directory */}
                  {trainingCentresTab === 'institutes' && (
                    <div className="flex-1 overflow-y-auto pr-1 space-y-3 max-h-[46vh]">
                      {filteredInstitutes.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 text-xs">
                          No accredited training institutes match the specified filter criteria.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {filteredInstitutes.map((inst) => (
                            <div
                              key={inst.id}
                              className="rounded-xl border border-white/[0.08] bg-navy-950/70 p-4 transition-all hover:border-accent-cyan/40 hover:bg-navy-950/90 flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase border ${
                                        inst.type.includes('ITI')
                                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                          : inst.type.includes('PMKK')
                                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                          : inst.type.includes('NSTI')
                                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                      }`}
                                    >
                                      {inst.type}
                                    </span>
                                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 border border-emerald-500/20">
                                      {inst.ncvet_grade}
                                    </span>
                                  </div>
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                      inst.status === 'Overloaded'
                                        ? 'bg-alert-red/20 text-alert-red'
                                        : 'bg-alert-green/20 text-alert-green'
                                    }`}
                                  >
                                    {inst.status}
                                  </span>
                                </div>

                                <h4 className="text-sm font-bold text-white leading-snug">
                                  {inst.name}
                                </h4>

                                <div className="mt-1 flex items-start gap-1.5 text-slate-400">
                                  <MapPin className="h-3.5 w-3.5 text-accent-cyan shrink-0 mt-0.5" />
                                  <p className="text-xs text-slate-300 leading-tight">
                                    {inst.location_address}
                                  </p>
                                </div>

                                {/* Sector & Specialized Trades */}
                                <div className="mt-2.5">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className="text-[10px] text-slate-400 font-medium">Sector:</span>
                                    <span className="text-[10px] font-bold text-white bg-white/[0.05] px-2 py-0.5 rounded border border-white/[0.08]">
                                      {inst.sector}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {inst.specialized_trades.map((trade, tIdx) => (
                                      <span
                                        key={tIdx}
                                        className="rounded bg-accent-purple/10 px-1.5 py-0.5 text-[9px] text-purple-300 border border-accent-purple/20"
                                      >
                                        {trade}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* Capacity and Enrolment telemetry */}
                              <div className="mt-3.5 pt-2.5 border-t border-white/[0.06]">
                                <div className="flex items-center justify-between text-[11px] mb-1">
                                  <span className="text-slate-400">
                                    Sanctioned: <strong className="text-white font-mono">{inst.sanctioned_seats}</strong> seats
                                  </span>
                                  <span className="text-slate-400">
                                    Enrolled: <strong className="text-accent-cyan font-mono">{inst.active_enrolment}</strong>
                                  </span>
                                  <span className="font-mono text-xs font-bold text-alert-green">
                                    {Math.round(inst.utilisation_rate * 100)}%
                                  </span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${Math.min(100, Math.round(inst.utilisation_rate * 100))}%`,
                                      backgroundColor:
                                        inst.utilisation_rate > 0.85
                                          ? '#ef4444'
                                          : inst.utilisation_rate > 0.65
                                          ? '#22c55e'
                                          : '#f59e0b',
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 3: Sector Breakdown & Capacity Table */}
                  {trainingCentresTab === 'sectors' && (
                    <div className="rounded-xl border border-white/[0.08] overflow-hidden bg-navy-950/80 flex-1 max-h-[46vh] flex flex-col">
                      <div className="overflow-x-auto overflow-y-auto">
                        <table className="w-full text-left text-xs border-separate border-spacing-0">
                          <thead className="sticky top-0 z-20">
                            <tr>
                              <th className="sticky top-0 z-20 bg-navy-900 border-b border-white/10 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                                Sector
                              </th>
                              <th className="sticky top-0 z-20 bg-navy-900 border-b border-white/10 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                                Centre Count
                              </th>
                              <th className="sticky top-0 z-20 bg-navy-900 border-b border-white/10 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                                Utilisation Rate
                              </th>
                              <th className="sticky top-0 z-20 bg-navy-900 border-b border-white/10 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                                Avg Batch
                              </th>
                              <th className="sticky top-0 z-20 bg-navy-900 border-b border-white/10 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                                Monthly Throughput
                              </th>
                              <th className="sticky top-0 z-20 bg-navy-900 border-b border-white/10 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody className="text-slate-300">
                            {trainingCentresData.centres_by_sector.map((row) => (
                              <tr key={row.sector} className="hover:bg-white/[0.04] transition">
                                <td className="px-4 py-3 font-semibold text-white border-b border-white/[0.04]">
                                  {row.sector}
                                </td>
                                <td className="px-4 py-3 font-mono border-b border-white/[0.04]">
                                  {row.centre_count.toLocaleString('en-IN')}
                                </td>
                                <td className="px-4 py-3 border-b border-white/[0.04]">
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-16 rounded-full bg-white/10 overflow-hidden">
                                      <div
                                        className="h-full rounded-full"
                                        style={{
                                          width: `${Math.min(100, Math.round(row.utilisation_rate * 100))}%`,
                                          backgroundColor:
                                            row.utilisation_rate > 0.85
                                              ? '#ef4444'
                                              : row.utilisation_rate > 0.65
                                              ? '#22c55e'
                                              : '#f59e0b',
                                        }}
                                      />
                                    </div>
                                    <span className="font-mono text-[11px] font-semibold">
                                      {Math.round(row.utilisation_rate * 100)}%
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-mono border-b border-white/[0.04]">
                                  {row.avg_batch_size} students
                                </td>
                                <td className="px-4 py-3 font-mono border-b border-white/[0.04]">
                                  {row.monthly_throughput.toLocaleString('en-IN')}/mo
                                </td>
                                <td className="px-4 py-3 border-b border-white/[0.04]">
                                  <span
                                    className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase ${
                                      row.status === 'Overloaded'
                                        ? 'bg-alert-red/20 text-alert-red'
                                        : row.status === 'Active'
                                        ? 'bg-alert-green/20 text-alert-green'
                                        : 'bg-amber-400/20 text-amber-400'
                                    }`}
                                  >
                                    {row.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Footer note */}
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/[0.06] shrink-0">
                    <span className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-accent-cyan" />
                      Integrated with MSDE SIP (Skill India Portal), NCVET National Registry & DGT MIS
                    </span>
                    <button
                      onClick={() => setTrainingCentresModalOpen(false)}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.08] transition"
                    >
                      Close
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── JOB ROLES & TRADES INTELLIGENCE MODAL ─────────── */}
      <JobRolesMenuModal
        isOpen={jobRolesModalOpen}
        onClose={() => setJobRolesModalOpen(false)}
        state={scope === 'national' ? 'National' : selectedState}
        scope={scope}
      />
    </div>
  );
};

export default MSDEDashboard;
