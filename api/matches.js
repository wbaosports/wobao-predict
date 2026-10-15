
// Vercel serverless function: free worldwide fixtures, no API key needed.
const LEAGUES = [
  "uefa.champions", "uefa.europa", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1",
  "ned.1", "por.1", "sau.1", "usa.1", "bra.1", "arg.1", "mex.1",
  "mys.1", "sgp.1", "tha.1", "idn.1", "vie.1", "jpn.1", "kor.1", "aus.1", "chn.1",
  "afc.champions", "fifa.friendly", "fifa.worldq.afc", "fifa.worldq.uefa"
];

const ymd = t => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");

function mapEvent(ev, league) {
  const comp = (ev.competitions || [])[0] || {};
  const teams = comp.competitors || [];
  const home = teams.find(t => t.homeAway === "home") || teams[0];
  const away = teams.find(t => t.homeAway === "away") || teams[1];
  if (!home || !away) return null;
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

async function fetchLeague(code, range) {
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${range}`);
    if (!r.ok) return [];
    const d = await r.json();
    const lg = (d.leagues || [])[0] || {};
    const league = { name: lg.name || code, logo: (lg.logos && lg.logos[0] && lg.logos[0].href) || "" };
    return (d.events || []).map(e => mapEvent(e, league)).filter(Boolean);
  } catch (e) {
    return [];
  }
}

module.exports = async (req, res) => {
  const day = 864e5, now = Date.now();
  const range = `${ymd(now - 2 * day)}-${ymd(now + 3 * day)}`;
  const lists = await Promise.all(LEAGUES.map(c => fetchLeague(c, range)));
  const seen = new Set();
  const matches = [];
  for (const m of lists.flat()) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    matches.push(m);
  }
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
  res.status(200).json({ matches });
};
