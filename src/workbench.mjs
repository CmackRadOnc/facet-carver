import { calculateFacetGeometry, stationDistance, measurementInputError, MAX_LOCATIONS, PASS_KEYS } from "./facetMath.mjs";

const FRACTION_PRECISIONS = [8, 16, 32, 64, 128];

/** Validate a portable setup before it can replace the working measurements. */
export function validateSetup(state) {
  const errors = [];
  if (!state || typeof state !== "object") return ["Setup must be an object."];
  if (!["decimal", "fraction", "mm"].includes(state.displayUnit)) errors.push("Unknown display unit.");
  if (!FRACTION_PRECISIONS.includes(state.fractionPrecision)) errors.push("Unknown fraction precision.");
  if (!["glue", "surface"].includes(state.referenceMode)) errors.push("Unknown reference surface.");
  if (!PASS_KEYS.includes(state.activePass)) errors.push("Unknown carving pass.");
  for (const key of ["showSmoothGuide", "flipDrawing"]) if (typeof state[key] !== "boolean") errors.push(`${key} must be true or false.`);
  if (!["before", "after"].includes(state.drawingStage)) errors.push("Unknown drawing state.");
  const scaleError = measurementInputError("scaleLength", state.scaleLength);
  if (scaleError) errors.push(scaleError);
  if (!Array.isArray(state.stations) || state.stations.length < 2 || state.stations.length > MAX_LOCATIONS) return [...errors, "A setup needs two to six locations."];
  const ids = new Set();
  for (const station of state.stations) {
    if (!station || typeof station !== "object") { errors.push("Invalid location."); continue; }
    if (typeof station.id !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(station.id) || ids.has(station.id)) errors.push("Location identifiers must be unique and valid.");
    ids.add(station.id);
    if (!["low", "middle", "high"].includes(station.role)) errors.push("Unknown location role.");
    for (const field of ["fret", "width", "thickness", "nutOffset"]) {
      const error = measurementInputError(field, station[field], `${station.role || "Neck"} location`);
      if (error) errors.push(error);
    }
    for (const field of ["behindNut", "manualWidth", "manualThickness"]) if (typeof station[field] !== "boolean") errors.push(`${field} must be true or false.`);
    if (station.behindNut && (station.role !== "low" || station.fret !== 0)) errors.push("Only the low location can be behind the nut, with fret set to zero.");
    if (station.role !== "middle" && (!station.manualWidth || !station.manualThickness)) errors.push("Endpoint dimensions must be measured.");
  }
  const low = state.stations.filter(s => s?.role === "low");
  const high = state.stations.filter(s => s?.role === "high");
  if (low.length !== 1 || high.length !== 1) errors.push("A setup needs exactly one low and one high location.");
  if (!errors.length) {
    const positions = state.stations.map(s => stationDistance(s, state.scaleLength));
    const start = stationDistance(low[0], state.scaleLength);
    const end = stationDistance(high[0], state.scaleLength);
    if (end - start < 0.000001) errors.push("The high location must follow the low location.");
    if (new Set(positions.map(p => p.toFixed(6))).size !== positions.length) errors.push("Location positions must be unique.");
    if (state.stations.some(s => s.role === "middle" && (stationDistance(s, state.scaleLength) <= start || stationDistance(s, state.scaleLength) >= end))) errors.push("Added locations must sit between the measured endpoints.");
  }
  return [...new Set(errors)];
}

function cleanSetup(state) {
  // Explicit projection prevents arbitrary imported keys from entering UI state.
  return {
    displayUnit: state.displayUnit, fractionPrecision: state.fractionPrecision,
    referenceMode: state.referenceMode, scaleLength: state.scaleLength,
    activePass: state.activePass, showSmoothGuide: state.showSmoothGuide,
    flipDrawing: state.flipDrawing, drawingStage: state.drawingStage,
    stations: state.stations.map(s => ({ id:s.id, role:s.role, fret:s.fret, width:s.width,
      thickness:s.thickness, behindNut:s.behindNut, nutOffset:s.nutOffset,
      manualWidth:s.manualWidth, manualThickness:s.manualThickness }))
  };
}

export function serializeSetup(state) {
  const errors = validateSetup(state);
  if (errors.length) throw new Error(errors[0]);
  return JSON.stringify({ application:"facet-carver", version:1, units:"inches", setup:cleanSetup(state) }, null, 2) + "\n";
}

export function parseSetup(text) {
  if (typeof text !== "string" || text.length > 100000) throw new Error("Choose a Facet Carver setup smaller than 100 KB.");
  let document;
  try { document = JSON.parse(text); } catch { throw new Error("This file is not valid JSON."); }
  if (document?.application !== "facet-carver" || document.version !== 1 || document.units !== "inches") throw new Error("This is not a supported Facet Carver setup.");
  const errors = validateSetup(document.setup);
  if (errors.length) throw new Error(errors[0]);
  return cleanSetup(document.setup);
}

/** Projection coordinates use real fret distances; face measurements stay in the math model. */
export function buildLongitudinalPlan(stations, scaleLength, passKey) {
  if (!PASS_KEYS.includes(passKey)) throw new Error("Unknown carving pass.");
  const rows = stations.map(station => {
    const geometry = calculateFacetGeometry(station.width, station.thickness);
    const pass = geometry.passes[passKey];
    return { id:station.id, fret:station.fret, behindNut:station.behindNut,
      distance:stationDistance(station, scaleLength), halfWidth:geometry.halfWidth,
      markA:Math.abs(pass.measurements[0].point.x), markB:Math.abs(pass.measurements[1].point.x) };
  }).sort((a,b) => a.distance - b.distance);
  if (rows.length < 2 || rows.at(-1).distance - rows[0].distance < 0.000001) throw new Error("Two distinct locations are needed for the lengthwise plan.");
  return rows;
}
