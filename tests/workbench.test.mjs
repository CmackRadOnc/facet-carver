import test from "node:test";
import assert from "node:assert/strict";
import { parseMeasurement, measurementInputError, fretDistance } from "../src/facetMath.mjs";
import { buildLongitudinalPlan, parseSetup, serializeSetup } from "../src/workbench.mjs";

export function exampleSetup() {
  return { displayUnit:"decimal", fractionPrecision:64, referenceMode:"glue", scaleLength:25.5,
    activePass:"first", drawingStage:"before", showSmoothGuide:true, flipDrawing:false,
    stations:[{id:"low",role:"low",fret:1,width:1.727,thickness:.6,behindNut:false,nutOffset:0,manualWidth:true,manualThickness:true},
      {id:"high",role:"high",fret:12,width:2.035,thickness:.68,behindNut:false,nutOffset:0,manualWidth:true,manualThickness:true}] };
}

test("explicit unit suffixes override the display unit without changing the physical measurement", () => {
  assert.equal(parseMeasurement("25.4 mm", "decimal"), 1);
  assert.equal(parseMeasurement('1"', "mm"), 1);
  assert.equal(parseMeasurement("1 1/2 inches", "mm"), 1.5);
  assert.equal(parseMeasurement(".625", "decimal"), .625);
});

test("ambiguous or malformed measurement strings cannot produce a carving dimension", () => {
  for (const text of ["1/2/3", "1 2", "1/0", "1,5", "1--2", "in 2", "25mm in", "0x10", "Infinity", "", "  ", "-", "1e400"]) {
    assert.ok(Number.isNaN(parseMeasurement(text)), `Accepted ${JSON.stringify(text)}`);
  }
  for (const value of [null, "", 1.5, Number.NaN]) assert.ok(measurementInputError("fret", value));
});

test("setup files round-trip exact canonical measurements in all display units", () => {
  for (const displayUnit of ["decimal", "fraction", "mm"]) {
    const setup = { ...exampleSetup(), displayUnit, activePass:"third", drawingStage:"after" };
    assert.deepEqual(parseSetup(serializeSetup(setup)), setup);
  }
});

test("setup imports reject corrupt versions, unsafe identifiers and invalid geometry", () => {
  const encoded = JSON.parse(serializeSetup(exampleSetup()));
  for (const change of [
    doc => doc.version = 2,
    doc => doc.units = "mm",
    doc => doc.setup.scaleLength = 0,
    doc => doc.setup.stations[0].width = null,
    doc => doc.setup.stations[0].id = '<svg/onload=alert(1)>',
    doc => doc.setup.stations[1].fret = 1,
    doc => doc.setup.stations[1].fret = 1.5,
    doc => doc.setup.stations[1].behindNut = true,
    doc => doc.setup.stations.push({...doc.setup.stations[0], id:"middle",role:"middle",fret:20})
  ]) {
    const copy = structuredClone(encoded);
    change(copy);
    assert.throws(() => parseSetup(JSON.stringify(copy)));
  }
  assert.throws(() => parseSetup("not json"));
  assert.throws(() => parseSetup(" ".repeat(100001)));
});

test("unknown imported properties do not enter the working state", () => {
  const doc = JSON.parse(serializeSetup(exampleSetup()));
  doc.setup.extra = "untrusted";
  doc.setup.stations[0].extra = "untrusted";
  assert.deepEqual(parseSetup(JSON.stringify(doc)), exampleSetup());
});

test("longitudinal projection preserves fret spacing and projects the actual facet points", () => {
  const setup = exampleSetup();
  const rows = buildLongitudinalPlan([...setup.stations].reverse(), setup.scaleLength, "first");
  assert.equal(rows[0].id, "low");
  assert.equal(rows[1].distance, 12.75);
  assert.equal(rows[0].distance, fretDistance(25.5, 1));
  assert.equal(rows[0].markA, 1.727 / 4);
  assert.equal(rows[0].markB, 1.727 / 2);
  const second = buildLongitudinalPlan(setup.stations, 25.5, "second");
  assert.ok(Math.abs(second[0].markB - 5 * 1.727 / 12) < 1e-10);
  setup.stations[0].behindNut = true;
  setup.stations[0].nutOffset = .5;
  setup.stations[0].fret = 0;
  assert.equal(buildLongitudinalPlan(setup.stations, 25.5, "third")[0].distance, -.5);
});
