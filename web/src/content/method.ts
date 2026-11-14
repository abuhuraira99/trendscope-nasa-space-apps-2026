/**
 * Content for the "How TrendScope decides" page. Each section has two depths: `plain` for
 * students and the public, `expert` for scientists. The expert text describes what the statistics
 * library in web/src/lib/stats actually does (checked against its source on 14 November 2026).
 */

import type { SourceId } from "./sources.ts";

export interface MethodSection {
  id: string;
  title: string;
  /** A short question the section answers, for a contents list. */
  question: string;
  /** Plain-language explanation, a few short sentences. */
  plain: string;
  /** Technical explanation with formulas written in plain text. */
  expert: string;
  /** One sentence describing a picture or animation that would explain the idea. */
  picture?: string;
  sources: SourceId[];
}

export interface GlossaryTerm {
  term: string;
  plain: string;
  expert: string;
}

export const METHOD_INTRO = {
  title: "How TrendScope decides",
  plain:
    "For every place on the globe, TrendScope takes one value per year, fits a line through the years, and asks two questions. How fast is it changing? Could a pattern this steady come from chance alone? Each answer below comes in two versions: a short one, and one for readers who want the formulas.",
  expert:
    "TrendScope applies a nonparametric trend workflow to annual series from 1981 to the last complete year: Sen's slope with a 95% confidence interval, the Mann-Kendall test with a Yue and Wang (2004) variance correction for lag-1 autocorrelation, and Benjamini-Hochberg false discovery rate control across the map. The investigation panel adds a seasonal Mann-Kendall test, per-month trends, a least-squares fit with a t-test, a Pettitt change-point test and a Weatherhead detection time.",
};

