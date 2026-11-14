/**
 * Plain and expert descriptions of every TrendScope variable.
 *
 * Ids match the variable table in docs/build-spec.md. Text never states a trend value: the app
 * computes every number from the data. Facts about sources were checked against the NASA POWER
 * documentation, the MERRA-2 papers and the NCAR Climate Data Guide on 14 November 2026.
 */

import type { SourceId } from "./sources.ts";

export const VAR_IDS = [
  "t2m",
  "t2m_max",
  "t2mwet",
  "cdd",
  "precip",
  "imerg",
  "soil",
  "evap",
  "pw",
  "snow",
  "seaice",
  "ozone",
  "aod",
  "cloud",
  "solar",
  "wind",
  "gistemp",
  "gpcp",
  "ndvi",
  "tws",
  "no2",
] as const;

export type VarId = (typeof VAR_IDS)[number];

export type Sphere = "heat" | "water" | "ice" | "air" | "life";

/** Picks the diverging colour ramp. The app maps these to its own ramps. */
export type RampKind = "temperature" | "wetness" | "ice" | "ozone" | "aerosol" | "neutral";

export type Landscape =
  | "desert"
  | "rainforest"
  | "megacity"
  | "farmland"
  | "mountains"
  | "polar"
  | "coast"
  | "ocean"
  | "monsoon";

export interface VariableSource {
  mission: string;
  product: string;
  provider: string;
  url: string;
}

export interface VariableInfo {
  id: VarId;
  /** Full name for headings. */
  name: string;
  /** At most 14 characters, for chips and legends. */
  shortName: string;
  sphere: Sphere;
  /** One sentence a 15-year-old understands, at most 22 words. */
  plain: string;
  /** One or two concrete sentences. */
  whyItMatters: string;
  /** Exact product, resolution and known caveats, in one or two sentences. */
  expert: string;
  /** Units of the stored values, as in the build spec. */
  units: string;
  /** Short unit text printed after numbers (may be empty for unitless values). */
  unitsLabel: string;
  /** Decimal places for slopes per decade and values in the panel. */
  decimals: number;
  /** Word for a rising trend, e.g. "warming". */
  increaseWord: string;
  /** Word for a falling trend, e.g. "cooling". */
  decreaseWord: string;
  rampKind: RampKind;
  /** True when an increase is usually read as worse for people. Not a moral judgment. */
  invertGood?: boolean;
  landOnly?: boolean;
  oceanOnly?: boolean;
  polarOnly?: boolean;
  source: VariableSource;
  /** Landscape types where this variable tends to tell the clearest story. */
  landscapes: Landscape[];
  /** False for variables planned but not yet in the app. */
  available: boolean;
  /** NASA POWER parameter code, for POWER variables. */
  powerParam?: string;
  /** How the annual value is formed from monthly values. */
  annualStat: "mean" | "sum";
  /** First year with data in the app. */
  firstYear: number;
  /** Keys into SOURCES for the "About the data" links. */
  sourceIds: SourceId[];
  /** Note for developers about fetching this variable. Not shown to users. */
  apiNote?: string;
}

const POWER_URL = "https://power.larc.nasa.gov/";
const POWER_MERRA2 = "NASA Langley POWER project, from NASA GMAO MERRA-2";
const POWER_CERES = "NASA Langley POWER project, from NASA Langley CERES and GEWEX SRB";

