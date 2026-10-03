const { onRequest } = require("firebase-functions/v2/https");

const AIRPORTS = {
  YYZ: { name: "Toronto Pearson", lat: 43.6777, lon: -79.6248 },
  YHM: { name: "Hamilton John C. Munro", lat: 43.1736, lon: -79.935 },
};
const SOURCES = [
  (a) => `https://api.adsb.lol/v2/point/${a.lat}/${a.lon}/25`,
  (a) => `https://opendata.adsb.fi/api/v2/lat/${a.lat}/lon/${a.lon}/dist/25`,
];
const KEEP = [
  "hex", "flight", "r", "t", "desc", "ownOp", "year", "category", "type",
  "alt_baro", "alt_geom", "gs", "ias", "tas", "mach", "track", "true_heading",
  "baro_rate", "geom_rate", "squawk", "emergency", "lat", "lon", "oat", "tat",
  "wd", "ws", "nav_altitude_mcp", "nav_qnh", "dst", "dir", "seen", "messages",
];

let cache = { t: 0, body: null };

async function fetchAirport(a) {
  let lastErr;
  for (const src of SOURCES) {
    try {
      const r = await fetch(src(a), { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      return (j.ac || j.aircraft || []).map((p) => {
        const o = {};
        for (const k of KEEP) if (p[k] !== undefined) o[k] = p[k];
        return o;
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

exports.planes = onRequest({ region: "us-central1", maxInstances: 3, memory: "256MiB" }, async (req, res) => {
  res.set("Cache-Control", "public, max-age=10, s-maxage=15");
  if (cache.body && Date.now() - cache.t < 10000) return res.json(cache.body);
  try {
    const out = { t: Date.now(), airports: {} };
    await Promise.all(
      Object.entries(AIRPORTS).map(async ([code, a]) => {
        out.airports[code] = { ...a, aircraft: await fetchAirport(a) };
      })
    );
    cache = { t: Date.now(), body: out };
    res.json(out);
  } catch (e) {
    res.status(502).json({ error: "Plane data source unavailable: " + e.message });
  }
});
