const { onRequest } = require("firebase-functions/v2/https");

const AIRPORTS = {
  YYZ: { name: "Toronto Pearson", lat: 43.6777, lon: -79.6248 },
  YHM: { name: "Hamilton John C. Munro", lat: 43.1736, lon: -79.935 },
};
const SOURCES = [
  (a) => `https://api.adsb.lol/v2/point/${a.lat}/${a.lon}/${a.radius || 25}`,
  (a) => `https://opendata.adsb.fi/api/v2/lat/${a.lat}/lon/${a.lon}/dist/${a.radius || 25}`,
];
const AIRPORT_DATA_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const COUNTRY_DATA_URL = "https://davidmegginson.github.io/ourairports-data/countries.csv";
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

const responseCache = new Map();
let airportCatalog = { t: 0, airports: null, countries: null };

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

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

async function loadAirportCatalog() {
  if (airportCatalog.airports && Date.now() - airportCatalog.t < 6 * 60 * 60 * 1000) return airportCatalog;
  const [airportResponse, countryResponse] = await Promise.all([
    fetch(AIRPORT_DATA_URL, { signal: AbortSignal.timeout(20000) }),
    fetch(COUNTRY_DATA_URL, { signal: AbortSignal.timeout(10000) }),
  ]);
  if (!airportResponse.ok || !countryResponse.ok) {
    throw new Error(`OurAirports returned HTTP ${!airportResponse.ok ? airportResponse.status : countryResponse.status}`);
  }
  const [airportRows, countryRows] = await Promise.all([airportResponse.text(), countryResponse.text()]);
  const toObjects = (text) => {
    const [header, ...rows] = parseCsv(text);
    return rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] || ""])));
  };
  const airports = toObjects(airportRows)
    .filter((a) => ["large_airport", "medium_airport", "small_airport", "heliport", "seaplane_base"].includes(a.type) &&
      a.latitude_deg !== "" && a.longitude_deg !== "" &&
      Number.isFinite(Number(a.latitude_deg)) && Number.isFinite(Number(a.longitude_deg)))
    .map((a) => ({
      ident: a.ident, name: a.name, type: a.type, lat: Number(a.latitude_deg), lon: Number(a.longitude_deg),
      country: a.iso_country, city: a.municipality, icao: a.icao_code, iata: a.iata_code,
    }));
  const countries = Object.fromEntries(toObjects(countryRows).map((country) => [country.code, country.name]));
  airportCatalog = { t: Date.now(), airports, countries };
  return airportCatalog;
}

async function searchAirports(kind, query, offset) {
  const { airports, countries } = await loadAirportCatalog();
  const needle = query.toLowerCase();
  const priority = { large_airport: 0, medium_airport: 1, small_airport: 2, seaplane_base: 3, heliport: 4 };
  const matches = airports.filter((airport) => {
    if (kind === "country") {
      return `${countries[airport.country] || ""} ${airport.country}`.toLowerCase().includes(needle);
    }
    return [airport.city, airport.name, airport.ident, airport.icao, airport.iata]
      .some((value) => value && value.toLowerCase().includes(needle));
  }).sort((a, b) => priority[a.type] - priority[b.type] ||
    (a.city || a.name).localeCompare(b.city || b.name) || a.name.localeCompare(b.name));
  const page = matches.slice(offset, offset + 50).map((airport) => ({
    ...airport, countryName: countries[airport.country] || airport.country,
  }));
  return { airports: page, total: matches.length, offset };
}

