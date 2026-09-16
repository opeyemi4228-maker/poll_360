import { agentsManifest } from "@/lib/agents-app";

/**
 * The agents' app manifest — its own name, icon and start page, so installing
 * from the agents' domain puts "Agents" on the home screen and not Poll360.
 * Poll360's own manifest stays at /manifest.webmanifest, untouched.
 */
export function GET() {
  return Response.json(agentsManifest(), {
    headers: {
      "content-type": "application/manifest+json",
      "cache-control": "public, max-age=3600",
    },
  });
}
