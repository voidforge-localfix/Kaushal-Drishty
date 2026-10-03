import { useState, useEffect, useMemo, type FC } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  X,
  Search,
  Briefcase,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Zap,
  History,
  Shield,
  Filter,
} from 'lucide-react';

/* ================================================================== */
/*  TYPES                                                             */
/* ================================================================== */

export interface JobRoleHistoryPoint {
  month: string;
  supply: number;
  demand: number;
  gap: number;
}

export interface JobRolePrediction {
  six_month: {
    projected_demand: number;
    projected_supply: number;
    projected_gap: number;
  };
  twelve_month: {
    projected_demand: number;
    projected_supply: number;
    projected_gap: number;
  };
  hiring_trajectory: string;
  risk_profile: string;
}

export interface JobRoleItem {
  id: string;
  trade: string;
  sector: string;
  nsqf_level: number;
  nco_code: string;
  current_supply: number;
  current_demand: number;
  current_gap: number;
  growth_rate_pct: number;
  hiring_velocity: string;
  saturation_risk: string;
  future_dss: number;
  future_status: string;
  recommendation: string;
  future_prediction: JobRolePrediction;
  history: JobRoleHistoryPoint[];
}

interface JobRolesMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: string;
  scope: 'national' | 'state';
}

/* ================================================================== */
/*  STATIC REGISTRY & SHARES (FALLBACK ENGINE)                        */
/* ================================================================== */

const STATE_SHARES: Record<string, { share: number; bias: number[] }> = {
  'National':               { share: 1.0,     bias: [1.0, 1.0, 1.0, 1.0, 1.0] },
  'Uttar Pradesh':          { share: 0.165,   bias: [0.95, 0.75, 1.20, 1.05, 0.65] },
  'Maharashtra':            { share: 0.105,   bias: [0.85, 1.15, 1.25, 0.95, 1.35] },
  'Bihar':                  { share: 0.086,   bias: [0.75, 0.55, 0.90, 0.85, 0.45] },
  'West Bengal':            { share: 0.072,   bias: [0.70, 0.85, 1.05, 0.95, 0.75] },
  'Madhya Pradesh':         { share: 0.060,   bias: [1.15, 0.65, 0.85, 0.75, 0.55] },
  'Tamil Nadu':             { share: 0.068,   bias: [0.95, 1.30, 1.10, 1.05, 1.25] },
  'Rajasthan':              { share: 0.058,   bias: [1.35, 0.65, 0.90, 0.75, 0.55] },
  'Karnataka':              { share: 0.064,   bias: [0.85, 1.25, 1.05, 0.95, 1.45] },
  'Gujarat':                { share: 0.062,   bias: [1.25, 1.05, 1.30, 0.85, 0.95] },
  'Andhra Pradesh':         { share: 0.046,   bias: [1.05, 1.10, 0.95, 0.85, 1.05] },
  'Odisha':                 { share: 0.038,   bias: [0.95, 0.65, 0.85, 0.75, 0.55] },
  'Telangana':              { share: 0.042,   bias: [0.75, 1.05, 0.95, 0.95, 1.35] },
  'Kerala':                 { share: 0.032,   bias: [0.65, 0.75, 0.85, 1.35, 1.05] },
  'Jharkhand':              { share: 0.028,   bias: [0.85, 0.65, 0.75, 0.65, 0.45] },
  'Assam':                  { share: 0.026,   bias: [0.75, 0.55, 0.85, 0.75, 0.45] },
  'Punjab':                 { share: 0.025,   bias: [0.85, 0.75, 1.10, 0.95, 0.65] },
  'Chhattisgarh':           { share: 0.022,   bias: [1.05, 0.55, 0.75, 0.65, 0.45] },
  'Haryana':                { share: 0.024,   bias: [0.95, 1.05, 1.25, 0.85, 1.05] },
  'Delhi':                  { share: 0.026,   bias: [0.45, 0.85, 1.05, 1.05, 1.55] },
  'Jammu & Kashmir':        { share: 0.012,   bias: [0.75, 0.45, 0.65, 0.85, 0.55] },
  'Uttarakhand':            { share: 0.011,   bias: [0.95, 0.65, 0.75, 0.85, 0.75] },
  'Himachal Pradesh':       { share: 0.008,   bias: [1.05, 0.55, 0.65, 0.75, 0.55] },
  'Tripura':                { share: 0.004,   bias: [0.65, 0.45, 0.55, 0.75, 0.35] },
  'Meghalaya':              { share: 0.0035,  bias: [0.75, 0.35, 0.55, 0.65, 0.35] },
  'Manipur':                { share: 0.0032,  bias: [0.55, 0.35, 0.45, 0.75, 0.35] },
  'Nagaland':               { share: 0.0025,  bias: [0.55, 0.35, 0.45, 0.65, 0.35] },
  'Goa':                    { share: 0.0022,  bias: [0.55, 0.65, 0.75, 0.85, 0.95] },
  'Arunachal Pradesh':      { share: 0.0018,  bias: [0.85, 0.25, 0.35, 0.55, 0.25] },
  'Puducherry':             { share: 0.0016,  bias: [0.45, 0.65, 0.55, 0.75, 0.85] },
  'Mizoram':                { share: 0.0014,  bias: [0.55, 0.35, 0.35, 0.65, 0.35] },
  'Chandigarh':             { share: 0.0015,  bias: [0.35, 0.75, 0.65, 0.85, 1.05] },
  'Sikkim':                 { share: 0.0010,  bias: [0.75, 0.25, 0.35, 0.55, 0.35] },
  'Dadra & Nagar Haveli':   { share: 0.0008,  bias: [0.45, 0.85, 0.65, 0.45, 0.35] },
  'Andaman & Nicobar':      { share: 0.0006,  bias: [0.65, 0.25, 0.45, 0.55, 0.25] },
  'Ladakh':                 { share: 0.0004,  bias: [0.85, 0.15, 0.25, 0.45, 0.25] },
  'Lakshadweep':            { share: 0.0002,  bias: [0.55, 0.15, 0.35, 0.45, 0.15] },
};