async function fetchByIdentifier(kind, value) {
  const endpoint = kind === "flight" ? "callsign" : "registration";
  const response = await fetch(`https://api.adsb.lol/v2/${endpoint}/${encodeURIComponent(value)}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`ADS-B source returned HTTP ${response.status}`);
  const body = await response.json();
  const list = (body.ac || body.aircraft || []).map((plane) => {
    const aircraft = {};
    for (const key of KEEP) if (plane[key] !== undefined) aircraft[key] = plane[key];
    return aircraft;
  });
  await enrich(list);
  return list;
}

async function cached(key, loader) {
  const hit = responseCache.get(key);
  if (hit && Date.now() - hit.t < 10000) return hit.body;
  const body = await loader();
  responseCache.set(key, { t: Date.now(), body });
  if (responseCache.size > 200) responseCache.delete(responseCache.keys().next().value);
  return body;
}

exports.planes = onRequest({
  region: "us-central1",
  maxInstances: 3,
  memory: "256MiB",
  timeoutSeconds: 60,
  cors: ["https://skydvbwatcher-glitch.github.io"],
}, async (req, res) => {
  res.set("Cache-Control", "public, max-age=10, s-maxage=15");
  try {
    const airportSearch = String(req.query.airports || "");
    if (airportSearch) {
      const kind = airportSearch === "city" || airportSearch === "country" ? airportSearch : "";
      const query = String(req.query.q || "").trim();
      const offset = Number(req.query.offset || 0);
      if (!kind || query.length < 2 || query.length > 80 || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
        return res.status(400).json({ error: "Enter at least 2 characters and use a valid city or country search." });
      }
      const key = `airports:${kind}:${query.toLowerCase()}:${offset}`;
      return res.json(await cached(key, () => searchAirports(kind, query, offset)));
    }

    const flight = String(req.query.flight || "").trim().toUpperCase();
    const tail = String(req.query.tail || "").trim().toUpperCase();
    if (flight || tail) {
      if ((flight && tail) || !/^[A-Z0-9-]{2,12}$/.test(flight || tail)) {
        return res.status(400).json({ error: "Enter a valid flight callsign or aircraft registration." });
      }
      const kind = flight ? "flight" : "tail";
      const value = flight || tail;
      const key = `${kind}:${value}`;
      const body = await cached(key, async () => ({
        t: Date.now(),
        airports: {
          [kind === "flight" ? "FLIGHT" : "TAIL"]: {
            name: kind === "flight" ? `Flight ${value}` : `Aircraft ${value}`,
            aircraft: await fetchByIdentifier(kind, value),
          },
        },
      }));
      return res.json(body);
    }

    const hasLat = req.query.lat !== undefined;
    const hasLon = req.query.lon !== undefined;
    if (hasLat || hasLon) {
      const lat = Number(req.query.lat), lon = Number(req.query.lon);
      const radius = Number(req.query.radius || 25);
      if (!hasLat || !hasLon || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
          !Number.isFinite(lon) || lon < -180 || lon > 180 ||
          !Number.isFinite(radius) || radius < 1 || radius > 250) {
        return res.status(400).json({ error: "Enter valid airport coordinates and a radius from 1 to 250 nm." });
      }
      const name = String(req.query.name || "Selected airport").slice(0, 100);
      const ident = String(req.query.ident || "AIRPORT").replace(/[^A-Z0-9-]/gi, "").slice(0, 12) || "AIRPORT";
      const airport = {
        name, lat, lon,
        icao: String(req.query.icao || "").replace(/[^A-Z0-9]/gi, "").slice(0, 4),
        city: String(req.query.city || "").slice(0, 80),
        country: String(req.query.country || "").slice(0, 80),
      };
      return res.json(await cached(`point:${ident}:${lat}:${lon}:${radius}`, async () => ({
        t: Date.now(),
        airports: { [ident]: { ...airport, aircraft: await fetchAirport({ ...airport, radius }) } },
      })));
    }

    const body = await cached("default", async () => {
      const out = { t: Date.now(), airports: {} };
      await Promise.all(Object.entries(AIRPORTS).map(async ([code, airport]) => {
        out.airports[code] = { ...airport, aircraft: await fetchAirport(airport) };
      }));
      return out;
    });
    res.json(body);
  } catch (e) {
    res.status(502).json({ error: "Plane data source unavailable: " + e.message });
  }
});
