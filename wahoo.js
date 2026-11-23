// wahoo.js : surcouche "façon Wahoo" pour le Plan vélo (VeloTracker).
// Ajoute : profil 4DP, séance du jour recommandée, bibliothèque de séances par chaîne, forme / fatigue.
// Chargé APRÈS le script principal de index.html. Ne modifie pas la logique existante du plan.
"use strict";
(function () {
  if (typeof S === "undefined" || typeof plan !== "function" || typeof WARM === "undefined") {
    console.warn("wahoo.js : index.html non reconnu, surcouche désactivée");
    return;
  }

  // ---------- styles ----------
  const css = `
.wx-chips{display:flex;flex-wrap:wrap;gap:6px}
.wx-chips button{min-height:40px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:600 14px var(--font-body);cursor:pointer}
.wx-chips button.on{border-color:var(--accent);background:var(--accent);color:var(--on-accent)}
.wx-prof{width:100%;height:64px;display:block;border-bottom:1px solid var(--line)}
.wx-prof.big{height:96px}
.wx-leg{font-size:12px;color:var(--muted)}
.wx-dims{display:flex;gap:12px;flex-wrap:wrap}
.wx-dim{display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}
.wx-dim b{display:flex;gap:2px}
.wx-dim u{width:14px;height:5px;border-radius:2px;background:var(--line);text-decoration:none;display:block}
.wx-dim u.on{background:var(--accent)}
.wx-item{border-top:1px solid var(--line);padding:12px 0;display:flex;flex-direction:column;gap:8px}
.wx-item h3{font-size:22px}
.wx-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.wx-badge{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--on-accent);background:var(--accent);border-radius:3px;padding:1px 7px;white-space:nowrap}
.wx-btns{display:flex;gap:8px;flex-wrap:wrap}
.wx-btns .btn2{margin-top:0}
.wx-fit{width:100%;height:auto;display:block}
.wx-tab td,.wx-tab th{padding:6px 8px 6px 0}
.wx-big{font-family:var(--font-display);font-size:34px;font-weight:700;line-height:1}
.wx-kpis{display:flex;gap:18px;flex-wrap:wrap}
.wx-kpis div{display:flex;flex-direction:column}
.wx-kpis span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.wx-inp{display:flex;gap:10px;flex-wrap:wrap}
.wx-inp label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)}
.wx-inp input{width:96px;font:16px var(--font-body);color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px}
`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  // ---------- état ----------
  const WS = Object.assign({ dur: 60, ch: "seuil", open: null }, LS.get("plan4wkg-wx", {}));
  const saveWS = () => LS.set("plan4wkg-wx", { dur: WS.dur, ch: WS.ch, open: WS.open });
  const fm = (m) => (m < 1 ? Math.round(m * 60) + " s" : (Number.isInteger(m) ? m : String(m).replace(".", ",")) + " min");

  // ---------- bibliothèque ----------
  const CH = [["seuil", "Seuil"], ["vo2", "VO2 / PMA"], ["ana", "1 min"], ["sprint", "Sprint"], ["endu", "Endurance"], ["recup", "Souplesse"]];
  const KIND = { seuil: "ss", vo2: "vo2", ana: "hill", sprint: "hill", endu: "endu", recup: "easy" };
  const WARMK = { seuil: "th", vo2: "vo2", ana: "vo2", sprint: "vo2", endu: "easy", recup: "easy" };
  const RPEV = { seuil: "6–8", vo2: "8–9", ana: "8–9", sprint: "7–8", endu: "3–4", recup: "1–2" };
  const SOTXT = {
    seuil: typeof SO !== "undefined" && SO.ss ? SO.ss : "Route plate ou longue montée douce. Vise la moyenne du bloc.",
    vo2: typeof SO !== "undefined" && SO.vo2 ? SO.vo2 : "Montée de 3–5 % de 2–4 min ou ligne droite vent de face.",
    ana: "Faux plat montant ou ligne droite, sans virage. Bien échauffé, récup en roue libre.",
    sprint: "Ligne droite sans circulation, départ lancé. Récup complète : la qualité prime sur la quantité.",
    endu: "Reste en zone 2, même dans les petites bosses ; relance en douceur.",
    recup: "Rien de spécial : roule tranquille, relief faible."
  };
  const WPRE = { th: [[3, 55], [4, 68], [3, 77]], vo2: [[5, 55], [5, 70], [6, 80]] };

  const spikes = [];
  for (let i = 0; i < 9; i++) { spikes.push([9.67, 66]); spikes.push([0.33, 115]); }
  const endu = (n) => ({ ch: "endu", t: "Endurance " + n + " min", segs: [[n, 66]], txt: n + " min à {62%}–{70%} (Zone 2), régulier.", d: [0, 0, 0, 1], why: "Base aérobie : régulier, nasal, tu peux parler." });

  const RAW = [
    { ch: "seuil", t: "Tempo 4 × 6 min", on: [6, 78], off: [3, 55], reps: 4, d: [0, 0, 0, 2], why: "Construit la base du seuil sans te cramer : idéal en reprise ou en semaine chargée." },
    { ch: "seuil", t: "Sweet spot 2 × 8 min", on: [8, 88], off: [3, 55], reps: 2, d: [0, 0, 0, 2], why: "Version courte du sweet spot quand tu n'as que 30 à 35 min." },
    { ch: "seuil", t: "Sweet spot 3 × 8 min", on: [8, 88], off: [3, 55], reps: 3, d: [0, 0, 1, 3], why: "Le classique pour monter la durée au seuil sans payer le prix fort." },
    { ch: "seuil", t: "Sweet spot 3 × 12 min", on: [12, 88], off: [4, 55], reps: 3, d: [0, 0, 1, 3], why: "Blocs plus longs à la même puissance : tu apprends à tenir." },
    { ch: "seuil", t: "Sweet spot 2 × 20 min", on: [20, 88], off: [5, 55], reps: 2, d: [0, 0, 0, 3], why: "Gros volume au seuil bas pour la séance longue de la semaine." },
    { ch: "seuil", t: "Seuil 3 × 8 min", on: [8, 95], off: [3, 55], reps: 3, d: [0, 0, 1, 3], why: "Seuil franc, blocs courts : bonne marche avant les blocs de 15 min." },
    { ch: "seuil", t: "Seuil 2 × 15 min", on: [15, 95], off: [4, 55], reps: 2, d: [0, 0, 1, 3], why: "Le cœur du travail de seuil, deux blocs seulement." },
    { ch: "seuil", t: "Seuil 5 × 5 min", on: [5, 100], off: [3, 55], reps: 5, d: [0, 0, 2, 3], why: "Au FTP en blocs courts : plus dur mais plus facile à digérer mentalement." },
    { ch: "vo2", t: "VO2 4 × 2 min", on: [2, 107], off: [3, 55], reps: 4, d: [0, 2, 3, 1], why: "Efforts courts et intenses, ton terrain de jeu : monte le plafond aérobie." },
    { ch: "vo2", t: "VO2 6 × 2 min", on: [2, 107], off: [3, 55], reps: 6, d: [0, 2, 3, 1], why: "Même format avec plus de volume quand les jambes sont bonnes." },
    { ch: "vo2", t: "PMA 5 × 3 min", on: [3, 100], off: [3, 55], reps: 5, d: [0, 1, 3, 2], why: "Cible directement ton point faible (3 à 5 min)." },
    { ch: "vo2", t: "PMA 4 × 4 min", on: [4, 98], off: [4, 55], reps: 4, d: [0, 0, 3, 2], why: "Plus long, un peu moins intense : tient la puissance sur 4 min." },
    { ch: "vo2", t: "VO2 court 5 × 1 min", on: [1, 120], off: [2, 55], reps: 5, d: [0, 2, 2, 0], why: "Séance courte et nerveuse quand tu manques de temps." },
    { ch: "vo2", t: "30/30 : 2 séries de 8", on: [0.5, 125], off: [0.5, 50], reps: 8, sets: 2, setRest: 5, d: [0, 2, 3, 1], why: "Beaucoup de temps près du max aérobie en effort fractionné." },
    { ch: "ana", t: "1 min : 6 × 1 min", on: [1, 150], off: [3, 55], reps: 6, d: [1, 3, 1, 0], why: "Capacité anaérobie : efforts d'1 minute bien au-dessus du seuil." },
    { ch: "ana", t: "1 min : 8 × 30 s", on: [0.5, 170], off: [2, 55], reps: 8, d: [2, 3, 0, 0], why: "Plus explosif, récup longue : garde la qualité de chaque effort." },
    { ch: "sprint", t: "Sprints : 6 × 10 s", on: [10 / 60, 250], onTxt: "sprint maximal", off: [3, 50], reps: 6, d: [3, 1, 0, 0], why: "Entretient ta puissance maximale. Récup complète entre chaque sprint." },
    { ch: "sprint", t: "Sprints lancés : 5 × 15 s", on: [0.25, 220], onTxt: "sprint maximal, départ lancé", off: [4, 50], reps: 5, d: [3, 2, 0, 0], why: "Sprint plus long pour la vitesse de pointe." },
    Object.assign(endu(45), {}),
    endu(60),
    endu(90),
    endu(120),
    { ch: "endu", t: "Endurance 90 min avec sursauts", segs: spikes, txt: "90 min en Zone 2 ({62%}–{70%}), avec un sursaut de 20 s à {115%} toutes les 10 min, puis retour direct en Zone 2.", d: [1, 0, 0, 1], why: "Casse la monotonie sur home trainer sans quitter la zone 2." },
    { ch: "recup", t: "Souplesse 30 min", segs: [[30, 52]], txt: "30 min à {50%}–{55%}, jambes souples, cadence libre.", d: [0, 0, 0, 0], why: "Fais circuler les jambes sans rien coûter." },
    { ch: "recup", t: "Souplesse 45 min", segs: [[45, 52]], txt: "45 min à {50%}–{55%}, jambes souples, cadence libre.", d: [0, 0, 0, 0], why: "Sortie bonus très facile, zéro obligation." }
  ];

  function mkW(o, i) {
    const sets = o.sets || 1, reps = o.reps || 1, off = o.off || [0, 55], sr = o.setRest || 0;
    let segs = [];
    if (o.segs) segs = o.segs.slice();
    else {
      for (let s = 0; s < sets; s++) {
        for (let r = 0; r < reps; r++) {
          segs.push([o.on[0], o.on[1]]);
          if (r < reps - 1 && off[0]) segs.push([off[0], off[1]]);
        }
        if (s < sets - 1 && sr) segs.push([sr, 55]);
      }
    }
    const main = segs.reduce((a, s) => a + s[0], 0);
    let txt = o.txt;
    if (!txt) {
      const onP = o.onTxt ? o.onTxt : "à {" + o.on[1] + "%}";
      if (reps === 1 && sets === 1) txt = fm(o.on[0]) + " " + onP;
      else if (sets > 1) txt = sets + " × (" + reps + " × " + fm(o.on[0]) + " " + onP + " / " + fm(off[0]) + " à {" + off[1] + "%}) — " + sr + " min à {55%} entre séries";
      else txt = reps + " × " + fm(o.on[0]) + " " + onP + " — récup " + fm(off[0]) + " à {" + off[1] + "%}";
    }
    const warm = WARMK[o.ch], Wm = WARM[warm] || WARM.none;
    const dur = Math.round((Wm.min + main + Wm.cool[0]) / 5) * 5;
    const kind = KIND[o.ch];
    const hard = !(o.ch === "endu" || o.ch === "recup");
    return {
      id: o.ch + "-" + i, ch: o.ch, title: o.t, why: o.why, dims: o.d, segs, txt, warm, dur, kind, hard,
      spec: { kind, title: o.t, main: [txt], warm, dur, hard, note: o.why, so: SOTXT[o.ch] }
    };
  }
  const LIB = RAW.map(mkW);
  const byId = (id) => LIB.find((x) => x.id === id);

  // ---------- profil 4DP ----------
  function p4() {
    const o = LS.get("plan4wkg-4dp", {});
    return { nm: +o.nm > 0 ? +o.nm : 762, ac: +o.ac > 0 ? +o.ac : 458, kg: +o.kg > 0 ? +o.kg : 69 };
  }
  function dims4() {
    const v = p4(), f = S.ftpExt;
    const rows = [
      { k: "nm", l: "Sprint", sub: "5–15 s", w: v.nm, ref: 3.0 },
      { k: "ac", l: "1 minute", sub: "capacité anaérobie", w: v.ac, ref: 1.9 },
      { k: "map", l: "PMA", sub: "5 min", w: S.pma, ref: 1.2 },
      { k: "ftp", l: "Seuil", sub: "FTP ~20 min", w: f, ref: 1.0 }
    ];
    rows.forEach((r) => { r.wkg = r.w / v.kg; r.pct = r.w / (r.ref * f); });
    return rows;
  }
  function riderType() {
    const d = dims4(), a = d.slice(0, 3);
    const mx = a.reduce((m, x) => (x.pct > m.pct ? x : m), a[0]);
    const mn = a.reduce((m, x) => (x.pct < m.pct ? x : m), a[0]);
    if (mx.pct - mn.pct < 0.12) return "Rouleur (profil équilibré)";
    if (mx.pct < 1) return "Rouleur / chrono";
    return { nm: "Sprinteur", ac: "Attaquant", map: "Pursuiter" }[mx.k];
  }
  function weakIdx() {
    const d = dims4(), a = d.slice(0, 3);
    const mn = a.reduce((m, x, i) => (x.pct < a[m].pct ? i : m), 0);
    return a[mn].pct >= 1 ? 3 : mn;
  }
  function radarSVG() {
    const d = dims4(), cx = 110, cy = 100, R = 60;
    const ang = [-90, 0, 90, 180].map((a) => (a * Math.PI) / 180);
    const pt = (i, r) => (cx + r * Math.cos(ang[i])).toFixed(1) + "," + (cy + r * Math.sin(ang[i])).toFixed(1);
    const ref = [0, 1, 2, 3].map((i) => pt(i, R)).join(" ");
    const cur = d.map((x, i) => pt(i, R * Math.max(0.3, Math.min(1.3, x.pct)))).join(" ");
    const lab = [["Sprint", 110, 18], ["1 min", 200, 104], ["PMA", 110, 192], ["Seuil", 20, 104]];
    return `<svg class="wx-fit" viewBox="0 0 220 200" role="img" aria-label="Profil 4DP : sprint, 1 minute, PMA, seuil">
<polygon points="${ref}" style="fill:none;stroke:var(--muted);stroke-dasharray:4 4;stroke-width:1"></polygon>
<line x1="${cx}" y1="${cy - R * 1.3}" x2="${cx}" y2="${cy + R * 1.3}" style="stroke:var(--line)"></line>
<line x1="${cx - R * 1.3}" y1="${cy}" x2="${cx + R * 1.3}" y2="${cy}" style="stroke:var(--line)"></line>
<polygon points="${cur}" style="fill:var(--accent);fill-opacity:.25;stroke:var(--accent);stroke-width:2"></polygon>
${lab.map((l) => `<text x="${l[1]}" y="${l[2]}" text-anchor="middle" style="fill:var(--muted);font:600 12px var(--font-body)">${l[0]}</text>`).join("")}
</svg>`;
  }
  const f1 = (x) => x.toFixed(1).replace(".", ",");

  // ---------- forme / fatigue ----------
  function fitness() {
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
    let ctl = 0, atl = 0;
    const series = [];
    for (let d = parse(dates[0]); d <= today; d = addD(d, 1)) {
      const t = out[iso(d)] || 0;
      ctl += (t - ctl) / 42;
      atl += (t - atl) / 7;
      series.push({ d: iso(d), ctl, atl, tsb: ctl - atl, tss: t });
    }
    const last = series[series.length - 1];
    const week = series.slice(-7).reduce((s, x) => s + x.tss, 0);
    return { series, skipped, ctl: last.ctl, atl: last.atl, tsb: last.tsb, week, days: series.length };
  }
  function fitSVG(F) {
    const s = F.series.slice(-56);
    const all = [].concat(s.map((x) => x.ctl), s.map((x) => x.atl), s.map((x) => x.tsb), [0]);
    const lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    const VW = 320, VH = 130, span = hi - lo || 1;
    const X = (i) => (s.length > 1 ? (i / (s.length - 1)) * VW : 0);
    const Y = (v) => VH - ((v - lo) / span) * (VH - 8) - 4;
    const line = (key, col, dash) => `<polyline points="${s.map((x, i) => X(i).toFixed(1) + "," + Y(x[key]).toFixed(1)).join(" ")}" style="fill:none;stroke:${col};stroke-width:2${dash ? ";stroke-dasharray:5 4" : ""}"></polyline>`;
    return `<svg class="wx-fit" viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="none" role="img" aria-label="Courbes de forme, fatigue et fraîcheur sur 8 semaines">
<line x1="0" x2="${VW}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" style="stroke:var(--line)"></line>
${line("ctl", "var(--easy)")}${line("atl", "var(--vo2)")}${line("tsb", "var(--ss)", true)}
</svg>`;
  }

  // ---------- profil en barres d'une séance ----------
  function profSVG(w, big) {
    const Wm = WARM[w.warm] || WARM.none;
    const pre = WPRE[w.warm] || [];
    const post = Wm.cool[0] ? [[Wm.cool[0], 52]] : [];
    const segs = pre.concat(w.segs, post);
    const tot = segs.reduce((a, s) => a + s[0], 0) || 1;
    const ymax = Math.max.apply(null, [110].concat(segs.map((s) => s[1]))) * 1.05;
    const VW = 320, VH = big ? 96 : 64;
    const raw = segs.map((s) => Math.max(0.8, (s[0] / tot) * VW));
    const k = VW / raw.reduce((a, b) => a + b, 0);
    let x = 0, out = "";
    segs.forEach((s, i) => {
      const bw = raw[i] * k, bh = Math.max(3, (s[1] / ymax) * VH);
      const col = s[1] < 76 ? "var(--easy)" : s[1] < 91 ? "var(--ss)" : s[1] < 106 ? "var(--accent)" : "var(--vo2)";
      out += `<rect x="${x.toFixed(1)}" y="${(VH - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" style="fill:${col}"></rect>`;
      x += bw;
    });
    return `<svg class="wx-prof${big ? " big" : ""}" viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="none" role="img" aria-label="Profil de la séance ${esc(w.title)}">${out}</svg><div class="wx-leg">Vert : facile · ambre : tempo / sweet spot · orange : seuil · violet : au-dessus du seuil</div>`;
  }
  function dimsHTML(d) {
    const L = ["Sprint", "1 min", "PMA", "Seuil"];
    return `<div class="wx-dims">${d.map((v, i) => `<span class="wx-dim"><i style="font-style:normal">${L[i]}</i><b>${[0, 1, 2].map((n) => `<u class="${n < v ? "on" : ""}"></u>`).join("")}</b></span>`).join("")}</div>`;
  }

  // ---------- recommandation du jour ----------
  function context() {
    const p = plan(today);
    const hard3 = [1, 2, 3].filter((i) => (+RPE[iso(addD(today, -i))] || 0) >= 8).length;
    const F = fitness();
    const tired = hard3 >= 2 || (F && F.tsb < -25);
    return { p, hard3, F, tired };
  }
  function recommend(dur) {
    const c = context(), p = c.p, why = [];
    let ch;
    if (p.kind === "rest") { ch = "recup"; why.push("Mercredi : repos prévu au plan. Si tu bouges quand même, souplesse uniquement."); }
    else if (c.tired) {
      ch = dur <= 45 ? "recup" : "endu";
      why.push(c.hard3 >= 2 ? "Deux jours très durs (RPE ≥ 8) ces 3 derniers jours : on lève le pied." : "Ta fraîcheur est basse (fatigue accumulée) : séance facile aujourd'hui.");
    }
    else if (p.kind === "ss" || p.kind === "ou") { ch = "seuil"; why.push("Aligné sur ton plan : jour de séance clé au seuil."); }
    else if (p.kind === "vo2" || p.kind === "short") { ch = "vo2"; why.push("Aligné sur ton plan : jour de séance clé VO2 / PMA."); }
    else if (p.kind === "hill" && p.hard) { ch = "seuil"; why.push("Sortie avec efforts prévue : des blocs au seuil la remplacent bien."); }
    else { ch = dur >= 60 ? "endu" : "recup"; why.push("Pas de séance clé aujourd'hui : on accumule du volume facile."); }
    const wi = weakIdx();
    const pool = LIB.filter((w) => w.ch === ch);
    let cand = pool.filter((w) => w.dur <= dur + 5);
    if (!cand.length) cand = [pool.slice().sort((a, b) => a.dur - b.dur)[0]];
    const score = (w) => w.dur + (w.dims[wi] >= 2 ? 6 : 0);
    cand.sort((a, b) => score(b) - score(a));
    const w = cand[0];
    if (w.hard && w.dims[wi] >= 2 && wi < 3) why.push("Cible aussi ta dimension la plus faible : " + ["le sprint", "l'effort d'1 minute", "la PMA"][wi] + ".");
    return { w, why, ctx: c };
  }

  // ---------- rendu ----------
  const el = {};
  function mount() {
    const mk1 = (id) => { const e = document.createElement("section"); e.id = id; e.className = "card"; return e; };
    el.daily = mk1("wxDaily"); el.p4 = mk1("wx4dp"); el.fit = mk1("wxFit"); el.lib = mk1("wxlib");
    const today1 = document.querySelector("#today");
    if (today1) today1.after(el.daily);
    const coach = document.querySelector("#adaptiveCoach");
    if (coach) { coach.after(el.p4); el.p4.after(el.fit); }
    const more = document.querySelector("section.more");
    if (more) more.before(el.lib);
  }
  function modeFtp(d) { const m = mode || dmode(d); return m === "ht" ? S.ftpHT : S.ftpExt; }

  function renderDaily() {
    const dur = WS.dur, r = recommend(dur), w = r.w, p = r.ctx.p, ftp = modeFtp(today), dk = iso(today);
    const chips = [30, 45, 60, 90, 120].map((n) => `<button data-wx="dur" data-v="${n}" class="${dur === n ? "on" : ""}">${n >= 60 ? n / 60 + " h" + (n % 60 ? " 30" : "") : n + " min"}</button>`).join("");
    const planned = p.dur ? `${esc(p.title)} · ≈ ${hm(p.dur)}` : esc(p.title);
    const isSet = S.over[dk] && S.over[dk].reason && String(S.over[dk].reason).indexOf("Bibliothèque") === 0;
    el.daily.innerHTML = `<div class="when"><span class="eyebrow">Séance du jour recommandée</span><h2>Combien de temps as-tu ?</h2></div>
<div class="wx-chips">${chips}</div>
<div class="when"><span class="day">${esc(w.title)}</span><span class="dur">≈ ${hm(w.dur)} · FTP ${ftp} W · RPE visé ${RPEV[w.ch]}</span></div>
${profSVG(w, false)}
${dimsHTML(w.dims)}
<p>${ex(w.txt, ftp)}</p>
<p class="muted" style="font-size:14px">${r.why.map(esc).join(" ")}</p>
<p class="muted" style="font-size:14px">Prévu au plan : ${planned}.</p>
<div class="wx-btns"><button class="btn2" data-wx="plan" data-id="${w.id}" data-d="${dk}">Faire cette séance aujourd'hui</button><button class="btn2" data-wx="see" data-id="${w.id}">Voir le détail</button>${isSet ? `<button class="btn2" data-wx="clear" data-d="${dk}">Revenir au plan</button>` : ""}</div>`;
  }

  function render4dp() {
    const d = dims4(), v = p4(), wi = weakIdx();
    const rows = d.map((x) => `<tr><td>${x.l}<br><span class="muted" style="font-size:12px">${x.sub}</span></td><td class="mono">${Math.round(x.w)} W</td><td class="mono">${f1(x.wkg)} W/kg</td><td class="mono">${Math.round(x.pct * 100)} %</td></tr>`).join("");
    el.p4.innerHTML = `<div class="when"><span class="eyebrow">Profil 4DP</span><h2>${esc(riderType())}</h2></div>
${radarSVG()}
<div class="scroll"><table class="wx-tab"><thead><tr><th>Dimension</th><th>Puissance</th><th>Par kg</th><th>vs repère</th></tr></thead><tbody>${rows}</tbody></table></div>
<p>Dimension à travailler en priorité : <b>${wi === 3 ? "aucune, profil équilibré" : d[wi].l}</b>.</p>
<p class="muted" style="font-size:13px">Estimation maison, pas l'algorithme de Wahoo. Le repère (pointillés) suppose un sprint ≈ 3,0 × FTP, 1 min ≈ 1,9 × FTP, 5 min ≈ 1,2 × FTP ; 100 % veut dire « sur le repère ». PMA et FTP se règlent dans Réglages.</p>
<details><summary>Mettre à jour mes valeurs</summary><div class="wx-inp" style="margin-top:8px"><label>Sprint (W)<input id="wx-nm" type="number" inputmode="numeric" value="${v.nm}"></label><label>1 min (W)<input id="wx-ac" type="number" inputmode="numeric" value="${v.ac}"></label><label>Poids (kg)<input id="wx-kg" type="number" inputmode="decimal" value="${v.kg}"></label></div><p class="muted" style="font-size:13px;margin-top:8px">Prends tes records récents (radar 8 semaines de Strava) : pas besoin de test dédié.</p></details>`;
  }

  function renderFit() {
    const F = fitness();
    if (!F) { el.fit.innerHTML = `<div class="when"><span class="eyebrow">Forme et fatigue</span><h2>Pas encore de données</h2></div><p class="muted">Synchronise Strava (Réglages) pour voir ta courbe.</p>`; return; }
    const t = F.tsb;
    const lab = t > 5 ? "Frais" : t > -10 ? "Équilibré" : t > -25 ? "Fatigue productive" : "Fatigue élevée : à surveiller";
    el.fit.innerHTML = `<div class="when"><span class="eyebrow">Forme et fatigue</span><h2>${lab}</h2></div>
<div class="wx-kpis"><div><span>Forme</span><b class="wx-big">${Math.round(F.ctl)}</b></div><div><span>Fatigue</span><b class="wx-big">${Math.round(F.atl)}</b></div><div><span>Fraîcheur</span><b class="wx-big">${Math.round(F.tsb)}</b></div><div><span>7 derniers jours</span><b class="wx-big">${Math.round(F.week)}</b></div></div>
${fitSVG(F)}
<div class="wx-leg">Vert : forme (42 j) · violet : fatigue (7 j) · ambre pointillé : fraîcheur = forme − fatigue</div>
<p class="muted" style="font-size:13px">Calculé depuis tes sorties Strava (charge d'après la puissance pondérée et ta FTP, home trainer ou extérieur) : formules classiques, pas le Fitness Score de Wahoo.${F.days < 42 ? " Historique de " + F.days + " jours seulement : la forme se stabilise vers 6 semaines." : ""}${F.skipped ? " " + F.skipped + " sortie(s) sans puissance ignorée(s)." : ""}</p>`;
  }

  function renderLib() {
    const ftp = modeFtp(sel), dk = iso(sel);
    const chips = CH.map((c) => `<button data-wx="ch" data-v="${c[0]}" class="${WS.ch === c[0] ? "on" : ""}">${c[1]}</button>`).join("");
    const rec = recommend(WS.dur).w.id;
    const list = LIB.filter((w) => w.ch === WS.ch).sort((a, b) => a.dur - b.dur);
    const items = list.map((w) => {
      const open = WS.open === w.id, Wm = WARM[w.warm] || WARM.none;
      const isSet = S.over[dk] && S.over[dk].reason === "Bibliothèque : " + w.title;
      let det = "";
      if (open) {
        det = `${profSVG(w, true)}<p>${ex(w.txt, ftp)}</p>
${Wm.steps.length ? `<p><b>Échauffement${Wm.min ? " (" + Wm.min + " min)" : ""}</b></p><ul class="plain" style="margin-top:0">${Wm.steps.map((s) => `<li><span class="mono">${s[0]}</span> ${ex(s[1], ftp)}</li>`).join("")}</ul>` : ""}
${Wm.cool[0] ? `<p><b>Retour au calme</b> : ${ex(Wm.cool[1], ftp)}</p>` : ""}
<p><b>Version extérieure</b> : ${esc(SOTXT[w.ch])}</p>
<p class="muted" style="font-size:13px">Watts calculés avec la FTP ${(mode || dmode(sel)) === "ht" ? "home trainer" : "extérieure"} (${ftp} W), comme la fiche du jour sélectionné.</p>
<div class="wx-btns"><button class="btn2" data-wx="plan" data-id="${w.id}" data-d="${dk}">Planifier le ${JF[sel.getDay()]} ${sel.getDate()} ${MF[sel.getMonth()]}</button>${isSet ? `<button class="btn2" data-wx="clear" data-d="${dk}">Revenir au plan</button>` : ""}</div>`;
      }
      return `<div class="wx-item"><div class="wx-row"><h3>${esc(w.title)}</h3>${w.id === rec ? '<span class="wx-badge">Conseillé</span>' : ""}</div>
<div class="dur">≈ ${hm(w.dur)} · RPE visé ${RPEV[w.ch]}</div>${dimsHTML(w.dims)}<p class="muted" style="font-size:14px">${esc(w.why)}</p>
<div class="wx-btns"><button class="btn2" data-wx="open" data-id="${w.id}">${open ? "Masquer" : "Voir la séance"}</button></div>${det}</div>`;
    }).join("");
    el.lib.innerHTML = `<div class="when"><span class="eyebrow">Bibliothèque</span><h2>Séances par chaîne</h2></div><div class="wx-chips">${chips}</div><div>${items}</div>`;
  }

  function wxRender() {
    try {
      if (!el.daily) mount();
      renderDaily(); render4dp(); renderFit(); renderLib();
    } catch (e) { console.warn("wahoo.js", e); }
  }

  // ---------- actions ----------
  function applyW(id, dk) {
    const w = byId(id);
    if (!w) return;
    S.over[dk] = { spec: w.spec, reason: "Bibliothèque : " + w.title };
    LS.set("plan4wkg-over", S.over);
    const d = parse(dk);
    sel = clamp(d); view = mk(sel.getFullYear(), sel.getMonth(), 1); mode = null;
    renderAll();
    if (typeof renderCR === "function") renderCR();
    const t = document.querySelector("#today");
    if (t && t.scrollIntoView) t.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-wx]");
    if (!t) return;
    const a = t.dataset.wx;
    if (a === "dur") { WS.dur = +t.dataset.v; saveWS(); wxRender(); }
    else if (a === "ch") { WS.ch = t.dataset.v; WS.open = null; saveWS(); renderLib(); }
    else if (a === "open") { WS.open = WS.open === t.dataset.id ? null : t.dataset.id; saveWS(); renderLib(); }
    else if (a === "see") {
      const w = byId(t.dataset.id);
      if (w) { WS.ch = w.ch; WS.open = w.id; saveWS(); renderLib(); const l = document.querySelector("#wxlib"); if (l && l.scrollIntoView) l.scrollIntoView({ behavior: "smooth", block: "start" }); }
    }
    else if (a === "plan") applyW(t.dataset.id, t.dataset.d);
    else if (a === "clear") {
      delete S.over[t.dataset.d];
      LS.set("plan4wkg-over", S.over);
      renderAll();
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "wx-nm" || t.id === "wx-ac" || t.id === "wx-kg") {
      const o = LS.get("plan4wkg-4dp", {});
      const key = { "wx-nm": "nm", "wx-ac": "ac", "wx-kg": "kg" }[t.id];
      if (+t.value > 0) { o[key] = +t.value; LS.set("plan4wkg-4dp", o); }
      wxRender();
    }
  });

  // ---------- accroches sur le rendu existant ----------
  const _ra = renderAll;
  renderAll = function () { _ra(); wxRender(); };
  if (typeof renderActivityPanel === "function") {
    const _rp = renderActivityPanel;
    renderActivityPanel = function () { _rp(); wxRender(); };
  }
  wxRender();
})();
