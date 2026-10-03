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

const AIRLINES = {
  ACA: ["Air Canada", "aircanada.com"], ROU: ["Air Canada Rouge", "aircanada.com"], JZA: ["Jazz (Air Canada Express)", "aircanada.com"],
  WJA: ["WestJet", "westjet.com"], WSW: ["WestJet Swoop", "flyswoop.com"], TSC: ["Air Transat", "airtransat.com"], FLE: ["Flair Airlines", "flyflair.com"],
  POE: ["Porter Airlines", "flyporter.com"], SWG: ["Sunwing", "sunwing.ca"], PAL: ["PAL Airlines", "palairlines.ca"], CJT: ["Cargojet", "cargojet.com"],
  AAL: ["American Airlines", "aa.com"], DAL: ["Delta Air Lines", "delta.com"], UAL: ["United Airlines", "united.com"], SWA: ["Southwest Airlines", "southwest.com"],
  JBU: ["JetBlue", "jetblue.com"], ASA: ["Alaska Airlines", "alaskaair.com"], NKS: ["Spirit Airlines", "spirit.com"], FFT: ["Frontier Airlines", "flyfrontier.com"],
  SKW: ["SkyWest", "skywest.com"], RPA: ["Republic Airways", "rjet.com"], ENY: ["Envoy Air", "envoyair.com"], EDV: ["Endeavor Air", "endeavorair.com"],
  JIA: ["PSA Airlines", "psaairlines.com"], FDX: ["FedEx Express", "fedex.com"], UPS: ["UPS Airlines", "ups.com"], GTI: ["Atlas Air", "atlasair.com"],
  BAW: ["British Airways", "britishairways.com"], VIR: ["Virgin Atlantic", "virginatlantic.com"], AFR: ["Air France", "airfrance.com"], KLM: ["KLM", "klm.com"],
  DLH: ["Lufthansa", "lufthansa.com"], SWR: ["Swiss", "swiss.com"], AUA: ["Austrian", "austrian.com"], SAS: ["SAS", "flysas.com"], FIN: ["Finnair", "finnair.com"],
  IBE: ["Iberia", "iberia.com"], TAP: ["TAP Air Portugal", "flytap.com"], ITY: ["ITA Airways", "ita-airways.com"], AZA: ["ITA Airways", "ita-airways.com"],
  ICE: ["Icelandair", "icelandair.com"], EIN: ["Aer Lingus", "aerlingus.com"], THY: ["Turkish Airlines", "turkishairlines.com"], UAE: ["Emirates", "emirates.com"],
  QTR: ["Qatar Airways", "qatarairways.com"], ETD: ["Etihad", "etihad.com"], ETH: ["Ethiopian Airlines", "ethiopianairlines.com"], SIA: ["Singapore Airlines", "singaporeair.com"],
  CPA: ["Cathay Pacific", "cathaypacific.com"], KAL: ["Korean Air", "koreanair.com"], AAR: ["Asiana", "flyasiana.com"], JAL: ["Japan Airlines", "jal.com"],
  ANA: ["ANA", "ana.co.jp"], CCA: ["Air China", "airchina.com"], CES: ["China Eastern", "ceair.com"], CSN: ["China Southern", "csair.com"], AIC: ["Air India", "airindia.com"],
  LAN: ["LATAM", "latam.com"], AVA: ["Avianca", "avianca.com"], AMX: ["Aeromexico", "aeromexico.com"], VOI: ["Volaris", "volaris.com"], CMP: ["Copa Airlines", "copaair.com"],
  EJA: ["NetJets", "netjets.com"], LXJ: ["Flexjet", "flexjet.com"], XOJ: ["XOJET", "vistajet.com"],
};
const routeCache = new Map();
async function lookupRoute(callsign) {
  const hit = routeCache.get(callsign);
  if (hit && Date.now() - hit.t < 30 * 60 * 1000) return hit.v;
  let v = null;
  try {
    const r = await fetch(`https://vrs-standing-data.adsb.lol/routes/${callsign.slice(0, 2)}/${callsign}.json`, { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "contacts-planes-page/1.0 (https://contacts-7ed77.web.app)" } });
    if (r.ok) {
      const j = await r.json();
      const ap = (j._airports || []).map((a) => ({ icao: a.icao, iata: a.iata, city: a.location, name: a.name, country: a.countryiso2 }));
      if (ap.length >= 2) v = { airports: ap };
    }
  } catch (e) { /* no route known */ }
  routeCache.set(callsign, { t: Date.now(), v });
  if (routeCache.size > 2000) routeCache.delete(routeCache.keys().next().value);
  return v;
}
async function enrich(list) {
  const todo = list.filter((p) => /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/.test((p.flight || "").trim()));
  for (const p of todo) {
    const code = p.flight.trim().slice(0, 3);
    if (AIRLINES[code]) { p.airline = AIRLINES[code][0]; p.airlineDomain = AIRLINES[code][1]; }
  }
  for (let i = 0; i < todo.length; i += 10) {
    await Promise.all(todo.slice(i, i + 10).map(async (p) => {
      const r = await lookupRoute(p.flight.trim());
      if (r) p.route = r.airports;
    }));
  }
}

let cache = { t: 0, body: null };

async function fetchAirport(a) {
  let lastErr;
  for (const src of SOURCES) {
    try {
      const r = await fetch(src(a), { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      const list = (j.ac || j.aircraft || []).map((p) => {
        const o = {};
        for (const k of KEEP) if (p[k] !== undefined) o[k] = p[k];
        return o;
      });
      await enrich(list);
      return list;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

exports.planes = onRequest({ region: "us-central1", maxInstances: 3, memory: "256MiB", timeoutSeconds: 60 }, async (req, res) => {
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
