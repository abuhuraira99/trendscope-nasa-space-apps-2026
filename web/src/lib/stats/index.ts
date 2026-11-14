/**
 * TrendScope statistics library: trend detection for annual and monthly Earth-system series.
 * Pure TypeScript, no runtime dependencies. Methods and references are in each module.
 */

export {
  analyzeAnnual,
  analyzeMonthly,
  confidenceFromP,
  type AnalyzeMonthlyOptions,
  type AnalyzeOptions,
  type AnnualAnalysis,
  type AnnualResult,
  type Confidence,
  type MonthlyAnalysis,
  type OlsSummary,
  type PettittSummary,
} from './analyze.ts';
export { detection, detectionYears, type DetectionResult } from './detection.ts';
export { bhMask, bhThreshold, significanceCodes } from './fdr.ts';
export {
  ar1VarianceFactor,
  hamedRao,
  mannKendall,
  mkScore,
  mkZ,
  varianceS,
  yueWang,
  yueWangFactorConservative,
  type MannKendallOptions,
  type MannKendallResult,
  type TrendDirection,
  type VarianceCorrection,
  type YueWangVariant,
} from './mannKendall.ts';
export {
  erf,
  erfc,
  lnGamma,
  normalCdf,
  normalPdf,
  normalQuantile,
  normalSf,
  regularizedBeta,
  studentTCdf,
  studentTPdf,
  studentTQuantile,
  twoSidedNormalP,
  twoSidedStudentP,
} from './normal.ts';
export { ols, type OlsResult } from './ols.ts';
export { pettitt, type PettittResult } from './pettitt.ts';
export {
  monthlyTrends,
  seasonalMK,
  seasonalSensSlope,
  type MonthTrend,
  type MonthTrendOk,
  type SeasonalMKResult,
  type SeasonalSensSlope,
} from './seasonal.ts';
export { gilbertCI, pairwiseSlopes, sensSlope, sensSlopeWithCI, type SensSlopeCI, type SensSlopeResult } from './sen.ts';
export {
  annualMeans,
  cleanMonthly,
  deseasonalize,
  lag1Autocorr,
  monthlyClimatology,
  residuals,
  type AnnualSeries,
  type AnnualStat,
  type MonthlyPoint,
} from './series.ts';
export { isValid, MIN_POINTS, POWER_FILL, type InsufficientData, type MaybeNumber } from './util.ts';
