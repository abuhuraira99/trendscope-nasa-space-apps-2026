# TrendScope design direction

## Scene

A NASA reviewer opens the link on a laptop in a lit office, then a student opens it on a phone at
night. Both are looking at the whole Earth and at forty-five years of its change. The data is the
only colour that matters, and data fields read with the most range against the dark of orbit, so
the ground is dark graphite. No neon, no glow, no glass.

## Direction contract

THESIS: The first screen is the instrument itself. A live globe shows where a NASA variable is
changing significantly, and the visitor can switch variables and click any place before reading a
word. It refuses the category default of a hero banner, a product screenshot and three feature cards.

OWN-WORLD: Graphite ground (#0B0D10) with a cooler panel layer (#12151A) and 1px hairlines (#23272E).
Ink is warm paper white (#ECE8E1), secondary ink #A3A7AE. Colour comes only from the data: diverging
ramps per variable family (temperature blue to red, wetness brown to teal, ice white to deep blue,
ozone and aerosol ramps) and their legend. Actions are solid ink-white buttons with graphite text.
Type: Schibsted Grotesk for every word, JetBrains Mono only for measurements, coordinates and
p-values, always tabular. Hairline graticules and tick scales borrowed from survey instruments.

STORY: The visitor sees that Earth is changing unevenly, learns that TrendScope separates real
trends from noise with the same tests scientists use, investigates a place they care about, and
leaves with a verdict they can cite.

FIRST VIEWPORT: Globe at instrument scale on the right two thirds, its edge bleeding off the
bottom. Left column: h1, one hard fact, the variable rail (each row: name and share of the planet
with a significant trend), primary action "Investigate a place". Under the globe, a time ruler from
the first to the last year.

FORM: Instrument panel. Signature interaction: click anywhere and a pin drops, rings expand, the
globe turns the place to centre, and the inspector fills row by row as each variable's test
finishes. Motion grammar: exponential ease-out, 200 to 400 ms, idle globe drift, everything still
under reduced motion. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance
