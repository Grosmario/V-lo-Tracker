// features.js : améliorations du Plan vélo (VeloTracker), chargé APRÈS wahoo.js.
// 1. Courbe de puissance critique : puissance des blocs seuil dégressive selon la durée du bloc.
// 2. Bilan prévu vs réalisé après séance, avec questions et ajustement.
// 3. Graphique forme / fatigue / fraîcheur sur l'écran d'accueil.
// 4. Sauvegarde : export / import JSON, copies automatiques, rappel.
// PMA et VO2 restent calculées en % de la FTP, comme avant.
"use strict";
(function () {
  if (typeof S === "undefined" || typeof plan !== "function" || typeof LS === "undefined" || typeof ex !== "function") {
    console.warn("features.js : index.html non reconnu, module désactivé");
    return;
  }

  // ---------- styles ----------
  const css = `
.cf-chips{display:flex;flex-wrap:wrap;gap:6px}
.cf-chips button{min-height:40px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:600 14px var(--font-body);cursor:pointer}
.cf-chips button.on{border-color:var(--accent);background:var(--accent);color:var(--on-accent)}
.cf-kpis{display:flex;gap:18px;flex-wrap:wrap}
.cf-kpis div{display:flex;flex-direction:column}
.cf-kpis span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.cf-big{font-family:var(--font-display);font-size:34px;font-weight:700;line-height:1}
.cf-svg{width:100%;height:auto;display:block}
.cf-leg{font-size:12px;color:var(--muted)}
.cf-btns{display:flex;gap:8px;flex-wrap:wrap}
.cf-btns .btn2{margin-top:0}
.cf-inp{display:flex;gap:10px;flex-wrap:wrap}
.cf-inp label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)}
.cf-inp input{width:86px;font:16px var(--font-body);color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px}
.cf-tab td,.cf-tab th{padding:6px 8px 6px 0}
.cf-ok{color:var(--easy)}.cf-warn{color:var(--ss)}.cf-bad{color:var(--vo2)}
.cf-q{display:flex;flex-direction:column;gap:6px}
.cf-q b{font-size:14px}
.cf-note{border-left:3px solid var(--accent);padding-left:10px;font-size:15px}
`;
  const st0 = document.createElement("style");
  st0.textContent = css;
  document.head.appendChild(st0);

  const r0 = Math.round;
  const f1 = (x) => x.toFixed(1).replace(".", ",");
  const dm = (k) => k.slice(8, 10) + "/" + k.slice(5, 7);
  const sgn = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n);

  // =====================================================================
  // 1. COURBE DE PUISSANCE CRITIQUE
  // =====================================================================
  const CPK = "plan4wkg-cp", RVK = "plan4wkg-review", BKK = "plan4wkg-backup";
  // Valeurs d'origine : ton test de puissance critique (2 min à 331 W, 10 min à 225 W) -> CP 199 W, W' 15,9 kJ.
  // Les meilleurs efforts Strava ne sont pas des efforts maximaux (sorties de groupe, séances à blocs) : ils sous-estiment la courbe.
  // Durée en secondes -> watts (extérieur).
  const DEF_REC = { 120: 331, 600: 225 };
  const REC_LABEL = { 120: "2 min", 180: "3 min", 300: "5 min", 600: "10 min", 1200: "20 min", 2700: "45 min" };
  const CPS = Object.assign({ rec: null, adj: 0 }, LS.get(CPK, {}));
  if (!CPS.rec || typeof CPS.rec !== "object") CPS.rec = Object.assign({}, DEF_REC);
  CPS.adj = +CPS.adj || 0;
  const saveCP = () => LS.set(CPK, { rec: CPS.rec, adj: CPS.adj });
  const CAP = 0.98, KMAX = 0.99, ADJ_MIN = -0.10, ADJ_MAX = 0.03;

  // Régression linéaire travail = CP × t + W' sur les records de 2 à 60 min.
  function fitCP(rec) {
    const pts = [];
    Object.keys(rec).forEach((k) => { const t = +k, p = +rec[k]; if (t >= 120 && t <= 3600 && p > 0) pts.push([t, t * p]); });
    if (pts.length < 2) return null;
    const n = pts.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach((q) => { sx += q[0]; sy += q[1]; sxx += q[0] * q[0]; sxy += q[0] * q[1]; });
    const den = n * sxx - sx * sx;
    if (!den) return null;
    const cp = (n * sxy - sx * sy) / den, w = (sy - cp * sx) / n;
    return cp > 80 && cp < 400 && w > 4000 && w < 40000 ? { cp, w } : null;
  }
  function model() {
    const f = fitCP(CPS.rec);
    return f ? { cp: f.cp, w: f.w, ok: true } : { cp: S.ftpExt * 0.85, w: 15000, ok: false };
  }
  // Puissance maximale tenable (extérieur) sur un bloc de m minutes.
  const plim = (m) => { const c = model(); return c.cp + c.w / (60 * m); };
  const pctOf = (m, k) => Math.round((100 * k * plim(m)) / S.ftpExt);
  const capPct = (m) => Math.floor((100 * (CAP + Math.min(0, CPS.adj)) * plim(m)) / S.ftpExt);

  // Plafond : un bloc de 5 min ou plus ne dépasse jamais 98 % de la courbe pour sa durée.
  function capText(s) {
    return String(s).replace(/(\d+) × (\d+) min à \{(\d+)%\}/g, (m0, n, mm, pc) => {
      if (+mm < 5) return m0;
      const lim = capPct(+mm);
      return +pc > lim ? n + " × " + mm + " min à {" + lim + "%}" : m0;
    });
  }
  const _ex = ex;
  ex = function (s, f) { return _ex(capText(s), f); };
  if (typeof pctAvg === "function") {
    const _pa = pctAvg;
    pctAvg = function (main) { return _pa((main || []).map((m) => [m[0], capText(m[1])])); };
  }
  const _plan = plan;
  plan = function (d) {
    const p = _plan(d);
    try {
      const cut = (p.main || []).some((m) => capText(m[1]) !== m[1]) || ((p.ht && p.ht.m) || []).some((m) => capText(m[1]) !== m[1]);
      if (cut && !p.capNote) {
        p.capNote = true;
        p.note = (p.note ? p.note + " " : "") + "Puissance plafonnée à ta courbe de puissance critique (98 % pour la durée du bloc).";
      }
    } catch (e) { /* on garde le plan tel quel */ }
    return p;
  };

  // Progression seuil : intensité = fraction de la courbe, donc la puissance baisse quand le bloc s'allonge.
  const KS = [0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.92, 0.94, 0.96, 0.98];
  const kOf = (st) => Math.min(KMAX, (KS[st] != null ? KS[st] : 0.9) + CPS.adj);
  if (typeof SEUIL_TABLE !== "undefined") {
    SEUIL_TABLE.forEach((e, i) => {
      const k = KS[i] != null ? KS[i] : 0.9;
      e.lbl = (k < 0.94 ? "SS " : "Seuil ") + Math.round(k * 100) + " % courbe · " + e.m + " min";
    });
  }
  if (typeof seuilProgression === "function" && typeof SEUIL_TABLE !== "undefined" && typeof sb === "function") {
    seuilProgression = function (p, d) {
      const st = +S.seuilStage || 0;
      if (iso(d) < (S.seuilStageFrom || "2026-11-30")) return p;
      if (st >= SEUIL_TABLE.length) return p;
      const e = SEUIL_TABLE[st], k = kOf(st), pct = pctOf(e.m, k);
      const b = sb(e.n, e.m, pct, e.r);
      const W = WARM[p.warm] || WARM.none;
      const dur = Math.round((W.min + b[0] + W.cool[0]) / 5) * 5;
      const wE = r0(k * plim(e.m)), wH = r0((wE * S.ftpHT) / S.ftpExt);
      const adjTxt = CPS.adj ? " (ajustement " + sgn(r0(CPS.adj * 100)) + " pt)" : "";
      return Object.assign({}, p, {
        main: [[b[0], b[1]]], dur, title: e.lbl,
        note: (p.note ? p.note + " · " : "") + "Palier " + (st + 1) + "/" + SEUIL_TABLE.length + " : " + r0(k * 100) + " % de ta courbe de puissance critique pour " + e.m + " min, soit ≈ " + wE + " W en extérieur et ≈ " + wH + " W en home trainer" + adjTxt + ". Plus le bloc s'allonge, plus la puissance baisse."
      });
    };
  }

  function curveSVG() {
    const c = model(), VW = 340, VH = 180, L = 36, R = 12, T = 10, B = 26;
    const X = (t) => L + (Math.log(t / 60) / Math.log(60)) * (VW - L - R);
    const pts = Object.keys(CPS.rec).map((k) => [+k, +CPS.rec[k]]).filter((q) => q[1] > 0);
    const hi = Math.ceil(Math.max(c.cp + c.w / 60, S.ftpExt) / 100) * 100, lo = Math.max(0, Math.floor((c.cp * 0.7) / 50) * 50);
    const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (VH - T - B);
    let line = "";
    for (let t = 60; t <= 3600; t += 30) line += X(t).toFixed(1) + "," + Y(c.cp + c.w / t).toFixed(1) + " ";
    let grid = "";
    for (let v = Math.ceil(lo / 100) * 100; v <= hi; v += 100) grid += `<line x1="${L}" x2="${VW - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" style="stroke:var(--line)"></line><text x="${L - 4}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" style="fill:var(--muted);font:11px var(--font-mono)">${v}</text>`;
    const xt = [[60, "1 min"], [120, "2"], [300, "5"], [600, "10"], [1200, "20"], [3600, "60 min"]];
    const xl = xt.map((q) => `<text x="${X(q[0]).toFixed(1)}" y="${VH - 8}" text-anchor="middle" style="fill:var(--muted);font:11px var(--font-mono)">${q[1]}</text>`).join("");
    const dots = pts.map((q) => `<circle cx="${X(q[0]).toFixed(1)}" cy="${Y(q[1]).toFixed(1)}" r="3.5" style="fill:var(--fg)"></circle>`).join("");
    return `<svg class="cf-svg" viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Courbe de puissance critique, puissance tenable selon la durée">
${grid}${xl}
<line x1="${L}" x2="${VW - R}" y1="${Y(S.ftpExt).toFixed(1)}" y2="${Y(S.ftpExt).toFixed(1)}" style="stroke:var(--ss);stroke-dasharray:5 4"></line>
<text x="${VW - R}" y="${(Y(S.ftpExt) - 4).toFixed(1)}" text-anchor="end" style="fill:var(--ss);font:600 11px var(--font-body)">FTP réglée ${S.ftpExt} W</text>
<polyline points="${line}" style="fill:none;stroke:var(--accent);stroke-width:2.5"></polyline>${dots}
</svg>`;
  }

  function renderCP() {
    const c = model(), ratio = S.ftpHT / S.ftpExt, st = +S.seuilStage || 0;
    const rows = [5, 8, 10, 12, 15, 20].map((m) => `<tr><td>${m} min</td><td class="mono">${r0(plim(m))} W</td><td class="mono">${r0(0.9 * plim(m))} W</td><td class="mono">${r0(CAP * plim(m))} W</td></tr>`).join("");
    const e = typeof SEUIL_TABLE !== "undefined" ? SEUIL_TABLE[st] : null;
    const cur = e ? `Palier actuel : ${e.n} × ${e.m} min à ≈ ${r0(kOf(st) * plim(e.m))} W en extérieur (≈ ${r0(kOf(st) * plim(e.m) * ratio)} W en home trainer).` : "Progression seuil terminée : le plan normal reprend, avec le plafond de la courbe.";
    const gap = c.ok
      ? `Ta FTP réglée est de ${S.ftpExt} W ; la courbe donne ${r0(plim(20))} W sur 20 min et ${r0(plim(60))} W sur 1 h. ${c.cp < S.ftpExt * 0.9 ? "Ta CP est nettement sous ta FTP réglée : les blocs seuil suivent la courbe, pas la FTP. " : ""}PMA et VO2 restent en % de la FTP.`
      : "Records insuffisants ou incohérents : courbe de secours (CP = 85 % de la FTP). Complète les records ci-dessous.";
    const inputs = Object.keys(REC_LABEL).map((k) => `<label>${REC_LABEL[k]} (W)<input type="number" inputmode="numeric" data-cfrec="${k}" value="${CPS.rec[k] != null ? CPS.rec[k] : ""}"></label>`).join("");
    el.cp.innerHTML = `<div class="when"><span class="eyebrow">Séances seuil</span><h2>Courbe de puissance critique</h2></div>
<div class="cf-kpis"><div><span>CP extérieur</span><b class="cf-big">${r0(c.cp)} W</b></div><div><span>CP home trainer</span><b class="cf-big">${r0(c.cp * ratio)} W</b></div><div><span>W′</span><b class="cf-big">${f1(c.w / 1000)} kJ</b></div></div>
${curveSVG()}
<div class="cf-leg">Ligne orange : puissance maximale tenable selon la durée · points blancs : tes records · tirets : FTP réglée</div>
<p>${esc(gap)}</p>
<p>${esc(cur)}</p>
<div class="scroll"><table class="cf-tab"><thead><tr><th>Bloc</th><th>Limite</th><th>À 90 %</th><th>Plafond 98 %</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted" style="font-size:13px">Watts en extérieur ; en home trainer, compte environ ${Math.round((1 - ratio) * 100)} % de moins. Plus le bloc s'allonge, plus la limite baisse, donc la cible aussi.</p>
<p><b>Ajustement du seuil : ${sgn(r0(CPS.adj * 100))} pt</b> <span class="muted">(1 pt ≈ 2 W)</span></p>
<div class="cf-btns"><button class="btn2" data-cf="adj" data-v="-0.01">−1 pt</button><button class="btn2" data-cf="adj" data-v="0.01">+1 pt</button><button class="btn2" data-cf="adj" data-v="0">Remettre à 0</button></div>
<details><summary>Mettre à jour mes records</summary><div class="cf-inp" style="margin-top:8px">${inputs}</div><p class="muted" style="font-size:13px;margin-top:8px">Mets des efforts réellement maximaux (test, course, effort à fond). Valeurs d'origine : ton test 2 min à 331 W et 10 min à 225 W. Un effort plus fort fait monter la courbe, donc les cibles ; les meilleurs efforts Strava de sorties non maximales la feraient baisser à tort.</p><button class="btn2" data-cf="recreset">Revenir aux valeurs d'origine</button></details>`;
  }

  // =====================================================================
  // 2. BILAN PRÉVU VS RÉALISÉ
  // =====================================================================
  let RVD = LS.get(RVK, {});
  const saveRV = () => LS.set(RVK, RVD);
  const CF = { rvDate: null };

  function reviewDates() {
    const set = new Set();
    Object.keys(STRAVA || {}).forEach((k) => set.add(k));
    Object.keys(DONE || {}).forEach((k) => set.add(k));
    Object.keys(RPE || {}).forEach((k) => set.add(k));
    const lim = iso(addD(today, -21)), end = iso(today), st = iso(START);
    return Array.from(set).filter((k) => /^\d{4}-\d\d-\d\d$/.test(k) && k <= end && k >= lim && k >= st).sort().reverse();
  }
  function num(s) { return parseFloat(String(s).replace(",", ".")); }
  const secOf = (v, u) => (u === "s" ? num(v) : num(v) * 60);

  // Profil prévu : segments [secondes, watts] reconstruits depuis le texte de la séance.
  function planProfile(p, main, durMin, ftp) {
    const segs = [], W = WARM[p.warm] || WARM.none;
    if (W.min) segs.push([W.min * 60, 0.62 * ftp]);
    const t = (main || []).map((x) => String(ex(x[1], ftp)).replace(/&#39;/g, "'")).join(" ; ");
    let m, ok = false;
    if ((m = t.match(/(\d+) × \((\d+) × (\d+(?:,\d+)?) (s|min) à (\d+) W \/ (\d+(?:,\d+)?) (s|min) à (\d+) W\) — (\d+) min à (\d+) W/))) {
      const nS = +m[1], nR = +m[2];
      for (let s = 0; s < nS; s++) {
        for (let r = 0; r < nR; r++) { segs.push([secOf(m[3], m[4]), +m[5]]); segs.push([secOf(m[6], m[7]), +m[8]]); }
        if (s < nS - 1) segs.push([+m[9] * 60, +m[10]]);
      }
      ok = true;
    } else if ((m = t.match(/(\d+) × (\d+(?:,\d+)?) (min|s) à (\d+) W[^\d(]*?récup (\d+(?:,\d+)?) (min|s) à (\d+) W/))) {
      const n = +m[1];
      for (let i = 0; i < n; i++) { segs.push([secOf(m[2], m[3]), +m[4]]); if (i < n - 1) segs.push([secOf(m[5], m[6]), +m[7]]); }
      ok = true;
    } else if ((m = t.match(/(?:(\d+) h(?: (\d+))?|(\d+) min) à (\d+) W(?:–(\d+) W)?/))) {
      const mins = m[3] != null ? +m[3] : +m[1] * 60 + (+m[2] || 0);
      segs.push([mins * 60, m[5] ? (+m[4] + +m[5]) / 2 : +m[4]]);
      ok = true;
    }
    if (!ok) {
      const ws = (t.match(/(\d+) W/g) || []).map((x) => parseInt(x, 10));
      const rest = (durMin - W.min - W.cool[0]) * 60;
      if (!ws.length || rest <= 0) return null;
      segs.push([rest, ws.reduce((a, b) => a + b, 0) / ws.length]);
    }
    if (W.cool[0]) segs.push([W.cool[0] * 60, 0.52 * ftp]);
    const sec = segs.reduce((a, s) => a + s[0], 0);
    if (!sec) return null;
    const work = segs.reduce((a, s) => a + s[0] * s[1], 0);
    const p4 = segs.reduce((a, s) => a + s[0] * Math.pow(s[1], 4), 0);
    return { sec, avg: work / sec, np: Math.pow(p4 / sec, 0.25), kj: work / 1000 };
  }

  function rpeRange(kind) {
    const s = (typeof RV !== "undefined" && RV[kind]) || "";
    const m = String(s).match(/(\d+)(?:[–-](\d+))?/);
    return m ? [+m[1], +(m[2] || m[1])] : null;
  }

  function analyse(dk) {
    const d = parse(dk), p = plan(d), A = RVD[dk] || {};
    const acts = Object.values(ACTIVITIES || {}).filter((a) => a && a.date === dk);
    const trainer = acts.some((a) => a.trainer);
    const ftp = trainer ? S.ftpHT : S.ftpExt;
    const useHT = trainer && p.ht;
    const main = useHT ? p.ht.m : p.main, dur = useHT ? p.ht.dur : p.dur;
    const sd = STRAVA && STRAVA[dk] && !STRAVA[dk].legacy ? STRAVA[dk] : null;
    const pr = dur > 0 && p.kind !== "group" ? planProfile(p, main, dur, ftp) : null;
    const rpe = +RPE[dk] || 0, hi = rpeRange(p.kind);
    let verdict = null;
    if (pr && sd && sd.avgPower) {
      const rAvg = sd.avgPower / pr.avg, rDur = sd.dur / (pr.sec / 60);
      if (rDur < 0.8 || rAvg < 0.85) verdict = { cls: "cf-warn", kind: "under", txt: "En dessous du prévu : " + (rDur < 0.8 ? "séance écourtée" : "puissance moyenne plus basse") + "." };
      else if (rAvg > 1.1) verdict = { cls: "cf-bad", kind: "over", txt: "Au-dessus du prévu : tu as roulé plus fort que la séance." };
      else verdict = { cls: "cf-ok", kind: "ok", txt: "Conforme au prévu." };
    }
    const sign = {
      under: (verdict && verdict.kind === "under") || A.reps === "non",
      hot: rpe >= 9 || (hi && rpe > hi[1]),
      heavy: A.legs === "lourdes",
      tired: A.next === "souffler",
      easy: !!(hi && rpe && rpe <= hi[0] - 1 && A.reps !== "non"),
      ready: A.next === "monter"
    };
    let sug = { txt: "Rien à changer : on garde la séance prévue.", adj: null };
    const isSS = p.kind === "ss";
    const down = sign.under || sign.hot || sign.heavy || sign.tired;
    if (isSS && down) sug = { txt: "Séance plus dure que prévu ou jambes fatiguées : on garde le palier et on allège la prochaine séance seuil de 2 pts de courbe (≈ 4 W).", adj: -0.02 };
    else if (isSS && (sign.easy || sign.ready) && A.reps !== "non" && !sign.heavy) sug = { txt: "Tu as de la marge : tu peux monter de 2 pts de courbe, ou valider le palier suivant dans « Évolution des séances » (deux séances à RPE ≤ 7).", adj: 0.02 };
    else if (p.kind === "vo2" && down) sug = { txt: "VO2 / PMA difficile : garde 3 min de récup entre les efforts et vise la puissance basse de la fourchette. La séance clé suivante reste la même.", adj: null };
    else if (["endu", "easy", "free"].includes(p.kind) && rpe >= 6) sug = { txt: "Sortie facile ressentie dure : reste sous 70 % de la FTP et laisse la fatigue retomber.", adj: null };
    return { dk, d, p, A, sd, pr, rpe, hi, verdict, sug, trainer, ftp };
  }

  const cell = (x, u) => (x == null || !isFinite(x) ? "—" : r0(x) + u);
  const delta = (a, b) => (a == null || b == null || !b ? "—" : sgn(r0(((a - b) / b) * 100)) + " %");

  function reviewText(R) {
    const L = [];
    L.push(JF[R.d.getDay()] + " " + R.d.getDate() + " " + MF[R.d.getMonth()] + " : " + R.p.title);
    if (R.pr) L.push("Prévu : " + r0(R.pr.sec / 60) + " min, " + r0(R.pr.avg) + " W moy., " + r0(R.pr.np) + " W norm., " + r0(R.pr.kj) + " kJ");
    if (R.sd) L.push("Réalisé (Strava) : " + R.sd.dur + " min, " + (R.sd.avgPower ? R.sd.avgPower + " W moy., " : "") + (R.sd.weighted ? R.sd.weighted + " W norm., " : "") + R.sd.kj + " kJ" + (R.sd.avgHr ? ", FC " + R.sd.avgHr + " bpm" : ""));
    if (R.verdict) L.push("Verdict de l'appli : " + R.verdict.txt);
    L.push("RPE : " + (R.rpe || "non noté") + (R.hi ? " (visé " + R.hi[0] + (R.hi[1] !== R.hi[0] ? "–" + R.hi[1] : "") + ")" : ""));
    const A = R.A, lab = { oui: "toutes", presque: "presque toutes", non: "pas toutes", fraiches: "fraîches", ok: "correctes", lourdes: "lourdes", monter: "prêt à monter", souffler: "besoin de souffler" };
    if (A.reps) L.push("Reps terminées : " + lab[A.reps]);
    if (A.legs) L.push("Jambes : " + lab[A.legs]);
    if (A.next) L.push("Pour la suite : " + (A.next === "ok" ? "OK comme prévu" : lab[A.next]));
    if (A.note) L.push("Note : " + A.note);
    return L.join("\n");
  }

  function renderReview() {
    const dates = reviewDates();
    if (!dates.length) {
      el.rv.innerHTML = `<div class="when"><span class="eyebrow">Après la séance</span><h2>Prévu vs réalisé</h2></div><p class="muted">Aucune sortie récente à analyser. Synchronise Strava ou note un RPE pour obtenir un bilan.</p>`;
      return;
    }
    if (!CF.rvDate || dates.indexOf(CF.rvDate) < 0) CF.rvDate = dates[0];
    const i = dates.indexOf(CF.rvDate), R = analyse(CF.rvDate), A = R.A;
    const chip = (q, v, lab) => `<button data-cf="q" data-q="${q}" data-v="${v}" class="${A[q] === v ? "on" : ""}">${lab}</button>`;
    let rows = "";
    if (R.pr || R.sd) {
      const a = R.sd || {};
      rows = `<div class="scroll"><table class="cf-tab"><thead><tr><th></th><th>Prévu</th><th>Réalisé</th><th>Écart</th></tr></thead><tbody>
<tr><td>Durée</td><td class="mono">${R.pr ? r0(R.pr.sec / 60) + " min" : "—"}</td><td class="mono">${a.dur ? a.dur + " min" : "—"}</td><td class="mono">${delta(a.dur, R.pr && R.pr.sec / 60)}</td></tr>
<tr><td>Puissance moy.</td><td class="mono">${R.pr ? cell(R.pr.avg, " W") : "—"}</td><td class="mono">${a.avgPower ? a.avgPower + " W" : "—"}</td><td class="mono">${delta(a.avgPower, R.pr && R.pr.avg)}</td></tr>
<tr><td>Puissance norm.</td><td class="mono">${R.pr ? cell(R.pr.np, " W") : "—"}</td><td class="mono">${a.weighted ? a.weighted + " W" : "—"}</td><td class="mono">${delta(a.weighted, R.pr && R.pr.np)}</td></tr>
<tr><td>Travail</td><td class="mono">${R.pr ? cell(R.pr.kj, " kJ") : "—"}</td><td class="mono">${a.kj ? a.kj + " kJ" : "—"}</td><td class="mono">${delta(a.kj, R.pr && R.pr.kj)}</td></tr>
<tr><td>FC moyenne</td><td class="mono">—</td><td class="mono">${a.avgHr ? a.avgHr + " bpm" : "—"}</td><td class="mono">—</td></tr>
<tr><td>RPE</td><td class="mono">${R.hi ? R.hi[0] + (R.hi[1] !== R.hi[0] ? "–" + R.hi[1] : "") : "—"}</td><td class="mono">${R.rpe || "—"}</td><td class="mono">${R.hi && R.rpe ? sgn(R.rpe - R.hi[1] > 0 ? R.rpe - R.hi[1] : R.rpe < R.hi[0] ? R.rpe - R.hi[0] : 0) : "—"}</td></tr>
</tbody></table></div>`;
    } else rows = `<p class="muted">Pas d'activité synchronisée ce jour-là : le bilan repose sur ton RPE et tes réponses.</p>`;
    el.rv.innerHTML = `<div class="when"><span class="eyebrow">Après la séance</span><h2>Prévu vs réalisé</h2></div>
<div class="cf-btns"><button class="btn2" data-cf="rvprev"${i >= dates.length - 1 ? " disabled" : ""}>← Plus ancien</button><button class="btn2" data-cf="rvnext"${i <= 0 ? " disabled" : ""}>Plus récent →</button></div>
<div class="when"><span class="day">${JF[R.d.getDay()]} ${R.d.getDate()} ${MF[R.d.getMonth()]}</span><span class="dur">${esc(R.p.title)}${R.trainer ? " · home trainer" : ""}</span></div>
${rows}
${R.verdict ? `<p class="${R.verdict.cls}"><b>${esc(R.verdict.txt)}</b></p>` : ""}
<div class="cf-q"><b>Reps terminées ?</b><div class="cf-chips">${chip("reps", "oui", "Toutes")}${chip("reps", "presque", "Presque")}${chip("reps", "non", "Pas toutes")}</div></div>
<div class="cf-q"><b>Jambes avant la séance ?</b><div class="cf-chips">${chip("legs", "fraiches", "Fraîches")}${chip("legs", "ok", "Correctes")}${chip("legs", "lourdes", "Lourdes")}</div></div>
<div class="cf-q"><b>Pour la suite ?</b><div class="cf-chips">${chip("next", "monter", "Prêt à monter")}${chip("next", "ok", "OK comme prévu")}${chip("next", "souffler", "Besoin de souffler")}</div></div>
<div class="fld" style="margin-top:0">Une remarque ?<textarea id="cfNote" data-d="${R.dk}" style="min-height:70px" placeholder="FC, ventilateur, sommeil, plantage MyWhoosh…">${esc(A.note || "")}</textarea></div>
<div class="cf-note"><b>Ajustement proposé</b><br>${esc(R.sug.txt)}</div>
<div class="cf-btns">${R.sug.adj ? `<button class="btn2" data-cf="adj" data-v="${R.sug.adj}" data-rel="1">${R.sug.adj < 0 ? "Alléger de 2 pts" : "Monter de 2 pts"}</button>` : ""}<button class="btn2" data-cf="copyrv">Copier le bilan pour le chat</button><span id="cfRvMsg" class="muted"></span></div>
<p class="muted" style="font-size:13px">Écarts calculés avec le résumé Strava de la sortie (pas les watts bloc par bloc) : une puissance moyenne basse veut surtout dire reps manquantes ou séance écourtée.</p>`;
  }

  // =====================================================================
  // 3. GRAPHIQUE FORME / FATIGUE / FRAÎCHEUR (accueil)
  // =====================================================================
  function fitnessSeries() {
    const out = {};
    let skipped = 0;
    Object.values(ACTIVITIES || {}).forEach((a) => {
      if (!a || !a.date) return;
      const sec = +a.moving_time || 0;
      if (sec <= 0) return;
      const ftp = a.trainer ? S.ftpHT : S.ftpExt;
      let np = +a.weighted_average_watts || 0;
      if (!np && +a.average_watts > 0) np = +a.average_watts;
      if (!np && a.kilojoules != null && +a.kilojoules > 0) np = (+a.kilojoules * 1000) / sec;
      if (!np) { skipped++; return; }
      out[a.date] = (out[a.date] || 0) + (sec * Math.pow(np / ftp, 2)) / 36;
    });
    const dates = Object.keys(out).sort();
    if (!dates.length) return null;
    const first = parse(dates[0]);
    let seed = 0, nSeed = 0;
    for (let i = 0; i < 21; i++) { seed += out[iso(addD(first, i))] || 0; nSeed++; }
    let ctl = seed / nSeed, atl = ctl;
    const series = [];
    for (let d = first; d <= today; d = addD(d, 1)) {
      const t = out[iso(d)] || 0;
      ctl += (t - ctl) / 42;
      atl += (t - atl) / 7;
      series.push({ d: iso(d), ctl, atl, tsb: ctl - atl, tss: t });
    }
    const last = series[series.length - 1];
    return { series, skipped, ctl: last.ctl, atl: last.atl, tsb: last.tsb, week: series.slice(-7).reduce((s, x) => s + x.tss, 0), days: series.length };
  }

  function fitChart(F) {
    const s = F.series.slice(-56), VW = 340, VH = 190, L = 32, R = 34, T = 10, B = 24;
    const vals = [0];
    s.forEach((x) => { vals.push(x.ctl, x.atl, x.tsb); });
    const lo = Math.floor(Math.min.apply(null, vals) / 10) * 10, hi = Math.ceil(Math.max.apply(null, vals) / 10) * 10 + 10;
    const step = hi - lo > 80 ? 20 : 10;
    const X = (i) => L + (s.length > 1 ? (i / (s.length - 1)) * (VW - L - R) : 0);
    const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (VH - T - B);
    let grid = "";
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid += `<line x1="${L}" x2="${VW - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" style="stroke:${v === 0 ? "var(--muted)" : "var(--line)"}"></line><text x="${L - 4}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" style="fill:var(--muted);font:11px var(--font-mono)">${v}</text>`;
    let xl = "";
    for (let i = s.length - 1; i >= 0; i -= 14) xl += `<text x="${X(i).toFixed(1)}" y="${VH - 6}" text-anchor="middle" style="fill:var(--muted);font:11px var(--font-mono)">${dm(s[i].d)}</text>`;
    const line = (key, col, dash) => `<polyline points="${s.map((x, i) => X(i).toFixed(1) + "," + Y(x[key]).toFixed(1)).join(" ")}" style="fill:none;stroke:${col};stroke-width:2.2${dash ? ";stroke-dasharray:5 4" : ""}"></polyline>`;
    const li = s.length - 1, lastv = s[li];
    const end = (key, col) => `<circle cx="${X(li).toFixed(1)}" cy="${Y(lastv[key]).toFixed(1)}" r="3.5" style="fill:${col}"></circle>`;
    return `<svg class="cf-svg" viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Forme, fatigue et fraîcheur sur 8 semaines">${grid}${xl}${line("ctl", "var(--easy)")}${line("atl", "var(--vo2)")}${line("tsb", "var(--ss)", true)}${end("ctl", "var(--easy)")}${end("atl", "var(--vo2)")}${end("tsb", "var(--ss)")}</svg>`;
  }

  function renderFitHome() {
    const F = fitnessSeries();
    if (!F) {
      el.fit.innerHTML = `<div class="when"><span class="eyebrow">Forme et fatigue</span><h2>Pas encore de données</h2></div><p class="muted">Synchronise Strava (onglet Plan, Réglages) pour voir ta courbe de forme.</p>`;
      return;
    }
    const t = F.tsb;
    const lab = t > 5 ? "Frais" : t > -10 ? "Équilibré" : t > -25 ? "Fatigue productive" : "Fatigue élevée : à surveiller";
    el.fit.innerHTML = `<div class="when"><span class="eyebrow">Forme et fatigue · 8 semaines</span><h2>${lab}</h2></div>
<div class="cf-kpis"><div><span>Forme</span><b class="cf-big">${r0(F.ctl)}</b></div><div><span>Fatigue</span><b class="cf-big">${r0(F.atl)}</b></div><div><span>Fraîcheur</span><b class="cf-big">${r0(F.tsb)}</b></div><div><span>7 jours</span><b class="cf-big">${r0(F.week)}</b></div></div>
${fitChart(F)}
<div class="cf-leg"><span style="color:var(--easy)">━</span> forme (42 j) · <span style="color:var(--vo2)">━</span> fatigue (7 j) · <span style="color:var(--ss)">┅</span> fraîcheur = forme − fatigue</div>
<details><summary>Comment lire ce graphique</summary><p>La forme monte quand tu t'entraînes régulièrement. La fatigue réagit vite à tes dernières séances. La fraîcheur est la différence : autour de 0 à −10 tu es dans la zone où l'on progresse ; sous −25, lève le pied.</p><p class="muted" style="font-size:13px">Charge calculée depuis tes sorties Strava avec la puissance normalisée et ta FTP réglée (home trainer ou extérieur). Elle démarre au 5 oct. : les premières semaines sont lissées sur ton volume moyen.${F.skipped ? " " + F.skipped + " sortie(s) sans puissance ignorée(s)." : ""}</p></details>`;
  }

  // =====================================================================
  // 4. SAUVEGARDE
  // =====================================================================
  const EXCL = ["plan4wkg-stok", "plan4wkg-strava-session"];
  const okKey = (k) => /^plan4wkg-[a-z0-9-]+$/i.test(k) && EXCL.indexOf(k) < 0;
  function collect() {
    const data = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && okKey(k)) data[k] = localStorage.getItem(k); } } catch (e) { /* stockage indisponible */ }
    return data;
  }
  const backupObj = () => ({ app: "velotracker", version: 1, exportedAt: new Date().toISOString(), data: collect() });
  const hasData = () => Object.keys(DONE || {}).length + Object.keys(RPE || {}).length > 2;
  const BK = Object.assign({ lastExport: null, snooze: null }, LS.get(BKK, {}));
  const saveBK = () => LS.set(BKK, { lastExport: BK.lastExport, snooze: BK.snooze });
  const fileName = () => "velotracker-sauvegarde-" + iso(new Date()) + ".json";

  function markExported() { BK.lastExport = new Date().toISOString(); saveBK(); renderBan(); renderData(); }
  function exportFile() {
    const txt = JSON.stringify(backupObj());
    const blob = new Blob([txt], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    markExported();
  }
  function shareFile() {
    const f = new File([JSON.stringify(backupObj())], fileName(), { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: "Sauvegarde VeloTracker" }).then(markExported, () => {});
    else exportFile();
  }
  function copyBackup() {
    const txt = JSON.stringify(backupObj()), msg = $("#cfDataMsg");
    const done = () => { if (msg) msg.textContent = "Sauvegarde copiée. Colle-la dans un message ou une note."; markExported(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => { if (msg) msg.textContent = "Copie impossible : utilise l'export en fichier."; });
    else if (msg) msg.textContent = "Copie impossible : utilise l'export en fichier.";
  }

  // copies automatiques (IndexedDB), une par jour, 7 conservées
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("velotracker-backup", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("snaps", { keyPath: "id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function snapPut(snap) {
    const db = await idb();
    return new Promise((res, rej) => { const tx = db.transaction("snaps", "readwrite"); tx.objectStore("snaps").put(snap); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  }
  async function snapAll() {
    const db = await idb();
    return new Promise((res, rej) => { const q = db.transaction("snaps").objectStore("snaps").getAll(); q.onsuccess = () => res((q.result || []).sort((a, b) => b.at - a.at)); q.onerror = () => rej(q.error); });
  }
  async function snapPrune() {
    const all = await snapAll(), db = await idb();
    const daily = all.filter((s) => /^\d{4}-\d\d-\d\d$/.test(s.id)), safe = all.filter((s) => !/^\d{4}-\d\d-\d\d$/.test(s.id));
    const drop = daily.slice(7).concat(safe.slice(3));
    return new Promise((res) => { const tx = db.transaction("snaps", "readwrite"); drop.forEach((s) => tx.objectStore("snaps").delete(s.id)); tx.oncomplete = () => res(); tx.onerror = () => res(); });
  }
  async function autoSnap() {
    try {
      if (!hasData()) return;
      const all = await snapAll(), id = iso(new Date());
      if (!all.some((s) => s.id === id)) await snapPut({ id, at: Date.now(), data: collect() });
      await snapPrune();
      renderData();
    } catch (e) { console.warn("sauvegarde auto", e); }
  }

  async function applyBackup(data) {
    try { await snapPut({ id: "avant-" + Date.now(), at: Date.now(), data: collect() }); } catch (e) { /* on continue */ }
    try {
      const old = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && okKey(k)) old.push(k); }
      old.forEach((k) => { if (k !== BKK) localStorage.removeItem(k); });
      Object.keys(data).forEach((k) => { if (okKey(k) && typeof data[k] === "string") localStorage.setItem(k, data[k]); });
    } catch (e) { alert("Restauration impossible : " + e.message); return; }
    location.reload();
  }
  function importText(txt) {
    const msg = $("#cfDataMsg");
    let o;
    try { o = JSON.parse(txt); } catch (e) { if (msg) msg.textContent = "Fichier illisible : ce n'est pas du JSON."; return; }
    if (!o || o.app !== "velotracker" || !o.data || typeof o.data !== "object") { if (msg) msg.textContent = "Ce fichier n'est pas une sauvegarde VeloTracker."; return; }
    const n = Object.keys(o.data).filter(okKey).length;
    if (!n) { if (msg) msg.textContent = "La sauvegarde est vide."; return; }
    if (window.confirm("Remplacer tes données actuelles par cette sauvegarde (" + n + " éléments, du " + String(o.exportedAt || "").slice(0, 10) + ") ? Une copie des données actuelles est gardée avant.")) applyBackup(o.data);
  }

  function ago(iso0) {
    if (!iso0) return "jamais";
    const days = Math.floor((Date.now() - new Date(iso0).getTime()) / 864e5);
    return days <= 0 ? "aujourd'hui" : days === 1 ? "hier" : "il y a " + days + " jours";
  }
  function renderBan() {
    const old = BK.lastExport ? (Date.now() - new Date(BK.lastExport).getTime()) / 864e5 : 99;
    const snoozed = BK.snooze && Date.now() < new Date(BK.snooze).getTime();
    if (hasData() && old > 7 && !snoozed) el.ban.innerHTML = `<div class="banner" style="margin-bottom:22px">Dernière sauvegarde exportée : ${ago(BK.lastExport)}. Tes données ne sont que dans ce navigateur.<div class="cf-btns" style="margin-top:8px"><button class="btn2" data-cf="export">Exporter maintenant</button><button class="btn2" data-cf="snooze">Plus tard</button></div></div>`;
    else el.ban.innerHTML = "";
  }
  function renderData() {
    el.data.innerHTML = `<div class="when"><span class="eyebrow">Tes données</span><h2>Sauvegarde</h2></div>
<p>Dernier export : <b>${ago(BK.lastExport)}</b>. Le fichier contient tes séances faites, kilomètres, RPE, réglages, ajustements, comptes rendus et activités Strava importées. Le jeton de connexion Strava n'y est jamais mis.</p>
<div class="cf-btns"><button class="btn2" data-cf="export">Exporter (fichier)</button><button class="btn2" data-cf="share">Partager (iPhone)</button><button class="btn2" data-cf="copy">Copier</button></div>
<details><summary>Restaurer une sauvegarde</summary><div class="fld"><label for="cfImpFile">Choisir un fichier</label><input id="cfImpFile" type="file" accept="application/json,.json"></div><div class="fld">Ou coller le contenu<textarea id="cfImpTxt" style="min-height:90px" placeholder="Colle ici la sauvegarde"></textarea></div><button class="btn2" data-cf="import">Restaurer</button></details>
<details><summary>Copies automatiques sur cet appareil</summary><div id="cfSnaps"><p class="muted">Chargement…</p></div><p class="muted" style="font-size:13px">Une copie par jour, 7 gardées, pour revenir en arrière après une fausse manipulation. Elles restent dans le navigateur : si tu vides ses données, elles disparaissent aussi. L'export en fichier est la vraie sauvegarde.</p></details>
<span id="cfDataMsg" class="muted"></span>`;
    snapAll().then((all) => {
      const h = $("#cfSnaps");
      if (!h) return;
      h.innerHTML = all.length ? `<ul class="plain">${all.map((s) => `<li>${esc(s.id.indexOf("avant-") === 0 ? "Avant une restauration" : s.id)} · ${new Date(s.at).toLocaleString("fr-FR")} <button class="btn2" style="margin:0 0 0 6px;min-height:36px" data-cf="restore" data-id="${esc(s.id)}">Restaurer</button></li>`).join("")}</ul>` : `<p class="muted">Aucune copie pour le moment.</p>`;
    }).catch(() => { const h = $("#cfSnaps"); if (h) h.innerHTML = `<p class="muted">Copies automatiques indisponibles sur ce navigateur.</p>`; });
  }

  // =====================================================================
  // montage, rendu, actions
  // =====================================================================
  const el = {};
  function mount() {
    const sec = (id) => { const e = document.createElement("section"); e.id = id; e.className = "card"; return e; };
    el.cp = sec("cfCurve"); el.rv = sec("cfReview"); el.fit = sec("cfFitHome"); el.data = sec("cfData");
    el.ban = document.createElement("div"); el.ban.id = "cfBackupBan";
    const wrap = document.querySelector(".wrap");
    const after = (ref, node) => { if (ref) ref.after(node); else if (wrap) wrap.appendChild(node); };
    after(document.getElementById("waxban"), el.ban);
    after(document.getElementById("wxslot-daily") || document.getElementById("today"), el.fit);
    after(document.getElementById("adaptiveCoach"), el.rv);
    const pp = document.querySelector('[data-page="plan"]');
    if (pp) { pp.prepend(el.cp); pp.appendChild(el.data); } else { after(null, el.cp); after(null, el.data); }
  }
  function cfRender() {
    try {
      if (!el.cp) mount();
      renderBan(); renderFitHome(); renderReview(); renderCP(); renderData();
    } catch (e) { console.warn("features.js", e); }
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-cf]");
    if (!t) return;
    const a = t.dataset.cf, v = t.dataset.v;
    if (a === "adj") {
      CPS.adj = v === "0" ? 0 : Math.max(ADJ_MIN, Math.min(ADJ_MAX, r0((CPS.adj + parseFloat(v)) * 100) / 100));
      saveCP(); renderAll();
    }
    else if (a === "recreset") { CPS.rec = Object.assign({}, DEF_REC); saveCP(); renderAll(); }
    else if (a === "rvprev" || a === "rvnext") {
      const dates = reviewDates(), i = dates.indexOf(CF.rvDate), j = a === "rvprev" ? i + 1 : i - 1;
      if (dates[j]) { CF.rvDate = dates[j]; renderReview(); }
    }
    else if (a === "q") {
      const dk = CF.rvDate, q = t.dataset.q;
      if (!dk) return;
      RVD[dk] = RVD[dk] || {};
      if (RVD[dk][q] === v) delete RVD[dk][q]; else RVD[dk][q] = v;
      saveRV(); renderReview();
    }
    else if (a === "copyrv") {
      const txt = reviewText(analyse(CF.rvDate)), msg = $("#cfRvMsg");
      const done = () => { if (msg) msg.textContent = "Copié. Colle-le dans le chat."; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => { if (msg) msg.textContent = "Copie impossible."; });
      else if (msg) msg.textContent = "Copie impossible.";
    }
    else if (a === "export") exportFile();
    else if (a === "share") shareFile();
    else if (a === "copy") copyBackup();
    else if (a === "snooze") { BK.snooze = new Date(Date.now() + 2 * 864e5).toISOString(); saveBK(); renderBan(); }
    else if (a === "import") { const ta = $("#cfImpTxt"); if (ta && ta.value.trim()) importText(ta.value); else { const m = $("#cfDataMsg"); if (m) m.textContent = "Colle d'abord la sauvegarde, ou choisis un fichier."; } }
    else if (a === "restore") {
      snapAll().then((all) => {
        const s = all.find((x) => x.id === t.dataset.id);
        if (s && window.confirm("Restaurer la copie du " + new Date(s.at).toLocaleString("fr-FR") + " ? Les données actuelles sont gardées dans une copie « avant restauration ».")) applyBackup(s.data);
      }).catch(() => {});
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.cfrec) {
      if (+t.value > 0) CPS.rec[t.dataset.cfrec] = +t.value; else delete CPS.rec[t.dataset.cfrec];
      saveCP(); renderAll();
    } else if (t.id === "cfImpFile" && t.files && t.files[0]) {
      const fr = new FileReader();
      fr.onload = () => importText(String(fr.result));
      fr.readAsText(t.files[0]);
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "cfNote") {
      const dk = e.target.dataset.d;
      RVD[dk] = RVD[dk] || {};
      if (e.target.value) RVD[dk].note = e.target.value; else delete RVD[dk].note;
      saveRV();
    }
  });

  // ---------- accroches sur le rendu existant ----------
  const _ra = renderAll;
  renderAll = function () { _ra(); cfRender(); };
  if (typeof renderActivityPanel === "function") {
    const _rp = renderActivityPanel;
    renderActivityPanel = function () { _rp(); cfRender(); };
  }
  if (typeof renderAdaptiveCoach === "function") {
    const _rc = renderAdaptiveCoach;
    renderAdaptiveCoach = function () { _rc(); try { if (el.rv) renderReview(); } catch (e) { /* ignoré */ } };
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignoré */ }
  renderAll();
  autoSnap();
})();
