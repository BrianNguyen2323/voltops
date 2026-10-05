# 0001: No hourly rollup table

## Context
CLAUDE.md section 6 lists an `energy_hourly` rollup table.

## Decision
Compute hourly figures with SQL `GROUP BY` over the 5-minute interval rows instead of storing a rollup table.

## Consequences
Less schema and no rollup job to keep consistent. Add the table only if a query is measurably slow.
