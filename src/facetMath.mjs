export const INCH_TO_MM = 25.4;
export const MAX_LOCATIONS = 6;
export const PASS_KEYS = ["first", "second", "third"];

export function measurementInputError(field, value, label = "Measurement") {
  const number = Number(value);

  if (field === "scaleLength") {
    return Number.isFinite(number) && number > 0
      ? null
      : "Scale length must be greater than zero.";
  }
  if (field === "fret") {
    return Number.isFinite(number) && number >= 0 && number <= 36
      ? null
      : `${label} needs a fret location from 0 through 36.`;
  }
  if (field === "nutOffset") {
    return Number.isFinite(number) && number >= 0
      ? null
      : `${label} needs a nut offset of zero or more.`;
  }
  if (field === "width") {
    return Number.isFinite(number) && number > 0
      ? null
      : `${label} needs a full width greater than zero.`;
  }
  if (field === "thickness") {
    return Number.isFinite(number) && number > 0
      ? null
      : `${label} needs a neck thickness greater than zero.`;
  }

  return Number.isFinite(number) ? null : `${label} needs a valid number.`;
}

export function calculateFacetGeometry(width, thickness) {
  const safeWidth = positiveNumber(width, "Neck width");
  const safeThickness = positiveNumber(thickness, "Neck thickness");
  const halfWidth = safeWidth / 2;
  const depth = safeThickness;

  const referenceSide = point(halfWidth, 0);
  const backCenter = point(0, depth);
  const blankCorner = point(halfWidth, depth);

  const firstSide = point(halfWidth, depth / 2);
  const firstBack = point(halfWidth / 2, depth);
  const firstMidpoint = between(firstSide, firstBack, 0.5);
  const firstFacetLength = distance(firstSide, firstBack);

  const secondSide = point(halfWidth, depth / 4);
  const secondFacetPoint = between(firstSide, firstBack, 1 / 3);

  const thirdBack = point(halfWidth / 4, depth);
  const thirdFacetPoint = firstMidpoint;

  const beforeFirst = symmetricPolygon([
    referenceSide,
    blankCorner,
    backCenter
  ]);
  const afterFirst = symmetricPolygon([
    referenceSide,
    firstSide,
    firstBack,
    backCenter
  ]);
  const afterSecond = symmetricPolygon([
    referenceSide,
    secondSide,
    secondFacetPoint,
    firstBack,
    backCenter
  ]);
  const afterThird = symmetricPolygon([
    referenceSide,
    secondSide,
    secondFacetPoint,
    firstMidpoint,
    thirdBack,
    backCenter
  ]);

  const first = createPass({
    key: "first",
    number: 1,
    title: "First facet",
    shortTitle: "First facet",
    instruction:
      "Mark the back and side, connect matching marks along the neck, then remove the corner between them.",
    line: [firstSide, firstBack],
    stageBefore: beforeFirst,
    stageAfter: afterFirst,
    waste: [firstSide, blankCorner, firstBack],
    measurements: [
      measurement(
        "a",
        "Back mark from centerline",
        firstBack.x,
        "width / 4",
        [backCenter, firstBack],
        firstBack
      ),
      measurement(
        "b",
        "Side mark from reference line",
        firstSide.y,
        "thickness / 2",
        [referenceSide, firstSide],
        firstSide
      )
    ]
  });

  const second = createPass({
    key: "second",
    number: 2,
    title: "Second facet",
    shortTitle: "Second facet",
    instruction:
      "Re-mark the side halfway to the first side edge. On the first facet, mark one-third of its length from the side end.",
    line: [secondSide, secondFacetPoint],
    stageBefore: afterFirst,
    stageAfter: afterSecond,
    waste: [secondSide, firstSide, secondFacetPoint],
    measurements: [
      measurement(
        "a",
        "Side mark from reference line",
        secondSide.y,
        "thickness / 4",
        [referenceSide, secondSide],
        secondSide
      ),
      measurement(
        "b",
        "Along first facet from side end",
        firstFacetLength / 3,
        "first facet length / 3",
        [firstSide, secondFacetPoint],
        secondFacetPoint
      )
    ]
  });

  const third = createPass({
    key: "third",
    number: 3,
    title: "Third facet",
    shortTitle: "Third facet",
    instruction:
      "Re-mark the back halfway to the first back edge. Mark the midpoint of the original first facet, then remove the back corner.",
    line: [thirdFacetPoint, thirdBack],
    stageBefore: afterSecond,
    stageAfter: afterThird,
    waste: [thirdBack, firstBack, thirdFacetPoint],
    measurements: [
      measurement(
        "a",
        "Back mark from centerline",
        thirdBack.x,
        "width / 8",
        [backCenter, thirdBack],
        thirdBack
      ),
      measurement(
        "b",
        "Along first facet from back end",
        firstFacetLength / 2,
        "first facet length / 2",
        [firstBack, thirdFacetPoint],
        thirdFacetPoint
      )
    ]
  });

  return {
    width: safeWidth,
    thickness: safeThickness,
    halfWidth,
    firstFacetLength,
    referenceSide,
    backCenter,
    points: {
      firstSide,
      firstBack,
      firstMidpoint,
      secondSide,
      secondFacetPoint,
      thirdBack,
      thirdFacetPoint
    },
    passes: { first, second, third },
    finalFacetPolygon: afterThird
  };
}