const BASE_JOB_ROLES: Array<{
  id: string;
  trade: string;
  sector: string;
  nsqf_level: number;
  nco_code: string;
  base_demand: number;
  base_supply: number;
  growth_rate: number;
  hiring_velocity: string;
  saturation_risk: string;
  future_dss: number;
  future_status: string;
  recommendation: string;
}> = [
  // ── Green Energy ──
  {
    id: 'solar-pv-installer',
    trade: 'Solar PV Installer',
    sector: 'Green Energy',
    nsqf_level: 4,
    nco_code: '7421.0101',
    base_demand: 38000,
    base_supply: 22000,
    growth_rate: 0.28,
    hiring_velocity: 'High (+28% YoY)',
    saturation_risk: 'Low',
    future_dss: 8.7,
    future_status: 'Acute Shortage',
    recommendation: 'Expand rooftop solar & utility installer batch allocations by 35% in state ITIs.',
  },
  {
    id: 'drone-pilot-technician',
    trade: 'Drone Pilot / Technician',
    sector: 'Green Energy',
    nsqf_level: 5,
    nco_code: '3154.0201',
    base_demand: 24000,
    base_supply: 8500,
    growth_rate: 0.35,
    hiring_velocity: 'Accelerating (+35% YoY)',
    saturation_risk: 'Low',
    future_dss: 9.1,
    future_status: 'Critical Shortage',
    recommendation: 'Establish DGCA-certified remote pilot training facilities in partnership with drone startups.',
  },
  {
    id: 'ev-battery-technician',
    trade: 'EV Battery Technician',
    sector: 'Green Energy',
    nsqf_level: 5,
    nco_code: '7412.0302',
    base_demand: 31000,
    base_supply: 14000,
    growth_rate: 0.32,
    hiring_velocity: 'Rapid (+32% YoY)',
    saturation_risk: 'Low',
    future_dss: 8.9,
    future_status: 'Acute Shortage',
    recommendation: 'Fund dedicated battery pack diagnostics labs and BMS safety certification modules.',
  },
  {
    id: 'wind-turbine-tech',
    trade: 'Wind Turbine Maintenance Tech',
    sector: 'Green Energy',
    nsqf_level: 5,
    nco_code: '7412.0401',
    base_demand: 16000,
    base_supply: 9200,
    growth_rate: 0.18,
    hiring_velocity: 'Steady (+18% YoY)',
    saturation_risk: 'Low',
    future_dss: 7.8,
    future_status: 'Moderate Shortage',
    recommendation: 'Focus capacity building in coastal and arid wind energy corridors.',
  },

  // ── Electronics ──
  {
    id: 'electronics-mechanic',
    trade: 'Electronics Mechanic',
    sector: 'Electronics',
    nsqf_level: 4,
    nco_code: '7421.0200',
    base_demand: 28000,
    base_supply: 36000,
    growth_rate: 0.08,
    hiring_velocity: 'Moderate (+8% YoY)',
    saturation_risk: 'High',
    future_dss: 3.2,
    future_status: 'Mild Oversupply',
    recommendation: 'Modernize legacy syllabus towards SMD repair and power electronics to clear inventory glut.',
  },
  {
    id: 'iot-technician',
    trade: 'IoT Technician',
    sector: 'Electronics',
    nsqf_level: 5,
    nco_code: '7421.0501',
    base_demand: 29000,
    base_supply: 13500,
    growth_rate: 0.26,
    hiring_velocity: 'High (+26% YoY)',
    saturation_risk: 'Low',
    future_dss: 8.4,
    future_status: 'Acute Shortage',
    recommendation: 'Deploy smart-factory hardware simulation kits across accredited PMKK centres.',
  },
  {
    id: 'pcb-assembly-operator',
    trade: 'PCB Assembly Operator',
    sector: 'Electronics',
    nsqf_level: 3,
    nco_code: '8212.0101',
    base_demand: 34000,
    base_supply: 26000,
    growth_rate: 0.16,
    hiring_velocity: 'Active (+16% YoY)',
    saturation_risk: 'Medium',
    future_dss: 6.8,
    future_status: 'Moderate Shortage',
    recommendation: 'Coordinate apprenticeship pipelines directly with mobile and EMS manufacturing clusters.',
  },
  {
    id: 'embedded-systems-associate',
    trade: 'Embedded Systems Associate',
    sector: 'Electronics',
    nsqf_level: 6,
    nco_code: '2152.0301',
    base_demand: 22000,
    base_supply: 11000,
    growth_rate: 0.22,
    hiring_velocity: 'High (+22% YoY)',
    saturation_risk: 'Low',
    future_dss: 8.1,
    future_status: 'Acute Shortage',
    recommendation: 'Create bridge courses for diploma engineers in RTOS and ARM microcontrollers.',
  },

  // ── Logistics ──
  {
    id: 'warehouse-operations-associate',
    trade: 'Warehouse Operations Associate',
    sector: 'Logistics',
    nsqf_level: 3,
    nco_code: '4321.0100',
    base_demand: 42000,
    base_supply: 28000,
    growth_rate: 0.20,
    hiring_velocity: 'Strong (+20% YoY)',
    saturation_risk: 'Low',
    future_dss: 7.9,
    future_status: 'Moderate Shortage',
    recommendation: 'Scale automated storage and WMS handheld scanner skilling programs.',
  },
  {
    id: 'logistics-coordinator',
    trade: 'Logistics Coordinator',
    sector: 'Logistics',
    nsqf_level: 4,
    nco_code: '4323.0101',
    base_demand: 31000,
    base_supply: 21000,
    growth_rate: 0.17,
    hiring_velocity: 'Active (+17% YoY)',
    saturation_risk: 'Low',
    future_dss: 7.5,
    future_status: 'Moderate Shortage',
    recommendation: 'Incorporate freight ERP and multi-modal transport management modules.',
  },
  {
    id: 'cold-chain-technician',
    trade: 'Cold Chain Technician',
    sector: 'Logistics',
    nsqf_level: 5,
    nco_code: '7127.0201',
    base_demand: 21000,
    base_supply: 9500,
    growth_rate: 0.25,
    hiring_velocity: 'High (+25% YoY)',
    saturation_risk: 'Low',
    future_dss: 8.6,
    future_status: 'Acute Shortage',
    recommendation: 'Target pharma and agri-perishable clusters with subsidized refrigeration maintenance seats.',
  },
  {
    id: 'supply-chain-analyst',
    trade: 'Supply Chain Analyst',
    sector: 'Logistics',
    nsqf_level: 6,
    nco_code: '2421.0401',
    base_demand: 24000,
    base_supply: 13500,
    growth_rate: 0.24,
    hiring_velocity: 'High (+24% YoY)',
    saturation_risk: 'Low',
    future_dss: 8.2,
    future_status: 'Acute Shortage',
    recommendation: 'Offer advanced skilling in inventory optimization and demand forecasting software.',
  },

  // ── Healthcare ──
  {
    id: 'general-duty-assistant',
    trade: 'General Duty Assistant (Healthcare)',
    sector: 'Healthcare',
    nsqf_level: 4,
    nco_code: '5321.0101',
    base_demand: 56000,
    base_supply: 38000,
    growth_rate: 0.22,
    hiring_velocity: 'Robust (+22% YoY)',
    saturation_risk: 'Low',
    future_dss: 8.0,
    future_status: 'Moderate Shortage',
    recommendation: 'Partner with tier-2 district hospital networks for 6-month clinical internships.',
  },
  {
    id: 'medical-lab-technician',
    trade: 'Medical Lab Technician',
    sector: 'Healthcare',
    nsqf_level: 6,
    nco_code: '3212.0101',
    base_demand: 38000,
    base_supply: 23000,
    growth_rate: 0.24,
    hiring_velocity: 'High (+24% YoY)',
    saturation_risk: 'Low',
    future_dss: 8.5,
    future_status: 'Acute Shortage',
    recommendation: 'Scale up diagnostics lab accreditation and molecular pathology technician seats.',
  },
  {
    id: 'emergency-medical-technician',
    trade: 'Emergency Medical Technician / Paramedic',
    sector: 'Healthcare',
    nsqf_level: 5,
    nco_code: '3258.0101',
    base_demand: 27000,
    base_supply: 12000,
    growth_rate: 0.29,
    hiring_velocity: 'Rapid (+29% YoY)',
    saturation_risk: 'Low',
    future_dss: 8.9,
    future_status: 'Acute Shortage',
    recommendation: 'Integrate advanced cardiac life support (ACLS) simulation labs in state ambulance trusts.',
  },
  {
    id: 'phlebotomist',
    trade: 'Phlebotomist',
    sector: 'Healthcare',
    nsqf_level: 4,
    nco_code: '3212.0201',
    base_demand: 19000,
    base_supply: 16000,
    growth_rate: 0.12,
    hiring_velocity: 'Steady (+12% YoY)',
    saturation_risk: 'Medium',
    future_dss: 5.9,
    future_status: 'Balanced',
    recommendation: 'Maintain baseline quota while enhancing sample preservation protocol training.',
  },

  // ── IT / ITES ──
  {
    id: 'full-stack-developer',
    trade: 'Full-Stack Developer',
    sector: 'IT / ITES',
    nsqf_level: 7,
    nco_code: '2512.0101',
    base_demand: 48000,
    base_supply: 26000,
    growth_rate: 0.27,
    hiring_velocity: 'High (+27% YoY)',
    saturation_risk: 'Low',
    future_dss: 8.6,
    future_status: 'Acute Shortage',
    recommendation: 'Transition basic coding bootcamps into cloud-native microservices and React/Node curricula.',
  },
  {
    id: 'ai-ml-engineer',
    trade: 'AI/ML Engineer',
    sector: 'IT / ITES',
    nsqf_level: 8,
    nco_code: '2519.0101',
    base_demand: 42000,
    base_supply: 14000,
    growth_rate: 0.42,
    hiring_velocity: 'Exponential (+42% YoY)',
    saturation_risk: 'Low',
    future_dss: 9.6,
    future_status: 'Critical Shortage',
    recommendation: 'Scale national AI skilling missions with GPU cloud access and prompt-engineering capstones.',
  },
  {
    id: 'cybersecurity-analyst',
    trade: 'Cybersecurity Analyst',
    sector: 'IT / ITES',
    nsqf_level: 7,
    nco_code: '2529.0101',
    base_demand: 33000,
    base_supply: 16000,
    growth_rate: 0.31,
    hiring_velocity: 'Accelerating (+31% YoY)',
    saturation_risk: 'Low',
    future_dss: 9.0,
    future_status: 'Critical Shortage',
    recommendation: 'Deploy SOC defense simulation ranges across national skill academies.',
  },
  {
    id: 'cloud-solutions-architect',
    trade: 'Cloud Solutions Architect',
    sector: 'IT / ITES',
    nsqf_level: 8,
    nco_code: '2523.0101',
    base_demand: 31000,
    base_supply: 15000,
    growth_rate: 0.30,
    hiring_velocity: 'Rapid (+30% YoY)',
    saturation_risk: 'Low',
    future_dss: 8.8,
    future_status: 'Acute Shortage',
    recommendation: 'Subsidize multi-cloud professional certifications (AWS, Azure, GCP) for final year trainees.',
  },
  {
    id: 'data-entry-operator',
    trade: 'Data Entry Operator',
    sector: 'IT / ITES',
    nsqf_level: 3,
    nco_code: '4132.0100',
    base_demand: 9500,
    base_supply: 52000,
    growth_rate: -0.18,
    hiring_velocity: 'Declining (-18% YoY)',
    saturation_risk: 'Severe',
    future_dss: 1.1,
    future_status: 'Severe Oversupply',
    recommendation: 'Freeze new batch approvals immediately; redirect trainees to AI annotation and data curation.',
  },
];

function generateLocalJobRoles(targetState: string): JobRoleItem[] {
  const isNational = targetState === 'National';
  const prof = STATE_SHARES[targetState] || { share: 0.05, bias: [1.0, 1.0, 1.0, 1.0, 1.0] };
  const share = isNational ? 1.0 : prof.share;
  const sectorIdxMap: Record<string, number> = {
    'Green Energy': 0,
    'Electronics': 1,
    'Logistics': 2,
    'Healthcare': 3,
    'IT / ITES': 4,
  };

  const months = ["Apr'25","May'25","Jun'25","Jul'25","Aug'25","Sep'25","Oct'25","Nov'25","Dec'25","Jan'26","Feb'26","Mar'26"];
  const capFactors = [0.902, 0.911, 0.920, 0.928, 0.937, 0.947, 0.956, 0.966, 0.975, 0.984, 0.992, 1.000];
  const demFactors = [0.865, 0.876, 0.888, 0.902, 0.919, 0.933, 0.949, 0.963, 0.976, 0.985, 0.993, 1.000];

  return BASE_JOB_ROLES.map((j) => {
    const idx = sectorIdxMap[j.sector] ?? 0;
    const bias = isNational ? 1.0 : prof.bias[idx];

    const scaledSupply = Math.max(5, Math.round(j.base_supply * share * bias));
    const scaledDemand = Math.max(5, Math.round(j.base_demand * share * bias));
    const currGap = scaledDemand - scaledSupply;

    const predDem6m = Math.max(5, Math.round(scaledDemand * (1 + j.growth_rate * 0.5)));
    const predCap6m = Math.max(5, Math.round(scaledSupply * 1.025));
    const predGap6m = predDem6m - predCap6m;

    const predDem12m = Math.max(5, Math.round(scaledDemand * (1 + j.growth_rate)));
    const predCap12m = Math.max(5, Math.round(scaledSupply * 1.055));
    const predGap12m = predDem12m - predCap12m;

    const history: JobRoleHistoryPoint[] = months.map((m, i) => {
      const c = Math.max(1, Math.round(scaledSupply * capFactors[i]));
      const d = Math.max(1, Math.round(scaledDemand * demFactors[i]));
      return {
        month: m,
        supply: c,
        demand: d,
        gap: d - c,
      };
    });

    return {
      id: j.id,
      trade: j.trade,
      sector: j.sector,
      nsqf_level: j.nsqf_level,
      nco_code: j.nco_code,
      current_supply: scaledSupply,
      current_demand: scaledDemand,
      current_gap: currGap,
      growth_rate_pct: Math.round(j.growth_rate * 1000) / 10,
      hiring_velocity: j.hiring_velocity,
      saturation_risk: j.saturation_risk,
      future_dss: j.future_dss,
      future_status: j.future_status,
      recommendation: j.recommendation,
      future_prediction: {
        six_month: {
          projected_demand: predDem6m,
          projected_supply: predCap6m,
          projected_gap: predGap6m,
        },
        twelve_month: {
          projected_demand: predDem12m,
          projected_supply: predCap12m,
          projected_gap: predGap12m,
        },
        hiring_trajectory: j.growth_rate > 0.2 ? 'Accelerating' : j.growth_rate > 0 ? 'Stable' : 'Declining',
        risk_profile: j.saturation_risk,
      },
      history,
    };
  });
}

