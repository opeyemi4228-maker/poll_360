import { site } from "@/lib/site";

/**
 * The marketing site is meant to be found. The application tier is not:
 * `/field` is an agent's dashboard, `/console` is a scoped review queue, and
 * `/board` renders frames intended for a vision mixer rather than for a search
 * result. They are disallowed here as well as being behind a sign-in, because
 * defence in depth costs three lines.
 */
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/field/", "/console/", "/board/", "/api/"],
    },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
