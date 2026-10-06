import type { DashboardData, TouPeriod } from "~/app/(protected)/home/data";
import { logoutAction } from "~/app/login/actions";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { formatKwh, formatMoney } from "~/lib/format";
import { cn } from "~/lib/utils";

import { TimelineChart, WeekChart } from "./charts";
import { FlowDiagram } from "./flow-diagram";

const PERIOD: Record<TouPeriod, string> = { "off-peak": "Off-peak", "mid-peak": "Mid-peak", peak: "Peak" };
const SOURCE = { "fleet-api": "Tesla Fleet API", "local-gateway": "Local gateway", replay: "Replay data" };

const clock = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(Date.parse(iso));

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-xl font-semibold">{children}</h2>
);

// A label with its value, used by the strip panels.
const Row = ({ label, value, dot }: { label: string; value: string; dot?: string }) => (
  <div className="flex items-baseline justify-between gap-4 py-1">
    <dt className="text-muted-foreground flex items-center gap-2">
      {dot && <span aria-hidden className={cn("size-2 rounded-full", dot)} />}
      {label}
    </dt>
    <dd className="reading text-base">{value}</dd>
  </div>
);

export function Dashboard({
  data,
  connected,
  isSample,
  showLogout,
}: {
  data: DashboardData;
  connected: boolean;
  isSample: boolean;
  showLogout: boolean;
}) {
  const { site, live, tariffNow, recommendation: rec, today, costToday, currency, health } = data;
  const tz = site.timezone;
  const money = (c: number) => formatMoney(c, currency);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-3xl font-bold">{site.name}</h1>
        {isSample && <Badge variant="secondary">Sample data</Badge>}
        <p className="text-muted-foreground text-sm">Updated {clock(data.updatedAt, tz)}</p>
        {showLogout && (
          <form action={logoutAction} className="ml-auto">
            <Button type="submit" variant="ghost" size="sm">
              Log out
            </Button>
          </form>
        )}
      </header>

      {!connected && (
        <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3">
          <p>Connect your Tesla account to see your own system</p>
          <a href="/api/auth/tesla" className={buttonVariants()}>
            Connect Tesla
          </a>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="flex flex-col gap-4 lg:col-span-2">
          <H2>Right now</H2>
          <FlowDiagram live={live} />
          <p className="flex flex-wrap items-center justify-center gap-x-2 text-sm">
            <Badge variant="outline">{PERIOD[tariffNow.period]}</Badge>
            <span>
              <span className="reading">{money(tariffNow.importCentsPerKwh)}</span>/kWh to import, until{" "}
              {clock(tariffNow.endsAt, tz)}
            </span>
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <H2>Tonight</H2>
          <Card>
            <CardContent className="flex flex-col gap-4">
              {rec ? (
                <>
                  <p className="text-2xl leading-tight font-bold">{rec.action}</p>
                  <p className="text-muted-foreground">
                    From {clock(rec.validFrom, tz)} until {clock(rec.validTo, tz)}. Stores {formatKwh(rec.effectWh)}{" "}
                    more and saves about <span className="reading text-foreground">{money(rec.savingsCents)}</span>.
                  </p>
                  <ul className="flex list-disc flex-col gap-1 pl-5">
                    {rec.why.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <p className="text-sm">
                    <span className="capitalize">{rec.confidence}</span> confidence. {rec.wouldChange}
                  </p>
                </>
              ) : (
                <p>No changes needed tonight.</p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <H2>Today and tomorrow</H2>
        <TimelineChart timeline={data.timeline} timezone={tz} />
      </section>

      <div className="bg-border grid gap-px overflow-hidden rounded-lg md:grid-cols-2 lg:grid-cols-4 [&>section]:bg-background [&>section]:p-4">
        <section>
          <H2>Today so far</H2>
          <dl className="mt-2">
            <Row label="Solar" value={formatKwh(today.solarWh)} dot="bg-solar" />
            <Row label="Home" value={formatKwh(today.loadWh)} dot="bg-home" />
            <Row label="Grid import" value={formatKwh(today.gridImportWh)} dot="bg-grid-import" />
            <Row label="Grid export" value={formatKwh(today.gridExportWh)} dot="bg-grid-export" />
            <Row label="Battery charged" value={formatKwh(today.batteryChargeWh)} dot="bg-battery" />
            <Row label="Battery discharged" value={formatKwh(today.batteryDischargeWh)} dot="bg-battery" />
          </dl>
          <p className="reading mt-3 text-4xl">{today.selfPoweredPct}%</p>
          <p className="text-muted-foreground text-sm">of your home use was self-powered</p>
        </section>

        <section>
          <H2>Cost today</H2>
          <dl className="mt-2">
            {costToday.periods.map((p) => (
              <Row key={p.period} label={`${PERIOD[p.period]} imports`} value={money(p.costCents)} />
            ))}
            <Row label="Export credit" value={money(costToday.exportCreditCents)} />
          </dl>
          <p className="reading mt-3 text-4xl">{money(costToday.netCents)}</p>
          <p className="text-muted-foreground text-sm">net so far today</p>
        </section>

        <section>
          <H2>Last 7 days</H2>
          <div className="mt-2">
            <WeekChart days={data.last7Days} />
          </div>
        </section>

        <section>
          <H2>Forecast accuracy</H2>
          <ul className="mt-2 flex flex-col gap-3">
            {data.accuracy.map((a) => (
              <li key={a.target}>
                <p className="font-medium capitalize">{a.target}</p>
                <p>
                  <span className="reading text-2xl">{a.maePct}%</span> error, against{" "}
                  <span className="reading">{a.baselineMaePct}%</span> for {a.baseline}
                </p>
                <p className="text-muted-foreground text-sm">Measured over {a.days} days</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="text-muted-foreground flex flex-col gap-1 text-sm">
        <p>
          Source: {SOURCE[data.source]}. Last poll {clock(health.lastPollAt, tz)}. ~
          {health.estRequestsPerMonth.toLocaleString("en-US")} requests/month.
        </p>
        {health.warnings.map((w) => (
          <p key={w} className="text-destructive">
            {w}
          </p>
        ))}
      </footer>
    </main>
  );
}
