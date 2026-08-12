import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateFacetGeometry,
  formatFraction,
  fretDistance,
  interpolateStation,
  measurementInputError,
  parseMeasurement,
  physicalTemplateSize
} from "../src/facetMath.mjs";

const EPSILON = 1e-10;

test("first facet uses width / 4 and thickness / 2", () => {
  const geometry = calculateFacetGeometry(1.727, 0.6);
  const pass = geometry.passes.first;

  assertClose(pass.measurements[0].value, 1.727 / 4);
  assertClose(pass.measurements[1].value, 0.6 / 2);
  assertClose(geometry.points.firstBack.x, 1.727 / 4);
  assertClose(geometry.points.firstSide.y, 0.6 / 2);
});

test("second facet uses thickness / 4 and one-third of the original first facet", () => {
  const width = 2.035;
  const thickness = 0.68;
  const geometry = calculateFacetGeometry(width, thickness);
  const pass = geometry.passes.second;

  assertClose(pass.measurements[0].value, thickness / 4);
  assertClose(pass.measurements[1].value, geometry.firstFacetLength / 3);
  assertClose(geometry.points.secondFacetPoint.x, (5 * width) / 12);
  assertClose(geometry.points.secondFacetPoint.y, (2 * thickness) / 3);
});

test("third facet uses width / 8 and the original first-facet midpoint", () => {
  const width = 1.727;
  const thickness = 0.6;
  const geometry = calculateFacetGeometry(width, thickness);
  const pass = geometry.passes.third;

  assertClose(pass.measurements[0].value, width / 8);
  assertClose(pass.measurements[1].value, geometry.firstFacetLength / 2);
  assertClose(geometry.points.thirdFacetPoint.x, (3 * width) / 8);
  assertClose(geometry.points.thirdFacetPoint.y, (3 * thickness) / 4);
});

test("all staged polygons remain symmetric and inside the measured blank", () => {
  const geometry = calculateFacetGeometry(2.7, 0.82);

  for (const pass of Object.values(geometry.passes)) {
    for (const point of [...pass.stageBefore, ...pass.stageAfter]) {
      assert.ok(Math.abs(point.x) <= geometry.halfWidth + EPSILON);
      assert.ok(point.y >= -EPSILON);
      assert.ok(point.y <= geometry.thickness + EPSILON);
    }

    for (const point of pass.stageAfter) {
      const mirrored = pass.stageAfter.some(
        (candidate) =>
          Math.abs(candidate.x + point.x) < EPSILON &&
          Math.abs(candidate.y - point.y) < EPSILON
      );
      assert.equal(mirrored, true);
    }
  }
});

test("added stations interpolate by physical fret distance", () => {
  const scale = 25.5;
  const low = { fret: 1, width: 1.72, thickness: 0.6 };
  const high = { fret: 12, width: 2.04, thickness: 0.68 };
  const target = { fret: 7 };
  const result = interpolateStation(low, high, target, scale);
  const expectedRatio =
    (fretDistance(scale, 7) - fretDistance(scale, 1)) /
    (fretDistance(scale, 12) - fretDistance(scale, 1));

  assertClose(result.ratio, expectedRatio);
  assertClose(result.width, low.width + (high.width - low.width) * expectedRatio);
  assertClose(
    result.thickness,
    low.thickness + (high.thickness - low.thickness) * expectedRatio
  );
});

test("fraction parsing and formatting preserve shop measurements", () => {
  assertClose(parseMeasurement("1 23/32 in", "fraction"), 1 + 23 / 32);
  assertClose(parseMeasurement("1-5/8 in", "fraction"), 1 + 5 / 8);
  assertClose(parseMeasurement("-1 1/2 in", "fraction"), -1.5);
  assertClose(parseMeasurement("43.9 mm", "mm"), 43.9 / 25.4);
  assert.equal(formatFraction(0.43175, 64), "7/16");
  assert.equal(formatFraction(1.6875, 64), "1 11/16");
});

test("print template dimensions preserve physical blank size plus fixed margins", () => {
  const size = physicalTemplateSize(2.035, 0.68, 0.28);

  assertClose(size.width, 2.595);
  assertClose(size.height, 1.24);
});

test("invalid draft measurements block stale physical-layout output", () => {
  assert.equal(
    measurementInputError("width", 0, "Low station"),
    "Low station needs a full width greater than zero."
  );
  assert.equal(
    measurementInputError("thickness", Number.NaN, "High station"),
    "High station needs a neck thickness greater than zero."
  );
  assert.equal(
    measurementInputError("fret", 37, "High station"),
    "High station needs a fret location from 0 through 36."
  );
  assert.equal(measurementInputError("scaleLength", 0), "Scale length must be greater than zero.");
  assert.equal(measurementInputError("width", 1.727, "Low station"), null);
});

function assertClose(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < EPSILON,
    `Expected ${actual} to be within ${EPSILON} of ${expected}`
  );
}
