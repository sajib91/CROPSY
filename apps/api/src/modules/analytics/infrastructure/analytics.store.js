/**
 * Empty-by-default report adapter for local development and tests. Tests may
 * inject historical rows through `rowsByReport`; the service still computes
 * every aggregate and projection from those rows.
 */
class AnalyticsInMemoryStore {
  constructor({ rowsByReport = {} } = {}) {
    this.rowsByReport = rowsByReport;
  }

  async readReport({ report, organizationId, actorUserId, query } = {}) {
    const rows = Array.isArray(this.rowsByReport[report]) ? this.rowsByReport[report] : [];
    return rows
      .filter((row) => {
        if (organizationId && row.organizationId && row.organizationId !== organizationId) {
          return false;
        }
        if (actorUserId && row.actorUserId && row.actorUserId !== actorUserId) {
          return false;
        }
        const timestamp = row.period_start || row.period;
        if (!timestamp) return true;
        const value = new Date(timestamp);
        if (Number.isNaN(value.getTime())) return false;
        if (query?.from && value < new Date(query.from)) return false;
        if (query?.to && value > new Date(query.to)) return false;
        return true;
      })
      .slice(0, query?.limit || rows.length)
      .map((row) => ({ ...row }));
  }
}

module.exports = { AnalyticsInMemoryStore };
