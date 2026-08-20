/**
 * Nigeria's six geopolitical zones.
 *
 * In its own file because both the forecast and the synthetic factor set need
 * it, and importing forecast.js into factors.js to reach it would make the two
 * modules circular.
 */
export const ZONES = {
  "North Central": ["BEN", "FCT", "KOG", "KWA", "NAS", "NIG", "PLA"],
  "North East": ["ADA", "BAU", "BOR", "GOM", "TAR", "YOB"],
  "North West": ["JIG", "KAD", "KAN", "KAT", "KEB", "SOK", "ZAM"],
  "South East": ["ABI", "ANA", "EBO", "ENU", "IMO"],
  "South South": ["AKW", "BAY", "CRO", "DEL", "EDO", "RIV"],
  "South West": ["EKI", "LAG", "OGU", "OND", "OSU", "OYO"],
};
