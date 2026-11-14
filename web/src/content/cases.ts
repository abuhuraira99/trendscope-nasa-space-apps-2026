/**
 * Six guided case files. Each one is grounded in peer-reviewed or NASA findings, cited in the text
 * and listed in `sources`.
 *
 * Numbers about the data are never written into the text. They appear as placeholders that the app
 * fills from its own live analysis (see CASE_PLACEHOLDERS). The direction of every trend the text
 * describes was checked against NASA POWER monthly point data for the exact case coordinates,
 * 1981 to 2025, on 14 November 2026.
 *
 * The offline copy of each case's POWER data is listed in pipeline/cases.json (main point, plus
 * the compareWith point with the id suffix "-b"). `casePowerPoints()` rebuilds that list from this
 * file, so the two can be checked against each other.
 */

import { VARIABLES, type Landscape, type VarId } from "./variables.ts";

export interface CasePoint {
  place: string;
  lat: number;
  lon: number;
}

export interface CaseFocus {
  variable: VarId;
  lat: number;
  lon: number;
  /** 1 = whole globe in view, 5 = a region a few hundred km across. See `zoomToDistance`. */
  zoom: number;
}

export interface CaseStep {
  title: string;
  /** Two or three sentences. May contain placeholders from CASE_PLACEHOLDERS. */
  body: string;
  focus: CaseFocus;
}

export interface CaseSourceLink {
  label: string;
  url: string;
}

export interface CaseFile {
  id: string;
  /** At most six words, no colon. */
  title: string;
  /** The question a detective would ask. */
  question: string;
  place: string;
  lat: number;
  lon: number;
  /** Variables the case uses; the first one is the headline variable for the takeaway. */
  variables: VarId[];
  compareWith?: CasePoint;
  steps: CaseStep[];
  /** One sentence; placeholders refer to variables[0] at the main point. */
  takeaway: string;
  sources: CaseSourceLink[];
  /** Ids of METHOD_SECTIONS this case demonstrates. */
  teaches: string[];
  landscapes: Landscape[];
}

/**
 * Placeholders used in step bodies and takeaways.
 *
 * In a step body, plain placeholders refer to the step's focus variable at the step's focus point.
 * `main...` placeholders refer to the focus variable at the case's main point, and `compare...`
 * placeholders to the focus variable at the case's compareWith point. In the takeaway, plain
 * placeholders refer to variables[0] at the main point.
 */
export const CASE_PLACEHOLDERS = {
  place: "Name of the point the values describe.",
  variable: "Variable name, lower case, e.g. 'wet-bulb temperature'.",
  verdict:
    "Short verdict built from the variable's increaseWord/decreaseWord and the corrected Mann-Kendall p-value, e.g. 'significant warming' or 'no clear trend'.",
  slope: "Signed Sen slope per decade with units, e.g. '+0.21 °C'. The text adds 'per decade'.",
  ciLow: "Lower end of the 95% interval of the Sen slope per decade, with units.",
  ciHigh: "Upper end of the 95% interval of the Sen slope per decade, with units.",
  p: "Corrected Mann-Kendall p-value, e.g. '0.003' or 'below 0.001'.",
  years: "Number of years in the annual series.",
  firstYear: "First year of the annual series.",
  lastYear: "Last year of the annual series.",
  changeYear: "First year after the Pettitt change point.",
  pettittP: "Approximate p-value of the Pettitt test.",
  detectYears: "Weatherhead et al. (1998) years needed to detect the current slope, rounded.",
  mainVerdict: "Verdict for the focus variable at the case's main point.",
  mainSlope: "Sen slope per decade for the focus variable at the case's main point.",
  mainChangeYear: "Pettitt change year for the focus variable at the case's main point.",
  compareVerdict: "Verdict for the focus variable at the compareWith point.",
  compareSlope: "Sen slope per decade for the focus variable at the compareWith point.",
  compareP: "Corrected Mann-Kendall p-value for the focus variable at the compareWith point.",
  comparePlace: "Name of the compareWith point.",
} as const;

export type CasePlaceholder = keyof typeof CASE_PLACEHOLDERS;

const doi = (d: string) => `https://doi.org/${d}`;

