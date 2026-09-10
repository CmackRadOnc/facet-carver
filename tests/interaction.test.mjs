import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { initFacetCarver } from "../src/facetCarver.mjs";
import { parseSetup } from "../src/workbench.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function mount() {
  const dom = parseHTML(html);
  // Linkedom lacks these browser UI methods; the test stubs only the platform edges.
  Object.defineProperty(dom.window.HTMLSelectElement.prototype, "value", {
    configurable:true,
    get() { return [...this.options].find(option => option.selected)?.value || this.options[0]?.value; },
    set(value) { for (const option of this.options) option.selected = option.value === value; }
  });
  dom.window.HTMLElement.prototype.focus = function() {};
  let prints = 0;
  globalThis.document = dom.document;
  globalThis.window = { setTimeout:() => 1, clearTimeout:() => {}, print:() => { prints += 1; } };
  initFacetCarver();
  const query = selector => dom.document.querySelector(selector);
  const all = selector => [...dom.document.querySelectorAll(selector)];
  const event = (element, name) => element.dispatchEvent(new dom.window.Event(name, {bubbles:true,cancelable:true}));
  const edit = (selector, value, commit = true) => {
    const input = query(selector);
    input.value = value;
    event(input, "input");
    if (commit) event(input, "change");
    return input;
  };
  return {query,all,event,edit,prints:() => prints};
}

test("initial workbench exposes one focused drawing, both locations and all print templates", () => {
  const {query,all} = mount();
  assert.equal(all(".diagram-card").length, 1);
  assert.equal(all(".station-tab").length, 2);
  assert.equal(all(".print-profile").length, 2);
  assert.match(query(".diagram-value--a dd").textContent, /0\.432 in/);
  assert.ok(query(".length-map"));
  assert.equal(query('[data-action="print"]').disabled, false);
});

test("invalid drafts survive blur and block drawings, saving and printing until corrected", () => {
  const {query,edit} = mount();
  const selector = '[data-station-id="low"][data-station-field="width"]';
  edit(selector, "0");
  assert.equal(query(selector).value, "0");
  assert.equal(query(selector).getAttribute("aria-invalid"), "true");
  assert.equal(query('[data-action="print"]').disabled, true);
  assert.equal(query('[data-action="save"]').disabled, true);
  assert.equal(query('[name="displayUnit"]').disabled, true);
  assert.equal(query(".diagram-card"), null);
  assert.equal(query(".print-profile"), null);
  edit(selector, "1.8");
  assert.equal(query('[data-action="print"]').disabled, false);
  assert.equal(query('[data-action="save"]').disabled, false);
  assert.match(query(".diagram-value--a dd").textContent, /0\.450 in/);
});

test("clearing a fret does not silently become fret zero; Undo cancels the draft", () => {
  const {query,edit,event} = mount();
  edit('[data-station-id="low"][data-station-field="fret"]', "");
  assert.equal(query('[data-action="print"]').disabled, true);
  event(query('[data-action="undo"]'), "click");
  assert.equal(query('[data-station-id="low"][data-station-field="fret"]').value, "1");
  assert.equal(query('[data-action="print"]').disabled, false);
});

test("pass and location selection update the actual cuts and before/after envelope", () => {
  const {query,event} = mount();
  event(query('[data-view-station="high"]'), "click");
  assert.match(query(".diagram-card__header h3").textContent, /12/);
  event(query('[data-pass="second"]'), "click");
  assert.match(query(".diagram-value--a dd").textContent, /0\.170 in/);
  const before = query(".blank-stage").getAttribute("d");
  event(query('[name="drawingStage"][value="after"]'), "change");
  assert.notEqual(query(".blank-stage").getAttribute("d"), before);
  assert.equal(query(".waste-fill"), null);
  event(query('[name="drawingStage"][value="before"]'), "change");
  assert.ok(query(".waste-fill"));
});

test("unit changes preserve physical output and explicit unit edits convert correctly", () => {
  const {query,event,edit} = mount();
  const printWidth = query(".print-profile svg").getAttribute("width");
  event(query('[name="displayUnit"][value="mm"]'), "change");
  assert.equal(query(".print-profile svg").getAttribute("width"), printWidth);
  edit('[data-station-id="low"][data-station-field="width"]', '2 in');
  assert.match(query(".diagram-value--a dd").textContent, /12\.7 mm/);
  event(query('[name="displayUnit"][value="fraction"]'), "change");
  assert.match(query(".diagram-value--a dd").textContent, /1\/2 in/);
});

test("added stations can be measured, reset to interpolation, removed and undone", () => {
  const {query,all,event,edit} = mount();
  event(query('[data-action="add-location"]'), "click");
  assert.equal(all(".location-card").length, 3);
  edit('[data-station-id="station-3"][data-station-field="width"]', "1.9");
  assert.match(query('[data-station-status="station-3"]').textContent, /Measured override/);
  assert.equal(query('[data-location-action="reset"]').hidden, false, "Measured overrides must expose reset immediately");
  event(query('[data-location-action="reset"]'), "click");
  assert.match(query('[data-station-status="station-3"]').textContent, /Auto estimate/);
  event(query('[data-location-action="remove"]'), "click");
  assert.equal(all(".location-card").length, 2);
  event(query('[data-action="undo"]'), "click");
  assert.equal(all(".location-card").length, 3);
});

test("print action produces physical templates and descriptive mark directions", () => {
  const {query,event,prints} = mount();
  event(query('[data-action="print"]'), "click");
  assert.equal(prints(), 1);
  assert.equal(query(".print-profile svg").getAttribute("width"), "2.287in");
  assert.match(query(".print-marks").textContent, /First facet, from side/);
  assert.ok(query(".calibration-square"));
});

test("saved setups restore dimensions and display preferences with an undoable import", async () => {
  const {query,event,edit} = mount();
  let saved;
  const createObjectURL = URL.createObjectURL;
  URL.createObjectURL = blob => { saved = blob; return "blob:facet-carver-test"; };
  try {
    edit('[data-station-id="low"][data-station-field="width"]', "1.8");
    event(query('[name="displayUnit"][value="mm"]'), "change");
    event(query('[data-action="save"]'), "click");
    const text = await saved.text();
    assert.equal(parseSetup(text).stations[0].width, 1.8);
    assert.equal(parseSetup(text).displayUnit, "mm");
    edit('[data-station-id="low"][data-station-field="width"]', "50.8");
    const fileInput = query("[data-project-file]");
    Object.defineProperty(fileInput, "files", {configurable:true,value:[{size:text.length,text:async()=>text}]});
    event(fileInput, "change");
    await new Promise(setImmediate);
    assert.equal(query('[data-station-id="low"][data-station-field="width"]').value, "45.7");
    assert.match(query("[data-project-message]").textContent, /Setup opened/);
    event(query('[data-action="undo"]'), "click");
    assert.equal(query('[data-station-id="low"][data-station-field="width"]').value, "50.8");
  } finally { URL.createObjectURL = createObjectURL; }
});

test("rejected setup files leave the working measurements untouched", async () => {
  const {query,event,edit} = mount();
  edit('[data-station-id="low"][data-station-field="width"]', "1.9");
  const fileInput = query("[data-project-file]");
  Object.defineProperty(fileInput, "files", {value:[{size:3,text:async()=>"bad"}]});
  event(fileInput,"change");
  await new Promise(setImmediate);
  assert.match(query("[data-project-message]").textContent, /Could not open/);
  assert.equal(query('[data-station-id="low"][data-station-field="width"]').value,"1.9");
  assert.equal(query('[data-action="print"]').disabled,false);
});