export const METHOD_SECTIONS: MethodSection[] = [
  {
    id: "trend",
    title: "What a trend is",
    question: "What does TrendScope mean by a trend?",
    plain:
      "A trend is a steady drift in one direction that lasts for years, underneath the ups and downs of single years. One hot summer is weather. Forty years of summers that keep creeping upward is a trend. TrendScope reports how big the drift is, per decade, and how sure we can be that it is real.",
    expert:
      "TrendScope tests for a monotonic trend in the annual series x_1, ..., x_n against the null hypothesis that the values are independent and identically distributed with no trend. Magnitude is the Sen slope in units per decade; significance is the two-sided Mann-Kendall p-value after the autocorrelation correction. A trend can be real and small, or large and still not significant when the record is short or noisy.",
    picture: "A jagged yearly line with a calm straight line through it, labelled 'the drift'.",
    sources: ["mann1945", "sen1968"],
  },
  {
    id: "seasons",
    title: "Why seasons come out first",
    question: "Why not test the raw monthly numbers?",
    plain:
      "Every place has a yearly rhythm: hot summers, cool winters, a rainy season. That rhythm is far bigger than most long-term changes, and it would hide them. TrendScope removes it in two ways. The map uses one average per year, so each value covers a full cycle. The investigation panel can also compare each January with other Januaries, each February with other Februaries, and so on.",
    expert:
      "Annual values are the mean (or for cooling degree days the sum) of the 12 monthly values, formed only when at least 10 months are present; incomplete final years are dropped. The panel also shows anomalies against the month-of-year mean, and the Hirsch et al. (1982) seasonal Mann-Kendall test, which sums S over the 12 calendar months, S' = sum_g S_g, with Var(S') = sum_g Var(S_g), and the seasonal Sen slope, the median of all within-month pairwise slopes. Per-month Sen slopes and p-values form a seasonal fingerprint that shows which months carry the change.",
    picture: "Twelve small lines, one per calendar month, each with its own slope, stacked like a bar chart.",
    sources: ["hirsch1982"],
  },
  {
    id: "mann-kendall",
    title: "The Mann-Kendall test in one picture",
    question: "How does the significance test work?",
    plain:
      "Take every pair of years in the record, an earlier one and a later one. Ask a simple question of each pair: did the value go up or down? Count the ups and subtract the downs. If nothing is changing, ups and downs should roughly cancel. If the count leans far to one side, chance becomes an unlikely explanation. The test never uses the size of the jumps, only their direction, so one extreme year cannot fake a trend.",
    expert:
      "S = sum_{i<j} sign(x_j - x_i). Under the null, E[S] = 0 and Var(S) = [n(n-1)(2n+5) - sum_p t_p(t_p-1)(2t_p+5)] / 18, where t_p is the size of the p-th group of tied values. The test statistic is z = (S - sign(S)) / sqrt(Var(S)) with continuity correction, and p = 2(1 - Phi(|z|)). Kendall's tau = S / [n(n-1)/2] is reported as a measure of how consistently the series rises or falls.",
    picture: "A grid of every pair of years, each cell coloured up or down; the balance of colours is S.",
    sources: ["mann1945", "kendall1975", "gilbert1987"],
  },
  {
    id: "sen-slope",
    title: "Sen's slope: how fast",
    question: "Where does the 'per decade' number come from?",
    plain:
      "For every pair of years, work out how fast the value changed between them. That gives hundreds of little slopes. Line them up and take the middle one. That middle value is Sen's slope. Because it is a median, a single strange year barely moves it, which suits noisy climate data. TrendScope multiplies it by ten to report change per decade, and gives a range that likely contains the true rate.",
    expert:
      "Q_ij = (x_j - x_i) / (t_j - t_i) for all i < j; Sen's slope is the median of the N' = n(n-1)/2 values (Sen 1968). The 95% interval follows Gilbert (1987): C = z_0.975 * sqrt(Var(S)), M1 = (N' - C) / 2 and M2 = (N' + C) / 2, with the limits taken as the M1-th and (M2 + 1)-th ordered slopes. TrendScope uses the autocorrelation-corrected Var(S) here, so the interval widens when the series is persistent. A least-squares slope with its t-test is shown alongside for comparison.",
    picture: "Many thin lines joining pairs of points, with the median line drawn bold.",
    sources: ["sen1968", "gilbert1987"],
  },
  {
    id: "ols",
    title: "Why not just a straight line and a t-test?",
    question: "How does this compare with ordinary regression?",
    plain:
      "A least-squares line and a t-test are the classic tools, and TrendScope shows them too. They work best when the year-to-year scatter is bell-shaped and every year is independent. Rainfall and pollution records often break those rules with a few extreme years. The Mann-Kendall test and Sen's slope make fewer assumptions, so TrendScope uses them for the verdict.",
    expert:
      "The panel reports the OLS slope, its standard error, the t-test p-value with n - 2 degrees of freedom, a 95% confidence interval and R². OLS is sensitive to outliers and to skewed residuals, and its standard error assumes independent residuals. When the OLS and Sen slopes disagree strongly, a few years are usually driving the fit.",
    sources: ["sen1968"],
  },
  {
    id: "autocorrelation",
    title: "Why memory in the data fakes trends",
    question: "What is the autocorrelation correction for?",
    plain:
      "Some things change slowly. A wet year leaves wet soil for the next year, and a warm ocean stays warm. This memory makes runs of high or low years more common than coin flips would give. Runs look like trends, so a test that assumes every year is independent will find too many trends. TrendScope measures the memory and makes the test stricter when it is present.",
    expert:
      "Positive serial correlation inflates the variance of S, so the original test rejects too often. Following Yue and Wang (2004), TrendScope removes the Sen slope, estimates the lag-1 autocorrelation r1 of the residuals, and multiplies Var(S) by n/n* = 1 + 2 sum_{k=1}^{n-1} (1 - k/n) r1^k. By default the correction is applied only when r1 is positive and significant (r1 > 1.96 / sqrt(n)), and it never shrinks Var(S), because negative sample r1 in short series would otherwise create false trends. The library also offers the pymannkendall lag-1 form, 1 + 2(1 - 1/n) r1, and the Hamed and Rao (1998) rank-based correction for comparison.",
    picture: "Two noise series side by side: one jumpy, one with long lazy swings that look like trends.",
    sources: ["yueWang2004", "hamedRao1998", "hussain2019"],
  },
  {
    id: "fdr",
    title: "Testing 52,000 places at once",
    question: "Why are some coloured cells left out of the significant map?",
    plain:
      "The map tests more than 52,000 grid cells. At the usual 5% level, about 1 cell in 20 would look significant even if nothing were changing anywhere. That is thousands of false alarms. TrendScope controls the false discovery rate instead: among all cells it marks as significant, the expected share of false alarms stays at or below one in ten. Cells that pass this stricter test are marked as field significant.",
    expert:
      "For the 181 x 288 POWER grid (52,128 cells, fewer with valid data), TrendScope applies the Benjamini and Hochberg (1995) step-up procedure at q = 0.10: sort the p-values p_(1) <= ... <= p_(m), find the largest k with p_(k) <= (k / m) q, and reject all hypotheses with p <= p_(k). Wilks (2016) shows that this controls false positives in gridded fields and is only mildly affected by spatial correlation, unlike testing each grid point alone. Cells carry sig = 2 when FDR-significant, 1 when only p < 0.05, and 0 otherwise.",
    picture: "A map of pure random noise where 1 in 20 cells lights up at p < 0.05, then goes dark under FDR.",
    sources: ["benjaminiHochberg1995", "wilks2016"],
  },
  {
    id: "detection-time",
    title: "How long until we know?",
    question: "What does the detection time mean?",
    plain:
      "A small change hidden in big year-to-year swings takes a long time to prove. TrendScope estimates how many years of data you would need to detect the current trend with good confidence. If that number is longer than the record, the honest verdict is 'not yet', and the trend may still be real. Sometimes all a trend needs to become significant is a longer record.",
    expert:
      "Weatherhead et al. (1998) give the record length needed to detect a linear trend omega_0 (per year) in AR(1) noise with standard deviation sigma_N and lag-1 autocorrelation phi, with probability 0.90 at the 5% level: n* = [ (3.3 sigma_N / |omega_0|) * sqrt((1 + phi) / (1 - phi)) ]^(2/3). TrendScope takes sigma_N and phi from the residuals of the fitted series and treats the current slope as the true one, so n* is an estimate. It is infinite when the slope is zero.",
    picture: "A slider of record length that turns the verdict from grey to coloured as years are added.",
    sources: ["weatherhead1998"],
  },
  {
    id: "change-points",
    title: "Steps, not slopes",
    question: "What is the change-point test for?",
    plain:
      "Some records jump to a new level and stay there. A drought can arrive in one year and last, or a new satellite can replace an old one and shift the numbers. A straight-line trend blurs a jump into a slope. Pettitt's test looks for the single year that best splits the record into a 'before' and an 'after' that differ. A detective then asks: did the climate change that year, or the instruments?",
    expert:
      "Pettitt (1979): U_t = sum_{i<=t} sum_{j>t} sign(x_i - x_j) for t = 1, ..., n - 1, K = max_t |U_t|, and the approximate two-sided p = 2 exp(-6 K² / (n³ + n²)). The test assumes independent values and a single shift, so it is weaker for gradual turns and can be distorted by autocorrelation. Known data seams worth checking against a Pettitt year include 1 January 2001 for POWER sunlight and cloud (GEWEX SRB to CERES), October 2004 for MERRA-2 ozone (SBUV to Aura), and the MERRA-2 production stream breaks of 1990-91, 2000-01 and 2010-11.",
    picture: "A series that sits at one level and then another, with a vertical line at the step.",
    sources: ["pettitt1979", "powerSourcesFluxes", "wargan2017", "ucarMerra2"],
  },
  {
    id: "limits",
    title: "Limits and honest caveats",
    question: "When should you doubt a TrendScope result?",
    plain:
      "Most map layers come from a reanalysis: a weather model that is steered by observations. It fills gaps well, but where few measurements exist it leans on the model, and changes in satellites can leave fingerprints. TrendScope fits straight lines, so curves, turns and jumps need the other tools. Each map cell is about 100 km wide and averages cities and farmland together. A significant trend shows that something changed. It does not by itself say why.",
    expert:
      "MERRA-2 does not assimilate station 2 m temperature directly, contains discontinuities tied to observing-system changes and sea-ice boundary forcing (NCAR Climate Data Guide), and its ozone switches source in 2004 (Wargan et al. 2017). POWER joins GEWEX SRB and CERES for sunlight and cloud in 2001, serves aerosol optical depth only from 2001 and IMERG only from 1998, and drops daily total ozone below about 200 DU. Trends are linear and annual; the 1° x 1.25° map is a subsample of POWER's 0.5° x 0.625° grid, while GISTEMP (2°) and GPCP (2.5°) are coarser. Compare a reanalysis trend with GISTEMP or GPCP where both exist, and treat attribution as a question for the cited literature.",
    sources: ["ucarMerra2", "wargan2017", "powerSourcesFluxes", "powerSourcesAerosols", "lenssen2019", "adler2018"],
  },
];

