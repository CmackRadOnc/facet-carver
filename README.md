# Facet Carver

**[Open the carving workbench](https://cmackradonc.github.io/facet-carver/)** · [CI checks](https://github.com/CmackRadOnc/facet-carver/actions/workflows/ci.yml)

Facet Carver turns measured guitar or bass neck dimensions into repeatable tape marks for three progressive carving passes. Version 2 is a working bench surface: enter your dimensions beside the drawing, inspect each location, compare the cut layout with the resulting envelope, and carry the marks down the neck.

The app runs entirely in your browser with no runtime dependencies, accounts, tracking, or server storage.

## The workbench

- **Measurements beside the drawing.** A compact setup panel and large cross-section keep inputs and results together. Select a fret location to focus its drawing.
- **Three clear passes.** Rough the corners, shape the shoulders, then refine the back. Hatched waste, a white cut line, and blue A / amber B marks keep each operation distinct.
- **Before and after.** Switch between the cut layout and the envelope after the selected pass. The original blank remains visible as a dashed outline.
- **A lengthwise plan.** Projected A/B lines follow actual fret spacing between measured locations. Width is enlarged for readability; the bench table gives the face distances to transfer to the wood.
- **Portable setups.** Save a JSON setup file and reopen it later. Dimensions retain full precision in inches, regardless of the selected display units. Import is validated and undoable; files stay on your device.
- **Shop-ready output.** Print physical cross-section templates, a one-inch calibration square, and a table of all six marks with their measurement directions.
- **Practical controls.** Decimal inches, fractions and millimeters; six locations; measured overrides; undo/redo; reference orientation; optional elliptical C guide.

## Using your own blank

1. Select your units and the flat surface used as the thickness reference.
2. Enter full width and wood-only thickness at the low and high locations. Replace the example dimensions before cutting.
3. Add intermediate fret locations if useful. They start as linear estimates in physical distance; type measurements to override them.
4. Select a location and work through the three passes. A/B distances are measured on the named face, not as a distance across the screen.
5. Save your setup or print the shop sheet. Print at **100% / Actual size** and verify the calibration square with a ruler.

An explicit unit suffix overrides the display selection: `25.4 mm` always means one inch, and `1 1/2 in` always means one and a half inches. Decimals use a period. Ambiguous entries such as `1,5`, `1 2`, or `1/2/3` are rejected. Fret locations are whole numbers from 0 through 36; 0 is the nut.

Invalid text stays visible after leaving a field. Drawings, saving and printing remain blocked until it is corrected, or Undo is used to cancel the draft.

The project is intentionally narrow: it supports a symmetric plain/modern C carving workflow from a flat reference surface. It does not claim to reconstruct a historical neck profile from width and thickness alone.

## Why this project matters

Facet Carver demonstrates a quality-focused approach to a physical-domain problem:

- deterministic geometry is isolated from browser rendering;
- requirements are expressed as formulas and mapped to automated tests;
- canonical measurements remain in decimal inches while the UI safely converts fractions and millimeters;
- interpolated stations use physical fret positions rather than raw fret numbers;
- print templates preserve physical dimensions and include a calibration reference;
- safety boundaries and unsupported measurement conditions are stated in the product itself.

The application has no runtime dependencies, backend, database, account system, or telemetry. All calculations happen locally in the browser.

## Quality evidence and traceability

| Requirement | Implementation | Automated evidence |
| --- | --- | --- |
| First pass marks use one half of the half-width and one half of neck thickness | `calculateFacetGeometry()` in `src/facetMath.mjs` | `first facet uses width / 4 and thickness / 2` |
| Second pass uses one quarter of thickness and one third of the original first facet | `calculateFacetGeometry()` | `second facet uses thickness / 4 and one-third of the original first facet` |
| Third pass uses one eighth of width and the first-facet midpoint | `calculateFacetGeometry()` | `third facet uses width / 8 and the original first-facet midpoint` |
| Staged cuts remain symmetric and inside the measured blank | Polygon construction in `src/facetMath.mjs` | `all staged polygons remain symmetric and inside the measured blank` |
| Added stations follow real fret spacing | `fretDistance()` and `interpolateStation()` | `added stations interpolate by physical fret distance` |
| Shop measurements round-trip across supported formats | `parseMeasurement()` and `formatFraction()` | `fraction parsing and formatting preserve shop measurements` |
| Printed outlines retain physical size plus fixed margins | `physicalTemplateSize()` | `print template dimensions preserve physical blank size plus fixed margins` |
| Invalid draft measurements cannot leave stale shop output printable | `measurementInputError()` and transient draft-error tracking | `invalid draft measurements block stale physical-layout output` |

The suite contains 23 tests covering the original geometry, strict measurement parsing, portable setup validation, projected mark coordinates, and real application event handlers in a simulated DOM. The interaction suite exercises invalid drafts after blur, print blocking, unit conversion, pass and station selection, measured overrides, history, file save/open, and physical print dimensions.

Continuous integration runs syntax checks and the complete suite on Node.js 22 and 24 for every push and pull request. DOM tests use Linkedom as a development-only dependency; they do not claim browser layout, printer calibration, or physical carving validation.

## Run locally

Requirements: Node.js 22 or newer. Launching the static app requires no package installation.

```powershell
npm.cmd start
```

Open `http://127.0.0.1:8793/`.

Verify the source and domain logic:

```powershell
npm.cmd run check
npm.cmd ci
npm.cmd test
```

On macOS or Linux, use `npm` in place of `npm.cmd`.

## Architecture

```text
index.html                  Accessible workflow and safety copy
styles.css                 Responsive UI, SVG, and print styles
workbench.css              Workbench layout and drawing-surface theme
server.mjs                 Small loopback-only static preview server
src/main.mjs               Browser entry point
src/facetCarver.mjs        UI state, controls, diagrams, tables, and printing
src/facetMath.mjs          Pure geometry, interpolation, parsing, and formatting
src/workbench.mjs          Portable setup validation and lengthwise projection
tests/facetMath.test.mjs   Deterministic domain tests
tests/workbench.test.mjs   Parsing, setup files, and projection tests
tests/interaction.test.mjs Application event handlers in a simulated DOM
```

The separation between `facetMath.mjs` and `facetCarver.mjs` keeps the highest-risk calculations testable without a browser or DOM harness.

## Risk boundaries

- Treat every output as a layout aid, not a guarantee.
- Verify measurements against the physical blank and intended profile before cutting.
- Confirm truss-rod channel depth, hardware clearance, center thickness, and the thinnest finished area.
- Side measurements require either a separate fretboard glue line or the still-flat top of a one-piece neck before radiusing.
- An already-radiused one-piece neck is intentionally unsupported because its center and edge do not share the required reference plane.
- The optional smooth C overlay is an elliptical fairing guide; it does not change any calculated facet mark.
- Printed templates must be produced at 100% / Actual Size and checked against the calibration square.

Further validation should include browser rendering, actual printed scale on your printer, and sacrificial physical blanks. Automated tests cover software behavior and dimensions, not those physical outcomes.

## References and disclosure

The interface links to a public neck-carving method reference from Tornelli Guitars and to StewMac profile-template pages for physical verification. These are ordinary source and product links; this repository makes no affiliate claim and contains no affiliate tracking.

This project was developed through an AI-assisted workflow. I directed the product requirements, domain constraints, risk framing, iterative review, and acceptance criteria; Codex assisted with implementation and verification.

## License

No open-source license is included. The source is published for portfolio review, and reuse rights are not granted.