/* ================================================================== */
/*  SECTOR VISUAL THEMES                                              */
/* ================================================================== */

const SECTOR_THEMES: Record<string, {
  color: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  icon: string;
  cardGlow: string;
}> = {
  'Green Energy': {
    color: '#10b981',
    badgeBg: 'bg-emerald-500/15',
    badgeBorder: 'border-emerald-500/30',
    badgeText: 'text-emerald-400',
    icon: '⚡',
    cardGlow: 'hover:shadow-emerald-500/5',
  },
  'Electronics': {
    color: '#06b6d4',
    badgeBg: 'bg-cyan-500/15',
    badgeBorder: 'border-cyan-500/30',
    badgeText: 'text-cyan-400',
    icon: '🔌',
    cardGlow: 'hover:shadow-cyan-500/5',
  },
  'Logistics': {
    color: '#f59e0b',
    badgeBg: 'bg-amber-500/15',
    badgeBorder: 'border-amber-500/30',
    badgeText: 'text-amber-400',
    icon: '🚚',
    cardGlow: 'hover:shadow-amber-500/5',
  },
  'Healthcare': {
    color: '#f43f5e',
    badgeBg: 'bg-rose-500/15',
    badgeBorder: 'border-rose-500/30',
    badgeText: 'text-rose-400',
    icon: '🩺',
    cardGlow: 'hover:shadow-rose-500/5',
  },
  'IT / ITES': {
    color: '#8b5cf6',
    badgeBg: 'bg-violet-500/15',
    badgeBorder: 'border-violet-500/30',
    badgeText: 'text-violet-400',
    icon: '💻',
    cardGlow: 'hover:shadow-violet-500/5',
  },
};

