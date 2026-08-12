import {
  INCH_TO_MM,
  MAX_LOCATIONS,
  PASS_KEYS,
  calculateFacetGeometry,
  clamp,
  formatFraction,
  interpolateStation,
  measurementInputError,
  mirror,
  parseMeasurement,
  physicalTemplateSize,
  stationDistance
} from "./facetMath.mjs";

const METHOD_REFERENCE_URL =
  "https://www.tornelliguitars.com/post/how-to-shape-a-guitar-neck";

const INITIAL_STATE = {
  displayUnit: "decimal",
  fractionPrecision: 64,
  referenceMode: "glue",
  scaleLength: 25.5,
  activePass: "first",
  showSmoothGuide: true,
  flipDrawing: false,
  stations: [
    {
      id: "low",
      role: "low",
      fret: 1,
      width: 1.727,
      thickness: 0.6,
      behindNut: false,
      nutOffset: 0,
      manualWidth: true,
      manualThickness: true
    },
    {
      id: "high",
      role: "high",
      fret: 12,
      width: 2.035,
      thickness: 0.68,
      behindNut: false,
      nutOffset: 0,
      manualWidth: true,
      manualThickness: true
    }
  ]
};

export function initFacetCarver() {
  const root = document.querySelector("[data-facet-carver]");
  if (!root) return;

  const controls = {
    form: root.querySelector(".measurement-form"),
    unitInputs: [...root.querySelectorAll("input[name='displayUnit']")],
    fractionOptions: root.querySelector("[data-fraction-options]"),
    fractionPrecision: root.querySelector("select[name='fractionPrecision']"),
    referenceInputs: [...root.querySelectorAll("input[name='referenceMode']")],
    referenceHelp: root.querySelector("[data-reference-help]"),
    scaleLength: root.querySelector("input[name='scaleLength']"),
    locationGrid: root.querySelector("[data-location-grid]"),
    addLocation: root.querySelector("[data-action='add-location']"),
    undo: root.querySelector("[data-action='undo']"),
    redo: root.querySelector("[data-action='redo']"),
    validation: root.querySelector("[data-validation]"),
    passButtons: [...root.querySelectorAll("[data-pass]")],
    passSummary: root.querySelector("[data-pass-summary]"),
    diagramGrid: root.querySelector("[data-diagram-grid]"),
    showSmoothGuide: root.querySelector("input[name='showSmoothGuide']"),
    flipDrawing: root.querySelector("input[name='flipDrawing']"),
    flipLabel: root.querySelector("[data-flip-label]"),
    markPlan: root.querySelector("[data-mark-plan]"),
    print: root.querySelector("[data-action='print']"),
    printSheet: document.querySelector("#print-sheet")
  };

  let state = cloneState(INITIAL_STATE);
  let nextStationNumber = 3;
  let history = [cloneState(state)];
  let historyIndex = 0;
  let restoringHistory = false;
  let historyTimer = null;
  const invalidDraftErrors = new Map();

  syncStaticControls();
  renderLocationCards();
  renderAll();

  for (const input of controls.unitInputs) {
    input.addEventListener("change", () => {
      flushHistoryCommit();
      invalidDraftErrors.clear();
      state.displayUnit = input.value;
      syncStaticControls();
      renderLocationCards();
      renderAll();
      commitHistory();
    });
  }

  controls.fractionPrecision.addEventListener("change", () => {
    flushHistoryCommit();
    invalidDraftErrors.clear();
    state.fractionPrecision = Number(controls.fractionPrecision.value) || 64;
    renderLocationCards();
    syncScaleInput();
    renderAll();
    commitHistory();
  });

  for (const input of controls.referenceInputs) {
    input.addEventListener("change", () => {
      flushHistoryCommit();
      invalidDraftErrors.clear();
      state.referenceMode = input.value === "surface" ? "surface" : "glue";
      syncStaticControls();
      renderLocationCards();
      renderAll();
      commitHistory();
    });
  }

  controls.scaleLength.addEventListener("input", () => {
    const parsed = parseMeasurement(controls.scaleLength.value, state.displayUnit);
    const error = measurementInputError("scaleLength", parsed);
    setInputValidity(controls.scaleLength, !error);
    if (error) {
      invalidDraftErrors.set("scaleLength", error);
      renderAll();
      return;
    }
    invalidDraftErrors.delete("scaleLength");
    state.scaleLength = parsed;
    updateAutomaticStations();
    syncAutomaticStationInputs();
    renderAll();
    scheduleHistoryCommit();
  });

  controls.scaleLength.addEventListener("change", () => {
    const parsed = parseMeasurement(controls.scaleLength.value, state.displayUnit);
    if (!(parsed > 0)) {
      syncScaleInput();
      setInputValidity(controls.scaleLength, true);
      invalidDraftErrors.delete("scaleLength");
      renderAll();
      return;
    }
    commitHistory();
  });

  controls.locationGrid.addEventListener("input", (event) => {
    const input = event.target.closest("[data-station-field]");
    if (!input) return;
    updateStationFromInput(input);
    scheduleHistoryCommit();
  });

  controls.locationGrid.addEventListener("change", (event) => {
    const input = event.target.closest("[data-station-field]");
    if (!input) return;

    if (input.dataset.stationField === "behindNut") {
      renderLocationCards();
      renderAll();
    } else if (input.getAttribute("aria-invalid") === "true") {
      invalidDraftErrors.delete(draftKey(input));
      renderLocationCards();
      renderAll();
    }
    commitHistory();
  });

  controls.locationGrid.addEventListener("click", (event) => {
    const action = event.target.closest("[data-location-action]");
    if (!action) return;
    flushHistoryCommit();
    const station = stationById(action.dataset.stationId);
    if (!station) return;

    if (action.dataset.locationAction === "remove" && station.role === "middle") {
      clearStationDraftErrors(station.id);
      state.stations = state.stations.filter((item) => item.id !== station.id);
      renderLocationCards();
      renderAll();
      commitHistory();
      return;
    }

    if (action.dataset.locationAction === "reset" && station.role === "middle") {
      station.manualWidth = false;
      station.manualThickness = false;
      updateAutomaticStations();
      renderLocationCards();
      renderAll();
      commitHistory();
    }
  });

  controls.addLocation.addEventListener("click", () => {
    flushHistoryCommit();
    if (state.stations.length >= MAX_LOCATIONS) return;
    const fret = suggestedFret();
    if (!Number.isFinite(fret)) return;

    const station = {
      id: `station-${nextStationNumber}`,
      role: "middle",
      fret,
      width: 0,
      thickness: 0,
      behindNut: false,
      nutOffset: 0,
      manualWidth: false,
      manualThickness: false
    };
    nextStationNumber += 1;
    state.stations.push(station);
    updateAutomaticStations();
    renderLocationCards();
    renderAll();
    commitHistory();
  });

  for (const button of controls.passButtons) {
    button.addEventListener("click", () => {
      flushHistoryCommit();
      state.activePass = PASS_KEYS.includes(button.dataset.pass)
        ? button.dataset.pass
        : "first";
      syncPassButtons();
      renderAll();
      commitHistory();
    });
  }

  controls.showSmoothGuide.addEventListener("change", () => {
    flushHistoryCommit();
    state.showSmoothGuide = controls.showSmoothGuide.checked;
    renderAll();
    commitHistory();
  });

  controls.flipDrawing.addEventListener("change", () => {
    flushHistoryCommit();
    state.flipDrawing = controls.flipDrawing.checked;
    renderAll();
    commitHistory();
  });

  controls.undo.addEventListener("click", () => {
    flushHistoryCommit();
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    restoreHistory(history[historyIndex]);
  });

  controls.redo.addEventListener("click", () => {
    flushHistoryCommit();
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    restoreHistory(history[historyIndex]);
  });

  controls.print.addEventListener("click", () => {
    flushHistoryCommit();
    const audit = validateState();
    if (audit.errors.length) {
      renderValidation(audit);
      controls.validation.focus?.();
      return;
    }
    renderPrintSheet();
    window.print();
  });

  function updateStationFromInput(input) {
    const station = stationById(input.dataset.stationId);
    if (!station) return;
    const field = input.dataset.stationField;

    if (field === "behindNut") {
      invalidDraftErrors.delete(`${station.id}:fret`);
      station.behindNut = input.checked && station.role === "low";
      if (station.behindNut) station.fret = 0;
      updateAutomaticStations();
      syncAutomaticStationInputs();
      renderAll();
      return;
    }

    if (field === "fret") {
      const value = Number(input.value);
      const error = measurementInputError("fret", value, stationShortName(station));
      setInputValidity(input, !error);
      if (error) {
        invalidDraftErrors.set(draftKey(input), error);
        renderAll();
        return;
      }
      invalidDraftErrors.delete(draftKey(input));
      station.fret = value;
      updateAutomaticStations();
      syncAutomaticStationInputs();
      updateStationHeadings();
      renderAll();
      return;
    }

    const parsed = parseMeasurement(input.value, state.displayUnit);
    const error = measurementInputError(field, parsed, stationShortName(station));
    setInputValidity(input, !error);
    if (error) {
      invalidDraftErrors.set(draftKey(input), error);
      renderAll();
      return;
    }
    invalidDraftErrors.delete(draftKey(input));

    if (field === "width") {
      station.width = parsed;
      if (station.role === "middle") station.manualWidth = true;
    } else if (field === "thickness") {
      station.thickness = parsed;
      if (station.role === "middle") station.manualThickness = true;
    } else if (field === "nutOffset") {
      station.nutOffset = parsed;
    }

    if (station.role !== "middle" || field === "nutOffset") {
      updateAutomaticStations();
      syncAutomaticStationInputs();
    } else {
      updateMiddleStatus(station);
    }
    renderAll();
  }

  function renderAll() {
    syncPassButtons();
    updateAddLocationButton();
    const audit = validateState();
    renderValidation(audit);
    renderPassSummary();
    renderDiagrams(audit);
    renderMarkPlan(audit);
    renderPrintSheet();
    updateHistoryButtons();
  }

  function syncStaticControls() {
    for (const input of controls.unitInputs) {
      input.checked = input.value === state.displayUnit;
    }
    controls.fractionOptions.hidden = state.displayUnit !== "fraction";
    controls.fractionPrecision.value = String(state.fractionPrecision);

    for (const input of controls.referenceInputs) {
      input.checked = input.value === state.referenceMode;
    }
    controls.referenceHelp.textContent =
      state.referenceMode === "glue"
        ? "Measure neck wood from the fretboard glue line to the center of the back."
        : "Use the flat top before it is radiused. Measure from that plane to the center of the back; an already-radiused one-piece neck needs a radius-aware method.";

    controls.showSmoothGuide.checked = state.showSmoothGuide;
    controls.flipDrawing.checked = state.flipDrawing;
    controls.flipLabel.textContent =
      state.referenceMode === "glue" ? "Glue line down" : "Flat top down";
    syncScaleInput();
  }

  function syncScaleInput() {
    controls.scaleLength.value = formatInput(state.scaleLength);
    controls.scaleLength.dataset.inches = String(state.scaleLength);
  }

  function renderLocationCards() {
    const ordered = orderedStations();
    const middleStations = ordered.filter((station) => station.role === "middle");
    controls.locationGrid.innerHTML = ordered
      .map((station) => locationCardMarkup(station, middleStations))
      .join("");
  }

  function locationCardMarkup(station, middleStations) {
    const label = stationLabel(station, middleStations);
    const tone = station.role === "low" ? "low" : station.role === "high" ? "high" : "middle";
    const unit = inputUnitLabel();
    const isLow = station.role === "low";
    const isHigh = station.role === "high";
    const isMiddle = station.role === "middle";
    const status =
      isMiddle && (station.manualWidth || station.manualThickness)
        ? "Measured override"
        : isMiddle
          ? "Auto estimate"
          : "Measured";

    return `
      <fieldset class="location-card location-card--${tone}" data-station-card="${station.id}">
        <legend class="sr-only">${escapeHtml(label)}</legend>
        <div class="location-card__header">
          <div>
            <p class="location-card__tone">${escapeHtml(label)}</p>
            <h3 data-station-heading="${station.id}">${escapeHtml(positionLabel(station))}</h3>
          </div>
          <div class="location-card__header-actions">
            <span class="station-status" data-station-status="${station.id}">${status}</span>
            ${
              isMiddle
                ? `<button class="small-button" type="button" data-location-action="remove" data-station-id="${station.id}" aria-label="Remove ${escapeHtml(label)}">Remove</button>`
                : ""
            }
          </div>
        </div>

        ${
          isHigh
            ? `<p class="location-card__help">Use the last fret that still has the normal neck shape before the heel transition.</p>`
            : ""
        }

        <div class="location-card__fields">
          <label class="field">
            <span>Fret <small>(0 = nut)</small></span>
            <input
              type="number"
              min="0"
              max="36"
              step="1"
              value="${formatNumber(station.fret)}"
              data-station-id="${station.id}"
              data-station-field="fret"
              ${isLow && station.behindNut ? "disabled" : ""}
            >
          </label>
          <label class="field">
            <span>Full width <small>(${unit})</small></span>
            <input
              type="text"
              inputmode="${state.displayUnit === "fraction" ? "text" : "decimal"}"
              value="${escapeHtml(formatInput(station.width))}"
              data-station-id="${station.id}"
              data-station-field="width"
              autocomplete="off"
            >
          </label>
          <label class="field">
            <span>${escapeHtml(thicknessFieldLabel())} <small>(${unit})</small></span>
            <input
              type="text"
              inputmode="${state.displayUnit === "fraction" ? "text" : "decimal"}"
              value="${escapeHtml(formatInput(station.thickness))}"
              data-station-id="${station.id}"
              data-station-field="thickness"
              autocomplete="off"
            >
          </label>
        </div>

        ${
          isLow
            ? `
              <div class="behind-nut-control">
                <label class="check-row">
                  <input
                    type="checkbox"
                    data-station-id="${station.id}"
                    data-station-field="behindNut"
                    ${station.behindNut ? "checked" : ""}
                  >
                  <span>Lowest mark is behind the nut / headless</span>
                </label>
                ${
                  station.behindNut
                    ? `
                      <label class="field field--compact">
                        <span>Distance behind nut <small>(${unit})</small></span>
                        <input
                          type="text"
                          inputmode="${state.displayUnit === "fraction" ? "text" : "decimal"}"
                          value="${escapeHtml(formatInput(station.nutOffset))}"
                          data-station-id="${station.id}"
                          data-station-field="nutOffset"
                          autocomplete="off"
                        >
                      </label>
                    `
                    : ""
                }
              </div>
            `
            : ""
        }

        ${
          isMiddle && (station.manualWidth || station.manualThickness)
            ? `<button class="reset-estimate" type="button" data-location-action="reset" data-station-id="${station.id}">Reset to interpolated estimate</button>`
            : ""
        }
      </fieldset>
    `;
  }

  function renderPassSummary() {
    const pass = passForRepresentativeStation();
    if (!pass) {
      controls.passSummary.replaceChildren();
      return;
    }

    controls.passSummary.innerHTML = `
      <div class="pass-summary__step">Pass ${pass.number} of 3</div>
      <div class="pass-summary__copy">
        <h3>${escapeHtml(pass.title)}</h3>
        <p>${escapeHtml(pass.instruction)} Tape or mark the keep side, then carve only the hatched corner.</p>
      </div>
      <div class="formula-pair" aria-label="Proportional formulas">
        <span><b>A</b> ${escapeHtml(pass.measurements[0].formula)}</span>
        <span><b>B</b> ${escapeHtml(pass.measurements[1].formula)}</span>
      </div>
    `;
  }

  function renderDiagrams(audit) {
    if (audit.errors.length) {
      controls.diagramGrid.innerHTML = `
        <div class="empty-state">
          Correct the highlighted measurements to draw the carving passes.
        </div>
      `;
      return;
    }

    const middleStations = orderedStations().filter((station) => station.role === "middle");
    controls.diagramGrid.innerHTML = orderedStations()
      .map((station) => {
        const geometry = calculateFacetGeometry(station.width, station.thickness);
        const pass = geometry.passes[state.activePass];
        const label = stationLabel(station, middleStations);
        return diagramCardMarkup(station, label, geometry, pass);
      })
      .join("");
  }

  function diagramCardMarkup(station, label, geometry, pass) {
    const first = pass.measurements[0];
    const second = pass.measurements[1];
    return `
      <article class="diagram-card diagram-card--${station.role}">
        <header class="diagram-card__header">
          <div>
            <p>${escapeHtml(label)}</p>
            <h3>${escapeHtml(positionLabel(station))}</h3>
          </div>
          <span class="angle-readout">${pass.angleFromBack.toFixed(1)}&deg; from back</span>
        </header>

        <dl class="diagram-values">
          ${diagramValueMarkup(first, "a")}
          ${diagramValueMarkup(second, "b")}
        </dl>

        ${crossSectionSvg(station, label, geometry, pass)}

        <p class="diagram-card__note">
          Use the same marks on both sides. Screen drawing is proportional; the print sheet is full size.
        </p>

        <details class="coordinate-details">
          <summary>Exact point locations</summary>
          <dl>
            ${coordinateMarkup(first, geometry)}
            ${coordinateMarkup(second, geometry)}
            <div>
              <dt>Full width / half-width</dt>
              <dd>${escapeHtml(formatMain(geometry.width))} / ${escapeHtml(formatMain(geometry.halfWidth))}</dd>
            </div>
            <div>
              <dt>${escapeHtml(thicknessFieldLabel())}</dt>
              <dd>${escapeHtml(formatMain(geometry.thickness))}</dd>
            </div>
          </dl>
        </details>
      </article>
    `;
  }

  function diagramValueMarkup(measurement, key) {
    return `
      <div class="diagram-value diagram-value--${key}">
        <dt>
          <span class="mark-symbol mark-symbol--${key}" aria-hidden="true">${key.toUpperCase()}</span>
          ${escapeHtml(measurement.label)}
        </dt>
        <dd>${escapeHtml(formatMain(measurement.value))}</dd>
      </div>
    `;
  }

  function coordinateMarkup(measurement, geometry) {
    const fromCenter = Math.abs(measurement.point.x);
    const down = measurement.point.y;
    return `
      <div>
        <dt>Point ${measurement.key.toUpperCase()}</dt>
        <dd>
          ${escapeHtml(formatMain(fromCenter))} from centerline,
          ${escapeHtml(formatMain(down))} from ${escapeHtml(referenceShortLabel())}
        </dd>
      </div>
    `;
  }

  function crossSectionSvg(station, stationName, geometry, pass) {
    const svgWidth = 720;
    const svgHeight = 410;
    const plotWidth = 500;
    const plotHeight = 205;
    const scale = Math.min(
      plotWidth / Math.max(geometry.width, 0.01),
      plotHeight / Math.max(geometry.thickness, 0.01)
    );
    const centerX = svgWidth / 2;
    const referenceY = state.flipDrawing ? 310 : 82;
    const direction = state.flipDrawing ? -1 : 1;
    const sx = (x) => centerX + x * scale;
    const sy = (y) => referenceY + direction * y * scale;
    const hatchId = `waste-${safeId(station.id)}-${pass.key}`;
    const smoothPath = smoothCurvePath(geometry, sx, sy);
    const stagePath = polygonPath(pass.stageBefore, sx, sy);
    const wasteRight = polygonPath(pass.waste, sx, sy);
    const wasteLeft = polygonPath(pass.waste.map(mirror), sx, sy);
    const activeRight = linePath(pass.line, sx, sy);
    const activeLeft = linePath(pass.line.map(mirror), sx, sy);
    const markA = pass.measurements[0];
    const markB = pass.measurements[1];
    const widthDimensionY = 372;
    const depthDimensionX = sx(-geometry.halfWidth) - 34;
    const referenceTextY = state.flipDrawing ? referenceY + 28 : referenceY - 17;
    const centerTextY = state.flipDrawing
      ? sy(geometry.thickness) - 16
      : sy(geometry.thickness) + 24;
    const ariaDescription =
      `${stationName}, ${positionLabel(station)}. ${pass.title}. ` +
      `Mark A is ${formatMain(markA.value)}. Mark B is ${formatMain(markB.value)}.`;

    return `
      <svg
        class="cross-section"
        viewBox="0 0 ${svgWidth} ${svgHeight}"
        role="img"
        aria-label="${escapeHtml(ariaDescription)}"
      >
        <defs>
          <pattern id="${hatchId}" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="9" class="waste-hatch-line"></line>
          </pattern>
        </defs>

        <rect class="diagram-background" x="1" y="1" width="${svgWidth - 2}" height="${svgHeight - 2}" rx="6"></rect>
        <path class="blank-stage" d="${stagePath} Z"></path>
        <path class="waste-fill" d="${wasteRight} Z"></path>
        <path class="waste-fill" d="${wasteLeft} Z"></path>
        <path class="waste-hatch" fill="url(#${hatchId})" d="${wasteRight} Z"></path>
        <path class="waste-hatch" fill="url(#${hatchId})" d="${wasteLeft} Z"></path>

        <line
          class="reference-line"
          x1="${sx(-geometry.halfWidth - 0.1).toFixed(2)}"
          y1="${sy(0).toFixed(2)}"
          x2="${sx(geometry.halfWidth + 0.1).toFixed(2)}"
          y2="${sy(0).toFixed(2)}"
        ></line>
        <line
          class="center-line"
          x1="${sx(0).toFixed(2)}"
          y1="${sy(0).toFixed(2)}"
          x2="${sx(0).toFixed(2)}"
          y2="${sy(geometry.thickness).toFixed(2)}"
        ></line>

        ${
          state.showSmoothGuide
            ? `<path class="smooth-guide" d="${smoothPath}"></path>`
            : ""
        }

        ${measurementSegmentMarkup(markA, "a", sx, sy)}
        ${measurementSegmentMarkup(markB, "b", sx, sy)}

        <path class="active-cut-line" d="${activeRight}"></path>
        <path class="active-cut-line" d="${activeLeft}"></path>

        ${pointMarkerMarkup(markA, "a", sx, sy)}
        ${pointMarkerMarkup(markB, "b", sx, sy)}

        <line class="dimension-line" x1="${sx(-geometry.halfWidth).toFixed(2)}" y1="${widthDimensionY}" x2="${sx(geometry.halfWidth).toFixed(2)}" y2="${widthDimensionY}"></line>
        <line class="dimension-tick" x1="${sx(-geometry.halfWidth).toFixed(2)}" y1="${widthDimensionY - 7}" x2="${sx(-geometry.halfWidth).toFixed(2)}" y2="${widthDimensionY + 7}"></line>
        <line class="dimension-tick" x1="${sx(geometry.halfWidth).toFixed(2)}" y1="${widthDimensionY - 7}" x2="${sx(geometry.halfWidth).toFixed(2)}" y2="${widthDimensionY + 7}"></line>
        <text class="dimension-label" x="${centerX}" y="${widthDimensionY - 10}">WIDTH ${escapeHtml(formatMain(geometry.width))}</text>

        <line class="dimension-line" x1="${depthDimensionX.toFixed(2)}" y1="${sy(0).toFixed(2)}" x2="${depthDimensionX.toFixed(2)}" y2="${sy(geometry.thickness).toFixed(2)}"></line>
        <line class="dimension-tick" x1="${(depthDimensionX - 7).toFixed(2)}" y1="${sy(0).toFixed(2)}" x2="${(depthDimensionX + 7).toFixed(2)}" y2="${sy(0).toFixed(2)}"></line>
        <line class="dimension-tick" x1="${(depthDimensionX - 7).toFixed(2)}" y1="${sy(geometry.thickness).toFixed(2)}" x2="${(depthDimensionX + 7).toFixed(2)}" y2="${sy(geometry.thickness).toFixed(2)}"></line>
        <text class="dimension-label dimension-label--depth" text-anchor="end" x="${(depthDimensionX - 12).toFixed(2)}" y="${((sy(0) + sy(geometry.thickness)) / 2 + 4).toFixed(2)}">T ${escapeHtml(formatMain(geometry.thickness))}</text>

        <text class="reference-label" x="${centerX}" y="${referenceTextY.toFixed(2)}">${escapeHtml(referenceLongLabel().toUpperCase())}</text>
        <text class="center-label" x="${centerX}" y="${centerTextY.toFixed(2)}">BACK CENTERLINE</text>
      </svg>
    `;
  }

  function renderMarkPlan(audit) {
    if (audit.errors.length) {
      controls.markPlan.innerHTML = `
        <div class="empty-state">The line plan will appear after the measurements are valid.</div>
      `;
      controls.print.disabled = true;
      return;
    }

    controls.print.disabled = false;
    const ordered = orderedStations();
    const middleStations = ordered.filter((station) => station.role === "middle");
    const representative = calculateFacetGeometry(ordered[0].width, ordered[0].thickness)
      .passes[state.activePass];

    controls.markPlan.innerHTML = `
      <div class="plan-key">
        <span><i class="mark-symbol mark-symbol--a" aria-hidden="true">A</i>${escapeHtml(representative.measurements[0].label)}</span>
        <span><i class="mark-symbol mark-symbol--b" aria-hidden="true">B</i>${escapeHtml(representative.measurements[1].label)}</span>
      </div>
      <div class="table-scroll">
        <table class="plan-table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Full width</th>
              <th>${escapeHtml(thicknessFieldLabel())}</th>
              <th>Mark A</th>
              <th>Mark B</th>
              <th>Guide angle</th>
            </tr>
          </thead>
          <tbody>
            ${ordered
              .map((station) => {
                const geometry = calculateFacetGeometry(station.width, station.thickness);
                const pass = geometry.passes[state.activePass];
                return `
                  <tr>
                    <th scope="row">
                      <span class="table-location table-location--${station.role}">${escapeHtml(stationLabel(station, middleStations))}</span>
                      <small>${escapeHtml(positionLabel(station))}</small>
                    </th>
                    <td>${resultValueMarkup(station.width)}</td>
                    <td>${resultValueMarkup(station.thickness)}</td>
                    <td class="plan-table__mark-a">${resultValueMarkup(pass.measurements[0].value)}</td>
                    <td class="plan-table__mark-b">${resultValueMarkup(pass.measurements[1].value)}</td>
                    <td><strong>${pass.angleFromBack.toFixed(1)}&deg;</strong><small>from back surface</small></td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPrintSheet() {
    if (!controls.printSheet) return;
    const audit = validateState();
    if (audit.errors.length) {
      controls.printSheet.replaceChildren();
      return;
    }

    const ordered = orderedStations();
    const middleStations = ordered.filter((station) => station.role === "middle");
    controls.printSheet.innerHTML = `
      <header class="print-header">
        <div>
          <p>Facet Carver</p>
          <h1>Plain C neck carving shop sheet</h1>
          <p>
            Reference: ${escapeHtml(referenceLongLabel())}. Print at 100% / actual size.
            Turn off "fit to page."
          </p>
        </div>
        <div class="calibration-block">
          <div class="calibration-square" aria-hidden="true"></div>
          <span>This square must measure exactly 1 in / 25.4 mm.</span>
        </div>
      </header>

      <section class="print-profiles">
        <h2>Full-size cross-sections</h2>
        <p>
          Solid outline: three-pass facet envelope. Dashed curve: optional elliptical
          smoothing guide. Verify both against the real blank and a physical template.
        </p>
        <div class="print-profile-grid">
          ${ordered
            .map((station) => {
              const geometry = calculateFacetGeometry(station.width, station.thickness);
              return printProfileMarkup(
                station,
                stationLabel(station, middleStations),
                geometry
              );
            })
            .join("")}
        </div>
      </section>

      <section class="print-marks">
        <h2>All tape marks</h2>
        ${printMarkTable(ordered, middleStations)}
      </section>

      <footer class="print-warning">
        Layout aid only. Confirm truss rod channel depth, hardware clearance, center
        thickness, and your target profile before removing wood.
      </footer>
    `;
  }

  function printProfileMarkup(station, label, geometry) {
    const margin = 0.28;
    const { width, height } = physicalTemplateSize(
      geometry.width,
      geometry.thickness,
      margin
    );
    const centerX = width / 2;
    const referenceY = margin;
    const sx = (x) => centerX + x;
    const sy = (y) => referenceY + y;
    const facetPath = polygonPath(geometry.finalFacetPolygon, sx, sy);
    const smoothPath = smoothCurvePath(geometry, sx, sy);

    return `
      <figure class="print-profile">
        <figcaption>
          <strong>${escapeHtml(label)} - ${escapeHtml(positionLabel(station))}</strong>
          <span>${escapeHtml(formatMain(station.width))} wide / ${escapeHtml(formatMain(station.thickness))} thick</span>
        </figcaption>
        <svg
          width="${width.toFixed(3)}in"
          height="${height.toFixed(3)}in"
          viewBox="0 0 ${width.toFixed(3)} ${height.toFixed(3)}"
          role="img"
          aria-label="${escapeHtml(label)} full-size neck cross-section"
        >
          <rect x="${margin.toFixed(3)}" y="${referenceY.toFixed(3)}" width="${geometry.width.toFixed(3)}" height="${geometry.thickness.toFixed(3)}" class="print-blank-outline"></rect>
          <path d="${facetPath} Z" class="print-facet-outline"></path>
          ${
            state.showSmoothGuide
              ? `<path d="${smoothPath}" class="print-smooth-guide"></path>`
              : ""
          }
          <line x1="${sx(0).toFixed(3)}" y1="${sy(0).toFixed(3)}" x2="${sx(0).toFixed(3)}" y2="${sy(geometry.thickness).toFixed(3)}" class="print-center-line"></line>
          <line x1="${sx(-geometry.halfWidth).toFixed(3)}" y1="${sy(0).toFixed(3)}" x2="${sx(geometry.halfWidth).toFixed(3)}" y2="${sy(0).toFixed(3)}" class="print-reference-line"></line>
        </svg>
      </figure>
    `;
  }

  function printMarkTable(ordered, middleStations) {
    return `
      <table>
        <thead>
          <tr>
            <th>Location</th>
            <th>Pass 1 A</th>
            <th>Pass 1 B</th>
            <th>Pass 2 A</th>
            <th>Pass 2 B</th>
            <th>Pass 3 A</th>
            <th>Pass 3 B</th>
          </tr>
        </thead>
        <tbody>
          ${ordered
            .map((station) => {
              const geometry = calculateFacetGeometry(station.width, station.thickness);
              return `
                <tr>
                  <th scope="row">
                    ${escapeHtml(stationLabel(station, middleStations))}
                    <small>${escapeHtml(positionLabel(station))}</small>
                  </th>
                  ${PASS_KEYS.flatMap((key) =>
                    geometry.passes[key].measurements.map(
                      (item) => `<td>${escapeHtml(formatMain(item.value))}</td>`
                    )
                  ).join("")}
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
      <p class="print-source">
        Carving tutorial: ${escapeHtml(METHOD_REFERENCE_URL)}
      </p>
    `;
  }

  function validateState() {
    const errors = [...invalidDraftErrors.values()];
    const warnings = [];
    const ordered = orderedStations();
    const low = stationByRole("low");
    const high = stationByRole("high");

    if (!(state.scaleLength > 0)) {
      errors.push("Scale length must be greater than zero.");
    }

    for (const station of ordered) {
      if (!(station.width > 0)) {
        errors.push(`${stationShortName(station)} needs a full width greater than zero.`);
      }
      if (!(station.thickness > 0)) {
        errors.push(`${stationShortName(station)} needs a neck thickness greater than zero.`);
      }
      if (station.width > 4.5 || station.thickness > 2) {
        warnings.push(`${stationShortName(station)} is outside a typical guitar or bass range. Verify the entry.`);
      }
    }

    if (low && high) {
      const lowDistance = stationDistance(low, state.scaleLength);
      const highDistance = stationDistance(high, state.scaleLength);
      if (highDistance <= lowDistance) {
        errors.push("The high station must be farther from the nut than the low station.");
      }

      const seen = new Set();
      for (const station of ordered) {
        const position = stationDistance(station, state.scaleLength).toFixed(6);
        if (seen.has(position)) {
          errors.push("Each fret location must be unique.");
          break;
        }
        seen.add(position);
      }

      for (const station of ordered.filter((item) => item.role === "middle")) {
        const position = stationDistance(station, state.scaleLength);
        if (position <= lowDistance || position >= highDistance) {
          errors.push(`${stationShortName(station)} must stay between the low and high stations.`);
        }
      }
    }

    if (state.stations.some((station) => station.role === "middle")) {
      warnings.push(
        "Added locations are linear estimates between your measured endpoints. Measure the real blank there when possible."
      );
    }

    return {
      errors: [...new Set(errors)],
      warnings: [...new Set(warnings)]
    };
  }

  function renderValidation(audit) {
    if (!audit.errors.length && !audit.warnings.length) {
      controls.validation.hidden = true;
      controls.validation.replaceChildren();
      return;
    }

    controls.validation.hidden = false;
    controls.validation.classList.toggle("has-errors", audit.errors.length > 0);
    controls.validation.innerHTML = `
      ${audit.errors.map((message) => `<p><strong>Fix:</strong> ${escapeHtml(message)}</p>`).join("")}
      ${audit.warnings.map((message) => `<p><strong>Check:</strong> ${escapeHtml(message)}</p>`).join("")}
    `;
  }

  function updateAutomaticStations() {
    const low = stationByRole("low");
    const high = stationByRole("high");
    if (!low || !high || !(state.scaleLength > 0)) return;

    for (const station of state.stations.filter((item) => item.role === "middle")) {
      const estimate = interpolateStation(low, high, station, state.scaleLength);
      if (!station.manualWidth) station.width = estimate.width;
      if (!station.manualThickness) station.thickness = estimate.thickness;
    }
  }

  function syncAutomaticStationInputs() {
    for (const station of state.stations.filter((item) => item.role === "middle")) {
      const card = controls.locationGrid.querySelector(`[data-station-card="${station.id}"]`);
      if (!card) continue;
      if (!station.manualWidth) {
        const input = card.querySelector('[data-station-field="width"]');
        if (input) input.value = formatInput(station.width);
      }
      if (!station.manualThickness) {
        const input = card.querySelector('[data-station-field="thickness"]');
        if (input) input.value = formatInput(station.thickness);
      }
      updateMiddleStatus(station);
    }
  }

  function updateMiddleStatus(station) {
    const status = controls.locationGrid.querySelector(
      `[data-station-status="${station.id}"]`
    );
    if (!status) return;
    status.textContent =
      station.manualWidth || station.manualThickness
        ? "Measured override"
        : "Auto estimate";
  }

  function updateStationHeadings() {
    for (const station of state.stations) {
      const heading = controls.locationGrid.querySelector(
        `[data-station-heading="${station.id}"]`
      );
      if (heading) heading.textContent = positionLabel(station);
    }
  }

  function suggestedFret() {
    const low = stationByRole("low");
    const high = stationByRole("high");
    if (!low || !high || low.behindNut) {
      const lowFret = 0;
      return suggestedFretBetween(lowFret, high?.fret ?? 12);
    }
    return suggestedFretBetween(low.fret, high.fret);
  }

  function suggestedFretBetween(lowFret, highFret) {
    const low = Math.ceil(Math.min(lowFret, highFret));
    const high = Math.floor(Math.max(lowFret, highFret));
    if (high - low < 2) return Number.NaN;

    const used = new Set(
      state.stations
        .filter((station) => !station.behindNut)
        .map((station) => Math.round(station.fret))
    );
    const candidates = [];
    for (let fret = low + 1; fret < high; fret += 1) {
      if (!used.has(fret)) candidates.push(fret);
    }
    if (!candidates.length) return Number.NaN;

    const existing = [...used].filter((fret) => fret >= low && fret <= high).sort((a, b) => a - b);
    let best = candidates[0];
    let bestDistance = -1;
    for (const candidate of candidates) {
      const nearest = Math.min(...existing.map((fret) => Math.abs(candidate - fret)));
      if (nearest > bestDistance) {
        best = candidate;
        bestDistance = nearest;
      }
    }
    return best;
  }

  function orderedStations() {
    const low = stationByRole("low");
    const high = stationByRole("high");
    const middle = state.stations
      .filter((station) => station.role === "middle")
      .sort(
        (left, right) =>
          stationDistance(left, state.scaleLength) -
          stationDistance(right, state.scaleLength)
      );
    return [low, ...middle, high].filter(Boolean);
  }

  function stationById(id) {
    return state.stations.find((station) => station.id === id);
  }

  function stationByRole(role) {
    return state.stations.find((station) => station.role === role);
  }

  function stationLabel(station, middleStations = []) {
    if (station.role === "low") return "Low station";
    if (station.role === "high") return "High station";
    const index = middleStations.findIndex((item) => item.id === station.id);
    return `Added station ${Math.max(1, index + 1)}`;
  }

  function stationShortName(station) {
    return station.role === "low"
      ? "Low station"
      : station.role === "high"
        ? "High station"
        : "Added station";
  }

  function positionLabel(station) {
    if (station.role === "low" && station.behindNut) {
      return `${formatMain(station.nutOffset)} behind nut`;
    }
    if (Number(station.fret) === 0) return "Nut";
    return `Fret ${formatNumber(station.fret)}`;
  }

  function updateAddLocationButton() {
    const maxed = state.stations.length >= MAX_LOCATIONS;
    const noRoom = !Number.isFinite(suggestedFret());
    controls.addLocation.disabled = maxed || noRoom;
    controls.addLocation.textContent = maxed
      ? "Six locations added"
      : noRoom
        ? "No open fret between stations"
        : "Add fret location";
  }

  function passForRepresentativeStation() {
    const station = orderedStations().find(
      (item) => item && item.width > 0 && item.thickness > 0
    );
    if (!station) return null;
    return calculateFacetGeometry(station.width, station.thickness).passes[
      state.activePass
    ];
  }

  function syncPassButtons() {
    for (const button of controls.passButtons) {
      const active = button.dataset.pass === state.activePass;
      button.classList.toggle("is-active", active);
      if (active) {
        button.setAttribute("aria-current", "step");
      } else {
        button.removeAttribute("aria-current");
      }
    }
  }

  function commitHistory() {
    if (restoringHistory) return;
    if (historyTimer) {
      window.clearTimeout(historyTimer);
      historyTimer = null;
    }
    const encoded = JSON.stringify(state);
    const currentEncoded = JSON.stringify(history[historyIndex]);
    if (encoded === currentEncoded) {
      updateHistoryButtons();
      return;
    }

    history = history.slice(0, historyIndex + 1);
    history.push(cloneState(state));
    if (history.length > 60) history.shift();
    historyIndex = history.length - 1;
    updateHistoryButtons();
  }

  function scheduleHistoryCommit() {
    if (restoringHistory) return;
    if (historyTimer) window.clearTimeout(historyTimer);
    historyTimer = window.setTimeout(() => {
      historyTimer = null;
      commitHistory();
    }, 300);
  }

  function flushHistoryCommit() {
    if (!historyTimer) return;
    window.clearTimeout(historyTimer);
    historyTimer = null;
    commitHistory();
  }

  function restoreHistory(snapshot) {
    restoringHistory = true;
    invalidDraftErrors.clear();
    state = cloneState(snapshot);
    nextStationNumber = Math.max(
      3,
      ...state.stations.map((station) => {
        const match = station.id.match(/(\d+)$/);
        return match ? Number(match[1]) + 1 : 3;
      })
    );
    syncStaticControls();
    renderLocationCards();
    renderAll();
    restoringHistory = false;
  }

  function draftKey(input) {
    return input === controls.scaleLength
      ? "scaleLength"
      : `${input.dataset.stationId}:${input.dataset.stationField}`;
  }

  function clearStationDraftErrors(stationId) {
    for (const key of invalidDraftErrors.keys()) {
      if (key.startsWith(`${stationId}:`)) invalidDraftErrors.delete(key);
    }
  }

  function updateHistoryButtons() {
    controls.undo.disabled = historyIndex <= 0;
    controls.redo.disabled = historyIndex >= history.length - 1;
  }

  function formatInput(value) {
    if (state.displayUnit === "mm") return (value * INCH_TO_MM).toFixed(1);
    if (state.displayUnit === "fraction") {
      return formatFraction(value, state.fractionPrecision);
    }
    return Number(value).toFixed(3);
  }

  function formatMain(value) {
    if (state.displayUnit === "mm") return `${(value * INCH_TO_MM).toFixed(1)} mm`;
    if (state.displayUnit === "fraction") {
      return `${formatFraction(value, state.fractionPrecision)} in`;
    }
    return `${Number(value).toFixed(3)} in`;
  }

  function resultValueMarkup(value) {
    const secondary = secondaryMeasurements(value);
    return `
      <strong>${escapeHtml(formatMain(value))}</strong>
      <small>(${escapeHtml(secondary.join(", "))})</small>
    `;
  }

  function secondaryMeasurements(value) {
    const values = {
      decimal: `${Number(value).toFixed(3)} in`,
      fraction: `${formatFraction(value, state.fractionPrecision)} in`,
      mm: `${(value * INCH_TO_MM).toFixed(1)} mm`
    };
    return ["decimal", "fraction", "mm"]
      .filter((unit) => unit !== state.displayUnit)
      .map((unit) => values[unit]);
  }

  function inputUnitLabel() {
    if (state.displayUnit === "mm") return "mm";
    if (state.displayUnit === "fraction") return "fractional inches";
    return "decimal inches";
  }

  function thicknessFieldLabel() {
    return state.referenceMode === "glue"
      ? "Neck thickness below glue line"
      : "Neck thickness from flat top";
  }

  function referenceShortLabel() {
    return state.referenceMode === "glue" ? "glue line" : "flat top";
  }

  function referenceLongLabel() {
    return state.referenceMode === "glue"
      ? "fretboard glue line"
      : "one-piece flat-top reference";
  }
}

function measurementSegmentMarkup(measurement, key, sx, sy) {
  const [start, end] = measurement.segment;
  const right = linePath([start, end], sx, sy);
  const left = linePath([mirror(start), mirror(end)], sx, sy);
  return `
    <path class="mark-segment mark-segment--${key}" d="${right}"></path>
    <path class="mark-segment mark-segment--${key}" d="${left}"></path>
  `;
}

function pointMarkerMarkup(measurement, key, sx, sy) {
  const rightX = sx(measurement.point.x);
  const leftX = sx(-measurement.point.x);
  const y = sy(measurement.point.y);
  if (key === "b") {
    return `
      <rect class="point-marker point-marker--b" x="${(rightX - 6).toFixed(2)}" y="${(y - 6).toFixed(2)}" width="12" height="12"></rect>
      <rect class="point-marker point-marker--b" x="${(leftX - 6).toFixed(2)}" y="${(y - 6).toFixed(2)}" width="12" height="12"></rect>
      <text class="point-label point-label--b" x="${(rightX + 13).toFixed(2)}" y="${(y - 10).toFixed(2)}">B</text>
      <text class="point-label point-label--b" text-anchor="end" x="${(leftX - 13).toFixed(2)}" y="${(y - 10).toFixed(2)}">B</text>
    `;
  }

  return `
    <circle class="point-marker point-marker--a" cx="${rightX.toFixed(2)}" cy="${y.toFixed(2)}" r="6"></circle>
    <circle class="point-marker point-marker--a" cx="${leftX.toFixed(2)}" cy="${y.toFixed(2)}" r="6"></circle>
    <text class="point-label point-label--a" x="${(rightX + 13).toFixed(2)}" y="${(y - 10).toFixed(2)}">A</text>
    <text class="point-label point-label--a" text-anchor="end" x="${(leftX - 13).toFixed(2)}" y="${(y - 10).toFixed(2)}">A</text>
  `;
}

function smoothCurvePath(geometry, sx, sy) {
  const kappa = 0.5522847498;
  const h = geometry.halfWidth;
  const d = geometry.thickness;
  return [
    `M ${sx(-h).toFixed(3)} ${sy(0).toFixed(3)}`,
    `C ${sx(-h).toFixed(3)} ${sy(kappa * d).toFixed(3)}`,
    `${sx(-kappa * h).toFixed(3)} ${sy(d).toFixed(3)}`,
    `${sx(0).toFixed(3)} ${sy(d).toFixed(3)}`,
    `C ${sx(kappa * h).toFixed(3)} ${sy(d).toFixed(3)}`,
    `${sx(h).toFixed(3)} ${sy(kappa * d).toFixed(3)}`,
    `${sx(h).toFixed(3)} ${sy(0).toFixed(3)}`
  ].join(" ");
}

function polygonPath(points, sx, sy) {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${sx(point.x).toFixed(3)} ${sy(point.y).toFixed(3)}`
    )
    .join(" ");
}

function linePath(points, sx, sy) {
  return polygonPath(points, sx, sy);
}

function setInputValidity(input, valid) {
  input.setAttribute("aria-invalid", valid ? "false" : "true");
}

function formatNumber(value) {
  return Number.isInteger(Number(value))
    ? String(Number(value))
    : Number(value).toFixed(1).replace(/\.0$/, "");
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeId(value) {
  return String(value).replace(/[^a-z0-9_-]/gi, "-");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