export const GLOSSARY: GlossaryTerm[] = [
  {
    term: "p-value",
    plain:
      "How often a pattern at least this steady would appear by chance if nothing were really changing. Small means chance is a poor explanation.",
    expert:
      "The probability, under the null hypothesis of no trend, of a Mann-Kendall statistic at least as extreme as the one observed (two-sided). It is not the probability that the trend is real.",
  },
  {
    term: "Reanalysis",
    plain:
      "A weather model run over past decades and nudged toward real measurements, giving a complete map even where nobody measured.",
    expert:
      "A fixed data assimilation system, here NASA GMAO's MERRA-2, that combines a forecast model with satellite and in situ observations to produce gridded, physically consistent fields from 1980 onward.",
  },
  {
    term: "Anomaly",
    plain: "How far a value is above or below its usual level for that place and time of year.",
    expert:
      "The departure from a reference climatology, such as the month-of-year mean or GISTEMP's 1951 to 1980 base period. Removing the climatology takes out the seasonal cycle and the local mean.",
  },
  {
    term: "Autocorrelation",
    plain: "Memory in a record: a high year tends to be followed by another high year.",
    expert:
      "Correlation of a series with itself at a time lag; r1 is the lag-1 value. Positive r1 inflates the variance of trend statistics and is corrected with the Yue and Wang (2004) method.",
  },
  {
    term: "False discovery rate",
    plain:
      "Among all the places a test calls significant, the share that are really false alarms. TrendScope keeps its expected value at or below one in ten.",
    expert:
      "The expected proportion of rejected null hypotheses that are true nulls, controlled here at q = 0.10 with the Benjamini and Hochberg (1995) procedure, as recommended for gridded fields by Wilks (2016).",
  },
  {
    term: "Change point",
    plain: "The year when a record seems to jump to a new level, from a real change or a change of instrument.",
    expert:
      "The time index that maximises the Pettitt (1979) statistic |U_t|, with an approximate p-value for a single shift in the median.",
  },
];