function getStatusStyle(status: string) {
  if (status.includes('Critical')) {
    return { bg: 'bg-red-500/15 border-red-500/30 text-red-400', dot: 'bg-red-400 animate-pulse' };
  }
  if (status.includes('Acute')) {
    return { bg: 'bg-amber-500/15 border-amber-500/30 text-amber-400', dot: 'bg-amber-400 animate-pulse' };
  }
  if (status.includes('Moderate')) {
    return { bg: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300', dot: 'bg-yellow-400' };
  }
  if (status.includes('Oversupply')) {
    return { bg: 'bg-purple-500/15 border-purple-500/30 text-purple-300', dot: 'bg-purple-400' };
  }
  return { bg: 'bg-blue-500/15 border-blue-500/30 text-blue-300', dot: 'bg-blue-400' };
}

/* ================================================================== */
/*  CUSTOM TOOLTIP FOR MINI AREA CHART                                */
/* ================================================================== */

interface TooltipPayload {
  dataKey: string;
  value: number;
  color: string;
}

const JobHistoryTooltip: FC<{
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload) return null;
  const supply = payload.find((p) => p.dataKey === 'supply')?.value ?? 0;
  const demand = payload.find((p) => p.dataKey === 'demand')?.value ?? 0;
  const gap = demand - supply;
  const isDeficit = gap > 0;

  return (
    <div className="rounded-xl border border-white/15 bg-navy-900/98 px-3.5 py-2.5 text-xs shadow-xl">
      <div className="font-bold text-accent-cyan mb-1.5">{label}</div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4 text-slate-300">
          <span className="flex items-center gap-1.5 text-blue-400">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            Supply:
          </span>
          <span className="font-semibold text-white">{supply.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-slate-300">
          <span className="flex items-center gap-1.5 text-purple-400">
            <span className="h-2 w-2 rounded-full bg-purple-400" />
            Demand:
          </span>
          <span className="font-semibold text-white">{demand.toLocaleString('en-IN')}</span>
        </div>
        <div className="pt-1 border-t border-white/10 flex items-center justify-between gap-4 font-bold">
          <span className="text-slate-400">Net Gap:</span>
          <span style={{ color: isDeficit ? '#fbbf24' : '#4ade80' }}>
            {isDeficit ? '+' : '−'}{Math.abs(gap).toLocaleString('en-IN')} {isDeficit ? '(Deficit)' : '(Surplus)'}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ================================================================== */
/*  MAIN COMPONENT                                                    */
/* ================================================================== */

export const JobRolesMenuModal: FC<JobRolesMenuModalProps> = ({
  isOpen,
  onClose,
  state,
  scope,
}) => {
  const [jobs, setJobs] = useState<JobRoleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSector, setSelectedSector] = useState('All');

  // Fetch or generate data whenever state or scope changes
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoading(true);

    const loadData = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/v1/jobs/roles?state=${encodeURIComponent(state)}`);
        if (res.ok) {
          const json = await res.json();
          if (isMounted) {
            setJobs(json.jobs);
            setLoading(false);
          }
          return;
        }
      } catch (err) {
        console.warn('Backend job roles endpoint error, using local fallback:', err);
      }
      if (isMounted) {
        setJobs(generateLocalJobRoles(state));
        setLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [isOpen, state]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Sector list
  const sectors = useMemo(() => {
    return ['All', 'Green Energy', 'Electronics', 'Logistics', 'Healthcare', 'IT / ITES'];
  }, []);

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesSector = selectedSector === 'All' || job.sector === selectedSector;
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        job.trade.toLowerCase().includes(q) ||
        job.sector.toLowerCase().includes(q) ||
        job.nco_code.toLowerCase().includes(q) ||
        `nsqf ${job.nsqf_level}`.includes(q) ||
        job.future_status.toLowerCase().includes(q);
      return matchesSector && matchesSearch;
    });
  }, [jobs, selectedSector, search]);

  // Group by sector for "All Sectors" view
  const groupedJobs = useMemo(() => {
    const map: Record<string, JobRoleItem[]> = {};
    for (const job of filteredJobs) {
      if (!map[job.sector]) map[job.sector] = [];
      map[job.sector].push(job);
    }
    return map;
  }, [filteredJobs]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-7 bg-navy-950/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-7xl max-h-[92vh] overflow-hidden rounded-3xl border border-white/15 bg-navy-950/98 shadow-2xl text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── TOP HEADER ── */}
        <div className="relative border-b border-white/[0.08] px-6 py-5 bg-gradient-to-r from-navy-900/90 via-navy-950/90 to-navy-900/90">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase text-accent-cyan">
                  <Sparkles className="h-3 w-3" />
                  Workforce Trade Intelligence & Predictions
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-slate-300 font-medium">
                  Scope: <strong className="text-white">{scope === 'national' ? 'National (All-India)' : state}</strong>
                </span>
                <span className="text-[11px] text-slate-400">
                  {jobs.length} NSQF Mapped Job Roles
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
                <Briefcase className="h-6 w-6 text-accent-cyan" />
                Sector-Segregated Job Roles, Future Predictions & Historical Trajectories
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-4xl">
                Every trade is segregated by industry sector with forward AI projections (6M & 12M).
                <strong className="text-slate-200 ml-1">Scroll down each job</strong> to inspect previous data: historical 12-month supply, demand, and talent gap evolution over time.
              </p>
            </div>

            <button
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-all shrink-0"
              title="Close Menu (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* ── SECTOR FILTER TABS & SEARCH BAR ── */}
          <div className="mt-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
            {/* Sector Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              <span className="text-xs text-slate-500 flex items-center gap-1 mr-1">
                <Filter className="h-3.5 w-3.5" />
                Sectors:
              </span>
              {sectors.map((sec) => {
                const isSelected = selectedSector === sec;
                const count = sec === 'All' ? jobs.length : jobs.filter((j) => j.sector === sec).length;
                const theme = SECTOR_THEMES[sec];
                return (
                  <button
                    key={sec}
                    onClick={() => setSelectedSector(sec)}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-accent-cyan text-navy-950 font-bold shadow-md shadow-accent-cyan/25 scale-[1.02]'
                        : 'border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <span>{sec === 'All' ? '🌐 All Sectors' : `${theme?.icon || ''} ${sec}`}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                        isSelected ? 'bg-navy-950/30 text-navy-950 font-extrabold' : 'bg-white/10 text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search job title, NCO code, level…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] py-1.5 pl-9 pr-8 text-xs text-white placeholder:text-slate-500 focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/40"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── BODY: SCROLLABLE LIST OF JOB ROLES ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 divide-y divide-white/[0.06]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
              <span className="h-8 w-8 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
              <p className="text-sm font-medium">Aggregating live sector predictions & historical series…</p>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-2">
              <p className="text-base font-bold text-white">No job roles match your filter criteria.</p>
              <p className="text-xs">Try selecting 'All Sectors' or clearing the search bar.</p>
              <button
                onClick={() => { setSelectedSector('All'); setSearch(''); }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent-cyan/20 px-3 py-1.5 text-xs font-semibold text-accent-cyan hover:bg-accent-cyan/30"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            // Render by sector groups
            Object.entries(groupedJobs).map(([sectorName, sectorJobs]) => {
              const theme = SECTOR_THEMES[sectorName];
              return (
                <div key={sectorName} className="pt-6 first:pt-0 space-y-5">
                  {/* Sector Group Banner */}
                  <div className="flex items-center justify-between flex-wrap gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{theme?.icon}</span>
                      <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          {sectorName}
                          <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-md border ${theme?.badgeBg} ${theme?.badgeBorder} ${theme?.badgeText}`}>
                            Sector Registry
                          </span>
                        </h3>
                        <p className="text-xs text-slate-400">
                          {sectorJobs.length} Mapped Trades · National Labour Market Forecast
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div>
                        <span className="text-slate-500">Total Sector Demand: </span>
                        <span className="font-bold text-white">
                          {sectorJobs.reduce((s, j) => s + j.current_demand, 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Current Gap: </span>
                        <span className="font-bold text-amber-400">
                          {(() => {
                            const totalG = sectorJobs.reduce((s, j) => s + j.current_gap, 0);
                            return `${totalG > 0 ? '+' : '−'}${Math.abs(totalG).toLocaleString('en-IN')}`;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Job Cards in this Sector */}
                  <div className="space-y-6">
                    {sectorJobs.map((job) => {
                      const statusStyle = getStatusStyle(job.future_status);
                      const isDeficit = job.current_gap > 0;
                      return (
                        <div
                          key={job.id}
                          className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-5 sm:p-6 transition-all hover:border-white/[0.16] shadow-xl hover:shadow-2xl space-y-6"
                        >
                          {/* 1. Header Row of Job */}
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${theme?.badgeBg} ${theme?.badgeBorder} ${theme?.badgeText}`}>
                                  {job.sector}
                                </span>
                                <span className="text-[11px] font-semibold bg-white/10 px-2 py-0.5 rounded-lg text-slate-300">
                                  NSQF Level {job.nsqf_level}
                                </span>
                                <span className="text-[11px] font-mono text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded-lg">
                                  NCO: {job.nco_code}
                                </span>
                                <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${statusStyle.bg}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                                  {job.future_status}
                                </span>
                              </div>
                              <h4 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                                {job.trade}
                              </h4>
                            </div>

                            {/* Current Supply / Demand / Gap Badges */}
                            <div className="flex items-center gap-3 sm:gap-4 flex-wrap bg-navy-900/60 border border-white/[0.06] rounded-2xl px-4 py-2.5">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400 block">Training Supply</span>
                                <span className="text-sm font-bold text-blue-400">
                                  {job.current_supply.toLocaleString('en-IN')}
                                </span>
                              </div>
                              <div className="h-6 w-px bg-white/[0.08]" />
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400 block">Industry Demand</span>
                                <span className="text-sm font-bold text-purple-400">
                                  {job.current_demand.toLocaleString('en-IN')}
                                </span>
                              </div>
                              <div className="h-6 w-px bg-white/[0.08]" />
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Gap</span>
                                <span className="text-sm font-bold" style={{ color: isDeficit ? '#fbbf24' : '#4ade80' }}>
                                  {isDeficit ? '+' : '−'}{Math.abs(job.current_gap).toLocaleString('en-IN')}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* 2. FUTURE PREDICTION MATRIX (Prominently displayed) */}
                          <div className="rounded-2xl border border-accent-cyan/20 bg-gradient-to-r from-accent-cyan/[0.04] via-accent-indigo/[0.04] to-transparent p-4 sm:p-5 space-y-3.5">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent-cyan">
                                <Sparkles className="h-4 w-4 text-accent-cyan" />
                                Future AI Prediction & Market Trajectory
                              </span>
                              <span className="text-[11px] text-slate-400">
                                DSS Severity: <strong className="text-white">{job.future_dss} / 10</strong> · Risk: <strong className="text-slate-200">{job.saturation_risk}</strong>
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {/* 6-Month Horizon */}
                              <div className="rounded-xl border border-white/[0.06] bg-navy-950/60 p-3 space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  6-Month Forecast
                                </span>
                                <div className="text-xs text-slate-300">
                                  Demand: <strong className="text-white font-semibold">{job.future_prediction.six_month.projected_demand.toLocaleString('en-IN')}</strong>
                                </div>
                                <div className="text-xs text-slate-300">
                                  Supply: <strong className="text-slate-200">{job.future_prediction.six_month.projected_supply.toLocaleString('en-IN')}</strong>
                                </div>
                                <div className="text-xs font-bold pt-1" style={{ color: job.future_prediction.six_month.projected_gap > 0 ? '#fbbf24' : '#4ade80' }}>
                                  Gap: {job.future_prediction.six_month.projected_gap > 0 ? '+' : '−'}{Math.abs(job.future_prediction.six_month.projected_gap).toLocaleString('en-IN')}
                                </div>
                              </div>

                              {/* 12-Month Horizon */}
                              <div className="rounded-xl border border-white/[0.06] bg-navy-950/60 p-3 space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  12-Month Forecast
                                </span>
                                <div className="text-xs text-slate-300">
                                  Demand: <strong className="text-white font-semibold">{job.future_prediction.twelve_month.projected_demand.toLocaleString('en-IN')}</strong>
                                </div>
                                <div className="text-xs text-slate-300">
                                  Supply: <strong className="text-slate-200">{job.future_prediction.twelve_month.projected_supply.toLocaleString('en-IN')}</strong>
                                </div>
                                <div className="text-xs font-bold pt-1" style={{ color: job.future_prediction.twelve_month.projected_gap > 0 ? '#fbbf24' : '#4ade80' }}>
                                  Gap: {job.future_prediction.twelve_month.projected_gap > 0 ? '+' : '−'}{Math.abs(job.future_prediction.twelve_month.projected_gap).toLocaleString('en-IN')}
                                </div>
                              </div>

                              {/* Hiring Velocity & Growth */}
                              <div className="rounded-xl border border-white/[0.06] bg-navy-950/60 p-3 space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  Growth Rate
                                </span>
                                <div className="text-sm font-extrabold flex items-center gap-1.5" style={{ color: job.growth_rate_pct >= 0 ? '#4ade80' : '#f87171' }}>
                                  {job.growth_rate_pct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                  {job.growth_rate_pct >= 0 ? '+' : ''}{job.growth_rate_pct}% YoY
                                </div>
                                <span className="text-[11px] text-slate-400 block">
                                  Velocity: <strong className="text-slate-200">{job.hiring_velocity}</strong>
                                </span>
                              </div>

                              {/* Saturation Risk */}
                              <div className="rounded-xl border border-white/[0.06] bg-navy-950/60 p-3 space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  Saturation Profile
                                </span>
                                <div className="text-xs font-bold text-white">
                                  {job.saturation_risk} Risk
                                </div>
                                <span className="text-[10px] text-slate-400 block leading-tight">
                                  Demand Severity Index: <span className="font-semibold text-accent-cyan">{job.future_dss}</span>
                                </span>
                              </div>
                            </div>

                            {/* Strategic Policy Recommendation */}
                            <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
                              <Zap className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                              <div className="text-slate-300">
                                <strong className="text-white">Actionable MSDE Recommendation: </strong>
                                {job.recommendation}
                              </div>
                            </div>
                          </div>

                          {/* 3. UPON SCROLLING: PREVIOUS DATA (SUPPLY, DEMAND, AND GAP VS TIME) */}
                          <div className="space-y-4 pt-3 border-t border-white/[0.06]">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                                <History className="h-4 w-4 text-accent-cyan" />
                                <span>Previous Data: 12-Month Supply, Demand & Gap vs Time (Apr'25 – Mar'26)</span>
                              </div>
                              <span className="text-[11px] text-slate-400">
                                Month-by-month trajectory before future predictions took effect
                              </span>
                            </div>

                            {/* 12-Month Historical AreaChart */}
                            <div className="rounded-2xl border border-white/[0.06] bg-navy-950/40 p-3 pt-4">
                              <ResponsiveContainer width="100%" height={170} debounce={150}>
                                <AreaChart data={job.history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                  <defs>
                                    <linearGradient id={`supply-${job.id}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                                    </linearGradient>
                                    <linearGradient id={`demand-${job.id}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                                  <XAxis
                                    dataKey="month"
                                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                                    axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                                    tickLine={false}
                                  />
                                  <YAxis
                                    tick={{ fill: '#64748b', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v: number) => {
                                      const abs = Math.abs(v);
                                      if (abs >= 1000) return `${(v / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
                                      return `${v}`;
                                    }}
                                  />
                                  <Tooltip content={<JobHistoryTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
                                  <Area
                                    type="monotone"
                                    dataKey="supply"
                                    name="Training Supply"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill={`url(#supply-${job.id})`}
                                    isAnimationActive={false}
                                  />
                                  <Area
                                    type="monotone"
                                    dataKey="demand"
                                    name="Industry Demand"
                                    stroke="#a855f7"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill={`url(#demand-${job.id})`}
                                    isAnimationActive={false}
                                  />
                                  <Area
                                    type="monotone"
                                    dataKey="gap"
                                    name="Talent Gap"
                                    stroke="#f59e0b"
                                    strokeWidth={1.5}
                                    strokeDasharray="3 3"
                                    fill="none"
                                    isAnimationActive={false}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>

                            {/* Scrollable Month-by-Month Historical Progression Table */}
                            <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-navy-950/60 max-h-48 overflow-y-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead className="sticky top-0 z-10 bg-navy-900 border-b border-white/[0.08] text-slate-400">
                                  <tr>
                                    <th className="py-2 px-3 font-semibold">Month</th>
                                    <th className="py-2 px-3 font-semibold text-blue-400">Supply</th>
                                    <th className="py-2 px-3 font-semibold text-purple-400">Demand</th>
                                    <th className="py-2 px-3 font-semibold text-amber-400">Historical Gap</th>
                                    <th className="py-2 px-3 font-semibold">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.03]">
                                  {job.history.map((pt) => {
                                    const ptDeficit = pt.gap > 0;
                                    return (
                                      <tr key={pt.month} className="hover:bg-white/[0.02]">
                                        <td className="py-1.5 px-3 font-medium text-slate-200">{pt.month}</td>
                                        <td className="py-1.5 px-3 text-slate-300 font-mono">{pt.supply.toLocaleString('en-IN')}</td>
                                        <td className="py-1.5 px-3 text-slate-300 font-mono">{pt.demand.toLocaleString('en-IN')}</td>
                                        <td className="py-1.5 px-3 font-mono font-bold" style={{ color: ptDeficit ? '#fbbf24' : '#4ade80' }}>
                                          {ptDeficit ? '+' : '−'}{Math.abs(pt.gap).toLocaleString('en-IN')}
                                        </td>
                                        <td className="py-1.5 px-3">
                                          <span
                                            className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                            style={{
                                              background: ptDeficit ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
                                              color: ptDeficit ? '#fbbf24' : '#4ade80',
                                            }}
                                          >
                                            {ptDeficit ? 'Shortage' : 'Surplus'}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── FOOTER BAR ── */}
        <div className="border-t border-white/[0.08] px-6 py-3.5 bg-navy-950/90 flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Shield className="h-4 w-4 text-accent-cyan" />
            <span>MSDE-NCVET Labour Market Intelligence Engine v2.4 • NSQF Aligned</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-400">
              Showing <strong className="text-white">{filteredJobs.length}</strong> of {jobs.length} roles
            </span>
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-1.5 font-semibold text-white hover:bg-white/10 transition-all"
            >
              Close Menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobRolesMenuModal;
