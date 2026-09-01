/**
 * Data access boundary.
 *
 * Today every function returns MOCK data from `src/data/demoPlayer.ts` because
 * DEMO_DATA is true and no parser/database exists. Later, each function becomes
 * the call site for the real pipeline:
 *
 *   DEMO -> PARSER -> DATABASE -> METRICS ENGINE -> SCORE ENGINE
 *        -> DIAGNOSIS ENGINE -> AI COACH -> TRAINING ENGINE
 *
 * Components never import from `src/data` directly for page content, so the
 * swap does not require rebuilding the UI.
 */
import { DEMO_DATA } from "@/config/app";
import {
  demoAdrTrend,
  demoAnalysis,
  demoBottlenecks,
  demoCoachMessages,
  demoHsTrend,
  demoKastTrend,
  demoKdTrend,
  demoMapPerformance,
  demoMatches,
  demoMetrics,
  demoOpeningTrend,
  demoPlayerDna,
  demoProScore,
  demoProfile,
  demoScoreTrend,
  demoSideSplit,
  demoStrengths,
  demoTrainingPlans,
} from "@/data/demoPlayer";

/** True while the UI is rendering demonstration values. */
export const isDemoSource = () => DEMO_DATA;

export const getProScore = () => demoProScore;
export const getPlayerDna = () => demoPlayerDna;
export const getBottlenecks = () => demoBottlenecks;
export const getStrengths = () => demoStrengths;
export const getMetrics = () => demoMetrics;
export const getMatches = () => demoMatches;
export const getMapPerformance = () => demoMapPerformance;
export const getSideSplit = () => demoSideSplit;
export const getTrainingPlans = () => demoTrainingPlans;
export const getCoachHistory = () => demoCoachMessages;
export const getProfile = () => demoProfile;
export const getAnalysis = () => demoAnalysis;

export const getTrends = () => ({
  score: demoScoreTrend,
  kd: demoKdTrend,
  adr: demoAdrTrend,
  kast: demoKastTrend,
  hs: demoHsTrend,
  opening: demoOpeningTrend,
});
