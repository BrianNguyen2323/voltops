// Extra landing page features and components

// ─── Stats ────────────────────────────────────────────────────────────────────

const stats = [
  { value: "99.9%", label: "Uptime SLA" },
  { value: "< 50ms", label: "Avg. Response Time" },
  { value: "500+", label: "Teams Using VoltOps" },
  { value: "10M+", label: "Operations Processed" },
];

function Stats() {
  return (
    <section className="border-border bg-surface border-y">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-primary text-3xl font-bold">{stat.value}</p>
              <p className="text-muted mt-1 text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// <Stats />