export function fretDistance(scaleLength, fret) {
  const scale = positiveNumber(scaleLength, "Scale length");
  const safeFret = Math.max(0, finiteNumber(fret, 0));
  return scale * (1 - Math.pow(2, -safeFret / 12));
}

export function stationDistance(station, scaleLength) {
  if (station?.behindNut) {
    return -Math.max(0, finiteNumber(station.nutOffset, 0));
  }
  return fretDistance(scaleLength, Math.max(0, finiteNumber(station?.fret, 0)));
}

export function interpolateStation(low, high, target, scaleLength) {
  const lowDistance = stationDistance(low, scaleLength);
  const highDistance = stationDistance(high, scaleLength);
  const targetDistance = stationDistance(target, scaleLength);
  const span = highDistance - lowDistance;
  const ratio =
    Math.abs(span) < 0.000001
      ? 0.5
      : clamp((targetDistance - lowDistance) / span, 0, 1);

  return {
    ratio,
    width: lerp(finiteNumber(low.width, 0), finiteNumber(high.width, 0), ratio),
    thickness: lerp(
      finiteNumber(low.thickness, 0),
      finiteNumber(high.thickness, 0),
      ratio
    )
  };
}

export function physicalTemplateSize(width, thickness, margin = 0.28) {
  const safeWidth = positiveNumber(width, "Template width");
  const safeThickness = positiveNumber(thickness, "Template thickness");
  const safeMargin = Math.max(0, finiteNumber(margin, 0.28));

  return {
    width: safeWidth + safeMargin * 2,
    height: safeThickness + safeMargin * 2
  };
}

export function formatFraction(value, denominator = 64) {
  const safeDenominator = Math.max(1, Math.round(finiteNumber(denominator, 64)));
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(finiteNumber(value, 0));
  let whole = Math.floor(absolute);
  let numerator = Math.round((absolute - whole) * safeDenominator);

  if (numerator === safeDenominator) {
    whole += 1;
    numerator = 0;
  }

  if (numerator === 0) return `${sign}${whole}`;

  const divisor = greatestCommonDivisor(numerator, safeDenominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = safeDenominator / divisor;
  return `${sign}${whole ? `${whole} ` : ""}${reducedNumerator}/${reducedDenominator}`;
}

export function parseMeasurement(value, unit = "decimal") {
  const raw = String(value ?? "")
    .trim()
    .replace(/[\u2033"]/g, "")
    .replace(/\b(inches|inch|in|millimeters|millimeter|mm)\b/gi, "")
    .trim();

  if (!raw) return Number.NaN;

  if (unit === "mm") {
    const millimeters = Number(raw.replace(/,/g, ""));
    return Number.isFinite(millimeters)
      ? millimeters / INCH_TO_MM
      : Number.NaN;
  }

  const sign = raw.startsWith("-") ? -1 : 1;
  const unsigned = raw
    .replace(/^-/, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!unsigned) return Number.NaN;

  let total = 0;
  for (const part of unsigned.split(" ")) {
    if (part.includes("/")) {
      const [numerator, denominator] = part.split("/").map(Number);
      if (
        !Number.isFinite(numerator) ||
        !Number.isFinite(denominator) ||
        denominator === 0
      ) {
        return Number.NaN;
      }
      total += numerator / denominator;
      continue;
    }

    const number = Number(part.replace(/,/g, ""));
    if (!Number.isFinite(number)) return Number.NaN;
    total += number;
  }

  return sign * total;
}

export function point(x, y) {
  return { x, y };
}

export function between(start, end, ratio) {
  return {
    x: lerp(start.x, end.x, ratio),
    y: lerp(start.y, end.y, ratio)
  };
}

export function distance(start, end) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function mirror(pointToMirror) {
  return { x: -pointToMirror.x, y: pointToMirror.y };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(start, end, ratio) {
  return start + (end - start) * ratio;
}

function createPass(config) {
  return {
    ...config,
    angleFromBack: lineAngleFromBack(config.line[0], config.line[1])
  };
}

function measurement(key, label, value, formula, segment, pointOnBlank) {
  return { key, label, value, formula, segment, point: pointOnBlank };
}

function symmetricPolygon(rightSidePoints) {
  const withoutCenter = rightSidePoints.slice(0, -1);
  return [
    ...rightSidePoints,
    ...withoutCenter.reverse().map(mirror)
  ];
}

function lineAngleFromBack(start, end) {
  const run = Math.abs(end.x - start.x);
  const rise = Math.abs(end.y - start.y);
  return (Math.atan2(rise, run) * 180) / Math.PI;
}

function greatestCommonDivisor(a, b) {
  let left = Math.abs(Math.round(a));
  let right = Math.abs(Math.round(b));
  while (right) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${label} must be greater than zero.`);
  }
  return number;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
