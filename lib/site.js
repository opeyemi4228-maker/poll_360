/**
 * Site chrome and product facts.
 *
 * Everything here is either a design decision or a structural fact about
 * Nigeria's electoral geography. There are no invented customers, no invented
 * uptime figures and no invented case studies: a product whose entire pitch is
 * "we do not publish numbers we cannot stand behind" cannot open with numbers
 * it cannot stand behind.
 */

export const site = {
  name: "Poll360",
  tagline: "From the booth to the broadcast.",
  description:
    "Poll360 counts an election alongside the official count. A named agent files the result from every polling unit with a photo of the sheet, a coordinator checks it, and the situation room, the newsroom and the studio all read the same numbers — with the share of booths counted shown beside every one.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://poll360.ng",
  contact: {
    access: "access@poll360.ng",
    press: "press@poll360.ng",
  },
};

/* The register, as INEC publishes it. These are the numbers the whole system
   is sized against, and they are the reason a per-unit query has to be a
   grouped scan rather than a join. */
export const register = {
  states: 37,
  zones: 6,
  lgas: 774,
  wards: 8809,
  pollingUnits: 176623,
  /* Of which 56,737 were created in the 2021 expansion — the detail that tells
     an election officer we are working from the current register, not a
     decade-old one. */
  unitsCreated2021: 56737,
};

export const nav = [
  { label: "Live board", href: "/#board" },
  { label: "How it works", href: "/#chain" },
  { label: "Who uses it", href: "/#rooms" },
  { label: "On air", href: "/#broadcast" },
  { label: "Our rules", href: "/#integrity" },
];

export const footerNav = [
  {
    title: "The product",
    links: [
      { label: "The live board", href: "/#board" },
      { label: "How a result travels", href: "/#chain" },
      { label: "The agent's phone", href: "/#rooms" },
      { label: "The situation room", href: "/#rooms" },
      { label: "On air", href: "/#broadcast" },
    ],
  },
  {
    title: "How we work",
    links: [
      { label: "The six levels", href: "/#levels" },
      { label: "What we will not do", href: "/#integrity" },
      { label: "What is built so far", href: "/#status" },
      { label: "Why coverage comes first", href: "/#discipline" },
    ],
  },
  {
    title: "Get in touch",
    links: [
      { label: "Log in", href: "/login" },
      { label: "Request access", href: "/#access" },
      { label: `${site.contact.access}`, href: `mailto:${site.contact.access}` },
      { label: `${site.contact.press}`, href: `mailto:${site.contact.press}` },
    ],
  },
];