export const CASES: CaseFile[] = [
  // ------------------------------------------------------------------ (a) Lahore, Pakistan
  {
    id: "lahore-humid-heat",
    title: "Lahore's heat turns humid",
    question: "Is Lahore getting hotter, or is its heat changing in another way?",
    place: "Lahore, Punjab, Pakistan",
    lat: 31.55,
    lon: 74.34,
    variables: ["t2mwet", "t2m", "t2m_max", "cdd", "gistemp", "tws"],
    compareWith: { place: "Jacobabad, Sindh, Pakistan", lat: 28.28, lon: 68.44 },
    steps: [
      {
        title: "Start with the thermometer",
        body: "Air temperature is the number in every weather report, so start there. In the MERRA-2 cell around Lahore the verdict is {verdict}, with a Sen slope of {slope} per decade (p {p}). Lahore is known for fierce summers, so a result like this needs explaining.",
        focus: { variable: "t2m", lat: 31.55, lon: 74.34, zoom: 4 },
      },
      {
        title: "Add the humidity",
        body: "Wet-bulb temperature folds heat and humidity into one number: the coolest your skin can get by sweating. Here the verdict is {verdict}, at {slope} per decade (p {p}). These are yearly averages far below the dangerous peaks, and they show which way the background is moving.",
        focus: { variable: "t2mwet", lat: 31.55, lon: 74.34, zoom: 4 },
      },
      {
        title: "Why humid heat matters",
        body: "Sweat only cools you if it can evaporate. Sherwood and Huber (2010) put the limit the body can survive for long at a wet-bulb temperature of 35 °C, and young, healthy adults in a lab struggled near 31 °C in humid air (Vecellio et al. 2022). Weather stations show extreme humid heat becoming more frequent since 1979, with repeated cases in Pakistan (Raymond et al. 2020).",
        focus: { variable: "t2mwet", lat: 31.55, lon: 74.34, zoom: 3 },
      },
      {
        title: "Suspect one: irrigation",
        body: "Punjab's fields are heavily irrigated, and studies of India find that irrigation cools the land surface while adding moisture to the air (Mishra et al. 2020). Across most of India, aerosols and irrigation have held back the hottest daytime temperatures while wet-bulb measures kept climbing (van Oldenborgh et al. 2018). For daytime highs here the verdict is {verdict}, at {slope} per decade.",
        focus: { variable: "t2m_max", lat: 31.55, lon: 74.34, zoom: 4 },
      },
      {
        title: "What the irrigation costs underground",
        body: "The GRACE satellites weigh the water stored on land by measuring tiny changes in Earth's gravity. Under this part of Punjab the verdict is {verdict}, at {slope} per decade (p {p}). Rodell et al. (2009) used GRACE to show that groundwater pumped for irrigation in north-west India was not being replaced, the same water that keeps these fields and their air humid.",
        focus: { variable: "tws", lat: 30.25, lon: 74.25, zoom: 3 },
      },
      {
        title: "Ask the weather stations",
        body: "GISTEMP is built from thermometers, with no weather model in between. Here the verdict is {verdict}, at {slope} per decade. MERRA-2 does not feed station air temperatures straight into its analysis (NCAR Climate Data Guide), so when the two disagree, ask what each one can see.",
        focus: { variable: "gistemp", lat: 31.55, lon: 74.34, zoom: 4 },
      },
      {
        title: "Suspect two: the data itself",
        body: "Jacobabad, about 670 km to the south-west in the hot plains of Sindh, has a similar record: its wet-bulb verdict is {verdict}, at {slope} per decade. Pettitt's test on the Lahore wet-bulb record places a jump at {mainChangeYear}. A jump shared across a region can be a real shift in climate or a change in the observations the reanalysis takes in, so a detective checks both (Weatherhead et al. 1998).",
        focus: { variable: "t2mwet", lat: 28.28, lon: 68.44, zoom: 4 },
      },
      {
        title: "The 2022 heatwave",
        body: "Cooling degree days add up the air temperature above 18.3 °C, the usual base for estimating air-conditioning demand, and they ignore humidity. Here their verdict is {verdict}. In 2022 an early-spring heatwave over north-west India and south-east Pakistan was made about 30 times more likely by climate change (Zachariah et al. 2023).",
        focus: { variable: "cdd", lat: 31.55, lon: 74.34, zoom: 4 },
      },
    ],
    takeaway:
      "Lahore's wet-bulb temperature moves {slope} per decade ({verdict}), so judge a heat trend by its humidity as well as by the thermometer.",
    sources: [
      { label: "Sherwood and Huber 2010, PNAS: an adaptability limit to heat stress", url: doi("10.1073/pnas.0913352107") },
      { label: "Vecellio et al. 2022, Journal of Applied Physiology: testing the 35 °C wet-bulb limit", url: doi("10.1152/japplphysiol.00738.2021") },
      { label: "Raymond et al. 2020, Science Advances: heat and humidity too severe for human tolerance", url: doi("10.1126/sciadv.aaw1838") },
      { label: "Mishra et al. 2020, Nature Geoscience: irrigation raises moist heat stress in India", url: doi("10.1038/s41561-020-00650-8") },
      { label: "van Oldenborgh et al. 2018, NHESS: extreme heat in India and climate change", url: doi("10.5194/nhess-18-365-2018") },
      { label: "Zachariah et al. 2023, Environmental Research: Climate: the 2022 India and Pakistan heatwave", url: doi("10.1088/2752-5295/acf4b6") },
      { label: "NCAR Climate Data Guide: NASA's MERRA-2 reanalysis", url: "https://climatedataguide.ucar.edu/climate-data/nasas-merra2-reanalysis" },
      { label: "Weatherhead et al. 1998, JGR: factors affecting the detection of trends", url: doi("10.1029/98JD00995") },
      { label: "Rodell, Velicogna and Famiglietti 2009, Nature: satellite estimates of groundwater depletion in India", url: doi("10.1038/nature08238") },
    ],
    teaches: ["limits", "change-points", "seasons"],
    landscapes: ["megacity", "farmland", "monsoon"],
  },

  // ------------------------------------------------------------------ (b) the Arctic
  {
    id: "arctic-amplification",
    title: "The Arctic warms fastest",
    question: "Why does the far north warm so much faster than the rest of the planet?",
    place: "Northern Barents Sea, between Svalbard and Franz Josef Land",
    lat: 78.0,
    lon: 40.0,
    variables: ["t2m", "seaice", "gistemp"],
    compareWith: { place: "Equatorial Atlantic Ocean", lat: 0.0, lon: -25.0 },
    steps: [
      {
        title: "A sea that is heating up",
        body: "This cell lies in the northern Barents Sea, between Svalbard and Franz Josef Land. For air temperature the verdict is {verdict}, at {slope} per decade (p {p}). Weather stations around it record some of the fastest warming on Earth, up to 2.7 °C per decade (Isaksen et al. 2022).",
        focus: { variable: "t2m", lat: 78.0, lon: 40.0, zoom: 3 },
      },
      {
        title: "Compare with the tropics",
        body: "The equatorial Atlantic warms too, more slowly: the verdict is {verdict}, at {slope} per decade. Put the two slopes side by side and divide one by the other. Since 1979 the Arctic as a whole has warmed nearly four times faster than the global average (Rantanen et al. 2022).",
        focus: { variable: "t2m", lat: 0.0, lon: -25.0, zoom: 2 },
      },
      {
        title: "Follow the ice",
        body: "For sea-ice fraction in the Barents cell the verdict is {verdict}, at {slope} per decade. Bright ice reflects much of the sunlight that reaches it, while open water absorbs most of it and gives the heat back to the air in autumn and winter. Shrinking sea ice plays a central role in this Arctic amplification (Screen and Simmonds 2010).",
        focus: { variable: "seaice", lat: 78.0, lon: 40.0, zoom: 3 },
      },
      {
        title: "Which season lost the ice",
        body: "Open the monthly fingerprint. The Barents Sea has little ice left in summer, and it accounts for the largest share of the Arctic's March ice loss (Onarheim et al. 2018). Check whether the winter and spring months carry the strongest slopes here.",
        focus: { variable: "seaice", lat: 78.0, lon: 40.0, zoom: 3 },
      },
      {
        title: "A slope or a step",
        body: "Pettitt's test looks for the year that best splits the record into a before and an after. For sea ice here the new level starts in {changeYear} (p = {pettittP}). MERRA-2 takes its sea ice from outside analyses that change source and contain a few abrupt jumps (NCAR Climate Data Guide), so a sharp step can be part climate and part data.",
        focus: { variable: "seaice", lat: 78.0, lon: 40.0, zoom: 3 },
      },
      {
        title: "A second witness",
        body: "GISTEMP covers the Arctic Ocean by spreading station anomalies up to 1200 km, from stations such as those on Svalbard. Here the verdict is {verdict}, at {slope} per decade. Few thermometers stand this far north, so agreement between GISTEMP and MERRA-2 matters more here than in a crowded region.",
        focus: { variable: "gistemp", lat: 78.0, lon: 40.0, zoom: 3 },
      },
      {
        title: "How long to be sure",
        body: "Weatherhead et al. (1998) give the number of years needed to detect a trend of a given size against a given amount of year-to-year noise. For air temperature here that is about {detectYears} years, and the record has {years}. A fast trend can be proven quickly even in a noisy place.",
        focus: { variable: "t2m", lat: 78.0, lon: 40.0, zoom: 3 },
      },
    ],
    takeaway:
      "Air over the northern Barents Sea warms at {slope} per decade, many times the rate at the equator, as the sea ice that once covered it retreats.",
    sources: [
      { label: "Isaksen et al. 2022, Scientific Reports: exceptional warming over the Barents area", url: doi("10.1038/s41598-022-13568-5") },
      { label: "Rantanen et al. 2022, Communications Earth & Environment: the Arctic has warmed nearly four times faster", url: doi("10.1038/s43247-022-00498-3") },
      { label: "Screen and Simmonds 2010, Nature: sea ice and Arctic temperature amplification", url: doi("10.1038/nature09051") },
      { label: "Onarheim et al. 2018, Journal of Climate: seasonal and regional Arctic sea ice loss", url: doi("10.1175/JCLI-D-17-0427.1") },
      { label: "NASA Earth indicator: Arctic sea ice minimum extent", url: "https://science.nasa.gov/earth/explore/earth-indicators/arctic-sea-ice-minimum-extent/" },
      { label: "NCAR Climate Data Guide: NASA's MERRA-2 reanalysis", url: "https://climatedataguide.ucar.edu/climate-data/nasas-merra2-reanalysis" },
      { label: "Weatherhead et al. 1998, JGR: factors affecting the detection of trends", url: doi("10.1029/98JD00995") },
    ],
    teaches: ["mann-kendall", "seasons", "change-points", "detection-time"],
    landscapes: ["polar", "ocean"],
  },

  // ------------------------------------------------------------------ (c) Antarctic ozone
  {
    id: "ozone-hole-window",
    title: "The ozone hole stops growing",
    question: "Did the ozone over Antarctica thin out, and is it healing now?",
    place: "Antarctic Peninsula, near Vernadsky station",
    lat: -65.25,
    lon: -64.25,
    variables: ["ozone"],
    compareWith: { place: "Ushuaia, Tierra del Fuego, Argentina", lat: -54.8, lon: -68.3 },
    steps: [
      {
        title: "A famous discovery",
        body: "In 1985 British Antarctic Survey scientists reported that spring ozone over Antarctica had dropped sharply (Farman et al. 1985). Chlorine from CFCs, gases then used in fridges and spray cans, was destroying it. The 1987 Montreal Protocol began phasing those gases out.",
        focus: { variable: "ozone", lat: -65.25, lon: -64.25, zoom: 2 },
      },
      {
        title: "One trend for the whole record",
        body: "Run the test on all {years} years and the verdict for this cell is {verdict}, with a Sen slope of {slope} per decade (p {p}). Taken alone, that result says almost nothing happened. Now look at the time series chart.",
        focus: { variable: "ozone", lat: -65.25, lon: -64.25, zoom: 3 },
      },
      {
        title: "Split the record",
        body: "On the chart, ozone falls through the 1980s and 1990s and then levels off after about 2000. A steep fall followed by a long flat stretch can average out to a slope near zero. A trend always belongs to its time window, so say which years you tested.",
        focus: { variable: "ozone", lat: -65.25, lon: -64.25, zoom: 3 },
      },
      {
        title: "Find the turning point",
        body: "Pettitt's test searches for the year that best splits the record into a before and an after. Here the new level starts in {changeYear} (p = {pettittP}). The test expects one clean step, so it can miss a slow fall that then flattens out.",
        focus: { variable: "ozone", lat: -65.25, lon: -64.25, zoom: 3 },
      },
      {
        title: "Look at the spring months",
        body: "The hole opens in the southern spring, from September to November. Open the monthly fingerprint and compare the spring months with the rest of the year. Solomon et al. (2016) found the first signs of healing in September ozone over Antarctica since 2000.",
        focus: { variable: "ozone", lat: -65.25, lon: -64.25, zoom: 3 },
      },
      {
        title: "Under the edge of the hole",
        body: "Ushuaia, at the southern tip of South America, can sit under the edge of the ozone hole in spring, and researchers there measured rises in ultraviolet light and plant DNA damage as it passed (Rousseaux et al. 1999). The verdict for its ozone record is {verdict}, at {slope} per decade. The WMO 2022 assessment expects Antarctic ozone to return to 1980 levels around 2066.",
        focus: { variable: "ozone", lat: -54.8, lon: -68.3, zoom: 3 },
      },
      {
        title: "Mind the gaps",
        body: "Halley station, where the hole was first measured, has blank Octobers in this record. In our checks NASA POWER returned no daily ozone values below 200 Dobson units, so the deepest days drop out and what remains reads too high. MERRA-2 also changed the satellites behind its ozone in late 2004 (Wargan et al. 2017), another reason to read the recent years with care.",
        focus: { variable: "ozone", lat: -75.6, lon: -26.2, zoom: 3 },
      },
    ],
    takeaway:
      "Over the full record the verdict here is {verdict} ({slope} per decade), even though ozone fell sharply until about 2000 and then held steady, so always state the time window of a trend.",
    sources: [
      { label: "Farman et al. 1985, Nature: large losses of total ozone in Antarctica", url: doi("10.1038/315207a0") },
      { label: "Solomon et al. 2016, Science: emergence of healing in the Antarctic ozone layer", url: doi("10.1126/science.aae0061") },
      { label: "WMO 2022, Scientific Assessment of Ozone Depletion", url: "https://csl.noaa.gov/assessments/ozone/2022/" },
      { label: "Rousseaux et al. 1999, PNAS: ozone depletion, UVB and plant DNA damage in southern South America", url: doi("10.1073/pnas.96.26.15310") },
      { label: "Wargan et al. 2017, Journal of Climate: the ozone fields in MERRA-2", url: doi("10.1175/JCLI-D-16-0699.1") },
      { label: "NASA Ozone Watch", url: "https://ozonewatch.gsfc.nasa.gov/" },
      { label: "Pettitt 1979, Applied Statistics: a non-parametric change-point test", url: doi("10.2307/2346729") },
    ],
    teaches: ["trend", "change-points", "seasons", "limits"],
    landscapes: ["polar"],
  },

  // ------------------------------------------------------------------ (d) same planet, opposite fates
  {
    id: "opposite-fates-rain",
    title: "Same planet, opposite fates",
    question: "How can rain return to one dry region and drain away from another, with the same cause behind both?",
    place: "Sahel, near Niamey, Niger",
    lat: 13.5,
    lon: 2.5,
    variables: ["gpcp", "soil", "precip"],
    compareWith: { place: "South-west Australia wheatbelt, east of Perth", lat: -31.5, lon: 116.25 },
    steps: [
      {
        title: "The rains come back",
        body: "The Sahel, the dry belt south of the Sahara, suffered a long drought in the 1970s and 1980s. Since then its seasonal rainfall has partly recovered (Biasutti 2019). Near Niamey, GPCP rainfall from satellites and rain gauges gives the verdict {verdict}, at {slope} per decade (p {p}).",
        focus: { variable: "gpcp", lat: 13.5, lon: 2.5, zoom: 3 },
      },
      {
        title: "The rains drain away",
        body: "South-west Australia gets its rain in winter, carried by westerly winds from the Southern Ocean. Autumn and winter rainfall there has fallen since about 1970 (Delworth and Zeng 2014). In the wheatbelt east of Perth the GPCP verdict is {verdict}, at {slope} per decade.",
        focus: { variable: "gpcp", lat: -31.5, lon: 116.25, zoom: 3 },
      },
      {
        title: "One cause, two outcomes",
        body: "Climate model experiments trace most of the Sahel's recovery to rising greenhouse gases (Dong and Sutton 2015). Similar experiments trace south-west Australia's drying to greenhouse gases and ozone loss, which pushed the westerly winds toward the pole (Delworth and Zeng 2014). The same human influence strengthened one rain belt and pulled another away.",
        focus: { variable: "gpcp", lat: -9.0, lon: 59.0, zoom: 1 },
      },
      {
        title: "Follow the water into the soil",
        body: "Rain soaks into the root zone, where crops and pasture draw it. For root-zone soil wetness the verdict near Niamey is {verdict}, and in south-west Australia it is {compareVerdict}. This soil wetness comes from the MERRA-2 land model, so it follows the rain that drives it.",
        focus: { variable: "soil", lat: 13.5, lon: 2.5, zoom: 3 },
      },
      {
        title: "Get a second opinion",
        body: "The MERRA-2 reanalysis builds rainfall from a weather model guided by observations, on a finer grid than GPCP. Its verdict near Niamey is {verdict}, and in south-west Australia {compareVerdict}. Reanalysis rainfall trends are less certain than measured ones, which is why a detective compares more than one record before trusting a result.",
        focus: { variable: "precip", lat: 13.5, lon: 2.5, zoom: 3 },
      },
      {
        title: "Count the false alarms",
        body: "Opposite trends can turn up by chance when you test thousands of places. TrendScope marks a cell as field significant only when it passes the false discovery rate test (Wilks 2016). Look for whole regions of colour, because a lone pixel can be luck.",
        focus: { variable: "gpcp", lat: 0.0, lon: 40.0, zoom: 1 },
      },
    ],
    takeaway:
      "Rain near Niamey moves {slope} per decade ({verdict}) while south-west Australia dries, and model studies link both changes to rising greenhouse gases.",
    sources: [
      { label: "Biasutti 2019, WIREs Climate Change: rainfall trends in the African Sahel", url: doi("10.1002/wcc.591") },
      { label: "Dong and Sutton 2015, Nature Climate Change: greenhouse gases and the recovery of Sahel rainfall", url: doi("10.1038/nclimate2664") },
      { label: "Delworth and Zeng 2014, Nature Geoscience: rainfall decline in Australia attributed to greenhouse gases and ozone", url: doi("10.1038/ngeo2201") },
      { label: "Adler et al. 2018, Atmosphere: GPCP monthly analysis version 2.3", url: doi("10.3390/atmos9040138") },
      { label: "Reichle et al. 2017, Journal of Climate: land surface precipitation in MERRA-2", url: doi("10.1175/JCLI-D-16-0570.1") },
      { label: "Wilks 2016, BAMS: field significance and the false discovery rate", url: doi("10.1175/BAMS-D-15-00267.1") },
    ],
    teaches: ["fdr", "sen-slope", "limits"],
    landscapes: ["desert", "farmland", "monsoon"],
  },

  // ------------------------------------------------------------------ (e) aerosols and sunlight
  {
    id: "dimming-and-brightening",
    title: "Europe brightens while India dims",
    question: "Why is sunshine at the ground rising over Germany and falling over northern India?",
    place: "Central Germany, near Erfurt",
    lat: 51.0,
    lon: 11.25,
    variables: ["aod", "solar", "cloud"],
    compareWith: { place: "Kanpur, Indo-Gangetic Plain, India", lat: 26.5, lon: 80.25 },
    steps: [
      {
        title: "Clearing air over Europe",
        body: "Aerosol optical depth measures the haze in the whole column of air. Over central Germany the verdict is {verdict}, at {slope} per decade since {firstYear} (p {p}). Aerosol pollution has fallen across Europe, North America and East Asia since about 2000 (Quaas et al. 2022).",
        focus: { variable: "aod", lat: 51.0, lon: 11.25, zoom: 3 },
      },
      {
        title: "Thickening haze over the Ganges plain",
        body: "Kanpur sits in the Indo-Gangetic Plain, one of the haziest regions on Earth. Here the verdict is {verdict}, at {slope} per decade. A network of ground stations across India recorded aerosol rising over decades, mostly from human sources (Babu et al. 2013).",
        focus: { variable: "aod", lat: 26.5, lon: 80.25, zoom: 3 },
      },
      {
        title: "From dimming to brightening",
        body: "Less haze lets more sunlight reach the ground. Wild et al. (2005) found that surface sunlight fell at many stations until about 1990 and then rose again in many regions, while India kept dimming. For surface sunlight over central Germany the verdict is {verdict}, at {slope} per decade.",
        focus: { variable: "solar", lat: 51.0, lon: 11.25, zoom: 3 },
      },
      {
        title: "The same physics in reverse",
        body: "At Kanpur the sunlight verdict is {verdict}, at {slope} per decade. Particles scatter and absorb sunlight before it reaches the ground, so the same physics brightens one place and dims the other. Pollution fell over Germany and rose over the Ganges plain.",
        focus: { variable: "solar", lat: 26.5, lon: 80.25, zoom: 3 },
      },
      {
        title: "Rule out the clouds",
        body: "Clouds block sunlight too, so check them before you blame the haze. For cloud amount the verdict over central Germany is {verdict}, and at Kanpur it is {compareVerdict}. If the clouds changed in step with the haze, both suspects share the blame.",
        focus: { variable: "cloud", lat: 51.0, lon: 11.25, zoom: 3 },
      },
      {
        title: "Mind the seam in 2001",
        body: "The sunlight and cloud records join GEWEX SRB (to 2000) and CERES (from 2001), and NASA POWER warns that the join can create a step that is not a real climate signal. Pettitt puts the shift in sunlight here at {changeYear}. In our checks the CERES years alone, from 2001, still show brightening over Germany and dimming at Kanpur.",
        focus: { variable: "solar", lat: 51.0, lon: 11.25, zoom: 3 },
      },
      {
        title: "A third place to test",
        body: "China cut fine-particle pollution sharply after its 2013 clean-air plan, mostly through emission controls (Zhang et al. 2019). Click the North China Plain and see whether its haze record bends after 2013. Use Pettitt's test to see whether the record shows a step.",
        focus: { variable: "aod", lat: 38.0, lon: 115.0, zoom: 3 },
      },
    ],
    takeaway:
      "Haze over central Germany moves {slope} per decade ({verdict}) while Kanpur grows hazier and dimmer, because air pollution went in opposite directions in the two places.",
    sources: [
      { label: "Wild et al. 2005, Science: from dimming to brightening", url: doi("10.1126/science.1103215") },
      { label: "Wild 2009, JGR Atmospheres: global dimming and brightening, a review", url: doi("10.1029/2008JD011470") },
      { label: "Babu et al. 2013, JGR Atmospheres: trends in aerosol optical depth over India", url: doi("10.1002/2013JD020507") },
      { label: "Quaas et al. 2022, Atmospheric Chemistry and Physics: reversal of the aerosol forcing trend", url: doi("10.5194/acp-22-12221-2022") },
      { label: "Zhang et al. 2019, PNAS: drivers of improved PM2.5 air quality in China, 2013 to 2017", url: doi("10.1073/pnas.1907956116") },
      { label: "NASA POWER data sources: solar fluxes and the 2001 join", url: "https://power.larc.nasa.gov/docs/methodology/data/sources_fluxes/" },
      { label: "NASA POWER data sources: clouds and aerosols", url: "https://power.larc.nasa.gov/docs/methodology/data/sources_clds_aerosols/" },
    ],
    teaches: ["change-points", "limits", "trend"],
    landscapes: ["megacity", "farmland"],
  },

  // ------------------------------------------------------------------ (f) water and drought
  {
    id: "chile-megadrought",
    title: "Central Chile runs dry",
    question: "When did central Chile's great drought begin, and was it a slow slide or a sudden step?",
    place: "Santiago, central Chile",
    lat: -33.45,
    lon: -70.65,
    variables: ["precip", "soil", "evap", "t2m"],
    compareWith: { place: "Central Arizona, south-western United States", lat: 34.5, lon: -111.25 },
    steps: [
      {
        title: "A drought with a name",
        body: "From 2010 central Chile had an unbroken run of dry years, with annual rainfall 25 to 45% below normal (Garreaud et al. 2017). A persistent pattern of pressure and winds over the South Pacific steered storms away, with a contribution from human-caused climate change (Boisier et al. 2016; Garreaud et al. 2020). At Santiago the precipitation verdict is {verdict}, at {slope} per decade (p {p}).",
        focus: { variable: "precip", lat: -33.45, lon: -70.65, zoom: 4 },
      },
      {
        title: "Slide or step",
        body: "A straight-line trend assumes slow, steady change. Pettitt's test looks for one sudden shift instead, and for rain at Santiago the new, drier level starts in {changeYear} (p = {pettittP}). Compare that year with 2010, the start date scientists give the Mega Drought.",
        focus: { variable: "precip", lat: -33.45, lon: -70.65, zoom: 4 },
      },
      {
        title: "Into the soil",
        body: "Less rain leaves less water in the root zone. For root-zone soil wetness the verdict is {verdict}, at {slope} per decade. Rivers, reservoirs and groundwater in the region fell much more steeply than rainfall, by up to 90% in places (Garreaud et al. 2017).",
        focus: { variable: "soil", lat: -33.45, lon: -70.65, zoom: 4 },
      },
      {
        title: "Less water to evaporate",
        body: "Evaporation needs water to work with. For land evaporation the verdict is {verdict}, at {slope} per decade. In a dry climate, falling evaporation is a sign that the land has less water left to give.",
        focus: { variable: "evap", lat: -33.45, lon: -70.65, zoom: 4 },
      },
      {
        title: "Heat adds to the thirst",
        body: "For air temperature at Santiago the verdict is {verdict}, at {slope} per decade. Warmer air pulls more water out of soil and plants, and in south-western North America that extra demand made a long drought much worse (Williams et al. 2020).",
        focus: { variable: "t2m", lat: -33.45, lon: -70.65, zoom: 4 },
      },
      {
        title: "Two hemispheres, two megadroughts",
        body: "South-western North America had its driest 22-year period since at least the year 800 from 2000 to 2021 (Williams et al. 2022). In central Arizona the precipitation verdict is {verdict}, at {slope} per decade. Check its Pettitt year and soil record, and ask whether the two droughts look like slides or steps.",
        focus: { variable: "precip", lat: 34.5, lon: -111.25, zoom: 3 },
      },
    ],
    takeaway:
      "Rain at Santiago moves {slope} per decade ({verdict}), and the Pettitt test places the break in {changeYear}, so ask whether a drought is a slope or a step before you describe it.",
    sources: [
      { label: "Garreaud et al. 2017, HESS: the 2010-2015 megadrought in central Chile", url: doi("10.5194/hess-21-6307-2017") },
      { label: "Garreaud et al. 2020, International Journal of Climatology: the Central Chile Mega Drought", url: doi("10.1002/joc.6219") },
      { label: "Boisier et al. 2016, GRL: anthropogenic and natural causes of the central Chile drought", url: doi("10.1002/2015GL067265") },
      { label: "Williams et al. 2020, Science: warming and the North American megadrought", url: doi("10.1126/science.aaz9600") },
      { label: "Williams et al. 2022, Nature Climate Change: the megadrought in 2020 and 2021", url: doi("10.1038/s41558-022-01290-z") },
      { label: "Pettitt 1979, Applied Statistics: a non-parametric change-point test", url: doi("10.2307/2346729") },
    ],
    teaches: ["change-points", "trend", "limits"],
    landscapes: ["farmland", "mountains", "desert"],
  },
];

