import {
  CloudAngledRainIcon,
  CloudIcon,
  Sun03Icon,
  SunCloud01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { logoutAction } from "~/app/login/actions";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import type { DashboardView, TouPeriod } from "~/lib/dashboard";
import { formatKw, formatKwh, formatMoney, formatTemp } from "~/lib/format";
import { cn } from "~/lib/utils";

import { TimelineChart, WeekChart } from "./charts";
import { costNow } from "./cost-now";
import { FlowDiagram } from "./flow-diagram";
import { InfoPopover } from "./info-popover";
import {
  batteryCapacityStatus,
  batteryInfo,
  bestHourPerPanelW,
  dateLabel,
  efficiencyStatus,
  monthLabel,
  solarInfo,
  solarStatus,
  systemSizeW,
  type HealthStatus,
} from "./system";
import { clock, confidenceInfo, reserveSteps } from "./tonight";

const PERIOD: Record<TouPeriod, string> = {
  "off-peak": "Off-peak",
  "mid-peak": "Mid-peak",
  peak: "Peak",
};
const WEATHER = {
  clear: { label: "Sunny", icon: Sun03Icon },
  "partly-cloudy": { label: "Partly cloudy", icon: SunCloud01Icon },
  cloudy: { label: "Cloudy", icon: CloudIcon },
  rain: { label: "Rain", icon: CloudAngledRainIcon },
};
const SOURCE = {
  "fleet-api": "Tesla Fleet API",
  "local-gateway": "Local gateway",
  replay: "Replay data",
};

const CHIP: Record<HealthStatus, [string, string]> = {
  ok: ["OK", "bg-secondary text-secondary-foreground"],
  watch: ["Watch", "bg-solar/15 text-solar"],
  check: ["Check", "bg-destructive/10 text-destructive"],
  learning: ["Learning", "border-border text-foreground"],
};
const Chip = ({ status }: { status: HealthStatus }) => (
  <Badge className={CHIP[status][1]}>{CHIP[status][0]}</Badge>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-xl font-semibold">{children}</h2>
);

// A label with its value, used by the strip panels.
const Row = ({
  label,
  value,
  dot,
}: {
  label: string;
  value: string;
  dot?: string;
}) => (
  <div className="flex items-baseline justify-between gap-4 py-1">
    <dt className="text-muted-foreground flex items-center gap-2">
      {dot && <span aria-hidden className={cn("size-2 rounded-full", dot)} />}
      {label}
    </dt>
    <dd className="reading text-base">{value}</dd>
  </div>
);

export function Dashboard({
  view,
  connected,
  isSample,
  showLogout,
}: {
  view: DashboardView;
  connected: boolean;
  isSample: boolean;
  showLogout: boolean;
}) {
  const {
    site,
    live,
    tariffNow,
    recommendation: rec,
    today,
    costToday,
    currency,
    health,
    solarOutlook,
  } = view;
  const tz = site.timezone;
  const sys = view.system;
  const eq = view.equipmentHealth;
  // Battery chip: the worse of capacity and efficiency.
  const ranked: HealthStatus[] = ["learning", "ok", "watch", "check"];
  const capStatus =
    ranked[
      Math.max(
        ...[
          sys
            ? batteryCapacityStatus(eq, sys.batteries.capacityWh)
            : "learning",
          efficiencyStatus(eq),
        ].map((x) => ranked.indexOf(x)),
      )
    ]!;
  const solStatus = solarStatus(eq);
  const batteryHelp = sys && batteryInfo(eq, sys.batteries.capacityWh);
  const solarHelp = solarInfo(eq);
  const sizeW = sys && systemSizeW(sys.solar);
  const perPanelW = sys && bestHourPerPanelW(sys.solar);
  const peakDay = view.peakUsage.today ?? view.peakUsage.tomorrow;
  const info = confidenceInfo(view);
  const weather = view.weatherTomorrow;
  const money = (c: number) => formatMoney(c, currency);
  const imp = tariffNow.importCentsPerKwh;
  const cost = costNow(live, tariffNow);
  const bought = Math.max(live.gridW, 0);
  // Only non-zero items: [label, cents per hour, plain explanation, colour].
  const homeCost: Array<[string, number, string, string]> = [
    ...(cost.spendingCentsPerHour
      ? [
          [
            "Spending",
            cost.spendingCentsPerHour,
            `Buying ${formatKw(live.gridW)} from the grid at ${money(imp)}/kWh`,
            "text-grid-import",
          ] as [string, number, string, string],
        ]
      : []),
    ...(cost.savingCentsPerHour
      ? [
          [
            "Saving",
            cost.savingCentsPerHour,
            `Solar and battery cover ${formatKw(live.loadW - bought)} of home use, so you're not buying it at ${money(imp)}/kWh`,
            "",
          ] as [string, number, string, string],
        ]
      : []),
    ...(cost.earningCentsPerHour
      ? [
          [
            "Earning",
            cost.earningCentsPerHour,
            `Selling ${formatKw(live.gridW)} to the grid at ${money(tariffNow.exportCentsPerKwh)}/kWh`,
            "",
          ] as [string, number, string, string],
        ]
      : []),
  ];
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-3xl font-bold">{site.name}</h1>
        {isSample && <Badge variant="secondary">Sample data</Badge>}
        <p className="text-muted-foreground text-sm">
          Updated {clock(view.updatedAt, tz)}
        </p>
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
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <h3 className="text-muted-foreground text-sm font-medium">
                Grid price now
              </h3>
              <p className="mt-1">
                <span className="reading text-2xl">{money(imp)}</span>
                <span className="text-muted-foreground">/kWh</span>
              </p>
              <p className="text-muted-foreground text-sm">
                {PERIOD[tariffNow.period]} rate until{" "}
                {clock(tariffNow.endsAt, tz)}
              </p>
            </div>
            <div>
              <h3 className="text-muted-foreground text-sm font-medium">
                Your home now
              </h3>
              <ul className="mt-1 flex flex-col gap-2">
                {homeCost.map(([label, amount, text, tone]) => (
                  <li key={text}>
                    <span
                      className={cn(
                        "mr-1.5 text-sm font-medium",
                        label === "Spending"
                          ? "text-grid-import"
                          : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </span>
                    <span className={cn("reading text-lg", tone)}>
                      {money(amount)}
                    </span>
                    <span className="text-muted-foreground">/hour</span>
                    <p className="text-muted-foreground text-sm">{text}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-muted-foreground text-sm font-medium">
                Peak hours
              </h3>
              {view.peakUsage.learning ? (
                <p className="mt-1">
                  Learning your usage: {view.peakUsage.historyDays} of 7 days
                </p>
              ) : (
                <ul className="mt-1 flex flex-col gap-3">
                  {(
                    [
                      ["Today", view.peakUsage.today],
                      ["Tomorrow", view.peakUsage.tomorrow],
                    ] as const
                  ).map(([label, day]) => (
                    <li key={label}>
                      {day ? (
                        <>
                          <p>
                            <span className="mr-1.5 text-sm font-medium">
                              {label}
                            </span>
                            <span className="text-muted-foreground text-sm">
                              {clock(day.windowStart, tz)}–
                              {clock(day.windowEnd, tz)}
                            </span>
                          </p>
                          <p>
                            <span className="reading text-lg">
                              {formatKwh(day.estimateWh)}
                            </span>{" "}
                            <span className="text-muted-foreground">
                              expected
                            </span>
                          </p>
                          {day.usedSoFarWh !== null && (
                            <p className="text-muted-foreground">
                              {formatKwh(day.usedSoFarWh)} used so far
                            </p>
                          )}
                          <p className="text-muted-foreground text-sm">
                            {`Usual ${formatKwh(day.historyAvgWh)} (${view.peakUsage.historyDays} days). `}
                            {day.similarTempAvgWh === null
                              ? `Not enough days near ${formatTemp(day.highC, site.temperatureUnit)} yet.`
                              : `On days near ${formatTemp(day.highC, site.temperatureUnit)}: ${formatKwh(day.similarTempAvgWh)} (${day.similarTempDays} days).`}
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">
                          {label}: no peak hours
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <H2>Tonight</H2>
          <Card>
            <CardContent className="flex flex-col gap-4">
              {rec ? (
                <>
                  {rec.reserve ? (
                    <>
                      <p className="text-2xl leading-tight font-bold">
                        Raise your backup reserve to {rec.reserve.targetPct}%.
                      </p>
                      <p>
                        With {rec.reserve.emergencyPct}% as reserve for
                        emergencies, an additional {rec.reserve.extraPct}% will
                        help you save{" "}
                        <span className="reading text-foreground">
                          {money(rec.savingsCents)}
                        </span>{" "}
                        for tomorrow&apos;s estimated{" "}
                        {formatKwh(rec.reserve.peakWh)} usage during peak hours.
                        {rec.reserve.targetPct === 100 &&
                          rec.reserve.coveredWh < rec.reserve.peakWh &&
                          ` That covers about ${formatKwh(rec.reserve.coveredWh)} of it.`}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {reserveSteps(view).map((s) => (
                          <span key={s.lead} className="block">
                            <span className="text-foreground font-medium">
                              {s.lead}
                            </span>
                            {s.rest}
                          </span>
                        ))}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl leading-tight font-bold">
                        {rec.action}
                      </p>
                      <p className="text-muted-foreground">
                        From {clock(rec.validFrom, tz)} until{" "}
                        {clock(rec.validTo, tz)}. Stores{" "}
                        {formatKwh(rec.effectWh)} more and saves about{" "}
                        <span className="reading text-foreground">
                          {money(rec.savingsCents)}
                        </span>
                        .
                      </p>
                    </>
                  )}
                  <ul className="flex list-disc flex-col gap-1 pl-5">
                    {rec.why.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <p className="text-sm">
                    <span className="capitalize">{rec.confidence}</span>{" "}
                    confidence.{" "}
                    {info ? (
                      <>
                        {rec.wouldChange.slice(
                          0,
                          rec.wouldChange.lastIndexOf(" ") + 1,
                        )}
                        <span className="whitespace-nowrap">
                          {rec.wouldChange.slice(
                            rec.wouldChange.lastIndexOf(" ") + 1,
                          )}
                          <InfoPopover sections={info} />
                        </span>
                      </>
                    ) : (
                      rec.wouldChange
                    )}
                  </p>
                </>
              ) : (
                <p>No changes needed tonight.</p>
              )}
              {weather && (
                <div className="bg-muted flex flex-col gap-3 rounded-md p-4">
                  <div className="flex items-center gap-3">
                    <HugeiconsIcon
                      icon={WEATHER[weather.condition].icon}
                      size={32}
                      className="text-solar shrink-0"
                    />
                    <div>
                      <h3 className="font-semibold">Tomorrow</h3>
                      <p className="text-muted-foreground text-sm">
                        {WEATHER[weather.condition].label},{" "}
                        {formatTemp(weather.highC, site.temperatureUnit)} high,{" "}
                        {formatTemp(weather.lowC, site.temperatureUnit)} low
                      </p>
                    </div>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {weather.cloudCoverPct}% cloud cover,{" "}
                    {weather.precipitationChancePct}% chance of rain
                  </p>
                  <p>
                    Expect{" "}
                    <span className="reading text-solar">
                      {formatKwh(solarOutlook.tomorrowWh)}
                    </span>{" "}
                    of solar, {solarOutlook.changePct}% {solarOutlook.direction}{" "}
                    sun than today.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <H2>Today and tomorrow</H2>
        <TimelineChart timeline={view.timeline} timezone={tz} />
      </section>

      <div className="bg-border [&>section]:bg-background grid gap-px overflow-hidden rounded-lg md:grid-cols-2 lg:grid-cols-4 [&>section]:p-4">
        <section>
          <H2>Today so far</H2>
          <dl className="mt-2">
            <Row
              label="Solar"
              value={formatKwh(today.solarWh)}
              dot="bg-solar"
            />
            <Row label="Home" value={formatKwh(today.loadWh)} dot="bg-home" />
            <Row
              label="Grid import"
              value={formatKwh(today.gridImportWh)}
              dot="bg-grid-import"
            />
            <Row
              label="Grid export"
              value={formatKwh(today.gridExportWh)}
              dot="bg-grid-export"
            />
            <Row
              label="Battery charged"
              value={formatKwh(today.batteryChargeWh)}
              dot="bg-battery"
            />
            <Row
              label="Battery discharged"
              value={formatKwh(today.batteryDischargeWh)}
              dot="bg-battery"
            />
          </dl>
          <p className="reading mt-3 text-4xl">{today.selfPoweredPct}%</p>
          <p className="text-muted-foreground text-sm">
            of your home use was self-powered
          </p>
        </section>

        <section>
          <H2>Cost today</H2>
          <dl className="mt-2">
            {costToday.periods.map((p) => (
              <Row
                key={p.period}
                label={`${PERIOD[p.period]} imports`}
                value={money(p.costCents)}
              />
            ))}
            <Row
              label="Export credit"
              value={money(costToday.exportCreditCents)}
            />
          </dl>
          <p className="reading mt-3 text-4xl">
            {money(Math.abs(costToday.netCents))}
          </p>
          <p className="text-muted-foreground text-sm">
            {costToday.netCents < 0 ? "Credit earned" : "Net cost"} so far today
          </p>
        </section>

        <section>
          <H2>Last 7 days</H2>
          <div className="mt-2">
            <WeekChart days={view.last7Days} />
          </div>
        </section>

        <section>
          <H2>Forecast accuracy</H2>
          <ul className="mt-2 flex flex-col gap-3">
            {view.accuracy.map((a) => (
              <li key={a.target}>
                <p className="font-medium capitalize">{a.target}</p>
                <p>
                  <span className="reading text-2xl">{a.maePct}%</span> error,
                  against <span className="reading">{a.baselineMaePct}%</span>{" "}
                  for {a.baseline}
                </p>
                <p className="text-muted-foreground text-sm">
                  Measured over {a.days} days
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="flex flex-col gap-4">
        <H2>Your system</H2>
        {sys ? (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardContent className="flex flex-col gap-2">
                  <h3 className="font-semibold">
                    {`${sys.batteries.count} ${sys.batteries.count === 1 ? "battery" : "batteries"}${sys.batteries.model ? ` · ${sys.batteries.model}` : ""}`}
                  </h3>
                  <p>
                    Stores{" "}
                    <span className="reading">
                      {formatKwh(sys.batteries.capacityWh)}
                    </span>
                  </p>
                  {sys.batteries.maxPowerW !== null && (
                    <p>
                      Up to{" "}
                      <span className="reading">
                        {formatKw(sys.batteries.maxPowerW)}
                      </span>
                    </p>
                  )}
                  {sys.batteries.backupReservePct !== null && (
                    <p>
                      Backup reserve{" "}
                      <span className="reading">
                        {sys.batteries.backupReservePct}%
                      </span>
                    </p>
                  )}
                  <div className="text-sm">
                    <Chip status={capStatus} />
                    {eq.batteryCapacity ? (
                      <p>
                        {`Est. capacity ${formatKwh(eq.batteryCapacity.estimatedWh)} (${Math.round((100 * eq.batteryCapacity.estimatedWh) / sys.batteries.capacityWh)}% of ${formatKwh(sys.batteries.capacityWh)})`}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        Learning: needs a few weeks of charge cycles.
                      </p>
                    )}
                    {eq.efficiency && (
                      <p>{`Round-trip efficiency ${eq.efficiency.pct}%`}</p>
                    )}
                    {batteryHelp && (
                      <InfoPopover
                        label="About battery health"
                        sections={batteryHelp}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex flex-col gap-2">
                  <h3 className="font-semibold">Solar</h3>
                  {sizeW !== null ? (
                    <p>
                      <span className="reading">{`${sys.solar.panelCount} panels × ${sys.solar.panelWatts} W`}</span>{" "}
                      = <span className="reading">{formatKw(sizeW)}</span>{" "}
                      system
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      Panel details not set. Add <code>SITE_PANEL_COUNT</code>{" "}
                      and <code>SITE_PANEL_WATTS</code> to your{" "}
                      <code>.env</code>.
                    </p>
                  )}
                  {sys.solar.bestHourWh !== null && sys.solar.bestHourAt && (
                    <p>
                      Best hour so far{" "}
                      <span className="reading">
                        {formatKwh(sys.solar.bestHourWh)}
                      </span>{" "}
                      ({dateLabel(sys.solar.bestHourAt, tz)})
                      {perPanelW !== null && ` ≈ ${perPanelW} W per panel`}
                    </p>
                  )}
                  <div className="text-sm">
                    <Chip status={solStatus} />
                    {eq.solarClearDay ? (
                      <p>{`Clear-day output ${eq.solarClearDay.pctOfBaseline}% of ${monthLabel(eq.solarClearDay.baselineMonth)}`}</p>
                    ) : (
                      <p className="text-muted-foreground">
                        {eq.backfill.state === "running"
                          ? `Loading past data: ${eq.backfill.daysDone} of ${eq.backfill.daysTotal} days`
                          : "Learning: needs a year of history"}
                      </p>
                    )}
                    {eq.sunnyDayMiss && (
                      <p>
                        {`${dateLabel(eq.sunnyDayMiss.date, tz)}: ${formatKwh(eq.sunnyDayMiss.actualWh)} on a clear day, expected ${formatKwh(eq.sunnyDayMiss.expectedWh)}.`}
                      </p>
                    )}
                    {solarHelp && (
                      <InfoPopover
                        label="About solar health"
                        sections={solarHelp}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex flex-col gap-2">
                  <h3 className="font-semibold">Plan</h3>
                  {sys.plan.utility && <p>{sys.plan.utility}</p>}
                  {sys.plan.name && (
                    <p className="text-muted-foreground">{sys.plan.name}</p>
                  )}
                  {peakDay && (
                    <p>
                      Peak hours {clock(peakDay.windowStart, tz)}–
                      {clock(peakDay.windowEnd, tz)}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
            <div className="text-muted-foreground flex flex-col gap-1 text-sm">
              <p>
                {[
                  sys.firmware && `Firmware ${sys.firmware}`,
                  sys.installedOn &&
                    `Installed ${dateLabel(sys.installedOn, tz)}`,
                  `Source ${SOURCE[view.source]}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {sys.changes.length > 0 && (
                <ul>
                  {sys.changes.map((c) => (
                    <li key={c.at}>{`${dateLabel(c.at, tz)}: ${c.text}`}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">
            System details not available yet.
          </p>
        )}
      </section>
      <footer className="text-muted-foreground flex flex-col gap-1 text-sm">
        <p>
          Source: {SOURCE[view.source]}. Last poll{" "}
          {clock(health.lastPollAt, tz)}. ~
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
