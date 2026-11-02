export interface WeeklyReportMetric {
  label: string;
  value: string;
  detail: string;
}

export interface WeeklyReportData {
  period: string;
  updatedDate: string;
  summary: string;
  metrics: WeeklyReportMetric[];
  simulated?: boolean;
}

export function WeeklyReportSection({ report }: { report: WeeklyReportData }) {
  return (
    <section className="weekly-report" aria-labelledby="weekly-report-title">
      <div className="weekly-report-heading">
        <div>
          <p className="weekly-report-period">{report.period}</p>
          <h2 id="weekly-report-title">Weekly Office Report</h2>
        </div>
        {report.simulated && (
          <span className="weekly-report-simulated">Simulated preview</span>
        )}
      </div>

      <p className="weekly-report-summary">{report.summary}</p>

      <dl className="weekly-report-metrics">
        {report.metrics.map((metric) => (
          <div className="weekly-report-metric" key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            <p>{metric.detail}</p>
          </div>
        ))}
      </dl>

      <footer className="weekly-report-footer">
        <span>Updated {report.updatedDate}</span>
        {report.simulated && <span>Sample figures only. No case details shown.</span>}
      </footer>
    </section>
  );
}
