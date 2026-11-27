import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { cn } from './cn';

const chartColors = {
  brand: 'rgb(var(--cropsy-brand-500))',
  success: 'rgb(var(--cropsy-success))',
  warning: 'rgb(var(--cropsy-warning))',
  danger: 'rgb(var(--cropsy-danger))',
  info: 'rgb(var(--cropsy-info))',
  neutral: 'rgb(var(--cropsy-content-subtle))',
};

export function chartColor(tone = 'brand') {
  return chartColors[tone] ?? chartColors.brand;
}

export function ChartCard({ title, description, children, footer, className }) {
  return (
    <Card className={className}>
      <CardHeader className="border-none pb-2">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer ? <div className="border-t border-line p-card">{footer}</div> : null}
    </Card>
  );
}

export function ChartTable({ label, data, valueFormatter }) {
  return (
    <table className="sr-only">
      <caption>{label}</caption>
      <thead>
        <tr>
          <th scope="col">Category</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item, index) => (
          <tr key={`${item.label}-${index}`}>
            <th scope="row">{item.label}</th>
            <td>{valueFormatter(item.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BarChart({
  label = 'Bar chart',
  data = [],
  tone = 'brand',
  valueFormatter = String,
  className,
}) {
  if (data.length === 0) {
    return <p className="text-body-sm text-content-muted">No chart data available.</p>;
  }

  const max = Math.max(...data.map((item) => Math.max(0, Number(item.value) || 0)), 1);
  const summary = data.map((item) => `${item.label}: ${valueFormatter(item.value)}`).join(', ');

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div role="img" aria-label={`${label}. ${summary}`} className="flex h-48 items-stretch gap-3">
        {data.map((item, index) => {
          const value = Math.max(0, Number(item.value) || 0);
          const height = Math.max(3, (value / max) * 100);
          return (
            <div
              key={`${item.label}-${index}`}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <div className="flex h-full w-full items-end">
                <div
                  className="w-full rounded-t-xs transition-[height]"
                  style={{ height: `${height}%`, backgroundColor: chartColor(item.tone ?? tone) }}
                />
              </div>
              <span className="w-full truncate text-center text-caption text-content-muted">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
      <ChartTable label={label} data={data} valueFormatter={valueFormatter} />
    </div>
  );
}

export function LineChart({
  label = 'Line chart',
  data = [],
  tone = 'brand',
  valueFormatter = String,
  className,
}) {
  if (data.length === 0) {
    return <p className="text-body-sm text-content-muted">No chart data available.</p>;
  }

  const width = 600;
  const height = 180;
  const padding = 12;
  const values = data.map((item) => Number(item.value) || 0);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;

  const points = values
    .map((value, index) => {
      const x =
        values.length === 1
          ? width / 2
          : padding + (index / (values.length - 1)) * (width - 2 * padding);
      const y =
        high === low ? height / 2 : padding + (1 - (value - low) / span) * (height - 2 * padding);
      return `${x},${y}`;
    })
    .join(' ');

  const firstX = values.length === 1 ? width / 2 : padding;
  const lastX = values.length === 1 ? width / 2 : width - padding;
  const areaPoints = `${firstX},${height - padding} ${points} ${lastX},${height - padding}`;
  const summary = data.map((item) => `${item.label}: ${valueFormatter(item.value)}`).join(', ');

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div role="img" aria-label={`${label}. ${summary}`} className="w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-48 w-full"
          aria-hidden="true"
          focusable="false"
        >
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={padding}
              x2={width - padding}
              y1={height * ratio}
              y2={height * ratio}
              stroke="rgb(var(--cropsy-border))"
              strokeWidth="1"
            />
          ))}
          <polygon points={areaPoints} fill={chartColor(tone)} fillOpacity="0.12" />
          <polyline
            points={points}
            fill="none"
            stroke={chartColor(tone)}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="mt-1 flex justify-between gap-2 text-caption text-content-muted">
          {data.map((item, index) => (
            <span key={`${item.label}-${index}`} className="truncate">
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <ChartTable label={label} data={data} valueFormatter={valueFormatter} />
    </div>
  );
}

export function DonutChart({
  label = 'Donut chart',
  data = [],
  centerLabel = 'Total',
  valueFormatter = String,
  className,
}) {
  if (data.length === 0) {
    return <p className="text-body-sm text-content-muted">No chart data available.</p>;
  }

  const total = data.reduce((sum, item) => sum + Math.max(0, Number(item.value) || 0), 0);
  let cumulative = 0;
  const segments = data.map((item, index) => {
    const value = Math.max(0, Number(item.value) || 0);
    const percentage = total > 0 ? (value / total) * 100 : 0;
    const offset = cumulative;
    cumulative += percentage;
    return { ...item, percentage, offset, key: `${item.label}-${index}` };
  });
  const summary = data.map((item) => `${item.label}: ${valueFormatter(item.value)}`).join(', ');

  return (
    <div className={cn('flex flex-wrap items-center gap-6', className)}>
      <div role="img" aria-label={`${label}. ${summary}`} className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 42 42" className="h-full w-full" aria-hidden="true" focusable="false">
          <circle
            cx="21"
            cy="21"
            r="15.9155"
            fill="none"
            stroke="rgb(var(--cropsy-surface-muted))"
            strokeWidth="6"
          />
          <g transform="rotate(-90 21 21)">
            {segments.map((segment) => (
              <circle
                key={segment.key}
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                stroke={chartColor(segment.tone)}
                strokeWidth="6"
                pathLength="100"
                strokeDasharray={`${segment.percentage} ${100 - segment.percentage}`}
                strokeDashoffset={-segment.offset}
              />
            ))}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-caption text-content-muted">{centerLabel}</span>
          <span className="text-subheading font-bold text-content">{valueFormatter(total)}</span>
        </div>
      </div>
      <ul className="flex min-w-40 flex-1 flex-col gap-2">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center justify-between gap-3 text-body-sm">
            <span className="flex items-center gap-2 text-content-muted">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-pill"
                style={{ backgroundColor: chartColor(segment.tone) }}
              />
              {segment.label}
            </span>
            <span className="font-semibold text-content">{valueFormatter(segment.value)}</span>
          </li>
        ))}
      </ul>
      <ChartTable label={label} data={data} valueFormatter={valueFormatter} />
    </div>
  );
}
