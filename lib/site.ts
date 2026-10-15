// Single source of truth for company content across all pages.

/** Origin used for canonical URLs, Open Graph and the sitemap. Vercel sets
    VERCEL_PROJECT_PRODUCTION_URL to the project's production domain, so this
    follows www.protransllp.com automatically once that domain is attached;
    until then it is the vercel.app address that actually serves the site. */
export const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://pro-trance-7.vercel.app";

export const company = {
  name: "PRO TRANS LOGISTICS LLP",
  shortName: "PRO TRANS",
  tagline: "Speed. Safety. Reliability.",
  founded: "2024",
  founders: ["Uvais Payambrote", "Muhammed Lukmanul Hakeem TP"],
  website: "www.protransllp.com",
  email: "protrans2025@gmail.com",
  focus: "South Indian market with Pan-India connectivity",
  industry: "FMCG Logistics & Transportation",
  hq: {
    line: "PP46B CVM Tower, Kodikuthiparambu",
    area: "Andiyoorkunnu P.O, Malappuram Dt.",
    pin: "673637",
    // Approximate coordinates of Malappuram, Kerala — used in telemetry motifs.
    coords: "11.0510° N, 76.0711° E",
  },
  phones: {
    mobile: ["9961243133", "9745997700"],
    office: ["9562113366", "8943884002"],
  },
} as const;

export const mission =
  "To redefine the logistics landscape of India by providing agile, transparent, and technology-driven transportation solutions that empower businesses to meet consumer demand.";

export const vision =
  "To be the most trusted logistics partner for India's leading consumer brands, bridging the gap between manufacturers and markets with unwavering reliability and operational excellence.";

export const coreValues = [
  {
    title: "Reliability Without Compromise",
    body: "A zero-delay culture ensuring fleet readiness and punctual drivers, every dispatch.",
    metric: "0",
    metricLabel: "delay culture",
  },
  {
    title: "Safety & Freshness First",
    body: "We protect the physical integrity of cargo — from fragile confectionery to perishable dairy.",
    metric: "2–8°C",
    metricLabel: "cold chain",
  },
  {
    title: "Radical Transparency",
    body: "Modern tracking and clear communication channels give you full visibility, end to end.",
    metric: "24/7",
    metricLabel: "live GPS",
  },
  {
    title: "Customer-Centric Innovation",
    body: "Constant route and feedback analysis for faster, more cost-effective solutions.",
    metric: "∞",
    metricLabel: "route analysis",
  },
] as const;

export const services = [
  {
    id: "pan-india",
    title: "Pan India Connectivity",
    short: "Coverage across every corner of India.",
    body: "Comprehensive road coverage across all of India, anchored in South India with reliable Pan-India reach.",
    tag: "NETWORK",
  },
  {
    id: "distribution",
    title: "Primary & Secondary Distribution",
    short: "Factory → Warehouse → Retail.",
    body: "Seamless movement across every leg of the supply chain, from the production line to the store shelf.",
    tag: "SUPPLY CHAIN",
  },
  {
    id: "time-sensitive",
    title: "Time-Sensitive Delivery",
    short: "Optimised routing for perishables.",
    body: "Route planning tuned for perishable and high-demand goods, where every hour on the shelf counts.",
    tag: "SPEED",
  },
  {
    id: "fleet-management",
    title: "Dedicated Fleet Management",
    short: "A modern fleet, always ready.",
    body: "A modern Ashok Leyland fleet with real-time tracking, dedicated to your distribution needs.",
    tag: "FLEET",
  },
  {
    id: "cold-chain",
    title: "Cold Chain & Perishable Handling",
    short: "Temperature-monitored transport.",
    body: "Thermo King-equipped trucks maintain a monitored temperature range for dairy and perishable cargo.",
    tag: "COLD CHAIN",
  },
  {
    id: "fragile",
    title: "Fragile Goods Management",
    short: "White-glove handling protocols.",
    body: "Specialised protocols for biscuits, glass-bottled cosmetics, and other delicate, high-value goods.",
    tag: "HANDLING",
  },
  {
    id: "express",
    title: "Express Replenishment",
    short: "High-priority stock recovery.",
    body: "High-priority transport for stock-outs and new product launches, keeping shelves full.",
    tag: "PRIORITY",
  },
  {
    id: "reverse",
    title: "Reverse Logistics",
    short: "Returns, crates, and pallets.",
    body: "Efficient return of empty crates, pallets, and expired or damaged stock, closing the loop.",
    tag: "RETURNS",
  },
  {
    id: "tracking",
    title: "Real-Time Fleet Tracking",
    short: "24/7 GPS with live ETAs.",
    body: "Round-the-clock GPS visibility with live ETAs, so you always know exactly where your cargo is.",
    tag: "VISIBILITY",
  },
  {
    id: "compliance",
    title: "Interstate Compliance Management",
    short: "E-way bills & state documentation.",
    body: "Expert handling of e-way bills and state-specific documentation for smooth border crossings.",
    tag: "COMPLIANCE",
  },
] as const;

export const advantages = [
  {
    title: "FMCG Specialization",
    body: "Deep understanding of shelf-life, handling requirements, and turnover speed.",
  },
  {
    title: "Interstate Expertise",
    body: "Seamless documentation and permits for smooth border crossings across South India.",
  },
  {
    title: "Scalability",
    body: "Capacity to scale during peak seasons and festivals without missing a beat.",
  },
  {
    title: "Safety First",
    body: "Strict adherence to safety protocols that minimise loss and damage.",
  },
  {
    title: "Specialized Handling",
    body: "White-glove treatment for cosmetic packaging, glass bottles, and luxury gift boxes.",
  },
] as const;

export const clients = [
  {
    name: "NESTO Hypermarkets",
    sector: "Retail",
    service:
      "Managing high-volume retail logistics for one of the fastest-growing retail chains.",
  },
  {
    name: "AZCCO Global Venture",
    sector: "Craze Biscuits",
    service:
      "Timely distribution of confectionery products across the network.",
  },
  {
    name: "MILMA",
    sector: "Dairy Federation",
    service:
      "Trusted handling of sensitive dairy products requiring strict timeline adherence.",
  },
] as const;

export const fleet = {
  brand: "Ashok Leyland",
  equipment: "Thermo King refrigerated units",
  note: "Diverse load capacity with a modern, fully trackable fleet.",
};

export const nav = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
  { label: "About Us", href: "/about" },
  { label: "Contact", href: "/contact" },
] as const;
