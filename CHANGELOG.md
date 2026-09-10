# Changelog

## 2.0.0 — 2026-09-10

### Workbench

- Replaced the long introductory page with side-by-side measurements and a focused drawing surface.
- Added station selection, cut-layout / after-pass views, and a physical-distance neck projection.
- Added validated, portable JSON setup files with reversible import.
- Made A/B values prominent with secondary units and improved print-table measurement directions.

### Correctness

- Explicit unit suffixes now control conversion instead of being silently stripped.
- Malformed fractions, multiple numeric tokens, ambiguous commas, blank frets and non-integer frets are rejected.
- Invalid drafts remain visible after blur and cannot leave a stale drawing or printable sheet.
- Measured intermediate locations expose their reset control immediately.
- Added regression tests for setup files, projection geometry and application interactions; CI installs only the locked development dependencies.

## 0.1.0 — Initial public release

Proportional three-pass C-neck geometry, measured and interpolated locations, unit display, undo/redo, and full-size shop templates.
