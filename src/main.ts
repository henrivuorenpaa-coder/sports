import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import type { User } from "firebase/auth";
import { addDays, diffDays, fi, fiLong, iso, mondayOf, parse, todayIso, WD, WDL, WDPL, wd } from "./lib/dates.ts";
import { esc, uid } from "./lib/html.ts";
import { KIND, kindOf, rpeText, segs, short, steps, summary, titleOf, totals } from "./plan.ts";
import {
  defaultSettings, eventsOn, isDone, notesFor, repeatPatch, repeatSuggestion, schedule, slotMap, status,
  tkdDoneOn, tkdPlannedOn, virtualsOn,
} from "./schedule.ts";
import { cleanProposals, coachPrompt } from "./coach.ts";
import { PROGRAMS, planFor, programIdOf, programOf, runCountsOf } from "./programs/index.ts";
import { firebaseSetup, getFirebaseDb, getIdToken, resetPassword, signInEmail, signOutUser, signUpEmail, watchUser } from "./lib/firebase.ts";
import { authErrorText } from "./lib/auth-errors.ts";
import { clearLocal, hasLocalData, localStore, readLocal } from "./storage/local.ts";
import { firestoreStore } from "./storage/firestore.ts";
import type { Store, StoreData } from "./storage/store.ts";
import type { Block, CoachState, Ctx, Kind, LogEntry, Proposal, Rule, Settings } from "./types.ts";

registerSW({ immediate: true });

/* ---------- tila ---------- */
type View = "today" | "calendar" | "plan" | "coach" | "prefs";
type SheetState = {
  kind: "session" | "event" | "virt" | "form" | "login";
  signup?: boolean;
  key?: string; id?: string; ref?: string; type?: Kind; date?: string;
  lock?: boolean; edit?: boolean; doneOnly?: boolean;
};

const S = {
  settings: null as Settings | null,
  logs: [] as LogEntry[],
  coach: null as CoachState | null,
  view: "today" as View,
  sheet: null as SheetState | null,
  pendingDelete: null as string | null,
  defaults: defaultSettings(todayIso()),
  store: localStore() as Store,
  user: null as User | null,
  authReady: !firebaseSetup.isReady,
  connecting: firebaseSetup.isReady,
  loaded: { settings: false, logs: false },
  offerMigrate: false,
  coachQ: "",
  coachBusy: false,
};

/**
 * Valmentajan kutsu Vercelin /api/coach-funktioon (Claude API). Vaatii kirjautumisen; palvelin tarkistaa,
 * että käyttäjä on sallittujen listalla. Virheet heitetään muodossa {code}.
 */
async function askCoach(prompt: string, signal: AbortSignal): Promise<unknown> {
  const token = await getIdToken();
  if (!token) throw { code: "unauthenticated" };
  const res = await fetch("/api/coach", {
    method: "POST", signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ prompt }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw { code: body.code || `http_${res.status}` };
  return body;
}
const COACH_ERRORS: Record<string, string> = {
  rate_limited: "Claudea on käytetty juuri paljon. Yritä hetken päästä uudelleen.",
  invalid_json: "Valmentajan vastausta ei saatu luettua. Yritä uudelleen.",
  unauthenticated: "Kirjaudu sisään käyttääksesi valmentajaa.",
  not_allowed: "Tunnuksellasi ei ole valmentajan käyttöoikeutta (COACH_ALLOWED_EMAILS).",
  bad_api_key: "Claude API -avain puuttuu tai on virheellinen (ANTHROPIC_API_KEY).",
  refusal: "Valmentaja ei voinut vastata tähän. Kokeile muotoilla kysymys toisin.",
};

const settings = (): Settings => S.settings || S.defaults;
const rules = (): Rule[] => settings().recurring || S.defaults.recurring;
const ctx = (): Ctx => ({ settings: { ...settings(), recurring: rules() }, logs: S.logs });
const plan = () => planFor(settings());
const program = () => programOf(settings());

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
const inputVal = (id: string) => $<HTMLInputElement>(id)?.value ?? "";

/* ---------- pienet HTML-palat ---------- */
function barHtml(blocks: Block[], size?: string) {
  const s = segs(blocks), tot = s.reduce((a, [, m]) => a + m, 0) || 1;
  return `<div class="bar${size ? " " + size : ""}" role="img" aria-label="Treenin rakenne: ${esc(summary(blocks))}">${s.map(([t, m]) => `<span class="${t}" style="flex:${(m / tot).toFixed(4)}"></span>`).join("")}</div>`;
}
const noteHtml = ([c, t]: [string, string]) => `<div class="note ${c}"><div>${t}</div></div>`;

/* ---------- Tänään ---------- */
function weekStrip(today: string) {
  const c = ctx(), mon = mondayOf(today), sch = schedule(c);
  let h = '<div class="days">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    let dots = sch.filter((s) => s.date === d && !s.skipped).map((s) => `<span class="dot run${s.done ? "" : d < today ? " miss" : " open"}"></span>`).join("");
    for (const l of eventsOn(c, d)) dots += `<span class="dot ${l.kind}${isDone(l) ? "" : " open"}"></span>`;
    for (const v of virtualsOn(c, d)) dots += `<span class="dot ${v.kind} open"></span>`;
    h += `<button class="day${d === today ? " is-today" : ""}" data-go="calendar" aria-label="${esc(fiLong(d))}"><span class="d">${WD[i]}</span><span class="n num">${parse(d).getDate()}</span><span class="dots">${dots}</span></button>`;
  }
  return h + "</div>";
}

function accountNote() {
  if (S.offerMigrate)
    return `<div class="note ok"><div><b>Tällä laitteella on aiempia kirjauksia.</b> Siirretäänkö ne tilillesi, jotta ne näkyvät kaikilla laitteilla?<div class="act"><button class="btn small primary" data-act="migrate">Siirrä tilille</button><button class="btn small ghost" data-act="migrate-no">Ei nyt</button></div></div></div>`;
  if (firebaseSetup.isReady && S.authReady && !S.user)
    return `<div class="note tkd"><div><b>Kirjaudu sisään</b>, niin kirjaukset tallentuvat tilillesi ja näkyvät puhelimella ja tietokoneella.<div class="act"><button class="btn small tkd" data-act="login">Kirjaudu sisään</button></div></div></div>`;
  return "";
}

