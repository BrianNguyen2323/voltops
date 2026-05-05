import type { Metadata } from "next";

export const metadata: Metadata = {
  // title: "VoltOps — Operations Platform Built for Speed",
  title: "VoltOps - Tesla Powerwall Manager Built for Efficiency",
  description:
    "Monitor your solar. Automate Powerwall reserves. Plan ahead to keep utility bills low.",
};

// ─── Shared Components ────────────────────────────────────────────────────────

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 13 22"
      fill="currentColor"
    >
      <path d="M9 0L0 13h7L4 22l10-13H7L9 0z" />
    </svg>
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <span
      className={`text-foreground inline-flex items-center font-bold tracking-tight ${className ?? ""}`}
    >
      Vol
      <BoltIcon className="text-primary h-[0.82em] w-auto" />
      Ops
    </span>
  );
}

function CheckIcon() {
  return (
    <svg
      className="text-primary h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

const navLinks = ["Features", "Pricing", "Docs", "Blog"];

function Navbar() {
  return (
    <header className="border-border bg-background/80 fixed top-0 right-0 left-0 z-50 border-b backdrop-blur-md">
      <nav className="max-w-8xl mx-auto flex items-center justify-between px-6 py-4">
        <Logo className="text-2xl" />
        <ul className="hidden items-center gap-12 md:flex">
          {navLinks.map((link) => (
            <li key={link}>
              <a
                href="#"
                className="text-muted hover:text-foreground text-sm transition-colors"
              >
                {link}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <a
            href="#"
            className="text-muted hover:text-foreground text-sm transition-colors"
          >
            Sign In
          </a>
          <a
            href="#"
            className="bg-primary rounded-lg px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            Get Started
          </a>
        </div>
      </nav>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-20 text-center">
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 900,
          height: 900,
          background:
            "radial-gradient(circle, rgba(0,255,178,0.07) 0%, transparent 65%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[60%] left-[20%]"
        style={{
          width: 400,
          height: 400,
          background:
            "radial-gradient(circle, rgba(255,0,102,0.05) 0%, transparent 70%)",
        }}
      />

      {/* Beta badge */}
      <div className="border-border bg-surface text-muted mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm">
        <span className="bg-primary h-1.5 w-1.5 rounded-full" />
        Announcing VoltOps v1.0 — Now in Public Beta
        <span className="text-primary">→</span>
      </div>

      {/* Main logo display */}
      <Logo className="mb-4 text-8xl leading-none tracking-tighter md:text-[9rem]" />

      <h1 className="text-foreground mb-6 max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">
        Tesla Powerwall Manager{" "}
        <span className="text-primary">Built for Efficiency</span>
      </h1>

      <p className="text-muted mb-10 max-w-xl text-lg leading-relaxed">
        Automated management to make the most out of your Tesla Powerwall.{" "}
        <span className="text-foreground">
          Deeper insight into your solar statistics and consumption.
        </span>{" "}
        <span className="text-accent">Reduce your energy bill </span> and keep
        your home running on{" "}
        <span className="text-primary/80">clean energy</span>.
      </p>

      <div className="flex flex-col gap-4 sm:flex-row">
        <a
          href="#"
          className="bg-primary rounded-lg px-8 py-3 font-semibold text-black transition-opacity hover:opacity-90"
        >
          Get Started Free
        </a>
        <a
          href="#"
          className="border-border bg-surface text-foreground hover:border-primary/40 rounded-lg border px-8 py-3 font-semibold transition-colors hover:bg-white/5"
        >
          View Documentation
        </a>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const features = [
  {
    title: "Real-time Monitoring",
    description:
      "Detailed information of your current Powerwall's charge and current productions and consumptions of clean energy. View and control your kW usage with detailed charts.",
    icon: (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          d="M22 12h-4l-3 9L9 3l-3 9H2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Automated Workflows",
    description:
      "Run scripts to automate your Powerwall reserve capacity and maximize your home's clean energy.",
    icon: (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Weather Forecasting",
    description:
      "Monitor your local weather and with VoltOps, create necessary reserves to save solar energy for high-rate hours.",
    icon: (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Analyze Trends",
    description:
      "Build an optimized Powerwall by viewing and understanding at a deepr level the trends of power usage in your home. ",
    icon: (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Security & Compliance",
    description:
      "Your energy data stays yours. All database queries are parameterized through Drizzle ORM, blocking SQL injection. Compelete protection on your Tesla credentials. OAuth refresh tokens are encrypted before being stored, with encryption keys held separately in secured environment variables.",
    icon: (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Integrations",
    description:
      "Connect with your Tesla account with a streamlined process and start managing your Powerwall with increased efficiency.",
    icon: (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

function Features() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24" id="features">
      <div className="mb-16 text-center">
        <p className="text-primary mb-3 text-sm font-semibold tracking-widest uppercase">
          Features
        </p>
        <h2 className="text-foreground mb-4 text-3xl font-bold tracking-tight md:text-4xl">
          Everything you need to manage your Powerwall
        </h2>
        <p className="text-muted mx-auto max-w-xl">
          Clear visiblity and full control. Automate your settings over your
          Powerwall's capacity and analyze your solar's charging trends.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="group border-border bg-surface hover:border-primary/30 rounded-xl border p-6 transition-colors"
          >
            <div className="bg-primary/10 text-primary mb-4 inline-flex rounded-lg p-3">
              {feature.icon}
            </div>
            <h3 className="text-foreground mb-2 font-semibold">
              {feature.title}
            </h3>
            <p className="text-muted text-sm leading-relaxed">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────

const steps = [
  {
    number: "01",
    title: "Connect Your Tesla Account",
    description:
      "Onboarding is simple as logging in and connecting your Tesla Account with VoltOps.",
  },
  {
    number: "02",
    title: "Configure Your Scripts",
    description:
      "Set your prefrences for energy usage times and provide details on your energy providers local rates. VoltOps will begin handling the rest to currate a lower energy bill for your home.",
  },
  {
    number: "03",
    title: "Deploy and Monitor",
    description:
      "Once setup, VoltOps will begin analyze trends of your energy usage and average charging trends. Continue monitoring your dashboard and edit any prefrences as VoltOps adapts and provides best practices and efficient energy control.",
  },
];

function HowItWorks() {
  return (
    <section className="border-border bg-surface border-t py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 text-center">
          <p className="text-primary mb-3 text-sm font-semibold tracking-widest uppercase">
            How It Works
          </p>
          <h2 className="text-foreground mb-4 text-3xl font-bold tracking-tight md:text-4xl">
            Up and running in minutes
          </h2>
          <p className="text-muted">
            Simply connect via OAuth with your Tesla account.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number} className="flex flex-col gap-5">
              <span className="border-primary/40 bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold">
                {step.number}
              </span>
              <div>
                <h3 className="text-foreground mb-2 font-semibold">
                  {step.title}
                </h3>
                <p className="text-muted text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const plans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description:
      "Perfect for small teams and individual developers getting started.",
    features: [
      "Up to 5 team members",
      "10 automated workflows",
      "Basic monitoring",
      "Community support",
      "Placeholder feature",
    ],
    cta: "Start for Free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/month",
    description:
      "For growing teams that need advanced features and more capacity.",
    features: [
      "Unlimited team members",
      "Unlimited workflows",
      "Advanced monitoring & alerts",
      "Priority support",
      "Placeholder feature",
      "Placeholder feature",
    ],
    cta: "Start Pro Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description:
      "For large organizations with custom needs and compliance requirements.",
    features: [
      "Everything in Pro",
      "SSO / SAML",
      "Custom integrations",
      "Dedicated support",
      "SLA guarantee",
      "Placeholder feature",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

function Pricing() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24" id="pricing">
      <div className="mb-16 text-center">
        <p className="text-primary mb-3 text-sm font-semibold tracking-widest uppercase">
          Pricing
        </p>
        <h2 className="text-foreground mb-4 text-3xl font-bold tracking-tight md:text-4xl">
          Simple, transparent pricing
        </h2>
        <p className="text-muted">
          Start for free. Scale as you grow. No hidden fees.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-xl border p-8 ${
              plan.highlighted
                ? "border-primary/60 bg-surface"
                : "border-border bg-surface"
            }`}
            style={
              plan.highlighted
                ? { boxShadow: "0 0 40px rgba(0,255,178,0.07)" }
                : undefined
            }
          >
            {plan.highlighted && (
              <div className="bg-primary absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-black">
                Most Popular
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-foreground mb-1 text-lg font-semibold">
                {plan.name}
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-foreground text-4xl font-bold">
                  {plan.price}
                </span>
                <span className="text-muted">{plan.period}</span>
              </div>
              <p className="text-muted mt-2 text-sm">{plan.description}</p>
            </div>

            <a
              href="#"
              className={`mb-6 block rounded-lg py-2.5 text-center text-sm font-semibold transition-colors ${
                plan.highlighted
                  ? "bg-primary text-black hover:opacity-90"
                  : "border-border text-foreground hover:border-primary/40 border hover:bg-white/5"
              }`}
            >
              {plan.cta}
            </a>

            <ul className="space-y-3">
              {plan.features.map((feature, i) => (
                <li
                  key={i}
                  className="text-muted flex items-center gap-2 text-sm"
                >
                  <CheckIcon />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────

function CTA() {
  return (
    <section className="border-border bg-surface relative overflow-hidden border-y">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 700,
          height: 700,
          background:
            "radial-gradient(circle, rgba(0,255,178,0.06) 0%, transparent 65%)",
        }}
      />
      <div className="relative mx-auto max-w-3xl px-6 py-28 text-center">
        <h2 className="text-foreground mb-4 text-3xl font-bold tracking-tight md:text-5xl">
          Ready to operate at <span className="text-primary">full voltage</span>
          ?
        </h2>
        <p className="text-muted mb-8 text-lg">
          Begin taking full advantage of your Tesla Powerwall and save on your
          electricity bill. Start free today!
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <a
            href="#"
            className="bg-primary rounded-lg px-8 py-3 font-semibold text-black transition-opacity hover:opacity-90"
          >
            Get Started Free
          </a>
          {/* <a
            href="#"
            className="border-border text-foreground hover:border-primary/40 rounded-lg border px-8 py-3 font-semibold transition-colors"
          >
            Talk to Sales
          </a> */}
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

const footerLinks: Record<string, string[]> = {
  Product: ["Features", "Pricing", "Changelog", "Roadmap"],
  Developers: ["Documentation", "API Reference", "SDKs", "Status"],
  Company: ["About", "Blog", "Careers", "Press"],
  Legal: ["Privacy", "Terms", "Security", "Cookies"],
};

function Footer() {
  return (
    <footer className="border-border bg-background border-t">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-5">
          <div className="md:col-span-1">
            <Logo className="mb-4 text-xl" />
            <p className="text-muted text-sm leading-relaxed">
              Placeholder: A one-line description of VoltOps for the footer.
            </p>
          </div>

          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group}>
              <h4 className="text-foreground mb-4 text-sm font-semibold">
                {group}
              </h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-muted hover:text-foreground text-sm transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-border mt-12 flex flex-col items-center justify-between gap-4 border-t pt-8 sm:flex-row">
          <p className="text-muted text-sm">
            {/* © 2025 VoltOps. All rights reserved. */}
            Designed and engineered by Brian Nguyen
          </p>
          <div className="flex gap-6">
            <a
              href="https://github.com/BrianNguyen2323"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-foreground text-sm transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://www.linkedin.com/in/ngynbrian/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-foreground text-sm transition-colors"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      {/* <Pricing /> */}
      <CTA />
      <Footer />
    </div>
  );
}
