export type Platform = "FACEIT" | "Gamers Club" | "Matchmaking" | "ESEA";

export type DnaDimension =
  | "Aim"
  | "Dueling"
  | "Survivability"
  | "Positioning"
  | "Utility"
  | "Decision Making"
  | "Teamplay"
  | "Economy"
  | "Clutch"
  | "Consistency";

export interface DnaPoint {
  dimension: DnaDimension;
  value: number;
  average: number;
}

export interface ProScore {
  value: number;
  max: number;
  deltaSinceFirstAnalysis: number;
  tier: string;
  percentile: number;
}

export interface Metric {
  key: string;
  label: string;
  value: string;
  delta?: number;
  unit?: string;
  hint?: string;
}

export interface TimeSeriesPoint {
  label: string;
  [series: string]: string | number;
}

export interface MapPerformance {
  map: string;
  matches: number;
  winRate: number;
  rating: number;
  adr: number;
}

export interface SideSplit {
  metric: string;
  ct: number;
  t: number;
}

export interface MatchRow {
  id: string;
  date: string;
  platform: Platform;
  map: string;
  result: "V" | "D" | "E";
  score: string;
  kills: number;
  deaths: number;
  adr: number;
  kast: number;
  rating: number;
}

export type Priority = "Crítica" | "Alta" | "Média";

export interface Bottleneck {
  id: string;
  area: DnaDimension;
  priority: Priority;
  impact: string;
  confidence: number;
  explanation: string;
}

export interface Strength {
  id: string;
  area: DnaDimension;
  summary: string;
  percentile: number;
}

export interface TrainingTask {
  title: string;
  detail: string;
  frequency: string;
}

export interface TrainingPlan {
  horizon: 30 | 60 | 90;
  title: string;
  goal: string;
  focus: string[];
  progress: number;
  tasks: TrainingTask[];
}

export interface CoachMessage {
  id: string;
  role: "coach" | "player";
  content: string;
  time: string;
}

export interface PlayerProfile {
  name: string;
  email: string;
  country: string;
  platform: Platform;
  level: string;
  goal: string;
  role: string;
  experience: string;
  preferences: { emailReports: boolean; weeklyPlan: boolean; publicProfile: boolean };
}