function renderToday() {
  const today = todayIso(), st = settings(), c = ctx(), el = $("v-today")!;
  const sch = schedule(c).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const map = slotMap(st), P = plan();
  const curSlot = Math.floor(diffDays(st.startDate, today) / 7);
  const todaysDone = sch.find((s) => s.date === today && s.done);
  const next = sch.find((s) => !s.done && !s.skipped && s.date >= today);
  const missed = sch.filter((s) => !s.done && !s.skipped && s.date < today && s.date >= addDays(today, -6));
  let h = `<div class="view-head"><div><span class="label">${esc(WDL[wd(today)])} ${fi(today)}</span><h2>${curSlot < 0 ? `Alkaa ${esc(fiLong(st.startDate))}` : curSlot >= map.length ? "Ohjelma suoritettu" : `Viikko ${curSlot + 1} / ${map.length}`}</h2></div></div>`;

  h += accountNote();
  const rep = repeatSuggestion(c, today);
  if (rep) h += `<div class="note warn"><div><b>Viime viikolla ${rep.prevDone}/${rep.n} juoksua.</b> Suosittelen toistamaan viikon ”${esc(P[rep.base].title)}” ennen kuin jatkat – loppuohjelma siirtyy viikolla.<div class="act"><button class="btn small primary" data-act="repeat" data-base="${rep.base}">Toista viikko</button><button class="btn small ghost" data-act="dismiss" data-slot="${rep.slot}">Jatka ohjelmaa</button></div></div></div>`;
  if (todaysDone?.done) h += `<div class="note ok"><div><b>Päivän juoksu tehty.</b> ${todaysDone.done.minutes || "–"} min · RPE ${todaysDone.done.rpe}/10</div></div>`;

  if (next) {
    const t = totals(next.blocks), isToday = next.date === today;
    const lng = t.longest < 1 ? [Math.round(t.longest * 60), "s"] : [short(t.longest), "min"];
    h += `<article class="card hero"><div class="hero-top">
      <div class="when"><span class="label">${isToday ? "Päivän treeni" : "Seuraava treeni"} · Viikko ${next.slot + 1}</span><span class="chip ${isToday ? "today" : "next"}">${isToday ? "Tänään" : esc(fiLong(next.date))}</span></div>
      <h3>${esc(kindOf(next.blocks))}: ${esc(summary(next.blocks))}</h3>
      <div class="meta">
        <div class="metric"><span class="label">Kesto</span><span class="v num">${t.total}<small>min</small></span></div>
        <div class="metric"><span class="label">Juoksua</span><span class="v num">${t.run}<small>min</small></span></div>
        <div class="metric"><span class="label">Pisin pätkä</span><span class="v num">${lng[0]}<small>${lng[1]}</small></span></div>
      </div>
      ${barHtml(next.blocks, "big")}
      </div><div class="hero-body">
      <ol class="steps">${steps(next.blocks).map((s) => `<li class="${s.r ? "r" : ""}"><span>${esc(s.t)}</span></li>`).join("")}</ol>
      ${notesFor(c, next, today).map(noteHtml).join("")}
      <div class="btnrow"><button class="btn primary" data-act="complete" data-key="${next.key}">Merkitse tehdyksi</button><button class="btn" data-act="session" data-key="${next.key}">Siirrä tai ohita</button></div></div>
    </article>`;
  } else if (curSlot >= 0) {
    h += `<article class="card"><h3>Ohjelman juoksut käyty läpi</h3><p class="muted">${esc(program().finishText)}</p></article>`;
  }
  if (missed.length) h += `<div class="card"><span class="label">Väliin jääneet tällä viikolla</span>${missed.map((s) => `<button class="sess" data-act="session" data-key="${s.key}"><span class="sd"><b>${WD[wd(s.date)]}</b>${fi(s.date)}</span><span class="mid"><span class="t">${esc(kindOf(s.blocks))} <span>· ${esc(summary(s.blocks))}</span></span>${barHtml(s.blocks)}</span><span class="chip missed">Väliin</span></button>`).join("")}<p class="muted small">Älä tuplaa – jatka seuraavasta treenistä. Voit siirtää väliin jääneen toiselle päivälle tai kirjata sen, jos teit sen.</p></div>`;

  const vt = virtualsOn(c, today).find((v) => v.kind === "tkd");
  h += `<div class="card"><div class="view-head"><span class="label">Tämä viikko</span><span class="legend"><span><i style="background:var(--run);border-radius:50%"></i>Juoksu</span><span><i style="background:var(--tkd)"></i>Taekwondo</span><span><i style="background:var(--other)"></i>Muu</span></span></div>${weekStrip(today)}
    <div class="btnrow">${vt ? `<button class="btn tkd" data-act="add" data-kind="tkd" data-date="${today}" data-lock="1" data-ref="${vt.ref}">Kirjaa tämän päivän taekwondo</button>` : `<button class="btn tkd" data-act="add" data-kind="tkd" data-date="${today}">+ Taekwondo</button>`}<button class="btn" data-act="add" data-date="${today}" data-kind="other">+ Lisää treeni</button></div></div>`;
  el.innerHTML = h;
}

/* ---------- Kalenteri ---------- */
function renderCalendar() {
  const el = $("v-calendar")!, today = todayIso(), st = settings(), c = ctx(), map = slotMap(st), P = plan();
  const sch = schedule(c);
  const first = mondayOf(st.startDate < today ? st.startDate : today);
  const progEnd = addDays(st.startDate, map.length * 7 - 1);
  const lastDate = [progEnd, today, ...sch.map((s) => s.date), ...S.logs.map((l) => l.date)].reduce((a, b) => (b > a ? b : a));
  const lastMon = mondayOf(lastDate);
  let h = `<div class="view-head"><div><span class="label">Napauta treeniä muokataksesi, siirtääksesi tai ohittaaksesi</span><h2>Kalenteri</h2></div>
    <div class="legend"><span><i style="background:var(--run)"></i>Juoksu</span><span><i style="background:var(--tkd)"></i>Taekwondo</span><span><i style="background:var(--other)"></i>Muu</span></div></div>`;
  for (let mon = first; mon <= lastMon; mon = addDays(mon, 7)) {
    const sun = addDays(mon, 6), slot = Math.floor(diffDays(st.startDate, mon) / 7);
    const inProg = slot >= 0 && slot < map.length;
    const weekRuns = sch.filter((s) => s.date >= mon && s.date <= sun && !s.skipped);
    const planned = weekRuns.reduce((a, s) => a + totals(s.blocks).run, 0);
    const tkdCount = [...Array(7)].map((_, i) => addDays(mon, i)).filter((d) => tkdDoneOn(c, d).length || tkdPlannedOn(c, d)).length;
    const isCur = today >= mon && today <= sun;
    h += `<section class="cal-week" data-current="${isCur}"${isCur ? ' id="cal-current"' : ""}>
      <div class="cal-head"><h3>${fi(mon)}–${fi(sun)}</h3>${inProg ? `<span class="tag">Viikko ${slot + 1}</span><span class="muted small">${esc(P[map[slot]].title)}</span>` : ""}
      <span class="tot num">Juoksua ${planned} min${tkdCount ? ` · taekwondo ${tkdCount}×` : ""}</span></div><div class="cal-days">`;
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i);
      let items = "";
      for (const s of sch.filter((s) => s.date === d)) {
        const t = totals(s.blocks);
        const mk = s.done ? '<span class="mark ok">✓</span>' : !s.skipped && d < today ? '<span class="mark miss">!</span>' : "";
        items += `<button class="item run${s.skipped ? " skip" : ""}" data-act="session" data-key="${s.key}"><span class="st"></span><span class="bd"><span class="it">${mk}<span>${esc(kindOf(s.blocks))}</span></span><span class="is">${t.total} min · ${esc(summary(s.blocks))}${s.moved ? " · siirretty" : ""}${s.adjusted ? " · muokattu" : ""}</span>${barHtml(s.blocks, "thin")}</span></button>`;
      }
      for (const l of eventsOn(c, d)) {
        const done = isDone(l);
        items += `<button class="item ${l.kind}${done ? "" : " plan"}" data-act="event" data-id="${esc(l.id)}"><span class="st"></span><span class="bd"><span class="it">${done ? '<span class="mark ok">✓</span>' : ""}<span>${esc(titleOf(l))}</span></span><span class="is">${l.minutes || "–"} min${done && l.rpe ? ` · RPE ${l.rpe}` : done ? "" : " · suunniteltu"}</span></span></button>`;
      }
      for (const v of virtualsOn(c, d)) items += `<button class="item ${v.kind} plan" data-act="virt" data-ref="${esc(v.ref)}"><span class="st"></span><span class="bd"><span class="it"><span>${esc(titleOf(v))}</span></span><span class="is">${v.minutes} min · ${d < today ? "kirjaamatta" : "toistuva"}</span></span></button>`;
      const addBtn = `<button class="add" data-act="add" data-date="${d}" aria-label="Lisää treeni ${esc(fiLong(d))}"><b>+</b><span>Lisää</span></button>`;
      h += `<div class="cal-day${d === today ? " is-today" : ""}"><div class="dl"><span class="d">${WD[i]}</span><span class="n num">${parse(d).getDate()}</span></div><div class="cal-items">${items}</div>${addBtn}</div>`;
    }
    h += `</div></section>`;
  }
  el.innerHTML = h;
}

