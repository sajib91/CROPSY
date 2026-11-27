'use client';

import { chartColor, EmptyState } from '../ui';

const WIDTH = 600;
const HEIGHT = 360;
const PADDING = 28;
const TONES = ['brand', 'success', 'info', 'warning', 'danger'];

function coordinatePairs(value, output) {
  if (!Array.isArray(value) || value.length < 2) return output;
  const [lng, lat] = value;
  if (Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))) {
    output.push([Number(lng), Number(lat)]);
  }
  return output;
}

export function geometryCoordinates(geometry) {
  const points = [];
  if (!geometry || typeof geometry !== 'object') return points;
  const { type, coordinates } = geometry;

  if (type === 'Point') return coordinatePairs(coordinates, points);
  if (type === 'MultiPoint' || type === 'LineString') {
    for (const point of coordinates || []) coordinatePairs(point, points);
    return points;
  }
  if (type === 'MultiLineString' || type === 'Polygon') {
    for (const line of coordinates || []) {
      for (const point of line || []) coordinatePairs(point, points);
    }
    return points;
  }
  if (type === 'MultiPolygon') {
    for (const polygon of coordinates || []) {
      for (const line of polygon || []) {
        for (const point of line || []) coordinatePairs(point, points);
      }
    }
    return points;
  }
  if (type === 'GeometryCollection') {
    for (const child of geometry.geometries || []) points.push(...geometryCoordinates(child));
  }
  return points;
}

function boundsFor(points) {
  const lngs = points.map(([lng]) => lng);
  const lats = points.map(([, lat]) => lat);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  if (minLng === maxLng) {
    minLng -= 0.0005;
    maxLng += 0.0005;
  }
  if (minLat === maxLat) {
    minLat -= 0.0005;
    maxLat += 0.0005;
  }
  return { minLng, maxLng, minLat, maxLat };
}

function buildPaths(geometry, project) {
  if (!geometry || typeof geometry !== 'object') return [];

  const lineToPath = (line) =>
    (line || [])
      .map((point) => {
        const pair = coordinatePairs(point, [])[0];
        if (!pair) return null;
        const [x, y] = project(pair);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .filter(Boolean)
      .join(' ');

  if (geometry.type === 'Point') {
    const pair = coordinatePairs(geometry.coordinates, [])[0];
    return pair ? [{ type: 'point', points: [project(pair)] }] : [];
  }
  if (geometry.type === 'MultiPoint') {
    return [
      {
        type: 'points',
        points: (geometry.coordinates || [])
          .map((point) => {
            const pair = coordinatePairs(point, [])[0];
            return pair ? project(pair) : null;
          })
          .filter(Boolean),
      },
    ];
  }
  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
    const lines =
      geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates || [];
    return lines
      .map((line) => ({ type: 'line', points: lineToPath(line) }))
      .filter((path) => path.points);
  }
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    const polygons =
      geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates || [];
    return polygons
      .map((polygon) => ({ type: 'polygon', points: lineToPath(polygon?.[0]) }))
      .filter((path) => path.points);
  }
  if (geometry.type === 'GeometryCollection') {
    return (geometry.geometries || []).flatMap((child) => buildPaths(child, project));
  }
  return [];
}

export function FarmMap({ features = [], labels, title }) {
  const usable = features.filter((feature) => geometryCoordinates(feature?.geometry).length > 0);
  if (usable.length === 0) {
    return <EmptyState title={labels.noGeometry} description={labels.coordinatesNote} compact />;
  }

  const allPoints = usable.flatMap((feature) => geometryCoordinates(feature.geometry));
  const bounds = boundsFor(allPoints);
  const project = ([lng, lat]) => [
    PADDING + ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * (WIDTH - 2 * PADDING),
    PADDING +
      (1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * (HEIGHT - 2 * PADDING),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-card border border-line bg-surface-muted">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={title}
          className="h-auto w-full"
        >
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={`h-${ratio}`}
              x1={PADDING}
              x2={WIDTH - PADDING}
              y1={HEIGHT * ratio}
              y2={HEIGHT * ratio}
              stroke="rgb(var(--cropsy-border))"
              strokeWidth="1"
            />
          ))}
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={`v-${ratio}`}
              y1={PADDING}
              y2={HEIGHT - PADDING}
              x1={WIDTH * ratio}
              x2={WIDTH * ratio}
              stroke="rgb(var(--cropsy-border))"
              strokeWidth="1"
            />
          ))}
          {usable.map((feature, index) => {
            const tone = chartColor(TONES[index % TONES.length]);
            const paths = buildPaths(feature.geometry, project);
            return (
              <g key={feature.id || index}>
                <title>{feature.properties?.name || feature.id || title}</title>
                {paths.map((path, pathIndex) =>
                  path.type === 'point' || path.type === 'points' ? (
                    path.points.map(([x, y], pointIndex) => (
                      <circle
                        key={`${pathIndex}-${pointIndex}`}
                        cx={x}
                        cy={y}
                        r="7"
                        fill={tone}
                        stroke="rgb(var(--cropsy-surface))"
                        strokeWidth="3"
                      />
                    ))
                  ) : path.type === 'polygon' ? (
                    <polygon
                      key={pathIndex}
                      points={path.points}
                      fill={tone}
                      fillOpacity="0.18"
                      stroke={tone}
                      strokeWidth="3"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <polyline
                      key={pathIndex}
                      points={path.points}
                      fill="none"
                      stroke={tone}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ),
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {usable.map((feature, index) => {
          const points = geometryCoordinates(feature.geometry);
          const [lng, lat] = points[0] || [];
          return (
            <li
              key={feature.id || index}
              className="rounded-control border border-line bg-surface p-3 text-body-sm"
            >
              <p className="font-semibold text-content">
                {feature.properties?.name || feature.id || labels.notProvided}
              </p>
              <p className="mt-1 text-caption text-content-muted">
                {feature.properties?.geometryType || feature.geometry?.type}
                {Number.isFinite(lng) && Number.isFinite(lat)
                  ? ` · ${lat.toFixed(5)}, ${lng.toFixed(5)}`
                  : ''}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
