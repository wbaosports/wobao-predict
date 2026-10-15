// Vercel serverless function: free worldwide fixtures, no API key needed.
const LEAGUES = [
  "uefa.champions", "uefa.europa", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1",
  "ned.1", "por.1", "sau.1", "usa.1", "bra.1", "arg.1", "mex.1",
  "mys.1", "sgp.1", "tha.1", "idn.1", "vie.1", "jpn.1", "kor.1", "aus.1", "chn.1",
  "afc.champions", "fifa.friendly", "fifa.worldq.afc", "fifa.worldq.uefa"
];
const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/";
const HEADERS = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "Accept": "application/json" };

const ymd = t => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");

function mapEvent(ev, league) {
  const comp = (ev.competitions || [])[0] || {};
  const teams = comp.competitors || [];
  const home = teams.find(t => t.homeAway === "home") || teams[0];
  const away = teams.find(t => t.homeAway === "away") || teams[1];
  if (!home || !away || !home.team || !away.team) return null;
  const type = (ev.status && ev.status.type) || {};
  let status = "TIMED";
  if (type.state === "in") status = "IN_PLAY";
  else if (type.state === "post") status = type.completed ? "FINISHED" : "POSTPONED";
  if (status === "POSTPONED") return null;
  const num = v => (v === undefined || v === null || v === "" ? null : Number(v));
  return {
    id: String(ev.id),
    utc: ev.date,
    status,
    clock: type.shortDetail || "",
    comp: league.name,
    compLogo: league.logo,
    home: home.team.shortDisplayName || home.team.displayName,
    away: away.team.shortDisplayName || away.team.displayName,
    homeLogo: home.team.logo || "",
    awayLogo: away.team.logo || "",
    hs: status === "TIMED" ? null : num(home.score),
    as: status === "TIMED" ? null : num(away.score)
  };
}

async function getJSON(url) {
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return { code: r.status, data: null };
    return { code: r.status, data: await r.json() };
  } catch (e) {
    return { code: "err", data: null };
  }
}

async function fetchLeague(code, range, debug) {
  let res = await getJSON(`${BASE}${code}/scoreboard?dates=${range}&limit=200`);
  let tried = "range:" + res.code;
  if (!res.data || !(res.data.events || []).length) {
    res = await getJSON(`${BASE}${code}/scoreboard`);
    tried += " plain:" + res.code;
  }
  const d = res.data || {};
  const lg = (d.leagues || [])[0] || {};
  const league = { name: lg.name || code, logo: (lg.logos && lg.logos[0] && lg.logos[0].href) || "" };
  const list = (d.events || []).map(e => mapEvent(e, league)).filter(Boolean);
  debug.push(`${code} ${tried} -> ${list.length}`);
  return list;
}

module.exports = async (req, res) => {
  const day = 864e5, now = Date.now();
  const range = `${ymd(now - 2 * day)}-${ymd(now + 3 * day)}`;
  const debug = [];
  const lists = await Promise.all(LEAGUES.map(c => fetchLeague(c, range, debug)));
  const seen = new Set();
  const matches = [];
  for (const m of lists.flat()) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    matches.push(m);
  }
  const wantDebug = req.query && req.query.debug;
  res.setHeader("Cache-Control", wantDebug ? "no-store" : "s-maxage=120, stale-while-revalidate=600");
  res.status(200).json(wantDebug ? { matches: matches.length, debug } : { matches });
};