/* ---------- Ohjelma ---------- */
function renderPlan() {
  const today = todayIso(), st = settings(), sch = schedule(ctx()), map = slotMap(st), P = plan(), el = $("v-plan")!;
  const curSlot = Math.floor(diffDays(st.startDate, today) / 7);
  let h = `<div class="view-head"><div><span class="label">${map.length} viikkoa · ${st.runDays.length} juoksua viikossa</span><h2>${esc(program().title)}</h2></div>
    <div class="legend"><span><i style="background:var(--run)"></i>Juoksu</span><span><i style="background:var(--walk)"></i>Kävely</span><span><i style="background:var(--stride)"></i>Veto</span></div></div>`;
  map.forEach((b, slot) => {
    const w = P[b], ss = sch.filter((s) => s.slot === slot);
    const mon = addDays(st.startDate, slot * 7), sun = addDays(mon, 6);
    const isRepeat = slot > 0 && map[slot - 1] === b;
    const open = slot === curSlot || (curSlot < 0 && slot === 0);
    h += `<details class="week" data-current="${slot === curSlot}"${open ? " open" : ""}>
      <summary><span class="wk-no num"><small>vk</small>${slot + 1}</span><span class="wk-t"><h3>${esc(w.title)}${isRepeat ? " (toisto)" : ""}</h3><p>${fi(mon)}–${fi(sun)} · ${ss.reduce((a, s) => a + totals(s.blocks).run, 0)} min juoksua</p></span>
      <span class="wk-prog">${ss.map((s) => `<span class="dot run${s.done ? "" : s.date < today && !s.skipped ? " miss" : " open"}"></span>`).join("")}</span></summary>
      <div class="week-body"><p class="focus">${esc(w.focus)}</p>
      ${ss.map((s) => { const [c, l] = status(s, today); return `<button class="sess" data-act="session" data-key="${s.key}"><span class="sd"><b>${WD[wd(s.date)]}</b>${fi(s.date)}</span><span class="mid"><span class="t">${esc(kindOf(s.blocks))}${s.adjusted ? " (muokattu)" : ""} <span>· ${esc(summary(s.blocks))} · ${totals(s.blocks).total} min</span></span>${barHtml(s.blocks)}</span><span class="chip ${c}">${esc(l)}</span></button>`; }).join("")}
      </div></details>`;
  });
  el.innerHTML = h;
}

