# VoltOps

A self-hosted companion for a household with Tesla Solar and Powerwall. It observes the energy system, learns its patterns, and advises the owner what to do next.

## Language

### The system

**Site**:
One energy installation (solar, Powerwall and grid connection) at one address, with its own timezone. One owner may have several Sites.
_Avoid_: account, system, installation, home (when you mean the Site)

**Home use**:
The energy or power the household consumes, whatever its source.
_Avoid_: load (in the UI), consumption, demand

**Live reading**:
The instantaneous power flows and battery charge of a Site at one moment.
_Avoid_: current status, realtime data

### Time

**Site-local day**:
A calendar day in the Site's own timezone, from local midnight to the next. It may be 23, 24 or 25 hours long.
_Avoid_: day (unqualified), UTC day

**Timeline**:
The hourly record of a Site's energy across the whole of today and tomorrow (site-local days): actual hours up to now, then forecast hours.
_Avoid_: series, rows, chart data

### The dashboard

**Dashboard snapshot**:
Everything a data source supplies about a Site as of one moment: the Live reading, the Timeline, tariff, weather and history. Only facts the data source knows; nothing that can be computed from other parts.
_Avoid_: dashboard data, payload, DTO

**Dashboard view**:
What the dashboard shows, derived entirely from one Dashboard snapshot.
_Avoid_: view model, page data

### History

**Energy history**:
The long-term per-Site record of hourly energy (solar, home use, grid, battery) and observed weather, kept for years. It is used to track panel and battery degradation.
_Avoid_: archive, logs, raw samples