export const VARIABLES: Record<VarId, VariableInfo> = {
  t2m: {
    id: "t2m",
    name: "Air temperature",
    shortName: "Temperature",
    sphere: "heat",
    plain: "How warm the air is just above the ground, averaged over every day and night of the year.",
    whyItMatters:
      "Air temperature controls how fast snow and ice melt and how much energy homes use for heating and cooling.",
    expert:
      "MERRA-2 2 m air temperature (Gelaro et al. 2017) from NASA POWER, monthly means on the native 0.5° x 0.625° grid, subsampled to 1° x 1.25° for the map. MERRA-2 does not assimilate station 2 m temperature directly (NCAR Climate Data Guide), so a city's own heat can be smoothed away and trends are least certain where few observations exist.",
    units: "°C",
    unitsLabel: "°C",
    decimals: 2,
    increaseWord: "warming",
    decreaseWord: "cooling",
    rampKind: "temperature",
    invertGood: true,
    source: { mission: "MERRA-2 reanalysis", product: "POWER monthly T2M", provider: POWER_MERRA2, url: POWER_URL },
    landscapes: ["megacity", "desert", "polar", "mountains", "farmland"],
    available: true,
    powerParam: "T2M",
    annualStat: "mean",
    firstYear: 1981,
    sourceIds: ["power", "gelaro2017", "ucarMerra2"],
  },
  t2m_max: {
    id: "t2m_max",
    name: "Daytime high temperature",
    shortName: "Daily highs",
    sphere: "heat",
    plain: "The warmest temperature of each day, usually reached in the afternoon, averaged over the month and the year.",
    whyItMatters:
      "Daytime highs drive heat stress for outdoor workers and peak electricity demand. They can change differently from the daily average when clouds, haze or wet soil hold back afternoon heating.",
    expert:
      "Monthly mean of the daily maximum 2 m temperature from MERRA-2 (POWER T2M_MAX_AVG); TrendScope averages the 12 monthly values into an annual mean. Afternoon highs respond strongly to cloud, aerosol and soil moisture, and van Oldenborgh et al. (2018) found that aerosols and irrigation have held back trends in the hottest days across most of India.",
    units: "°C",
    unitsLabel: "°C",
    decimals: 2,
    increaseWord: "hotter days",
    decreaseWord: "cooler days",
    rampKind: "temperature",
    invertGood: true,
    source: { mission: "MERRA-2 reanalysis", product: "POWER monthly T2M_MAX_AVG", provider: POWER_MERRA2, url: POWER_URL },
    landscapes: ["megacity", "desert", "farmland"],
    available: true,
    powerParam: "T2M_MAX_AVG",
    annualStat: "mean",
    firstYear: 1981,
    sourceIds: ["power", "gelaro2017", "vanOldenborgh2018"],
  },
  t2mwet: {
    id: "t2mwet",
    name: "Wet-bulb temperature",
    shortName: "Humid heat",
    sphere: "heat",
    plain: "The temperature a thermometer wrapped in a wet cloth would show. It tells you how well sweat can cool you.",
    whyItMatters:
      "People cool down by sweating, and sweat stops working when the air is both hot and humid. A wet-bulb temperature of 35 °C is often cited as the limit the body can survive for long (Sherwood and Huber 2010), and young, healthy adults already struggle near 31 °C in humid air (Vecellio et al. 2022).",
    expert:
      "Wet-bulb temperature at 2 m from POWER (T2MWET), derived from MERRA-2 temperature, humidity and pressure, as monthly means. Monthly means sit far below the short peaks that harm health, and reanalysis humidity can shift when the observing system changes, so check the Pettitt change point before reading a trend.",
    units: "°C",
    unitsLabel: "°C",
    decimals: 2,
    increaseWord: "more humid heat",
    decreaseWord: "less humid heat",
    rampKind: "temperature",
    invertGood: true,
    source: { mission: "MERRA-2 reanalysis", product: "POWER monthly T2MWET", provider: POWER_MERRA2, url: POWER_URL },
    landscapes: ["megacity", "monsoon", "coast", "farmland"],
    available: true,
    powerParam: "T2MWET",
    annualStat: "mean",
    firstYear: 1981,
    sourceIds: ["power", "gelaro2017", "sherwoodHuber2010", "vecellio2022"],
  },
  cdd: {
    id: "cdd",
    name: "Cooling degree days",
    shortName: "Cooling need",
    sphere: "heat",
    plain: "A running total of how many degrees each day's average rises above 18.3 °C. It tracks the need for cooling.",
    whyItMatters:
      "Engineers use cooling degree days to estimate air-conditioning demand and electricity loads. A rising total means more energy spent on cooling buildings.",
    expert:
      "POWER CDD18_3: the daily excess of mean temperature over 18.3 °C, summed over each month, from MERRA-2; the annual value is the sum of the 12 monthly totals. It inherits any bias in MERRA-2 daily mean temperature and ignores humidity.",
    units: "°C·day",
    unitsLabel: "°C·days",
    decimals: 0,
    increaseWord: "more cooling needed",
    decreaseWord: "less cooling needed",
    rampKind: "temperature",
    invertGood: true,
    source: { mission: "MERRA-2 reanalysis", product: "POWER monthly CDD18_3", provider: POWER_MERRA2, url: POWER_URL },
    landscapes: ["megacity", "desert", "monsoon"],
    available: true,
    powerParam: "CDD18_3",
    annualStat: "sum",
    firstYear: 1981,
    sourceIds: ["power", "gelaro2017"],
  },
  precip: {
    id: "precip",
    name: "Precipitation",
    shortName: "Rain and snow",
    sphere: "water",
    plain: "How much rain and snow falls, measured as millimetres of water per day and averaged over the year.",
    whyItMatters:
      "Rainfall decides whether crops grow and whether rivers and reservoirs fill. Shifts in where and when it falls can bring floods to one region and drought to another.",
    expert:
      "MERRA-2 bias-corrected total precipitation (POWER PRECTOTCORR), monthly means in mm/day. Over land the correction uses observation-based products, mostly gauges at low and middle latitudes, with little or no correction at high latitudes (Reichle et al. 2017; NCAR Climate Data Guide).",
    units: "mm/day",
    unitsLabel: "mm/day",
    decimals: 3,
    increaseWord: "wetter",
    decreaseWord: "drier",
    rampKind: "wetness",
    source: { mission: "MERRA-2 reanalysis", product: "POWER monthly PRECTOTCORR", provider: POWER_MERRA2, url: POWER_URL },
    landscapes: ["monsoon", "rainforest", "farmland", "desert"],
    available: true,
    powerParam: "PRECTOTCORR",
    annualStat: "mean",
    firstYear: 1981,
    sourceIds: ["power", "gelaro2017", "reichle2017"],
  },
  imerg: {
    id: "imerg",
    name: "Precipitation (GPM IMERG)",
    shortName: "GPM rain",
    sphere: "water",
    plain: "Rain and snow estimated from space by many satellites working together, led by the GPM Core Observatory.",
    whyItMatters:
      "Satellites see rain over oceans, deserts and remote mountains where rain gauges are few. That makes IMERG a check on the reanalysis in the places where models are least certain.",
    expert:
      "GPM IMERG Final Run V07 monthly precipitation (Huffman et al. 2020; Huffman et al. 2023, dataset), 0.1° native, served by POWER from 1998. The record is 17 years shorter than MERRA-2 here, and its years before the 2014 GPM launch rest on the TRMM-era satellite constellation.",
    units: "mm/day",
    unitsLabel: "mm/day",
    decimals: 3,
    increaseWord: "wetter",
    decreaseWord: "drier",
    rampKind: "wetness",
    source: {
      mission: "Global Precipitation Measurement (GPM)",
      product: "IMERG Final Run V07 via POWER IMERG_PRECTOT",
      provider: "NASA GSFC Precipitation Processing System, served by NASA Langley POWER",
      url: "https://gpm.nasa.gov/data/imerg",
    },
    landscapes: ["monsoon", "rainforest", "ocean", "coast"],
    available: true,
    powerParam: "IMERG_PRECTOT",
    annualStat: "mean",
    firstYear: 1998,
    sourceIds: ["power", "imergV07", "huffman2020"],
    apiNote:
      "POWER returns only fill values (-999) for IMERG_PRECTOT unless the request sets time-standard=UTC (checked 14 Nov 2026; the response message says IMERG is not available in Local Solar Time). With UTC, monthly point data run from 1998.",
  },
  soil: {
    id: "soil",
    name: "Root-zone soil wetness",
    shortName: "Soil water",
    sphere: "water",
    plain: "How wet the soil is where plant roots grow, from 0 for bone dry to 1 for fully soaked.",
    whyItMatters:
      "Crops and forests drink from the root zone, so its water decides harvests and fire risk. Drying soil also heats the air above it, because less water is left to evaporate.",
    expert:
      "MERRA-2 root-zone soil wetness (POWER GWETROOT, roughly the top 1 m), a state of the MERRA-2 land model driven by corrected precipitation, from 0 (dry) to 1 (saturated). It is a model estimate, so its trends follow the precipitation that drives it.",
    units: "0 to 1",
    unitsLabel: "",
    decimals: 3,
    increaseWord: "wetter soil",
    decreaseWord: "drying soil",
    rampKind: "wetness",
    landOnly: true,
    source: { mission: "MERRA-2 reanalysis", product: "POWER monthly GWETROOT", provider: POWER_MERRA2, url: POWER_URL },
    landscapes: ["farmland", "desert", "monsoon"],
    available: true,
    powerParam: "GWETROOT",
    annualStat: "mean",
    firstYear: 1981,
    sourceIds: ["power", "gelaro2017", "reichle2017"],
  },
  evap: {
    id: "evap",
    name: "Land evaporation",
    shortName: "Evaporation",
    sphere: "water",
    plain: "How much water leaves the land as vapour, from soil, puddles and the leaves of plants.",
    whyItMatters:
      "Evaporation cools the ground and returns water to the air that later falls as rain. Where soil runs dry, evaporation drops and more of the sun's energy goes into heating the air.",
    expert:
      "MERRA-2 land evaporation (POWER EVLAND), the modelled evapotranspiration flux in mm/day. Evapotranspiration is not measured directly from space, so treat its trends as model estimates that inherit the precipitation and radiation driving the model.",
    units: "mm/day",
    unitsLabel: "mm/day",
    decimals: 3,
    increaseWord: "more evaporation",
    decreaseWord: "less evaporation",
    rampKind: "wetness",
    landOnly: true,
    source: { mission: "MERRA-2 reanalysis", product: "POWER monthly EVLAND", provider: POWER_MERRA2, url: POWER_URL },
    landscapes: ["farmland", "rainforest", "desert"],
    available: true,
    powerParam: "EVLAND",
    annualStat: "mean",
    firstYear: 1981,
    sourceIds: ["power", "gelaro2017"],
  },
  pw: {
    id: "pw",
    name: "Precipitable water",
    shortName: "Water vapour",
    sphere: "water",
    plain: "All the water vapour above one spot, imagined as a layer of liquid water. It shows how moist the air is.",
    whyItMatters:
      "Warmer air can hold more water vapour, so a moistening atmosphere is one of the clearest fingerprints of warming. More vapour also feeds heavier downpours.",
    expert:
      "On the map: MERRA-2 total precipitable water vapour (TQV in kg/m², divided by 10 to give cm) from 1981. POWER's point service describes its PW parameter as sourced from CERES and returns it from 2001 only, so the investigation panel can show a shorter record than the map.",
    units: "cm",
    unitsLabel: "cm",
    decimals: 3,
    increaseWord: "moister air",
    decreaseWord: "drier air",
    rampKind: "wetness",
    source: { mission: "MERRA-2 reanalysis and CERES", product: "MERRA-2 TQV (map); POWER monthly PW (point)", provider: POWER_MERRA2, url: POWER_URL },
    landscapes: ["ocean", "monsoon", "rainforest", "coast"],
    available: true,
    powerParam: "PW",
    annualStat: "mean",
    firstYear: 1981,
    sourceIds: ["power", "gelaro2017", "ceresSyn1deg"],
    apiNote:
      "POWER monthly point PW has values from 2001 only (checked at Lahore and the equatorial Pacific). The grid is built from MERRA-2 TQV / 10 (pipeline/build_power_grids.py), which starts in 1981.",
  },
  snow: {
    id: "snow",
    name: "Snow cover fraction",
    shortName: "Snow cover",
    sphere: "ice",
    plain: "The share of land covered by snow, from 0 for bare ground to 1 for completely white.",
    whyItMatters:
      "Snow reflects sunlight and stores winter water that rivers release in spring. Less snow cover means a darker, warmer surface and an earlier melt season.",
    expert:
      "MERRA-2 land snow-cover fraction (POWER FRSNO), a land-model state computed from MERRA-2 snowfall and temperature, as monthly means. A 0.5° cell averages valleys and peaks, so mountain snow trends here are coarse estimates.",
    units: "0 to 1",
    unitsLabel: "",
    decimals: 3,
    increaseWord: "more snow",
    decreaseWord: "less snow",
    rampKind: "ice",
    invertGood: false,
    landOnly: true,
    source: { mission: "MERRA-2 reanalysis", product: "POWER monthly FRSNO", provider: POWER_MERRA2, url: POWER_URL },
    landscapes: ["mountains", "polar"],
    available: true,
    powerParam: "FRSNO",
    annualStat: "mean",
    firstYear: 1981,
    sourceIds: ["power", "gelaro2017"],
  },
  seaice: {
    id: "seaice",
    name: "Sea-ice fraction",
    shortName: "Sea ice",
    sphere: "ice",
    plain: "The share of the sea surface covered by floating ice, from 0 for open water to 1 for solid ice.",
    whyItMatters:
      "Sea ice reflects sunlight and insulates the ocean from cold air. When it shrinks, dark water absorbs more heat, which speeds up warming in the polar regions (Screen and Simmonds 2010).",
    expert:
      "MERRA-2 sea-ice fraction (POWER FRSEAICE), which MERRA-2 takes as a boundary condition from external sea-surface temperature and sea-ice analyses. Those inputs change source over time and contain abrupt changes on known dates (NCAR Climate Data Guide), so test any sharp step with Pettitt before calling it climate.",
    units: "0 to 1",
    unitsLabel: "",
    decimals: 3,
    increaseWord: "more sea ice",
    decreaseWord: "less sea ice",
    rampKind: "ice",
    invertGood: false,
    oceanOnly: true,
    polarOnly: true,
    source: { mission: "MERRA-2 reanalysis", product: "POWER monthly FRSEAICE", provider: POWER_MERRA2, url: POWER_URL },
    landscapes: ["polar", "ocean"],
    available: true,
    powerParam: "FRSEAICE",
    annualStat: "mean",
    firstYear: 1981,
    sourceIds: ["power", "gelaro2017", "ucarMerra2", "screenSimmonds2010"],
  },
  ozone: {
    id: "ozone",
    name: "Total column ozone",
    shortName: "Ozone",
    sphere: "air",
    plain: "The total amount of ozone gas above a spot. High in the sky, ozone blocks harmful ultraviolet sunlight.",
    whyItMatters:
      "Less ozone lets more ultraviolet light reach the ground, which raises the risk of skin cancer and harms plants. The 1987 Montreal Protocol phased out the chemicals that destroy ozone, and its effect can be tested in this record.",
    expert:
      "MERRA-2 total column ozone in Dobson units (POWER TO3), built from SBUV data through September 2004 and Aura OMI and MLS data after that; Wargan et al. (2017) advise caution when using it for trends across that switch. In our checks POWER returned no daily values below 200 DU, so months inside the deepest part of the Antarctic ozone hole read too high or are missing.",
    units: "DU",
    unitsLabel: "DU",
    decimals: 1,
    increaseWord: "thicker ozone",
    decreaseWord: "thinner ozone",
    rampKind: "ozone",
    invertGood: false,
    source: { mission: "MERRA-2 reanalysis (SBUV, Aura OMI and MLS)", product: "POWER monthly TO3", provider: POWER_MERRA2, url: POWER_URL },
    landscapes: ["polar"],
    available: true,
    powerParam: "TO3",
    annualStat: "mean",
    firstYear: 1981,
    sourceIds: ["power", "gelaro2017", "wargan2017", "farman1985", "solomon2016"],
    apiNote:
      "POWER daily TO3 is -999 on every day below about 200 DU (Halley, October 2000 and 2008), and monthly means are formed from the remaining days. Many Octobers near the South Pole are therefore missing or biased high.",
  },
  aod: {
    id: "aod",
    name: "Aerosol optical depth",
    shortName: "Haze",
    sphere: "air",
    plain: "How hazy the air is. Dust, smoke and pollution block sunlight, and a higher number means more haze.",
    whyItMatters:
      "Fine particles in polluted air harm lungs and hearts, and they dim and cool the ground below. Cleaner air brings back sunshine and also removes some of that cooling (Quaas et al. 2022).",
    expert:
      "Aerosol optical depth at 550 nm from CERES SYN1deg Edition 4.2 (POWER AOD_55_ADJ, 1° grid, from January 2001), which POWER adjusts to reduce known biases. It counts every particle in the column, so dust storms and fire smoke weigh in alongside pollution.",
    units: "unitless",
    unitsLabel: "",
    decimals: 3,
    increaseWord: "hazier",
    decreaseWord: "clearer",
    rampKind: "aerosol",
    invertGood: true,
    source: { mission: "CERES on Terra and Aqua", product: "SYN1deg Ed4.2 via POWER AOD_55_ADJ", provider: POWER_CERES, url: POWER_URL },
    landscapes: ["megacity", "desert", "farmland"],
    available: true,
    powerParam: "AOD_55_ADJ",
    annualStat: "mean",
    firstYear: 2001,
    sourceIds: ["power", "powerSourcesAerosols", "ceresSyn1deg", "rutan2015"],
  },
  cloud: {
    id: "cloud",
    name: "Cloud amount",
    shortName: "Clouds",
    sphere: "air",
    plain: "The share of the sky covered by cloud, from 0% for clear blue sky to 100% for full overcast.",
    whyItMatters:
      "Clouds shade the ground by day and trap heat at night. A change in cloud cover can explain a change in sunshine or temperature with no change in pollution at all.",
    expert:
      "Cloud amount in percent as served by POWER: GEWEX SRB for 1984 to 2000 and CERES SYN1deg Edition 4.2 from 2001 (checked in the POWER response headers). Satellite cloud records are sensitive to changes of satellite and method, so treat a step near 2001 as a likely data seam.",
    units: "%",
    unitsLabel: "%",
    decimals: 2,
    increaseWord: "cloudier",
    decreaseWord: "clearer skies",
    rampKind: "neutral",
    source: { mission: "GEWEX SRB and CERES", product: "POWER monthly CLOUD_AMT", provider: POWER_CERES, url: POWER_URL },
    landscapes: ["ocean", "coast", "rainforest"],
    available: true,
    powerParam: "CLOUD_AMT",
    annualStat: "mean",
    firstYear: 1984,
    sourceIds: ["power", "powerSourcesFluxes", "srbRel4", "ceresSyn1deg"],
  },
  solar: {
    id: "solar",
    name: "Surface sunlight",
    shortName: "Sunlight",
    sphere: "air",
    plain: "How much sunlight energy reaches the ground each day, after clouds and haze have taken their share.",
    whyItMatters:
      "Sunlight drives crop growth and solar power. Long-term dimming and brightening at the ground have been traced to changes in air pollution and clouds (Wild 2009).",
    expert:
      "All-sky surface shortwave downward irradiance in MJ/m²/day (POWER ALLSKY_SFC_SW_DWN), from GEWEX SRB Release 4-IP for 1984 to 2000 and CERES SYN1deg Edition 4.2 from 2001. POWER warns that joining the two on 1 January 2001 can create a step that is not a climate signal, so compare the years after 2001 with the full record.",
    units: "MJ/m²/day",
    unitsLabel: "MJ/m²/day",
    decimals: 2,
    increaseWord: "brighter",
    decreaseWord: "dimmer",
    rampKind: "neutral",
    source: { mission: "GEWEX SRB and CERES", product: "POWER monthly ALLSKY_SFC_SW_DWN", provider: POWER_CERES, url: POWER_URL },
    landscapes: ["megacity", "desert"],
    available: true,
    powerParam: "ALLSKY_SFC_SW_DWN",
    annualStat: "mean",
    firstYear: 1984,
    sourceIds: ["power", "powerSourcesFluxes", "srbRel4", "ceresSyn1deg", "rutan2015", "wild2009"],
  },
  wind: {
    id: "wind",
    name: "Wind speed (10 m)",
    shortName: "Wind",
    sphere: "air",
    plain: "How fast the wind blows 10 metres above the ground, about the height of a three-storey building.",
    whyItMatters:
      "Wind speed sets how much power a wind farm can make and how fast soil and lakes lose water.",
    expert:
      "MERRA-2 10 m wind speed (POWER WS10M), monthly means. Land winds depend on surface roughness such as forests and buildings, which a 0.5° cell averages, and station studies tie part of the slowdown of Northern Hemisphere land winds to rising roughness (Vautard et al. 2010).",
    units: "m/s",
    unitsLabel: "m/s",
    decimals: 3,
    increaseWord: "windier",
    decreaseWord: "calmer",
    rampKind: "neutral",
    source: { mission: "MERRA-2 reanalysis", product: "POWER monthly WS10M", provider: POWER_MERRA2, url: POWER_URL },
    landscapes: ["coast", "ocean", "mountains"],
    available: true,
    powerParam: "WS10M",
    annualStat: "mean",
    firstYear: 1981,
    sourceIds: ["power", "gelaro2017", "vautard2010"],
  },
  gistemp: {
    id: "gistemp",
    name: "Temperature anomaly (stations and ships)",
    shortName: "GISTEMP",
    sphere: "heat",
    plain: "How much warmer or cooler it is than the 1951 to 1980 average, from thermometers on land, ships and buoys.",
    whyItMatters:
      "GISTEMP is built from direct measurements, so it is the reference to check when a model and the thermometers disagree. NASA uses it to rank each year against a record that starts in 1880.",
    expert:
      "NASA GISS Surface Temperature Analysis v4: GHCN v4 land stations plus ERSST v5 ocean temperatures, anomalies against 1951 to 1980 on a 2° grid with 1200 km smoothing (Lenssen et al. 2019, 2024). Where stations are sparse a cell borrows from stations up to 1200 km away, so local trends there are smoothed.",
    units: "°C",
    unitsLabel: "°C",
    decimals: 2,
    increaseWord: "warming",
    decreaseWord: "cooling",
    rampKind: "temperature",
    invertGood: true,
    source: {
      mission: "GISTEMP v4 (weather stations, ships and buoys)",
      product: "gistemp1200_GHCNv4_ERSSTv5",
      provider: "NASA Goddard Institute for Space Studies",
      url: "https://data.giss.nasa.gov/gistemp/",
    },
    landscapes: ["ocean", "polar", "megacity"],
    available: true,
    annualStat: "mean",
    firstYear: 1981,
    sourceIds: ["gistemp", "lenssen2019", "lenssen2024", "hansen2010"],
  },
  gpcp: {
    id: "gpcp",
    name: "Precipitation (satellites and gauges)",
    shortName: "GPCP rain",
    sphere: "water",
    plain: "Rain and snow estimated by combining many satellites with rain gauges on the ground, over land and ocean.",
    whyItMatters:
      "GPCP is a standard climate record of global rainfall since 1979, and it is independent of the MERRA-2 model. When the two agree, a rainfall trend is more believable.",
    expert:
      "GPCP Monthly Version 2.3 (Adler et al. 2018): microwave and infrared satellite estimates merged with gauge analyses over land, on a 2.5° grid from 1979, used here from 1981. Version 2.3 fixed cross-calibration problems after 2002 that had caused a false downward drift, and its coarse cells blur mountains and coastlines.",
    units: "mm/day",
    unitsLabel: "mm/day",
    decimals: 3,
    increaseWord: "wetter",
    decreaseWord: "drier",
    rampKind: "wetness",
    source: {
      mission: "GPCP v2.3 (satellites and rain gauges)",
      product: "GPCP monthly v2.3, precip.mon.mean.nc",
      provider: "NASA GSFC, served by NOAA Physical Sciences Laboratory",
      url: "https://psl.noaa.gov/data/gridded/data.gpcp.html",
    },
    landscapes: ["ocean", "monsoon", "rainforest"],
    available: true,
    annualStat: "mean",
    firstYear: 1981,
    sourceIds: ["gpcpPsl", "adler2018", "adler2003"],
  },
  ndvi: {
    id: "ndvi",
    name: "Vegetation greenness (NDVI)",
    shortName: "Greenness",
    sphere: "life",
    plain: "How green the land is, measured from how strongly leaves reflect near-infrared light compared with red light.",
    whyItMatters:
      "Greenness shows crop health and drought stress, and it reveals where forests are lost. MODIS has mapped it every 16 days since 2000.",
    expert:
      "MODIS Terra MOD13C2 Version 6.1 monthly NDVI (Didan 2021), sampled from the 0.05° climate modelling grid to 1° through NASA OPeNDAP, 2001 to 2025. Annual means include snow-season months where MODIS reports a value, so some northern cells mix in snow changes; trends also need care with sensor ageing.",
    units: "NDVI",
    unitsLabel: "NDVI",
    decimals: 4,
    increaseWord: "greening",
    decreaseWord: "browning",
    rampKind: "wetness",
    invertGood: false,
    landOnly: true,
    source: {
      mission: "MODIS on Terra",
      product: "MOD13C2 v061",
      provider: "NASA LP DAAC",
      url: "https://doi.org/10.5067/MODIS/MOD13C2.061",
    },
    landscapes: ["farmland", "rainforest", "desert"],
    available: true,
    annualStat: "mean",
    firstYear: 2001,
    sourceIds: ["didan2021"],
  },
  tws: {
    id: "tws",
    name: "Terrestrial water storage",
    shortName: "Water storage",
    sphere: "water",
    plain: "All the water stored on and under the land, from lakes and snow to deep groundwater, weighed by gravity from space.",
    whyItMatters:
      "The GRACE satellites showed groundwater in north-west India being pumped faster than rain refills it (Rodell et al. 2009). They weigh every kind of stored water at once.",
    expert:
      "GRACE and GRACE-FO JPL mascon terrestrial water storage anomalies RL06.3 (Watkins et al. 2015), monthly on a 0.5° grid with about 3° effective resolution. Annual means need 8 of 12 months; 2017 and 2018 are missing because of the gap between the two missions. Ice-sheet mass loss dominates Greenland and Antarctica, and earthquakes such as Sumatra 2004 leave gravity signals that are not water.",
    units: "cm water equivalent",
    unitsLabel: "cm",
    decimals: 2,
    increaseWord: "water gain",
    decreaseWord: "water loss",
    rampKind: "wetness",
    invertGood: false,
    landOnly: true,
    source: {
      mission: "GRACE and GRACE-FO",
      product: "JPL RL06 mascons",
      provider: "NASA JPL PO.DAAC",
      url: "https://doi.org/10.1002/2014JB011547",
    },
    landscapes: ["farmland", "desert", "monsoon"],
    available: true,
    annualStat: "mean",
    firstYear: 2003,
    sourceIds: ["watkins2015", "rodell2009"],
  },
  no2: {
    id: "no2",
    name: "Nitrogen dioxide (NO2)",
    shortName: "NO2 pollution",
    sphere: "air",
    plain: "Nitrogen dioxide, a gas made mostly by burning fuel in engines, power plants and fires. It marks polluted air.",
    whyItMatters:
      "NO2 inflames airways and helps form smog and fine particles near the ground. Satellite maps of it pick out busy cities and power plants.",
    expert:
      "Planned: OMI on Aura, OMNO2d Version 3 tropospheric NO2 column on a 0.25° daily grid from October 2004 (Krotkov 2013, dataset). Since 2007 a row anomaly on the OMI detector has reduced its daily coverage.",
    units: "10^15 molecules/cm²",
    unitsLabel: "×10¹⁵ molec/cm²",
    decimals: 2,
    increaseWord: "more NO2",
    decreaseWord: "less NO2",
    rampKind: "aerosol",
    invertGood: true,
    source: {
      mission: "OMI on Aura",
      product: "OMNO2d v003",
      provider: "NASA GES DISC",
      url: "https://doi.org/10.5067/Aura/OMI/DATA3007",
    },
    landscapes: ["megacity"],
    available: false,
    annualStat: "mean",
    firstYear: 2004,
    sourceIds: ["krotkov2013"],
  },
};

/** Ids of variables the app can map now, in menu order. */
export const AVAILABLE_VAR_IDS: readonly VarId[] = VAR_IDS.filter((id) => VARIABLES[id].available);

/** Variables most worth trying first for each landscape type. */
export function variablesFor(landscape: Landscape): VarId[] {
  return AVAILABLE_VAR_IDS.filter((id) => VARIABLES[id].landscapes.includes(landscape));
}

export function isVarId(id: string): id is VarId {
  return (VAR_IDS as readonly string[]).includes(id);
}