/* ---------- Valmentaja ---------- */
const GARMIN: [string, string][] = [
  ["Juoksut", "Matka, kesto, vauhti, keskisyke ja kierrokset. Valmentaja vertaa toteutunutta suunniteltuun."],
  ["Leposyke", "Jos aamun leposyke on yli 5 lyöntiä tavallista korkeampi, palautuminen on kesken."],
  ["Yön HRV", "Laskeva trendi useana yönä on merkki kevyemmän viikon tarpeesta."],
  ["Uni ja Body Battery", "Huono yö ennen treeniä → lyhyempi tai kevyempi juoksu."],
  ["VO2max", "Kunnon kehitys viikoittain. Tästä saadaan myöhemmin vauhtitavoitteet."],
  ["Sykealueet", "Kevyen juoksun yläraja, jotta juoksut pysyvät oikeasti kevyinä."],
];
function renderCoach() {
  const el = $("v-coach")!, today = todayIso(), st = settings(), sch = schedule(ctx()), map = slotMap(st);
  const done = sch.filter((s) => s.done), dl = S.logs.filter(isDone);
  const runMin = dl.filter((l) => l.kind === "run").reduce((a, l) => a + (+l.minutes || 0), 0);
  const tkd = dl.filter((l) => l.kind === "tkd");
  const longest = done.reduce((a, s) => Math.max(a, totals(s.blocks).longest), 0);
  const prog = program(), pct = Math.min(100, Math.round((longest / prog.goalMinutes) * 100));
  const weeks = map.map((_, slot) => {
    const mon = addDays(st.startDate, slot * 7), sun = addDays(mon, 6);
    const r = dl.filter((l) => l.kind === "run" && l.date >= mon && l.date <= sun).reduce((a, l) => a + (+l.minutes || 0), 0);
    const k = dl.filter((l) => l.kind !== "run" && l.date >= mon && l.date <= sun).reduce((a, l) => a + (+l.minutes || 0), 0);
    const p = sch.filter((s) => s.date >= mon && s.date <= sun && !s.skipped).reduce((a, s) => a + totals(s.blocks).total, 0);
    return { r, k, p };
  });
  const max = Math.max(60, ...weeks.map((w) => Math.max(w.r + w.k, w.p)));

  let coach = "";
  if (!S.user) coach = `<p class="muted small">Kirjaudu sisään käyttääksesi valmentajaa.</p>`;
  else {
    coach = `<div class="field"><label for="c-q">Kysy tai kerro jotain (valinnainen)</label><textarea id="c-q" maxlength="600" placeholder="esim. Pohkeet ovat kipeät taekwondon jälkeen, kannattaako lauantain juoksu tehdä?">${esc(S.coachQ)}</textarea></div>
      <div class="btnrow">${S.coachBusy ? `<button class="btn" data-act="coach-stop">Pysäytä</button>` : `<button class="btn primary" data-act="coach-run">${S.coachQ.trim() ? "Kysy valmentajalta" : "Analysoi tilanne"}</button>`}</div>`;
    if (S.coachBusy) coach += `<p class="thinking">Valmentaja käy läpi kirjauksiasi ja ohjelmaa…</p>`;
  }
  const c = S.coach;
  if (c?.error) coach += `<div class="note warn"><div>${esc(c.error)}</div></div>`;
  if (c?.analysis) {
    coach += `<div class="coach-out"><span class="label">Analyysi ${c.at ? `· ${fi(c.at.slice(0, 10))}` : ""}${c.q ? ` · ”${esc(c.q.slice(0, 60))}${c.q.length > 60 ? "…" : ""}”` : ""}</span>${c.analysis.split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
    if ((c.proposals || []).length) coach += `<span class="label">Ehdotetut muutokset</span>` + c.proposals!.map((p, i) => propHtml(p, i)).join("");
    else coach += `<p class="muted small">Ei muutosehdotuksia – ohjelma jatkuu sellaisenaan.</p>`;
  }

  el.innerHTML = `<div class="view-head"><div><span class="label">Tilanne ${fi(today)}</span><h2>Valmentaja</h2></div></div>
  <div class="card"><div class="view-head"><span class="label">Oma valmentaja</span></div>
    <p class="small muted" style="max-width:65ch">Valmentaja lukee juoksusi, rasittavuudet, muistiinpanot, taekwondon ja tulevan ohjelman. Se kirjoittaa analyysin ja ehdottaa muutoksia, mutta ohjelma muuttuu vain, kun hyväksyt ehdotuksen.</p>
    ${coach}
  </div>
  <div class="stats">
    <div class="stat"><span class="label">Ohjelman juoksut</span><span class="v num">${done.length}<small> / ${sch.length}</small></span></div>
    <div class="stat"><span class="label">Juoksua yhteensä</span><span class="v num">${runMin}<small> min</small></span></div>
    <div class="stat"><span class="label">Pisin yhtäjaksoinen</span><span class="v num">${longest > 0 && longest < 1 ? Math.round(longest * 60) + "<small> s</small>" : Math.round(longest) + "<small> min</small>"}</span></div>
    <div class="stat"><span class="label">Taekwondo</span><span class="v num">${tkd.length}<small> krt</small></span></div>
  </div>
  <div class="card goal"><div class="view-head"><span class="label">${esc(prog.goalLabel)}</span><span class="num muted small">${Math.round(longest)} / ~${prog.goalMinutes} min yhtäjaksoista juoksua</span></div><div class="track"><span style="width:${pct}%"></span></div></div>
  <div class="card"><div class="view-head"><span class="label">Viikkokuorma, minuuttia</span><span class="legend"><span><i style="background:var(--run)"></i>Juoksu</span><span><i style="background:var(--tkd)"></i>Taekwondo ja muu</span><span><i style="border:1px dashed var(--muted)"></i>Suunniteltu juoksu</span></span></div>
    <div class="chart" style="--n:${weeks.length}">${weeks.map((w) => `<div class="col" title="Juoksu ${w.r} min, taekwondo ja muu ${w.k} min, suunniteltu ${w.p} min"><span class="p" style="height:${((w.p / max) * 100).toFixed(1)}%"></span><span class="r" style="height:${((w.r / max) * 100).toFixed(1)}%"></span><span class="k" style="height:${((w.k / max) * 100).toFixed(1)}%"></span></div>`).join("")}</div>
    <div class="xlab num" style="--n:${weeks.length}">${weeks.map((_, i) => `<span>vk ${i + 1}</span>`).join("")}</div>
  </div>
  <div class="card"><div class="view-head"><span class="label">Garmin-data valmentajalle</span><span class="chip up">Ei yhdistetty</span></div>
    <p class="small muted" style="max-width:65ch">Kun Garmin Personal API yhdistetään, nämä tiedot tulevat sovellukseen automaattisesti ja valmentaja käyttää niitä analyysissa. Muutokset ohjelmaan tehdään edelleen vain sinun hyväksynnälläsi.</p>
    <div>${GARMIN.map(([t, d]) => `<div class="gm"><b>${t}</b><p>${d}</p><span class="v">–</span></div>`).join("")}</div>
    <div class="flow"><span>Garmin-kello</span>→<span>Sports</span>→<span>Valmentaja ehdottaa</span>→<span>Sinä hyväksyt</span>→<span>intervals.icu</span>→<span>Kello</span></div>
  </div>`;
}
function propHtml(p: Proposal, i: number) {
  const s = "key" in p ? schedule(ctx()).find((x) => x.key === p.key) : null;
  let what = "";
  if (p.type === "replace" && s) what = `${esc(fiLong(s.date))}: ${esc(summary(s.blocks))} → <b>${esc(summary(p.blocks))}</b> (${totals(p.blocks).total} min)`;
  else if (p.type === "move" && s) what = `${esc(kindOf(s.blocks))} ${esc(fiLong(s.date))} → <b>${esc(fiLong(p.date))}</b>`;
  else if (p.type === "skip" && s) what = `Ohita ${esc(kindOf(s.blocks).toLowerCase())} ${esc(fiLong(s.date))}`;
  else if (p.type === "repeat_week") what = `Toista ohjelman viikko ${p.week} (”${esc(plan()[slotMap(settings())[p.week - 1]]?.title || "")}”)`;
  const st = p.status;
  return `<div class="prop${st ? " " + st : ""}"><span class="pt">${what}</span>${p.type === "replace" ? barHtml(p.blocks) : ""}<span class="small muted">${esc(p.reason || "")}</span>
    ${st === "applied" ? '<span class="chip done">Hyväksytty</span>' : st === "rejected" ? '<span class="chip skipped">Hylätty</span>'
      : `<div class="btnrow"><button class="btn small primary" data-act="prop-ok" data-i="${i}">Hyväksy</button><button class="btn small ghost" data-act="prop-no" data-i="${i}">Hylkää</button></div>`}</div>`;
}

let coachCtl: AbortController | null = null;
async function runCoach() {
  if (!S.user || S.coachBusy) return;
  const q = S.coachQ.trim();
  coachCtl = new AbortController();
  S.coachBusy = true; render();
  try {
    const res = (await askCoach(coachPrompt(ctx(), todayIso(), q), coachCtl.signal)) as { analysis?: unknown; proposals?: unknown } | null;
    const analysis = String(res?.analysis || "").slice(0, 4000);
    if (!analysis) throw { code: "invalid_json" };
    S.coach = { analysis, proposals: cleanProposals(ctx(), res?.proposals, todayIso()), at: new Date().toISOString(), q };
    S.coachQ = "";
    await saveCoach();
  } catch (e) {
    const code = (e as { code?: string; name?: string })?.code ?? (e as { name?: string })?.name;
    if (code !== "AbortError" && code !== "cancelled")
      S.coach = { ...(S.coach || {}), error: COACH_ERRORS[code ?? ""] || "Valmentaja ei vastannut. Yritä uudelleen." };
  } finally { S.coachBusy = false; coachCtl = null; render(); }
}
async function saveCoach() {
  const c = { ...S.coach };
  delete c.error;
  try { await S.store.saveCoach(c); } catch { /* ei kriittinen */ }
}
async function applyProposal(i: number, ok: boolean) {
  S.coach = structuredClone(S.coach);
  const p = S.coach?.proposals?.[i];
  if (!S.coach || !p || p.status) return;
  if (ok) {
    const st = settings();
    const s = "key" in p ? schedule(ctx()).find((x) => x.key === p.key) : null;
    if (p.type === "replace" && s) await saveSettings({ overrides: { ...(st.overrides || {}), [p.key]: p.blocks } });
    else if (p.type === "move" && s) await saveSettings({ moves: { ...(st.moves || {}), [p.key]: p.date } });
    else if (p.type === "skip" && s) await saveSettings({ skips: { ...(st.skips || {}), [p.key]: true } });
    else if (p.type === "repeat_week") {
      const base = slotMap(st)[p.week - 1];
      if (base !== undefined) await saveSettings(repeatPatch(st, base));
    } else toast("Ehdotus ei ole enää ajankohtainen");
    // Viikon toisto siirtää myöhempiä avaimia: hylätään muut vielä avoimet ehdotukset, jotta ne eivät osu väärään treeniin.
    if (p.type === "repeat_week") S.coach.proposals!.forEach((x, j) => { if (j !== i && !x.status) x.status = "rejected"; });
  }
  S.coach.proposals = S.coach.proposals!.map((x, j) => (j === i ? { ...x, status: ok ? "applied" : "rejected" } : x));
  await saveCoach(); toast(ok ? "Muutos tehty ohjelmaan" : "Ehdotus hylätty"); render();
}

/* ---------- Asetukset ---------- */
function accountCard() {
  if (!firebaseSetup.isReady)
    return `<div class="card"><span class="label">Tallennus</span><p class="muted small">Kirjaukset tallentuvat tällä hetkellä vain tähän selaimeen. Pilvitallennus otetaan käyttöön, kun Firebase-asetukset on lisätty.</p></div>`;
  if (!S.user)
    return `<div class="card"><span class="label">Tili</span><p class="muted small">Kirjaudu sähköpostilla, niin kirjaukset ja asetukset tallentuvat pilveen ja näkyvät kaikilla laitteillasi. Ilman kirjautumista ne tallentuvat vain tähän selaimeen.</p>
      <div class="btnrow"><button class="btn tkd" data-act="login"${S.authReady ? "" : " disabled"}>Kirjaudu sisään</button><button class="btn" data-act="signup"${S.authReady ? "" : " disabled"}>Luo tunnus</button></div></div>`;
  return `<div class="card"><span class="label">Tili</span><p class="small">Kirjautuneena: <b>${esc(S.user.email || S.user.displayName || "")}</b></p>
    <p class="muted small">Kirjaukset ja asetukset tallentuvat tilillesi, joten ne näkyvät sekä puhelimella että tietokoneella.</p>
    ${S.offerMigrate || hasLocalData() ? `<button class="btn small" data-act="migrate">Siirrä tämän selaimen kirjaukset tilille</button>` : ""}
    <div class="btnrow"><button class="btn small ghost" data-act="logout">Kirjaudu ulos</button></div></div>`;
}
function renderPrefs() {
  const el = $("v-prefs")!, st = settings(), today = todayIso();
  const pick = (name: string, sel: number[], cls?: string) => `<div class="wkpick ${cls || ""}">${WD.map((d, i) => `<span><input type="checkbox" id="${name}-${i}" name="${name}" value="${i}"${sel.includes(i) ? " checked" : ""}><label for="${name}-${i}">${d}</label></span>`).join("")}</div>`;
  const n = st.runDays.length, prog = program(), counts = runCountsOf(prog);
  const active = rules().filter((r) => !r.until || r.until >= today);
  el.innerHTML = `<div class="view-head"><div><span class="label">Ohjelman rytmi</span><h2>Asetukset</h2></div></div>
  <form class="card" id="prefs-form">
    <div class="field"><span class="lbl">Ohjelma</span>
      <div class="progpick">${PROGRAMS.map((p) => `<span><input type="radio" id="p-prog-${p.id}" name="p-prog" value="${p.id}"${p.id === prog.id ? " checked" : ""}><label for="p-prog-${p.id}"><b>${esc(p.name)}</b><span class="small muted">${esc(p.description)}</span></label></span>`).join("")}</div>
      <span class="muted small">Ohjelman vaihto aloittaa uuden ohjelman valitulta aloitusviikolta. Aiemmat kirjaukset säilyvät.</span></div>
    <div class="field"><span class="lbl">Juoksukerrat viikossa</span>
      <div class="seg" style="--n:${counts.length}">${counts.map((c) => `<span><input type="radio" id="p-n${c}" name="p-n" value="${c}"${n === c ? " checked" : ""}><label for="p-n${c}">${c} kertaa</label></span>`).join("")}</div>
      <span class="muted small">Kaksi kertaa sopii hyvin taekwondon rinnalle. Kolme kertaa etenee samassa ajassa tasaisemmin.</span></div>
    <div class="field"><label for="p-start">Ohjelman aloitusviikko</label><input type="date" id="p-start" value="${st.startDate}"></div>
    <div class="field"><span class="lbl">Juoksupäivät</span>${pick("p-run", st.runDays)}</div>
    <div class="field"><label for="p-tkdmin">Uuden taekwondotreenin oletuskesto (min)</label><input type="number" id="p-tkdmin" min="15" max="240" step="5" value="${st.tkdMin}"></div>
    <p class="err" id="p-err" hidden></p>
    <div class="btnrow"><button class="btn primary" type="submit">Tallenna asetukset</button></div>
  </form>
  <div class="card"><span class="label">Toistuvat treenit</span>
    ${active.length ? active.map((r) => `<div class="rrow ${r.kind}"><span class="st"></span><div><b>${esc(titleOf(r))}</b><div class="small muted">${WDPL[r.weekday]} · ${r.minutes} min</div></div><button class="btn small ${S.pendingDelete === r.id ? "danger" : "ghost"}" data-act="rule-end" data-id="${esc(r.id)}">${S.pendingDelete === r.id ? "Vahvista lopetus" : "Lopeta"}</button></div>`).join("")
      : '<p class="muted small">Ei toistuvia treenejä.</p>'}
    <p class="muted small">Uuden toistuvan treenin lisäät kalenterista: Lisää → valitse ”Toista joka viikko”. Kestoa voi muuttaa kalenterissa napauttamalla treeniä.</p>
  </div>
  ${accountCard()}
  <div class="card"><span class="label">Tiedot</span>
    <p class="muted small">Vie kaikki kirjaukset ja asetukset JSON-tiedostoon tai tuo ne toisesta laitteesta tai Claude-artefaktista. Tuonti yhdistää kirjaukset ja korvaa asetukset.</p>
    <div class="btnrow"><button class="btn small" data-act="export">Vie tiedot</button><button class="btn small" data-act="import">Tuo tiedot</button></div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>
    ${(st.repeats || []).length ? `<button class="btn small" data-act="clear-repeats">Poista toistetut viikot (${st.repeats.length})</button>` : ""}
    ${Object.keys(st.moves || {}).length ? `<button class="btn small" data-act="clear-moves">Palauta siirretyt juoksut alkuperäisille päiville (${Object.keys(st.moves).length})</button>` : ""}
    ${Object.keys(st.overrides || {}).length ? `<button class="btn small" data-act="clear-overrides">Palauta valmentajan muokkaamat juoksut (${Object.keys(st.overrides).length})</button>` : ""}</div>`;
}

/* ---------- sheets ---------- */
function openSheet(kind: SheetState["kind"], opts: Omit<SheetState, "kind"> = {}) { S.sheet = { kind, ...opts }; S.pendingDelete = null; renderSheet(); }
function closeSheet() { S.sheet = null; renderSheet(); }
const head = (label: string, title: string) => `<div class="sheet-head"><div><span class="label">${label}</span><h3>${esc(title)}</h3></div><button class="x" data-act="close" aria-label="Sulje">×</button></div>`;
const moveRow = (date: string, act: string, attrs: string) => `<div class="moverow"><div class="field"><label for="mv-date">Siirrä päivälle</label><input type="date" id="mv-date" value="${date}"></div><button class="btn" data-act="${act}" ${attrs}>Siirrä</button></div>`;
const findVirt = (ref: string) => { const [id, d] = ref.split("@"); return virtualsOn(ctx(), d).find((v) => v.id === id) || null; };

function renderSheet(): void {
  const root = $("sheet-root")!;
  if (!S.sheet) { root.innerHTML = ""; return; }
  const sh = S.sheet, today = todayIso(), c = ctx();
  let body = "";
  if (sh.kind === "session") {
    const s = schedule(c).find((x) => x.key === sh.key);
    if (!s) return closeSheet();
    const t = totals(s.blocks), [cl, l] = status(s, today);
    body = head(`Viikko ${s.slot + 1} · ${esc(fiLong(s.date))}${s.moved ? ` · alun perin ${esc(fiLong(s.orig))}` : ""}`, `${kindOf(s.blocks)}: ${summary(s.blocks)}`) + `
      <div class="btnrow" style="align-items:center"><span class="chip ${cl}">${esc(l)}</span><span class="muted num" style="font-size:14px">${t.total} min, josta juoksua ${t.run} min</span></div>
      ${barHtml(s.blocks, "big")}
      <ol class="steps">${steps(s.blocks).map((x) => `<li class="${x.r ? "r" : ""}"><span>${esc(x.t)}</span></li>`).join("")}</ol>
      ${s.done || s.skipped ? "" : notesFor(c, s, today).map(noteHtml).join("")}
      <p class="muted small">Tahti: niin hidas, että pystyt puhumaan (RPE 3–4/10). Jos pätkä ei mene läpi, kävele hetki ja jatka – se lasketaan silti.</p>
      ${s.done ? `<div class="note ok"><div><b>Tehty ${esc(fiLong(s.done.date))}.</b> ${s.done.minutes} min · RPE ${s.done.rpe}/10${s.done.note ? ` · ${esc(s.done.note)}` : ""}</div></div>
          <div class="btnrow"><button class="btn small" data-act="edit-event" data-id="${esc(s.done.id)}">Muokkaa kirjausta</button><button class="btn small ${S.pendingDelete === s.done.id ? "danger" : "ghost"}" data-act="del" data-id="${esc(s.done.id)}">${S.pendingDelete === s.done.id ? "Vahvista: peru merkintä" : "Peru tehty-merkintä"}</button></div>`
        : s.skipped ? `<div class="btnrow"><button class="btn primary" data-act="unskip" data-key="${s.key}">Palauta treeni</button></div>`
        : `<div class="btnrow"><button class="btn primary" data-act="complete" data-key="${s.key}">Merkitse tehdyksi</button></div><hr class="sep">
           ${moveRow(s.date, "move-session", `data-key="${s.key}"`)}
           <div class="btnrow"><button class="btn ghost" data-act="skip" data-key="${s.key}">Ohita treeni</button>${s.moved ? `<button class="btn ghost" data-act="unmove" data-key="${s.key}">Palauta ${esc(fiLong(s.orig))}</button>` : ""}${s.adjusted ? `<button class="btn ghost" data-act="unoverride" data-key="${s.key}">Palauta alkuperäinen treeni</button>` : ""}</div>`}`;
  } else if (sh.kind === "event") {
    const l = S.logs.find((x) => x.id === sh.id);
    if (!l) return closeSheet();
    const done = isDone(l);
    body = head(`${esc(fiLong(l.date))} · ${done ? "tehty" : "suunniteltu"}${l.ruleRef ? " · toistuva" : ""}`, titleOf(l)) + `
      <p class="num">${l.minutes || "–"} min${l.km ? ` · ${String(l.km).replace(".", ",")} km` : ""}${done && l.rpe ? ` · RPE ${l.rpe}/10 (${rpeText(l.rpe)})` : ""}</p>
      ${l.note ? `<p class="muted">${esc(l.note)}</p>` : ""}
      <div class="btnrow">${done ? "" : `<button class="btn ${l.kind === "tkd" ? "tkd" : "primary"}" data-act="complete-event" data-id="${esc(l.id)}">Merkitse tehdyksi</button>`}<button class="btn" data-act="edit-event" data-id="${esc(l.id)}">Muokkaa</button></div>
      ${done ? "" : `<hr class="sep">${moveRow(l.date, "move-event", `data-id="${esc(l.id)}"`)}`}
      <div class="btnrow"><button class="btn small ${S.pendingDelete === l.id ? "danger" : "ghost"}" data-act="del" data-id="${esc(l.id)}">${S.pendingDelete === l.id ? "Vahvista poisto" : "Poista"}</button></div>`;
  } else if (sh.kind === "virt") {
    const v = findVirt(sh.ref!);
    if (!v) return closeSheet();
    const d = v.date;
    body = head(`${esc(fiLong(d))} · toistuu ${WDPL[v.weekday]}`, titleOf(v)) + `
      <p class="muted">Noin ${v.minutes} min. ${v.kind === "tkd" ? "Kun kirjaat sen tehdyksi, rasittavuus huomioidaan seuraavissa juoksuissa." : ""}</p>
      <div class="btnrow">${d <= today ? `<button class="btn ${v.kind === "tkd" ? "tkd" : "primary"}" data-act="add" data-kind="${v.kind}" data-date="${d}" data-lock="1" data-ref="${esc(v.ref)}">Kirjaa tehdyksi</button>` : ""}<button class="btn" data-act="edit-virt" data-ref="${esc(v.ref)}">Muokkaa tätä kertaa</button></div>
      <hr class="sep">${moveRow(d, "move-virt", `data-ref="${esc(v.ref)}"`)}
      <div class="btnrow"><button class="btn ghost" data-act="skip-virt" data-ref="${esc(v.ref)}">Ei tällä kertaa</button></div>
      <hr class="sep"><span class="label">Kaikki kerrat</span>
      <div class="inl"><div class="field"><label for="r-min">Kesto jatkossa (min)</label><input type="number" id="r-min" min="5" max="300" step="5" value="${v.minutes}"></div><button class="btn" data-act="rule-min" data-id="${esc(v.id)}">Tallenna</button></div>
      <div class="btnrow"><button class="btn small ${S.pendingDelete === v.id ? "danger" : "ghost"}" data-act="rule-end" data-id="${esc(v.id)}" data-from="${d}">${S.pendingDelete === v.id ? `Vahvista: lopeta ${fi(d)} alkaen` : "Lopeta toisto tästä eteenpäin"}</button></div>`;
  } else if (sh.kind === "login") {
    const up = !!sh.signup;
    body = head("Tili", up ? "Luo tunnus" : "Kirjaudu") + `
    <form id="login-form" class="view" style="gap:14px" novalidate>
      <div class="field"><label for="a-email">Sähköposti</label><input type="email" id="a-email" autocomplete="email" inputmode="email" required></div>
      <div class="field"><label for="a-pw">Salasana${up ? " (vähintään 6 merkkiä)" : ""}</label><input type="password" id="a-pw" autocomplete="${up ? "new-password" : "current-password"}" minlength="6" required></div>
      <p class="err" id="a-err" hidden></p>
      <div class="btnrow"><button class="btn primary" type="submit" id="a-submit">${up ? "Luo tunnus" : "Kirjaudu"}</button></div>
      <div class="btnrow">${up ? `<button class="btn small ghost" type="button" data-act="login">Minulla on jo tunnus</button>`
        : `<button class="btn small ghost" type="button" data-act="signup">Luo uusi tunnus</button><button class="btn small ghost" type="button" data-act="reset-pw">Unohtuiko salasana?</button>`}</div>
    </form>`;
  } else if (sh.kind === "form") {
    const s = sh.key ? schedule(c).find((x) => x.key === sh.key) : null;
    const ev = sh.id ? S.logs.find((x) => x.id === sh.id) : null;
    const v = sh.ref ? findVirt(sh.ref) || rules().find((r) => r.id === sh.ref!.split("@")[0]) || null : null;
    const kind: Kind = ev ? ev.kind : sh.type || "tkd";
    const edit = !!sh.edit;
    const date = sh.date || (ev ? ev.date : s ? (s.date < today ? s.date : today) : today);
    const mins = ev ? ev.minutes : v ? v.minutes : kind === "tkd" ? settings().tkdMin : s ? totals(s.blocks).total : 30;
    const rpe = ev?.rpe ? ev.rpe : kind === "tkd" ? 6 : 4;
    const locked = !!(s || ev || sh.lock);
    const doneOnly = !!(s || (ev && !edit)); // tehdyksi merkitseminen: ei tulevaa päivää
    const title = s ? `${kindOf(s.blocks)} tehty` : edit ? `Muokkaa: ${titleOf(ev || v || { kind })}` : ev ? `${titleOf(ev)} tehty` : sh.lock ? titleOf(v || { kind }) : "Lisää treeni";
    sh.doneOnly = doneOnly;
    body = head(s ? `Viikko ${s.slot + 1}` : esc(fiLong(date)), title) + `
    <form id="log-form" class="view" style="gap:14px">
      ${locked ? "" : `<div class="seg" style="--n:3" role="radiogroup" aria-label="Laji">${(["tkd", "run", "other"] as Kind[]).map((k) => `<span><input type="radio" id="f-k-${k}" name="f-kind" value="${k}"${k === kind ? " checked" : ""}><label for="f-k-${k}">${KIND[k]}</label></span>`).join("")}</div>`}
      <div class="field" id="f-label-w"${kind === "other" ? "" : " hidden"}><label for="f-label">Laji</label><input type="text" id="f-label" placeholder="esim. kuntosali, pyöräily" maxlength="40" value="${esc(ev?.label || v?.label || "")}"></div>
      <div class="grid2">
        <div class="field"><label for="f-date">Päivä</label><input type="date" id="f-date" value="${date}" ${doneOnly ? `max="${today}"` : ""} required></div>
        <div class="field"><label for="f-min">Kesto (min)</label><input type="number" id="f-min" min="1" max="600" value="${mins}" required></div>
      </div>
      <p class="muted small" id="f-plan-note" hidden>Tuleva päivä: treeni tallentuu kalenteriin suunniteltuna. Rasittavuuden kirjaat, kun merkitset sen tehdyksi.</p>
      <div class="field" id="f-km-w"${kind === "run" ? "" : " hidden"}><label for="f-km">Matka (km, valinnainen)</label><input type="number" id="f-km" min="0" max="100" step="0.01" placeholder="esim. 3,2" value="${ev?.km ? ev.km : ""}"></div>
      <div class="field" id="f-rpe-w"><div class="rpe-out"><label for="f-rpe">Rasittavuus (RPE)</label><span><b class="num" id="f-rpe-v">${rpe}</b>/10 <span class="muted" id="f-rpe-t">${rpeText(rpe)}</span></span></div>
        <input type="range" id="f-rpe" min="1" max="10" step="1" value="${rpe}"></div>
      <div class="field"><label for="f-note">Muistiinpano</label><textarea id="f-note" maxlength="300" placeholder="${kind === "tkd" ? "esim. sparrausta, potkutekniikkaa, pohkeet jumissa" : "esim. pohkeet jäykät, hyvä fiilis"}">${esc(ev?.note || "")}</textarea></div>
      ${!locked ? `<label class="check" for="f-rep"><input type="checkbox" id="f-rep"> <span id="f-rep-t">Toista joka viikko</span></label>` : ""}
      <p class="err" id="f-err" hidden></p>
      <div class="btnrow"><button class="btn primary" type="submit" id="f-submit">Tallenna</button></div>
    </form>`;
  }
  root.innerHTML = `<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="Treeni">${body}</div></div>`;
  wireForm();
}

function wireForm() {
  const f = $<HTMLFormElement>("log-form");
  const sh = S.sheet;
  if (!f || !sh) return;
  const r = $<HTMLInputElement>("f-rpe")!;
  r.addEventListener("input", () => { $("f-rpe-v")!.textContent = r.value; $("f-rpe-t")!.textContent = rpeText(+r.value); });
  const ev = sh.id ? S.logs.find((x) => x.id === sh.id) : null;
  const sync = () => {
    const k = (f.querySelector<HTMLInputElement>('input[name="f-kind"]:checked')?.value as Kind | undefined) || sh.type;
    sh.type = k;
    const date = inputVal("f-date");
    // Muokkauksessa suunniteltu kirjaus pysyy suunniteltuna, kunnes se merkitään tehdyksi.
    const planned = date > todayIso() || (!!sh.edit && !!ev && !isDone(ev)) || (!!sh.edit && !ev);
    $("f-label-w")!.hidden = k !== "other";
    $("f-km-w")!.hidden = k !== "run" || planned;
    $("f-rpe-w")!.hidden = planned;
    $("f-plan-note")!.hidden = !(date > todayIso());
    const rt = $("f-rep-t");
    if (rt && date) rt.textContent = `Toista joka viikko (${WDPL[wd(date)]})`;
    const b = $("f-submit")!;
    b.className = "btn " + (k === "tkd" ? "tkd" : "primary");
    b.textContent = date > todayIso() && !sh.edit ? "Lisää kalenteriin" : "Tallenna";
  };
  f.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "f-kind") $<HTMLInputElement>("f-min")!.value = String(t.value === "tkd" ? settings().tkdMin : 30);
    sync();
  });
  $("f-date")!.addEventListener("input", sync);
  sync();
  f.addEventListener("submit", onLogSubmit);
}

/* ---------- tallennus ---------- */
async function saveSettings(patch: Partial<Settings>) {
  const next: Settings = { ...settings(), ...patch };
  if (!next.recurring) next.recurring = rules();
  S.settings = next;
  try { await S.store.saveSettings(next); } catch { toast("Tallennus epäonnistui. Yritä uudelleen."); }
}
async function ensureSettings() { if (!S.settings || !S.settings.recurring) await saveSettings({}); }
async function putLog(entry: LogEntry) {
  await ensureSettings();
  try { await S.store.putLog(entry); return true; }
  catch { toast("Tallennus epäonnistui. Yritä uudelleen."); return false; }
}
async function removeLog(id: string) {
  try { await S.store.removeLog(id); } catch { toast("Poisto epäonnistui."); }
}

async function onLogSubmit(ev: SubmitEvent) {
  ev.preventDefault();
  const sh = S.sheet!, err = $("f-err")!, today = todayIso();
  const date = inputVal("f-date"), minutes = +inputVal("f-min");
  if (!date || !(minutes > 0)) { err.textContent = "Anna päivä ja kesto minuutteina."; err.hidden = false; return; }
  const future = date > today;
  if (future && sh.doneOnly) { err.textContent = "Tehdyksi merkityn treenin päivä ei voi olla tulevaisuudessa."; err.hidden = false; return; }
  const prev = sh.id ? S.logs.find((l) => l.id === sh.id) : null;
  const kind: Kind = prev ? prev.kind : sh.key ? "run" : sh.type || "tkd";
  let st: "done" | "planned";
  if (future) st = "planned";
  else if (sh.edit) st = prev ? prev.status || "done" : "planned";
  else st = "done";
  const entry: LogEntry = { ...(prev || {}), id: prev ? prev.id : uid(), kind, date, minutes, note: $<HTMLTextAreaElement>("f-note")!.value.trim(), status: st, createdAt: prev?.createdAt ?? Date.now() };
  if (st === "done") entry.rpe = +inputVal("f-rpe"); else delete entry.rpe;
  const km = inputVal("f-km");
  if (km && st === "done") entry.km = +km.replace(",", "."); else delete entry.km;
  const lab = inputVal("f-label").trim();
  if (kind === "other" && lab) entry.label = lab;
  if (sh.key) { entry.sessionKey = sh.key; entry.programId = programIdOf(settings()); }
  if (sh.ref) entry.ruleRef = sh.ref;
  if ($<HTMLInputElement>("f-rep")?.checked) {
    const rule: Rule = { id: uid("r"), kind, weekday: wd(date), minutes, from: date };
    if (entry.label) rule.label = entry.label;
    await saveSettings({ recurring: [...rules(), rule] });
    if (!future) { entry.ruleRef = `${rule.id}@${date}`; await putLog(entry); }
    closeSheet(); toast(`${titleOf(rule)} toistuu ${WDPL[rule.weekday]}`); return render();
  }
  if (await putLog(entry)) {
    closeSheet();
    toast(sh.edit ? "Muutokset tallennettu" : future ? `${KIND[kind]} lisätty kalenteriin` : kind === "tkd" ? "Taekwondo kirjattu" : sh.key ? "Juoksu merkitty tehdyksi" : "Treeni kirjattu");
    render();
  }
}

let toastT: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string) {
  const r = $("toast-root")!;
  r.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`;
  clearTimeout(toastT);
  toastT = setTimeout(() => { r.innerHTML = ""; }, 2600);
}

/* ---------- tuonti ja vienti ---------- */
function exportData() {
  const data: StoreData & { exportedAt: string } = { settings: S.settings, logs: S.logs, coach: S.coach, exportedAt: new Date().toISOString() };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = `sports-${iso(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importData(file: File) {
  try {
    const j = JSON.parse(await file.text());
    const logs = Array.isArray(j.logs) ? (j.logs as LogEntry[]).filter((l) => l && typeof l.id === "string" && typeof l.date === "string") : [];
    const st = j.settings && typeof j.settings.startDate === "string" ? (j.settings as Settings) : null;
    if (!st && !logs.length) throw new Error("empty");
    await S.store.importAll({ settings: st, logs, coach: j.coach || null });
    if (st) S.settings = st;
    toast(`Tuotu ${logs.length} kirjausta${st ? " ja asetukset" : ""}`);
  } catch {
    toast("Tiedostoa ei voitu lukea. Valitse Sportsista (tai Askel 5K:sta) viety JSON.");
  }
  render();
}
async function migrateLocal() {
  const d = readLocal();
  try {
    await S.store.importAll(d);
    clearLocal();
    S.offerMigrate = false;
    toast(`Siirretty ${d.logs.length} kirjausta tilillesi`);
  } catch { toast("Siirto epäonnistui. Yritä uudelleen."); }
  render();
}

/* ---------- tapahtumat ---------- */
const mvDate = () => inputVal("mv-date");
document.addEventListener("input", (e) => {
  const t = e.target as HTMLTextAreaElement;
  if (t.id === "c-q") {
    S.coachQ = t.value;
    const b = document.querySelector('[data-act="coach-run"]');
    if (b) b.textContent = S.coachQ.trim() ? "Kysy valmentajalta" : "Analysoi tilanne";
  }
});
document.addEventListener("click", async (ev) => {
  const target = ev.target as Element;
  const go = target.closest<HTMLElement>("[data-go]");
  if (go) {
    S.view = go.dataset.go as View; S.pendingDelete = null; render();
    const c = S.view === "calendar" && $("cal-current");
    if (c) c.scrollIntoView({ block: "start" }); else window.scrollTo({ top: 0 });
    return;
  }
  const a = target.closest<HTMLElement>("[data-act]");
  if (!a) return;
  const act = a.dataset.act, ds = a.dataset, st = settings(), today = todayIso();
  if (act === "scrim") { if (target === a) closeSheet(); return; }
  if (act === "close") return closeSheet();
  if (act === "session") return openSheet("session", { key: ds.key });
  if (act === "event") return openSheet("event", { id: ds.id });
  if (act === "virt") return openSheet("virt", { ref: ds.ref });
  if (act === "complete") return openSheet("form", { key: ds.key, type: "run" });
  if (act === "complete-event") { const l = S.logs.find((x) => x.id === ds.id)!; return openSheet("form", { id: l.id, type: l.kind, date: l.date > today ? today : l.date }); }
  if (act === "edit-event") { const l = S.logs.find((x) => x.id === ds.id)!; return openSheet("form", { id: l.id, type: l.kind, edit: true }); }
  if (act === "edit-virt") { const v = findVirt(ds.ref!)!; return openSheet("form", { ref: v.ref, type: v.kind, date: v.date, lock: true, edit: true }); }
  if (act === "add") return openSheet("form", { date: ds.date, type: (ds.kind as Kind) || "tkd", lock: !!ds.lock, ref: ds.ref });
  if (act === "del") {
    if (S.pendingDelete === ds.id) { S.pendingDelete = null; await removeLog(ds.id!); toast("Poistettu"); if (S.sheet?.kind === "event") S.sheet = null; }
    else S.pendingDelete = ds.id!;
    return render();
  }
  if (act === "move-session") {
    const d = mvDate(); if (!d) return;
    const s = schedule(ctx()).find((x) => x.key === ds.key)!, moves = { ...(st.moves || {}) };
    if (d === s.orig) delete moves[s.key]; else moves[s.key] = d;
    await saveSettings({ moves }); closeSheet(); toast(`Juoksu siirretty: ${fiLong(d)}`); return render();
  }
  if (act === "unmove") { const moves = { ...(st.moves || {}) }; delete moves[ds.key!]; await saveSettings({ moves }); closeSheet(); toast("Juoksu palautettu"); return render(); }
  if (act === "unoverride") { const ov = { ...(st.overrides || {}) }; delete ov[ds.key!]; await saveSettings({ overrides: ov }); closeSheet(); toast("Alkuperäinen treeni palautettu"); return render(); }
  if (act === "skip") { await saveSettings({ skips: { ...(st.skips || {}), [ds.key!]: true } }); closeSheet(); toast("Treeni ohitettu"); return render(); }
  if (act === "unskip") { const skips = { ...(st.skips || {}) }; delete skips[ds.key!]; await saveSettings({ skips }); closeSheet(); return render(); }
  if (act === "move-event") {
    const d = mvDate(); if (!d) return;
    const l = S.logs.find((x) => x.id === ds.id)!;
    if (await putLog({ ...l, date: d })) { closeSheet(); toast(`Siirretty: ${fiLong(d)}`); render(); }
    return;
  }
  if (act === "skip-virt") { await saveSettings({ rSkips: [...(st.rSkips || []), ds.ref!] }); closeSheet(); toast("Poistettu tältä kerralta"); return render(); }
  if (act === "move-virt") {
    const d = mvDate(), v = findVirt(ds.ref!);
    if (!d || !v || d === v.date) return;
    const entry: LogEntry = { id: uid(), kind: v.kind, date: d, minutes: v.minutes, note: "", status: "planned", ruleRef: v.ref, createdAt: Date.now() };
    if (v.label) entry.label = v.label;
    await putLog(entry);
    closeSheet(); toast(`${titleOf(v)} siirretty: ${fiLong(d)}`); return render();
  }
  if (act === "rule-min") {
    const m = +inputVal("r-min"); if (!(m > 0)) return;
    await saveSettings({ recurring: rules().map((r) => (r.id === ds.id ? { ...r, minutes: m } : r)) });
    closeSheet(); toast("Kesto päivitetty kaikille tuleville kerroille"); return render();
  }
  if (act === "rule-end") {
    if (S.pendingDelete !== ds.id) { S.pendingDelete = ds.id!; return S.sheet ? renderSheet() : render(); }
    const until = addDays(ds.from || today, -1);
    await saveSettings({ recurring: rules().map((r) => (r.id === ds.id ? { ...r, until } : r)) });
    S.pendingDelete = null; closeSheet(); toast("Toisto lopetettu"); return render();
  }
  if (act === "repeat") { await saveSettings(repeatPatch(st, +ds.base!)); toast("Viikko lisätty uudelleen ohjelmaan"); return render(); }
  if (act === "dismiss") { await saveSettings({ dismissed: [...(st.dismissed || []), +ds.slot!] }); return render(); }
  if (act === "clear-repeats") { await saveSettings({ repeats: [] }); toast("Toistot poistettu"); return render(); }
  if (act === "clear-moves") { await saveSettings({ moves: {} }); toast("Juoksut palautettu"); return render(); }
  if (act === "clear-overrides") { await saveSettings({ overrides: {} }); toast("Alkuperäiset juoksut palautettu"); return render(); }
  if (act === "coach-run") return runCoach();
  if (act === "coach-stop") { coachCtl?.abort(); return; }
  if (act === "prop-ok") return applyProposal(+ds.i!, true);
  if (act === "prop-no") return applyProposal(+ds.i!, false);
  if (act === "login" || act === "signup") {
    const email = inputVal("a-email");
    openSheet("login", { signup: act === "signup" });
    const el = $<HTMLInputElement>("a-email");
    if (el) { el.value = email; (email ? $("a-pw") : el)?.focus(); }
    return;
  }
  if (act === "reset-pw") {
    const email = inputVal("a-email").trim(), err = $("a-err")!;
    if (!email) { err.textContent = "Kirjoita ensin sähköpostiosoitteesi."; err.hidden = false; return; }
    try { await resetPassword(email); err.hidden = true; toast("Salasanan palautuslinkki lähetetty sähköpostiisi"); }
    catch (e) { err.textContent = authErrorText(e); err.hidden = false; }
    return;
  }
  if (act === "logout") { await signOutUser(); return; }
  if (act === "migrate") return migrateLocal();
  if (act === "migrate-no") { S.offerMigrate = false; return render(); }
  if (act === "export") return exportData();
  if (act === "import") { $("import-file")?.click(); return; }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sheet) closeSheet(); });
document.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "import-file" && t.files?.[0]) { void importData(t.files[0]); t.value = ""; return; }
  if (t.name !== "p-n") return;
  const def = +t.value === 3 ? [0, 2, 5] : [2, 5];
  document.querySelectorAll<HTMLInputElement>('input[name="p-run"]').forEach((i) => { i.checked = def.includes(+i.value); });
});
document.addEventListener("submit", async (ev) => {
  if ((ev.target as HTMLElement).id === "login-form") {
    ev.preventDefault();
    const email = inputVal("a-email").trim(), pw = inputVal("a-pw"), err = $("a-err")!, btn = $<HTMLButtonElement>("a-submit")!;
    const up = !!S.sheet?.signup;
    if (!email || !pw) { err.textContent = "Anna sähköposti ja salasana."; err.hidden = false; return; }
    btn.disabled = true;
    try {
      await (up ? signUpEmail(email, pw) : signInEmail(email, pw));
      closeSheet(); toast(up ? "Tunnus luotu – olet kirjautuneena" : "Kirjauduttu sisään");
    } catch (e) { err.textContent = authErrorText(e); err.hidden = false; btn.disabled = false; }
    return;
  }
  if ((ev.target as HTMLElement).id !== "prefs-form") return;
  ev.preventDefault();
  const n = +(document.querySelector<HTMLInputElement>('input[name="p-n"]:checked')?.value || 2);
  const runDays = [...document.querySelectorAll<HTMLInputElement>('input[name="p-run"]:checked')].map((i) => +i.value);
  const err = $("p-err")!;
  if (runDays.length !== n) { err.textContent = `Valitse ${n} juoksupäivää (nyt ${runDays.length}).`; err.hidden = false; return; }
  const start = inputVal("p-start");
  if (!start) { err.textContent = "Valitse aloituspäivä."; err.hidden = false; return; }
  const programId = document.querySelector<HTMLInputElement>('input[name="p-prog"]:checked')?.value || programIdOf(settings());
  // Ohjelman tai juoksukertojen vaihto muuttaa juoksujen avaimet → siirrot, ohitukset ja muokkaukset nollataan.
  const changed = n !== settings().runDays.length || programId !== programIdOf(settings());
  await saveSettings({ programId, startDate: mondayOf(start), runDays, tkdMin: +inputVal("p-tkdmin") || 75, ...(changed ? { moves: {}, skips: {}, repeats: [], overrides: {}, dismissed: [] } : {}) });
  toast("Asetukset tallennettu"); render();
});

/* ---------- render ---------- */
const wide = matchMedia("(min-width: 960px)");
const VIEWS: View[] = ["today", "calendar", "plan", "coach", "prefs"];
function render() {
  const v = S.view, right = wide.matches ? (v === "today" ? "calendar" : v) : v;
  for (const id of VIEWS) $("v-" + id)!.hidden = wide.matches ? !(id === "today" || id === right) : id !== v;
  document.querySelectorAll<HTMLElement>("nav [data-go]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.go === (b.closest("#topnav") ? right : v))));
  const focusQ = document.activeElement?.id === "c-q";
  renderToday(); renderCalendar(); renderPlan(); renderCoach(); renderPrefs();
  if (focusQ) { const q = $<HTMLTextAreaElement>("c-q"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  if (S.sheet) renderSheet();
  $("sync")!.textContent = S.connecting ? "Yhdistetään…" : S.store.mode === "cloud" ? "Tallentuu tilillesi" : "Vain tämä selain";
}
wide.addEventListener("change", render);

/* ---------- käynnistys ---------- */
let unsubscribe: () => void = () => {};
function useStore(store: Store) {
  unsubscribe();
  S.store = store;
  S.settings = null; S.logs = []; S.coach = null;
  S.loaded = { settings: false, logs: false };
  unsubscribe = store.subscribe((p) => {
    if ("settings" in p) { S.settings = p.settings ?? null; S.loaded.settings = true; }
    if ("logs" in p) { S.logs = p.logs ?? []; S.loaded.logs = true; }
    if ("coach" in p && !S.coachBusy) S.coach = p.coach ?? null;
    // Ensimmäinen kirjautuminen: tili on tyhjä mutta selaimessa on aiempia tietoja → tarjotaan siirtoa.
    if (store.mode === "cloud" && S.loaded.settings && S.loaded.logs)
      S.offerMigrate = !S.settings && !S.logs.length && hasLocalData();
    render();
  }, (msg) => toast(msg));
}

useStore(localStore());
render();
watchUser((user) => {
  S.user = user;
  S.authReady = true;
  S.connecting = false;
  const db = getFirebaseDb();
  useStore(user && db ? firestoreStore(db, user.uid) : localStore());
});
