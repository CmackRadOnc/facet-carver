# Facet Carver

Facet Carver is a dependency-free browser tool that turns measured guitar or bass neck dimensions into repeatable tape marks for three progressive carving passes. It also generates proportional diagrams, unit conversions, and print-scale shop templates.

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

The current suite contains eight deterministic tests. Continuous integration runs syntax checks and the complete suite on supported Node.js versions for every push and pull request.

## Run locally

Requirements: Node.js 22 or newer. There are no packages to install.

```powershell
npm.cmd start
```

Open `http://127.0.0.1:8793/`.

Verify the source and domain logic:

```powershell
npm.cmd run check
npm.cmd test
```

On macOS or Linux, use `npm` in place of `npm.cmd`.

## Architecture

```text
index.html                  Accessible workflow and safety copy
styles.css                 Responsive UI, SVG, and print styles
server.mjs                 Small loopback-only static preview server
src/main.mjs               Browser entry point
src/facetCarver.mjs        UI state, controls, diagrams, tables, and printing
src/facetMath.mjs          Pure geometry, interpolation, parsing, and formatting
tests/facetMath.test.mjs   Deterministic domain tests
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

Future quality work would add browser-level interaction tests, automated print-layout checks, and validation against sacrificial physical blanks.

## References and disclosure

The interface links to a public neck-carving method reference from Tornelli Guitars and to StewMac profile-template pages for physical verification. These are ordinary source and product links; this repository makes no affiliate claim and contains no affiliate tracking.

This project was developed through an AI-assisted workflow. I directed the product requirements, domain constraints, risk framing, iterative review, and acceptance criteria; Codex assisted with implementation and verification.

## License

No open-source license is included. The source is published for portfolio review, and reuse rights are not granted.
