const { ValidationError } = require('../../../shared/kernel/errors');

const AREA_UNITS = Object.freeze(['HECTARE', 'ACRE', 'SQUARE_METER']);
const FARM_TYPES = Object.freeze(['OWNED', 'LEASED', 'SHARED', 'COMMUNITY', 'OTHER']);
const FARM_STATUSES = Object.freeze(['ACTIVE', 'FALLBACK', 'INACTIVE', 'ARCHIVED']);
const LAND_OWNERSHIP_TYPES = Object.freeze([
  'OWNED',
  'LEASED',
  'SHARE_CROPPING',
  'CUSTOM_FARMING',
  'OTHER',
]);
const LAND_PARCEL_STATUSES = Object.freeze(['AVAILABLE', 'CULTIVATED', 'FALLOW', 'UNAVAILABLE']);
const SOIL_TEXTURES = Object.freeze([
  'CLAY',
  'CLAY_LOAM',
  'LOAM',
  'SANDY_LOAM',
  'SANDY',
  'SILT',
  'SILTY_LOAM',
  'OTHER',
]);
const SOIL_FERTILITY_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']);
const IRRIGATION_SOURCES = Object.freeze([
  'RAINFED',
  'CANAL',
  'RIVER',
  'POND',
  'GROUNDWATER',
  'DEEP_WELL',
  'SHALLOW_WELL',
  'WATER_SUPPLY',
  'OTHER',
]);
const IRRIGATION_METHODS = Object.freeze([
  'FLOOD',
  'FURROW',
  'SPRINKLER',
  'DRIP',
  'CHANNEL',
  'MANUAL',
  'OTHER',
]);
const IRRIGATION_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE', 'SEASONAL']);

// Approximate terrestrial envelope of Bangladesh in WGS84. It is used for
// fast application-level rejection before PostGIS performs the authoritative
// geometry checks.
const BANGLADESH_BOUNDS = Object.freeze({
  minLng: 88.0,
  maxLng: 92.7,
  minLat: 20.5,
  maxLat: 26.7,
});

// Exact SI conversions. Region-specific bigha/katha conventions are not
// assumed; tenants should record those values in notes unless they configure
// their own conversion policy.
const AREA_TO_HECTARES = Object.freeze({
  HECTARE: 1,
  ACRE: 0.40468564224,
  SQUARE_METER: 0.0001,
});

const EPSILON = 1e-9;

function isBangladeshPoint(point) {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1]) &&
    point[0] >= BANGLADESH_BOUNDS.minLng &&
    point[0] <= BANGLADESH_BOUNDS.maxLng &&
    point[1] >= BANGLADESH_BOUNDS.minLat &&
    point[1] <= BANGLADESH_BOUNDS.maxLat
  );
}

function assertBangladeshPoint(point, label = 'coordinate') {
  if (!isBangladeshPoint(point)) {
    throw new ValidationError({
      message: `${label} must be a [longitude, latitude] pair inside Bangladesh.`,
      details: { bounds: BANGLADESH_BOUNDS },
    });
  }
  return point;
}

function samePoint(a, b) {
  return Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;
}

function segmentsIntersect(a, b, c, d) {
  function orientation(p, q, r) {
    const value = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    if (Math.abs(value) < EPSILON) return 0;
    return value > 0 ? 1 : 2;
  }

  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

function isSimpleRing(ring) {
  const count = ring.length - 1;
  for (let i = 0; i < count; i += 1) {
    const a = ring[i];
    const b = ring[i + 1];
    for (let j = i + 1; j < count; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === count - 1)) continue;
      const c = ring[j];
      const d = ring[j + 1];
      if (segmentsIntersect(a, b, c, d)) return false;
    }
  }
  return true;
}

function ringArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function isValidPolygon(ring) {
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 512) return false;
  if (!ring.every(isBangladeshPoint)) return false;
  if (!samePoint(ring[0], ring[ring.length - 1])) return false;
  for (let index = 1; index < ring.length; index += 1) {
    if (samePoint(ring[index - 1], ring[index])) return false;
  }
  if (Math.abs(ringArea(ring)) < 1e-10) return false;
  return isSimpleRing(ring);
}

function assertValidPolygon(ring, label = 'boundary') {
  if (!isValidPolygon(ring)) {
    throw new ValidationError({
      message: `${label} must be a closed, non-self-intersecting ring inside Bangladesh.`,
      details: { bounds: BANGLADESH_BOUNDS },
    });
  }
  return ring;
}

function pointInPolygon(point, ring) {
  if (!isValidPolygon(ring)) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonIntersectsBbox(ring, bbox) {
  if (!isValidPolygon(ring)) return false;
  if (
    ring.some(
      ([lng, lat]) =>
        lng >= bbox.minLng && lng <= bbox.maxLng && lat >= bbox.minLat && lat <= bbox.maxLat,
    )
  ) {
    return true;
  }
  const corners = [
    [bbox.minLng, bbox.minLat],
    [bbox.maxLng, bbox.minLat],
    [bbox.maxLng, bbox.maxLat],
    [bbox.minLng, bbox.maxLat],
  ];
  return corners.some((corner) => pointInPolygon(corner, ring));
}

function haversineMeters(a, b) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371008.8;
  const dLat = toRadians(b[1] - a[1]);
  const dLng = toRadians(b[0] - a[0]);
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toHectares(value, unit) {
  const factor = AREA_TO_HECTARES[unit];
  if (factor === undefined) {
    throw new ValidationError({ message: `Unsupported area unit '${unit}'.` });
  }
  return Math.round(Number(value) * factor * 1000) / 1000;
}

function isValidAreaValue(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1e9;
}

module.exports = {
  AREA_UNITS,
  AREA_TO_HECTARES,
  BANGLADESH_BOUNDS,
  FARM_STATUSES,
  FARM_TYPES,
  IRRIGATION_METHODS,
  IRRIGATION_SOURCES,
  IRRIGATION_STATUSES,
  LAND_OWNERSHIP_TYPES,
  LAND_PARCEL_STATUSES,
  SOIL_FERTILITY_LEVELS,
  SOIL_TEXTURES,
  assertBangladeshPoint,
  assertValidPolygon,
  haversineMeters,
  isBangladeshPoint,
  isValidAreaValue,
  isValidPolygon,
  pointInPolygon,
  polygonIntersectsBbox,
  toHectares,
};