export const CASE_BY_ID: Record<string, CaseFile> = Object.fromEntries(CASES.map((c) => [c.id, c]));

/**
 * Map a case zoom level (1 to 5) to the globe camera distance used by the Atlas store
 * (MIN_D = 1.55 close up, MAX_D = 6 far away).
 */
export function zoomToDistance(zoom: number): number {
  const z = Math.min(5, Math.max(1, zoom));
  return 1.55 + 4.45 * Math.exp(-0.75 * (z - 1));
}

/**
 * Replace {name} placeholders with values. Unknown or missing values become "n/a" so a missing
 * number is visible rather than silently dropped.
 */
export function fillPlaceholders(
  text: string,
  values: Partial<Record<CasePlaceholder, string | number>>,
): string {
  return text.replace(/\{([A-Za-z]+)\}/g, (_match, key: string) => {
    const v = (values as Record<string, string | number | undefined>)[key];
    return v === undefined || v === "" ? "n/a" : String(v);
  });
}

/** Placeholders a piece of text uses, for checking that the app supplies all of them. */
export function placeholdersIn(text: string): string[] {
  return Array.from(text.matchAll(/\{([A-Za-z]+)\}/g), (m) => m[1] ?? "").filter((k) => k.length > 0);
}

export interface CasePowerPoint {
  id: string;
  lat: number;
  lon: number;
  params: string[];
}

/** The pipeline/cases.json list, derived from CASES: one entry per point, "-b" for compareWith. */
export function casePowerPoints(): CasePowerPoint[] {
  const out: CasePowerPoint[] = [];
  for (const c of CASES) {
    const params = c.variables
      .map((v) => VARIABLES[v].powerParam)
      .filter((p): p is string => typeof p === "string");
    out.push({ id: c.id, lat: c.lat, lon: c.lon, params });
    if (c.compareWith) out.push({ id: `${c.id}-b`, lat: c.compareWith.lat, lon: c.compareWith.lon, params });
  }
  return out;
}
