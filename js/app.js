async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Impossible de charger ${path}`);
  return res.json();
}

async function loadText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Impossible de charger ${path}`);
  return res.text();
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "hidden") node.hidden = !!v;
    else if (k === "open" || k === "disabled" || k === "checked" || k === "selected") {
      // Boolean attrs: presence = true. Never setAttribute('open','false').
      if (v) node.setAttribute(k, "");
      else node.removeAttribute(k);
    } else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v == null || v === false) return;
    else node.setAttribute(k, v);
  });
  children.flat().forEach((c) => {
    if (c == null || c === false) return;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  });
  return node;
}

function fmtEur(n) {
  return Number(n).toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " €";
}

/** Matplotlib / Python chart from assets/charts (see scripts/generate_graphics.py). */
function vizFigure(chartKey, manifest) {
  const meta = manifest?.charts?.[chartKey];
  if (!meta?.file) return null;
  return el("figure", { class: "viz-figure" },
    el("img", {
      src: `./assets/charts/${meta.file}`,
      alt: meta.caption || chartKey,
      loading: "lazy",
    }),
    meta.caption ? el("figcaption", {}, meta.caption) : null
  );
}

function fillVizRow(containerId, keys, manifest, dual = false) {
  const root = document.getElementById(containerId);
  if (!root || !manifest) return;
  root.className = dual ? "viz-row viz-2" : "viz-row";
  root.replaceChildren(...keys.map((k) => vizFigure(k, manifest)).filter(Boolean));
}

function copyBtn(text) {
  return el("button", {
    type: "button",
    class: "copy-btn",
    title: "Copier",
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        /* ignore */
      }
    },
  }, "copier");
}

function simpleMarkdown(md) {
  const wrap = el("div", { class: "md" });
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let list = null;
  const flushList = () => {
    if (list) {
      wrap.append(list);
      list = null;
    }
  };
  const inline = (s) => {
    const frag = document.createDocumentFragment();
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/\S+)/g);
    for (const p of parts) {
      if (!p) continue;
      if (p.startsWith("**") && p.endsWith("**")) frag.append(el("strong", {}, p.slice(2, -2)));
      else if (p.startsWith("`") && p.endsWith("`")) frag.append(el("code", {}, p.slice(1, -1)));
      else if (/^https?:\/\//.test(p)) frag.append(el("a", { href: p, target: "_blank", rel: "noopener" }, p));
      else frag.append(document.createTextNode(p));
    }
    return frag;
  };
  for (const line of lines) {
    if (/^---+$/.test(line.trim())) {
      flushList();
      wrap.append(el("hr"));
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      wrap.append(el("h2", {}, line.slice(2)));
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      wrap.append(el("h3", {}, line.slice(3)));
      continue;
    }
    if (line.startsWith("- ")) {
      if (!list) list = el("ul", { class: "list" });
      list.append(el("li", {}, inline(line.slice(2))));
      continue;
    }
    if (!line.trim()) {
      flushList();
      continue;
    }
    flushList();
    if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
      wrap.append(el("p", { class: "muted" }, inline(line.replace(/^\*|\*$/g, ""))));
    } else {
      wrap.append(el("p", {}, inline(line)));
    }
  }
  flushList();
  return wrap;
}

function statusLabel(s) {
  return ({
    todo: "À faire",
    partial: "Partiel",
    done: "OK",
    blocked: "Bloqué",
    n_a: "N/A",
    in_progress: "En cours",
  })[s] || s;
}

const HASH_ALIASES = {
  "panel-compare": "panel-decide",
  "panel-exec": "panel-do",
  "panel-plan": "panel-plan90",
  "panel-chances": "panel-plan90",
  "panel-frenchtech": "panel-eco",
  "panel-incubators": "panel-eco",
  "panel-product": "panel-dossier",
  "panel-profile": "panel-dossier",
  "panel-emails": "panel-dossier",
  "panel-sources": "panel-dossier",
};

function goTo(panelId, subId) {
  const btn = document.querySelector(`.nav-journey button[data-panel="${panelId}"]`)
    || document.querySelector(`.nav button[data-panel="${panelId}"]`);
  if (btn) btn.click();
  if (subId) {
    requestAnimationFrame(() => {
      const subBtn = document.querySelector(`[data-sub="${subId}"]`);
      if (subBtn) subBtn.click();
    });
  }
}

function setupSubnav(navId) {
  const nav = document.getElementById(navId);
  if (!nav) return;
  const buttons = [...nav.querySelectorAll("button[data-sub]")];
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      buttons.forEach((b) => {
        const panel = document.getElementById(b.dataset.sub);
        if (!panel) return;
        const on = b === btn;
        panel.hidden = !on;
        panel.classList.toggle("active", on);
      });
    });
  });
}

function renderPathway(container, pathway, tone) {
  container.replaceChildren();
  const meter = el("div", { class: `meter ${tone}` }, el("span"));
  const topAction = pathway.next_actions?.[0];
  const body = el("details", { class: "pathway-details" },
    el("summary", {}, "Forces · risques · actions (détail)"),
    el("h3", {}, "Forces"),
    el("ul", { class: "list" }, ...pathway.strengths.slice(0, 4).map((s) => el("li", {}, s))),
    el("h3", {}, "Risques"),
    el("ul", { class: "list" }, ...pathway.risks.slice(0, 4).map((s) => el("li", {}, s))),
    el("h3", {}, "Prochaines actions"),
    el("ul", { class: "list" }, ...pathway.next_actions.slice(0, 4).map((s) => el("li", {}, s))),
    el("h3", {}, "Critères pondérés"),
    el("div", { class: "criteria" },
      ...pathway.criteria.map((c) =>
        el("div", { class: "criterion" },
          el("div", { class: "label" }, c.label),
          el("div", { class: "pts" }, `${Math.round(c.score)}/100 · w${c.weight}`),
          el("div", { class: "note" }, c.note)
        )
      )
    )
  );
  container.append(
    el("div", { class: "score-row" },
      el("div", {},
        el("h2", {}, pathway.title),
        el("span", { class: "verdict" }, pathway.verdict)
      ),
      el("div", { class: `score-big ${tone}` }, `${pathway.score}`)
    ),
    meter,
    topAction
      ? el("p", { class: "pathway-next" }, el("strong", {}, "Next : "), topAction)
      : null,
    body
  );
  requestAnimationFrame(() => {
    meter.querySelector("span").style.width = `${pathway.score}%`;
  });
}

function checklistProgress(items) {
  const active = items.filter((i) => i.status !== "n_a");
  const done = active.filter((i) => i.status === "done").length;
  const partial = active.filter((i) => i.status === "partial" || i.status === "in_progress").length;
  const weight = done + partial * 0.5;
  const pct = active.length ? Math.round((weight / active.length) * 100) : 0;
  return { active: active.length, done, pct };
}

function renderProgressStrip(checklist) {
  const strip = document.getElementById("progress-strip");
  if (!strip) return;
  const { active, done, pct } = checklistProgress(checklist.items || []);
  const next = (checklist.items || []).find((i) => ["todo", "partial", "in_progress"].includes(i.status));
  strip.replaceChildren(
    el("div", { class: "progress-track" }, el("span", { style: `width:${pct}%` })),
    el("div", { class: "progress-meta" },
      el("strong", {}, `${pct}%`),
      el("span", {}, `${done}/${active} pièces`),
      next
        ? el("button", {
            type: "button",
            class: "progress-next",
            onclick: () => goTo("panel-do"),
          }, `Suivant : ${next.label}`)
        : el("span", {}, "Checklist à jour")
    )
  );
}

function computeChanceScore(activeIds, sim) {
  const docs = sim.documents || [];
  const byId = Object.fromEntries(docs.map((d) => [d.id, d]));
  const sc = sim.scoring || {};
  let raw = Number(sc.floor) || 12;
  const active = new Set(activeIds);

  for (const id of active) {
    const d = byId[id];
    if (d) raw += Number(d.points) || 0;
  }

  const doorIds = sc.ecosystem_door_ids || [];
  const letterIds = sc.letter_ids || [];
  const hasIncubator = active.has("incubator_partner");
  const letterCount = letterIds.filter((id) => active.has(id)).length;
  const hasDoor = hasIncubator || letterCount >= 2;
  const hasDrieets = active.has(sc.drieets_id || "drieets_attestation");
  const resIds = sc.resources_pack_ids || [];
  const resCount = resIds.filter((id) => active.has(id)).length;
  const hasResources = resCount >= (sc.resources_min_count || 3);

  if (active.has("captures_live") && active.has("pitch_1page") && active.has("product_live")) {
    raw += Number(sc.bonus_complete_pack) || 0;
  }
  if (active.has("narrative_athens")) {
    raw += Number(sc.bonus_narrative) || 0;
  }

  let capped = raw;
  const caps = [];
  if (!hasDoor) {
    capped = Math.min(capped, Number(sc.cap_without_ecosystem_door) || 52);
    caps.push("Sans porte écosystème (incubateur OU 2 lettres) → plafond ~52 %");
  }
  if (!hasDrieets) {
    capped = Math.min(capped, Number(sc.cap_without_drieets) || 58);
    caps.push("Sans attestation DRIEETS → plafond ~58 %");
  }
  if (hasDrieets && !hasResources) {
    capped = Math.min(capped, Number(sc.cap_without_resources_pack) || 78);
    caps.push("DRIEETS OK mais pack ressources incomplet (< 3 pièces) → plafond ~78 %");
  }

  const ceiling = Number(sc.ceiling) || 92;
  const score = Math.max(Number(sc.floor) || 12, Math.min(ceiling, Math.round(capped)));

  let band = "fragile";
  if (score >= 85) band = "fort";
  else if (score >= 70) band = "solide";
  else if (score >= 55) band = "intermédiaire";
  else if (score >= 40) band = "faible";

  const missing = [];
  if (!hasDoor) missing.push("Ouvrir une porte écosystème (incubateur confirmé ou 2 lettres)");
  if (!hasDrieets) missing.push("Obtenir l’attestation DRIEETS");
  if (!hasResources) missing.push("Compléter le pack ressources (sans prêt 22 k€)");
  if (!active.has("captures_live")) missing.push("Ajouter les captures live du site");

  return { score, raw: Math.round(raw), band, caps, hasDoor, hasDrieets, hasResources, letterCount, missing };
}

function renderChanceSimulator(mount, sim) {
  if (!mount || !sim) return;
  const docs = sim.documents || [];
  const STORAGE_KEY = "dina_chance_sim_v1";

  let activeIds;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(saved?.activeIds)) activeIds = new Set(saved.activeIds);
  } catch (_) { /* */ }
  if (!activeIds) {
    activeIds = new Set(docs.filter((d) => d.ready || d.fixed).map((d) => d.id));
  }
  // Fixed/ready docs always stay in dossier
  docs.filter((d) => d.fixed).forEach((d) => activeIds.add(d.id));

  const counterEl = el("div", { class: "sim-counter", id: "sim-counter" });
  const activeZone = el("div", {
    class: "sim-zone sim-zone-active",
    "data-zone": "active",
  });
  const seekZone = el("div", {
    class: "sim-zone sim-zone-seek",
    "data-zone": "seek",
  });

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeIds: [...activeIds] }));
    } catch (_) { /* */ }
  };

  const paintCounter = () => {
    const r = computeChanceScore([...activeIds], sim);
    counterEl.className = `sim-counter band-${r.band}`;
    counterEl.replaceChildren(
      el("div", { class: "sim-counter-main" },
        el("div", { class: "sim-pct" }, `${r.score}`, el("span", {}, "%")),
        el("div", { class: "sim-band" },
          el("strong", {}, "Chances estimées"),
          el("span", { class: "sim-band-label" }, r.band),
          el("span", { class: "muted" }, `somme brute ${r.raw} pts · plafonnée`)
        )
      ),
      el("div", { class: "sim-meter" }, el("span", { style: `width:${r.score}%` })),
      r.caps.length
        ? el("ul", { class: "list sim-caps" }, ...r.caps.map((c) => el("li", {}, c)))
        : el("p", { class: "sim-ok" }, "Aucun plafond critique — porte écosystème + DRIEETS + ressources OK."),
      r.missing.length
        ? el("div", { class: "sim-missing" },
            el("strong", {}, "Prochains gains : "),
            r.missing.slice(0, 3).join(" · ")
          )
        : null
    );
  };

  const toggleDoc = (id) => {
    const doc = docs.find((d) => d.id === id);
    if (!doc || doc.fixed) return;
    if (activeIds.has(id)) activeIds.delete(id);
    else activeIds.add(id);
    paintZones();
  };

  const makeCard = (doc) => {
    const inActive = activeIds.has(doc.id);
    const card = el("div", {
      class: `sim-doc${doc.fixed ? " sim-doc-fixed" : ""}${doc.ready ? " sim-doc-ready" : ""}`,
      draggable: doc.fixed ? "false" : "true",
      "data-id": doc.id,
    },
      el("div", { class: "sim-doc-top" },
        el("span", { class: `sim-cat cat-${doc.category}` }, doc.category),
        el("span", { class: "sim-pts" }, `+${doc.points}`)
      ),
      el("strong", {}, doc.label),
      el("p", { class: "muted" }, doc.note || ""),
      doc.fixed
        ? el("span", { class: "sim-lock" }, "Fixe — déjà prêt")
        : el("div", { class: "sim-doc-actions" },
            el("span", { class: "sim-hint" }, "Glisser · ou"),
            el("button", {
              type: "button",
              class: "sim-toggle",
              onclick: (e) => {
                e.stopPropagation();
                toggleDoc(doc.id);
              },
            }, inActive ? "Retirer →" : "← Ajouter")
          )
    );
    if (!doc.fixed) {
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", doc.id);
        e.dataTransfer.effectAllowed = "move";
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
    }
    return card;
  };

  const paintZones = () => {
    const activeDocs = docs.filter((d) => activeIds.has(d.id));
    const seekDocs = docs.filter((d) => !activeIds.has(d.id));
    activeZone.replaceChildren(
      el("div", { class: "sim-zone-head" },
        el("h4", {}, "Dans mon dossier (actif)"),
        el("span", { class: "muted" }, `${activeDocs.length} pièce(s)`)
      ),
      el("div", { class: "sim-doc-list" }, ...activeDocs.map(makeCard))
    );
    seekZone.replaceChildren(
      el("div", { class: "sim-zone-head" },
        el("h4", {}, "À obtenir / chercher"),
        el("span", { class: "muted" }, `${seekDocs.length} cible(s)`)
      ),
      el("div", { class: "sim-doc-list" }, ...seekDocs.map(makeCard))
    );
    setupDrop(activeZone, "active");
    setupDrop(seekZone, "seek");
    paintCounter();
    persist();
  };

  function setupDrop(zone, kind) {
    zone.ondragover = (e) => {
      e.preventDefault();
      zone.classList.add("drag-over");
    };
    zone.ondragleave = () => zone.classList.remove("drag-over");
    zone.ondrop = (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      const doc = docs.find((d) => d.id === id);
      if (!doc || doc.fixed) return;
      if (kind === "active") activeIds.add(id);
      else activeIds.delete(id);
      paintZones();
    };
  }

  const resetBtn = el("button", {
    type: "button",
    class: "btn-link",
    onclick: () => {
      activeIds = new Set(docs.filter((d) => d.ready || d.fixed).map((d) => d.id));
      docs.filter((d) => d.fixed).forEach((d) => activeIds.add(d.id));
      paintZones();
    },
  }, "Réinitialiser (pièces déjà prêtes)");

  mount.replaceChildren(
    el("div", { class: "card sim-shell" },
      el("div", { class: "sim-intro" },
        el("h3", {}, sim.title || "Simulateur de chances"),
        el("p", { class: "muted" }, sim.disclaimer || ""),
        el("p", {},
          "Glisse les justificatifs entre ",
          el("strong", {}, "dossier actif"),
          " et ",
          el("strong", {}, "à obtenir"),
          ". Les pièces déjà prêtes sont ",
          el("strong", {}, "fixées"),
          " dans le dossier."
        ),
        resetBtn
      ),
      counterEl,
      el("div", { class: "sim-board" }, activeZone, seekZone)
    )
  );
  paintZones();
}

function renderPlan90(root, plan, graphics, sim) {
  if (!root || !plan) return;
  const money = plan.money_without_loan || {};
  const levers = plan.probability_model?.levers || [];
  const simMount = el("div", { id: "chance-sim-mount" });

  root.replaceChildren(
    el("div", { class: "section-intro card" },
      el("h2", {}, plan.title || "Plan chances"),
      el("p", {},
        el("strong", {}, "Voie : "),
        plan.target_pathway || "Talent Founders",
        " — ",
        el("em", {}, plan.not_this_pathway || "")
      ),
      el("p", { class: "muted" }, plan.disclaimer || "")
    ),
    el("div", { class: "card plan-hero" },
      el("p", { class: "eyebrow" }, "Honnêteté"),
      el("h3", {}, "Ce que « ~90 % » veut dire ici"),
      el("p", {}, plan.honesty?.what_90_means || ""),
      el("div", { class: "alert" },
        el("strong", {}, "Goulot actuel : "),
        plan.honesty?.current_bottleneck || ""
      )
    ),
    simMount,
    vizFigure("plan_levers", graphics),
    el("div", { class: "card" },
      el("h3", {}, "À ne pas faire (idées absurdes)"),
      el("ul", { class: "list myth-list" },
        ...(plan.absurd_to_avoid || []).map((m) =>
          el("li", {},
            el("div", { class: "myth" }, m.myth),
            el("div", { class: "reality" }, m.reality)
          )
        )
      )
    ),
    el("div", { class: "card money-card" },
      el("h3", {}, money.title || "Ressources sans emprunt"),
      el("p", {}, el("strong", {}, money.constraint || "")),
      el("p", { class: "muted" }, "Ce que le consulat regarde en pratique :"),
      el("ul", { class: "list" },
        ...(money.what_consulate_usually_wants || []).map((x) => el("li", {}, x))
      ),
      el("div", { class: "options-grid" },
        ...(money.realistic_options || []).map((o) =>
          el("article", { class: "option-card" },
            el("h4", {}, `Option ${o.id} — ${o.label}`),
            el("p", { class: "muted" }, o.fit),
            el("ul", { class: "list" }, ...(o.actions || []).map((a) => el("li", {}, a)))
          )
        )
      ),
      el("div", { class: "alert", style: "margin-top:1rem" },
        el("strong", {}, "Interdit dans ce plan : "),
        (money.do_not || []).join(" · ")
      )
    ),
    el("div", { class: "card" },
      el("h3", {}, "Leviers qui bougent vraiment les chances"),
      el("p", { class: "muted" }, plan.probability_model?.note || ""),
      el("ul", { class: "list lever-list" },
        ...levers.map((l) =>
          el("li", {},
            el("span", { class: `impact-pill impact-${l.impact === "critique" ? "crit" : l.impact === "élevé" ? "high" : "mid"}` }, l.impact),
            " ",
            el("strong", {}, l.label),
            el("div", { class: "muted" }, `${l.delta} · Sans ça : ${l.without}`)
          )
        )
      )
    ),
    el("div", { class: "phases" },
      el("h3", { class: "phases-title" }, "Étapes à suivre (dans l’ordre)"),
      ...(plan.phases || []).map((ph) =>
        el("article", { class: "card phase-card" },
          el("div", { class: "phase-head" },
            el("span", { class: "phase-n" }, `Phase ${ph.n}`),
            el("h3", {}, ph.title)
          ),
          el("p", {}, el("strong", {}, "But : "), ph.goal),
          el("p", { class: "muted" }, el("strong", {}, "Effet chances : "), ph.chance_effect),
          el("ol", { class: "list" }, ...(ph.steps || []).map((s) => el("li", {}, s))),
          el("p", { class: "done-when" }, el("strong", {}, "Terminé quand : "), ph.done_when)
        )
      )
    ),
    el("div", { class: "card" },
      el("h3", {}, "Cadence hebdo (simple)"),
      el("ul", { class: "list" }, ...(plan.weekly_cadence || []).map((x) => el("li", {}, x))),
      el("h3", { style: "margin-top:1.25rem" }, "Checklist « dossier ~90 % »"),
      el("ul", { class: "list check-90" },
        ...(plan.success_checklist_90 || []).map((x) => el("li", {}, x))
      ),
      el("div", { class: "incubator-actions", style: "margin-top:1rem" },
        el("button", { type: "button", class: "btn-link primary", onclick: () => goTo("panel-eco", "eco-inc") }, "Candidater incubateurs →"),
        el("button", { type: "button", class: "btn-link", onclick: () => goTo("panel-do") }, "Ouvrir checklist →"),
        el("button", { type: "button", class: "btn-link", onclick: () => goTo("panel-eco", "eco-ft") }, "3 portes DRIEETS →")
      )
    )
  );
  renderChanceSimulator(simMount, sim);
}

function renderHome(root, ctx) {
  const { analysis, checklist, product, synthesis, graphics } = ctx;
  const pt = analysis.pathways.talent?.score;
  const pe = analysis.pathways.etudes?.score;
  const pc = analysis.pathways.talent_createur?.score;
  const items = checklist.items || [];
  const todo = items.filter((i) => ["todo", "partial", "in_progress"].includes(i.status));
  const next3 = todo.slice(0, 3);
  const hard = (synthesis?.hard_rules || []).slice(0, 4);

  root.replaceChildren(
    el("div", { class: "home-decision card" },
      el("p", { class: "eyebrow" }, "Décision claire"),
      el("h2", {}, "Priorité : Talent innovant (French Tech Founders)"),
      el("p", { class: "home-lead" },
        "Objectif : une attestation d’innovation délivrée par la DRIEETS (guichet État) — via un incubateur French Tech Nouvelle-Aquitaine ",
        "ou 2 lettres d’acteurs de l’écosystème — puis dépôt visa au consulat d’Athènes. "
      ),
      el("ul", { class: "list home-rails" },
        el("li", {}, el("strong", {}, "Rail A (priorité) : "), "Passeport Talent « projet économique innovant » — sans besoin des 30 000 €."),
        el("li", {}, el("strong", {}, "Rail B (filet) : "), "Visa études — seulement si le master IAE en formation à distance (FAD) est couvert par une attestation de présence obligatoire."),
        el("li", {}, el("strong", {}, "Rail C (plan B) : "), "Talent créateur — uniquement si investissement ≥ 30 000 € prouvable.")
      ),
      el("div", { class: "home-scores" },
        el("button", { type: "button", class: "score-chip preferred", onclick: () => goTo("panel-decide") },
          el("span", {}, "Talent"), el("strong", {}, String(pt))
        ),
        el("button", { type: "button", class: "score-chip", onclick: () => goTo("panel-decide") },
          el("span", {}, "Études"), el("strong", {}, String(pe))
        ),
        el("button", { type: "button", class: "score-chip", onclick: () => goTo("panel-decide") },
          el("span", {}, "Créateur"), el("strong", {}, String(pc))
        )
      ),
      el("p", { class: "muted" },
        "Clique un score pour comparer. L’avis SNEE (étudiant-entrepreneur) crédibilise le projet mais ",
        el("strong", {}, "n’est pas un visa"),
        ". D2E (diplôme étudiant-entrepreneur) : pas encore inscrit — les scores simulent l’inscription."
      )
    ),
    el("div", { class: "viz-row viz-2" },
      vizFigure("rails_abc", graphics),
      vizFigure("scores_pathways", graphics)
    ),
    vizFigure("flow_founders", graphics),
    vizFigure("timeline_softlanding", graphics),
    el("div", { class: "home-grid" },
      el("div", { class: "card" },
        el("div", { class: "card-kicker" }, "Maintenant"),
        el("h3", {}, "3 prochaines actions"),
        el("p", { class: "muted" }, "Extrait de la checklist (barre de progression au-dessus)."),
        el("ol", { class: "list next-actions" },
          ...next3.map((i) =>
            el("li", {},
              el("span", { class: `status-pill status-${i.status}` }, statusLabel(i.status)),
              " ",
              el("strong", {}, i.label),
              el("div", { class: "muted" }, i.note || "")
            )
          )
        ),
        el("button", { type: "button", class: "btn-link primary", onclick: () => goTo("panel-do") }, "Ouvrir À faire →")
      ),
      el("div", { class: "card" },
        el("div", { class: "card-kicker" }, "Preuve produit"),
        el("h3", {}, product.name || "DinaResearch"),
        el("p", {}, product.tagline || ""),
        el("p", { class: "muted" }, "Site live = preuve d’existence du projet pour incubateurs et DRIEETS."),
        el("p", {},
          el("a", { href: product.live_url, target: "_blank", rel: "noopener" }, product.live_url)
        ),
        el("button", { type: "button", class: "btn-link", onclick: () => goTo("panel-dossier", "dos-product") }, "Pitch & pack →")
      )
    ),
    el("div", { class: "home-jumps" },
      el("button", { type: "button", class: "jump-card jump-priority", onclick: () => goTo("panel-plan90") },
        el("strong", {}, "Plan chances ~90 %"),
        el("span", {}, "Étapes réalistes — sans emprunter 22 k€")
      ),
      el("button", { type: "button", class: "jump-card", onclick: () => goTo("panel-eco", "eco-ft") },
        el("strong", {}, "Mode d’emploi FT"),
        el("span", {}, "3 portes vers l’attestation DRIEETS")
      ),
      el("button", { type: "button", class: "jump-card", onclick: () => goTo("panel-eco", "eco-inc") },
        el("strong", {}, "Candidater"),
        el("span", {}, "Unitec · Technowest · Héméra · Village CA")
      ),
      el("button", { type: "button", class: "jump-card", onclick: () => goTo("panel-dossier") },
        el("strong", {}, "Preuves"),
        el("span", {}, "Pitch, profil, mails, sources OSINT")
      )
    ),
    el("details", { class: "card details-block" },
      el("summary", {}, el("strong", {}, "À ne jamais confondre"), el("span", { class: "muted" }, " — 4 règles (détail aussi en Décision)")),
      el("ul", { class: "list", style: "margin-top:0.75rem" }, ...hard.map((r) => el("li", {}, r))),
      el("div", { class: "incubator-actions" },
        el("button", { type: "button", class: "btn-link", onclick: () => goTo("panel-decide") }, "Comparer les voies"),
        el("a", {
          class: "btn-link primary",
          href: "https://www.demarches-simplifiees.fr/commencer/french-tech-visa-for-founders",
          target: "_blank",
          rel: "noopener",
        }, "Plateforme dépôt Founders")
      )
    )
  );
}

function renderEmails(root, emailsData, filterKey = "all") {
  root.replaceChildren();
  const cats = Object.entries(emailsData.categories);
  const timeline = el("ul", { class: "timeline" });
  const items = [];
  for (const [key, cat] of cats) {
    if (filterKey !== "all" && filterKey !== key) continue;
    for (const mail of cat.emails) {
      items.push({ ...mail, category: key, categoryLabel: cat.label });
    }
  }
  items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  for (const mail of items) {
    timeline.append(
      el("li", {},
        el("div", { class: "date" }, `${mail.date} · ${mail.categoryLabel}`),
        el("div", { class: "subject" },
          mail.subject,
          mail.key ? el("span", { class: "key-tag" }, "clé") : null
        ),
        el("div", { class: "from" }, `De : ${mail.from}${mail.to ? ` → ${mail.to}` : ""}`),
        el("div", { class: "summary" }, mail.summary),
        mail.critical_note
          ? el("div", { class: "alert" }, el("strong", {}, "Alerte : "), mail.critical_note)
          : null
      )
    );
  }
  root.append(timeline);
}

function renderProduct(root, product, ent) {
  root.replaceChildren(
    el("div", { class: "card" },
      el("h3", {}, product.name || "DinaResearch"),
      el("p", { class: "muted" }, product.tagline || ""),
      el("dl", {},
        el("div", { class: "kv" }, el("dt", {}, "Live"), el("dd", {},
          el("a", { href: product.live_url, target: "_blank", rel: "noopener" }, product.live_url)
        )),
        el("div", { class: "kv" }, el("dt", {}, "Contact"), el("dd", {}, product.contact_email || "—")),
        el("div", { class: "kv" }, el("dt", {}, "SNEE"), el("dd", {}, ent?.project_name || "Dina's research")),
        el("div", { class: "kv" }, el("dt", {}, "Stack"), el("dd", {}, (product.stack || []).join(" · "))),
        el("div", { class: "kv" }, el("dt", {}, "Pack visa"), el("dd", {}, "data/project_pack/ · pitch_1page_fr.md"))
      )
    ),
    el("div", { class: "card" },
      el("h3", {}, "Domaines éditoriaux"),
      el("ul", { class: "list" }, ...(product.domains || []).map((d) => el("li", {}, d)))
    ),
    el("div", { class: "card" },
      el("h3", {}, "Articles observés (live)"),
      el("ul", { class: "list" }, ...(product.sample_articles_observed_2026_10 || []).map((d) => el("li", {}, d))),
      el("p", { class: "muted", style: "margin-top:1rem" },
        "Innovation claim large (produit / usage / modèle d’info) pour French Tech Founders — L.421-16 2°."
      )
    )
  );
}

function showAnglesList() {
  const listView = document.getElementById("angles-list-view");
  const detailView = document.getElementById("angles-detail-view");
  if (listView) listView.hidden = false;
  if (detailView) {
    detailView.hidden = true;
    detailView.replaceChildren();
  }
  if (location.hash.startsWith("#angle-")) {
    history.replaceState(null, "", "#panel-angles");
  }
}

function openAngleDetail(anglesData, angle) {
  const listView = document.getElementById("angles-list-view");
  const detailView = document.getElementById("angles-detail-view");
  if (!detailView || !angle) return;
  if (listView) listView.hidden = true;
  detailView.hidden = false;

  const goBack = () => {
    showAnglesList();
    document.querySelector('.nav button[data-panel="panel-angles"]')?.classList.add("active");
  };

  const linkNodes = (angle.links || []).map((l) => {
    const external = /^https?:|^mailto:|^\.\//.test(l.href);
    return el("a", {
      class: "btn-link",
      href: l.href,
      ...(external && l.href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {}),
      onclick: (e) => {
        if (l.href.startsWith("#panel-") || l.href.startsWith("#eco-") || l.href.startsWith("#dos-")) {
          e.preventDefault();
          showAnglesList();
          const id = l.href.slice(1);
          const mapped = HASH_ALIASES[id] || id;
          if (id.startsWith("eco-")) goTo("panel-eco", id);
          else if (id.startsWith("dos-")) goTo("panel-dossier", id);
          else goTo(mapped);
        }
      },
    }, l.label);
  });

  detailView.replaceChildren(
    el("article", { class: "card angle-detail-card" },
      el("div", { class: "angle-detail-top" },
        el("button", { type: "button", class: "back-btn", onclick: goBack }, "← Tous les angles"),
        el("span", { class: "pill" }, angle.priority)
      ),
      el("p", { class: "angle-n" }, `Angle #${angle.n}${angle.n === anglesData.primary ? " · rail prioritaire" : ""}`),
      el("h2", {}, angle.title),
      el("p", { class: "angle-tagline" }, angle.tagline || angle.action || ""),
      el("p", {}, angle.summary || ""),
      el("h3", {}, "Usage"),
      el("p", {}, angle.usage || "—"),
      el("h3", {}, "Actions"),
      el("ol", { class: "list" }, ...(angle.actions || []).map((s) => el("li", {}, s))),
      angle.narrative
        ? el("div", { class: "narrative-box" },
            el("h3", {}, "Message type (consulat)"),
            el("blockquote", {}, angle.narrative),
            el("button", {
              type: "button",
              class: "copy-btn",
              onclick: async () => {
                try { await navigator.clipboard.writeText(angle.narrative); } catch (_) { /* */ }
              },
            }, "Copier le texte")
          )
        : null,
      (angle.timeline || []).length
        ? el("div", {},
            el("h3", {}, "Calendrier"),
            el("ul", { class: "list timeline-mini" },
              ...angle.timeline.map((t) => el("li", {}, el("strong", {}, t.when), " — ", t.what))
            )
          )
        : null,
      (angle.rails || []).length
        ? el("div", { class: "rails-grid" },
            el("h3", {}, "Rails"),
            ...angle.rails.map((r) =>
              el("div", { class: "rail-card" },
                el("strong", {}, `Rail ${r.id} — ${r.name}`),
                el("div", { class: "muted" }, `${r.priority} · Pièce killer : ${r.killer}`)
              )
            )
          )
        : null,
      el("h3", {}, "Succès"),
      el("p", {}, angle.success || "—"),
      (angle.risks || []).length
        ? el("div", {},
            el("h3", {}, "Risques"),
            el("ul", { class: "list" }, ...angle.risks.map((r) => el("li", {}, r)))
          )
        : null,
      linkNodes.length
        ? el("div", { class: "incubator-actions", style: "margin-top:1.25rem" }, ...linkNodes)
        : null
    )
  );
  history.replaceState(null, "", `#angle-${angle.n}`);
  detailView.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderAngles(root, anglesData, mode = "p0") {
  const list = anglesData.angles.filter((a) => {
    if (mode === "all") return true;
    const p = String(a.priority || "");
    return p.startsWith("P0") || a.n === anglesData.primary;
  });
  root.replaceChildren(
    ...list.map((a) =>
      el("article", {
        class: `angle-card clickable${a.n === anglesData.primary ? " angle-primary" : ""}`,
        role: "button",
        tabindex: "0",
        onclick: () => openAngleDetail(anglesData, a),
        onkeydown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openAngleDetail(anglesData, a);
          }
        },
      },
        el("div", { class: "angle-card-top" },
          el("div", { class: "angle-n" }, `#${a.n}`),
          el("span", { class: "pill" }, a.priority)
        ),
        el("h3", {}, a.title),
        el("p", {}, a.tagline || a.action || ""),
        el("button", {
          type: "button",
          class: "see-all-btn",
          onclick: (e) => {
            e.stopPropagation();
            openAngleDetail(anglesData, a);
          },
        }, "Voir tout →")
      )
    )
  );
}

function renderExec(root, synthesis, checklist, graphics) {
  const t = synthesis.thresholds || {};
  const fees = synthesis.fees_talent_founders_eur || {};
  const legal = synthesis.legal_basis || {};
  const contacts = synthesis.key_contacts || {};
  const contactLabels = {
    drieets_talent: "DRIEETS Talent",
    athens_visas: "Consulat Athènes visas",
    pepite_poitiers: "Pépite Poitiers",
    iae_fad: "IAE FAD (Lespe)",
  };

  const facts = el("div", { class: "card" },
    el("h3", {}, "Faits terrain (vs scoring)"),
    el("ul", { class: "list" },
      el("li", {}, "SNEE : avis positif commission 13/10/2026 — ≠ visa."),
      el("li", {}, "D2E : ", el("strong", {}, "non inscrit"), " au 24/10 (rentrée admin ~3 nov) — scores = hypothèse."),
      el("li", {}, "M2IE = FAD → filet études fragile sans attestation présence IAE."),
      el("li", {}, "Vevaiosi (Grèce) ≠ titre voyage Schengen."),
      el("li", {}, `Timeline e2e estimée : ${synthesis.timeline_months_e2e || "4-6"} mois.`)
    )
  );

  const thresholds = el("div", { class: "card" },
    el("h3", {}, "Seuils & délais"),
    el("div", { class: "stat-grid" },
      el("div", { class: "stat" }, el("div", { class: "stat-v" }, fmtEur(t.smic_annual_brut_2026_06_01)), el("div", { class: "stat-l" }, "SMIC annuel Talent")),
      el("div", { class: "stat" }, el("div", { class: "stat-v" }, fmtEur(t.student_monthly_eur)), el("div", { class: "stat-l" }, "Étudiant / mois")),
      el("div", { class: "stat" }, el("div", { class: "stat-v" }, fmtEur(t.talent_createur_investment_eur)), el("div", { class: "stat-l" }, "Créateur (plan B)")),
      el("div", { class: "stat" }, el("div", { class: "stat-v" }, `${t.drieets_processing_best_days}–${t.drieets_processing_incomplete_months * 30} j`), el("div", { class: "stat-l" }, "DRIEETS (best → incomplet)"))
    ),
    el("p", { class: "muted", style: "margin-top:0.85rem" }, t.talent_createur_legal_basis || "")
  );

  const feesCard = el("div", { class: "card" },
    el("h3", {}, "Frais Talent Founders"),
    el("ul", { class: "list" },
      el("li", {}, `Visa long séjour : ${fees.visa_long_stay} €`),
      el("li", {}, `Taxe titre : ${fees.titre_tax} €`),
      el("li", {}, `Timbre : ${fees.timbre} €`),
      el("li", {}, `Renouvellement : ${fees.renewal} €`)
    ),
    el("p", { class: "muted" }, fees.source || ""),
    synthesis.checklist_pdf_juillet_2026
      ? el("p", {}, el("a", { href: synthesis.checklist_pdf_juillet_2026, target: "_blank", rel: "noopener" }, "PDF checklist Founders (juil. 2026)"))
      : null
  );

  const { pct, done, active } = checklistProgress(checklist.items || []);

  const checkCard = el("div", { class: "card span-2" },
    el("div", { class: "do-head" },
      el("div", {},
        el("h3", {}, "Checklist pièces"),
        el("p", { class: "muted" },
          "Ordre logique : pack produit → preuves SNEE → incubateurs/lettres → dépôt DRIEETS → D2E / oncle / IAE en parallèle → France-Visas seulement après attestation. ",
          "Statuts : éditer data/checklist_pieces.json puis recharger."
        )
      ),
      el("div", { class: "do-pct" }, el("strong", {}, `${pct}%`), el("span", {}, `${done}/${active}`))
    ),
    el("div", { class: "progress-track lg" }, el("span", { style: `width:${pct}%` })),
    el("ul", { class: "check-list" },
      ...checklist.items.map((item) =>
        el("li", { class: `check-item status-${item.status}` },
          el("span", { class: `status-pill status-${item.status}` }, statusLabel(item.status)),
          el("div", {},
            el("div", { class: "check-label" }, item.label),
            el("div", { class: "muted" }, item.note || "")
          )
        )
      )
    ),
    el("div", { class: "incubator-actions" },
      el("a", {
        class: "btn-link primary",
        href: "https://www.demarches-simplifiees.fr/commencer/french-tech-visa-for-founders",
        target: "_blank",
        rel: "noopener",
      }, "Ouvrir dépôt Founders"),
      el("button", { type: "button", class: "btn-link", onclick: () => goTo("panel-eco", "eco-inc") }, "Candidater incubateurs →")
    )
  );

  const vizDo = el("div", { class: "span-2 viz-row viz-2" },
    vizFigure("checklist_status", graphics),
    vizFigure("fees_thresholds", graphics)
  );

  const refs = el("details", { class: "card span-2 details-block" },
    el("summary", {}, el("strong", {}, "Références utiles"), el("span", { class: "muted" }, " — seuils, frais, contacts, légal")),
    el("div", { class: "exec-layout", style: "margin-top:1rem" },
      facts, thresholds, feesCard,
      el("div", { class: "card" },
        el("h3", {}, "Contacts clés"),
        el("ul", { class: "list contact-list" },
          ...Object.entries(contacts).map(([k, v]) =>
            el("li", {},
              el("strong", {}, contactLabels[k] || k),
              " · ",
              el("a", { href: `mailto:${v}` }, v),
              " ",
              copyBtn(v)
            )
          )
        )
      ),
      el("div", { class: "card" },
        el("h3", {}, "Bases légales"),
        el("dl", {},
          el("div", { class: "kv" }, el("dt", {}, "Innovant"), el("dd", {}, legal.innovant || "—")),
          el("div", { class: "kv" }, el("dt", {}, "Créateur"), el("dd", {}, legal.createur || "—")),
          el("div", { class: "kv" }, el("dt", {}, "FAD"), el("dd", {}, legal.fad_case || "—")),
          el("div", { class: "kv" }, el("dt", {}, "Innovant ≠ 30 k€"), el("dd", {}, legal.innovant_no_30k ? "oui" : "—"))
        )
      )
    )
  );

  root.replaceChildren(checkCard, vizDo, refs);
}

const VISA_PATH_LABEL = {
  likely_ft_partner: "Voie visa : incubateur FT (à confirmer sur liste)",
  check_ft_list: "Voie visa : vérifier liste French Tech",
  capital_letter: "Voie visa : lettre Capitale FT",
  ecosystem_letter: "Voie visa : lettre écosystème (1/2)",
  process_help: "Process / orientation Founders",
  traction_maybe_letter: "Traction FR · éventuelle lettre / aide visa",
  traction_ai: "Traction AI (≠ visa seul)",
  bridge_africa_eu: "Pont Afrique–EU (≠ visa seul)",
  traction: "Traction / réseau",
  none_product_only: "Produit Maroc — pas DRIEETS",
  none_local: "Local GR — pas visa FR",
  none_vc: "VC / residency — pas visa FR",
};

function renderIncubators(intro, filtersEl, root, data, tierFilter = "p0_visa") {
  const tierMeta = Object.fromEntries((data.tiers || []).map((t) => [t.id, t]));
  intro.replaceChildren(
    el("h2", {}, "Incubateurs & programmes à contacter"),
    el("p", {}, data.product_fit_summary),
    el("div", { class: "alert" }, el("strong", {}, "Règle visa : "), data.visa_rule),
    el("p", { class: "muted" }, data.sources_note),
    el("p", {}, el("strong", {}, "Pitch one-liner : "), data.pitch_one_liner)
  );

  const tiers = [["all", "Tous"], ...(data.tiers || []).map((t) => [t.id, t.label])];
  filtersEl.replaceChildren(
    ...tiers.map(([key, label]) =>
      el("button", {
        type: "button",
        class: key === tierFilter ? "active" : "",
        "data-tier": key,
      }, label)
    )
  );

  const list = (data.incubators || [])
    .filter((inc) => tierFilter === "all" || inc.tier === tierFilter)
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));

  root.replaceChildren(
    ...list.map((inc) =>
      el("article", { class: "incubator-card" },
        el("div", { class: "incubator-head" },
          el("div", {},
            el("span", { class: "angle-n" }, tierMeta[inc.tier]?.label?.split("—")[0]?.trim() || inc.tier),
            el("h3", {}, inc.name),
            el("p", { class: "muted" }, `${inc.city} · ${inc.country}`)
          ),
          el("span", { class: `status-pill visa-${inc.visa_path}` }, VISA_PATH_LABEL[inc.visa_path] || inc.visa_path)
        ),
        el("p", {}, el("strong", {}, "Fit : "), inc.fit),
        el("p", {}, el("strong", {}, "Pourquoi DinaResearch : "), inc.why_dina),
        el("h4", {}, "Comment candidater / contacter"),
        el("ol", { class: "list" }, ...(inc.how_to_apply || []).map((s) => el("li", {}, s))),
        (inc.pitch_hooks || []).length
          ? el("div", {},
              el("h4", {}, "Hooks pitch"),
              el("ul", { class: "list" }, ...inc.pitch_hooks.map((h) => el("li", {}, h)))
            )
          : null,
        el("div", { class: "incubator-actions" },
          inc.website
            ? el("a", { class: "btn-link", href: inc.website, target: "_blank", rel: "noopener" }, "Site")
            : null,
          inc.apply_url
            ? el("a", { class: "btn-link primary", href: inc.apply_url, target: "_blank", rel: "noopener" }, "Candidater / page")
            : null,
          inc.apply_form
            ? el("a", { class: "btn-link", href: inc.apply_form, target: "_blank", rel: "noopener" }, "Formulaire")
            : null,
          inc.email
            ? el("span", { class: "contact-inline" },
                el("a", { href: `mailto:${inc.email}?subject=${encodeURIComponent("Candidature DinaResearch — French Tech Founders")}` }, inc.email),
                " ",
                copyBtn(inc.email)
              )
            : null,
          inc.email_alt
            ? el("span", { class: "contact-inline" },
                el("a", { href: `mailto:${inc.email_alt}` }, inc.email_alt),
                " ",
                copyBtn(inc.email_alt)
              )
            : null,
          inc.phone ? el("span", { class: "muted" }, inc.phone) : null
        )
      )
    )
  );
}

function setupIncubatorFilters(intro, filtersEl, root, data) {
  let tier = "p0_visa";
  const paint = () => {
    renderIncubators(intro, filtersEl, root, data, tier);
    filtersEl.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        tier = btn.dataset.tier;
        paint();
      });
    });
  };
  paint();
}

function renderFrenchTech(root, ft, graphics) {
  const fit = ft.fit_dina || {};
  const net = ft.what_is_french_tech?.network_2026 || {};
  const routes = ft.founders_recognition_routes?.routes || [];
  const steps = ft.process_steps || [];
  const orgs = ft.organisms || [];
  const templates = ft.email_templates || {};

  root.replaceChildren(
    el("div", { class: "card span-2" },
      el("h2", {}, "French Tech — comment débloquer l’attestation"),
      el("p", { class: "muted" },
        `OSINT ${ft.researched_at}. `,
        "Ici on n’a pas re-décidé la voie (déjà sur Accueil) : on explique ",
        el("strong", {}, "comment"),
        " obtenir le document DRIEETS."
      ),
      el("div", { class: "alert" },
        el("strong", {}, "En une phrase : "),
        "French Tech Visa for Founders = même chose que Passeport Talent innovant — il faut d’abord une reconnaissance écosystème, puis l’attestation DRIEETS, puis Athènes."
      ),
      el("details", { class: "details-block", style: "margin-top:0.75rem" },
        el("summary", {}, el("strong", {}, "Pourquoi DinaResearch colle"), el("span", { class: "muted" }, " — profil · innovation · géo · Athènes")),
        el("ul", { class: "list", style: "margin-top:0.75rem" },
          el("li", {}, el("strong", {}, "Pourquoi FT : "), fit.why_ft || ""),
          el("li", {}, el("strong", {}, "Profil : "), fit.profile || ""),
          el("li", {}, el("strong", {}, "Fit innovation : "), fit.innovation_match || ""),
          el("li", {}, el("strong", {}, "Géo NA : "), fit.geo_match || ""),
          el("li", {}, el("strong", {}, "Athènes : "), fit.athens_match || "")
        )
      )
    ),
    el("div", { class: "span-2 viz-row viz-2" },
      vizFigure("flow_founders", graphics),
      vizFigure("trois_portes", graphics)
    ),
    el("div", { class: "card span-2" },
      el("h3", {}, "3 portes avant l’attestation DRIEETS"),
      el("p", {},
        "Avant de déposer sur demarches-simplifiees, il faut ",
        el("strong", {}, "une"),
        " de ces trois preuves d’écosystème (Business France). ",
        ft.founders_recognition_routes?.note || ""
      ),
      el("div", { class: "ft-routes" },
        ...routes.map((r) =>
          el("article", { class: "ft-route-card" },
            el("h4", {}, r.title),
            el("p", {}, r.detail),
            r.na_historical_ftb
              ? el("p", {}, el("strong", {}, "NA (FTB) : "), r.na_historical_ftb.join(" · "))
              : null,
            r.dina_candidates
              ? el("ul", { class: "list" }, ...r.dina_candidates.map((c) => el("li", {}, c)))
              : null,
            r.contact
              ? el("p", {}, el("a", { href: `mailto:${r.contact}` }, r.contact), " ", copyBtn(r.contact))
              : null,
            r.website
              ? el("a", { class: "btn-link", href: r.website, target: "_blank", rel: "noopener" }, "Site")
              : null
          )
        )
      ),
      el("div", { class: "alert", style: "margin-top:1rem" },
        el("strong", {}, "Alerte liste : "),
        ft.list_caveat?.finding || "",
        " ",
        el("em", {}, ft.list_caveat?.action || "")
      ),
      el("p", { style: "margin-top:1rem" },
        el("button", {
          type: "button",
          class: "btn-link primary",
          onclick: () => goTo("panel-eco", "eco-inc"),
        }, "Candidater incubateurs NA →")
      )
    ),
    el("div", { class: "card" },
      el("h3", {}, "Process (4 étapes)"),
      el("ol", { class: "list" },
        ...steps.map((s) =>
          el("li", {},
            el("strong", {}, s.title),
            s.url ? el("div", {}, el("a", { href: s.url, target: "_blank", rel: "noopener" }, "Ouvrir la plateforme")) : null,
            s.email ? el("div", {}, el("a", { href: `mailto:${s.email}` }, s.email), " ", copyBtn(s.email)) : null,
            s.delay_practice ? el("div", { class: "muted" }, s.delay_practice) : null,
            s.actions ? el("ul", { class: "list" }, ...s.actions.map((a) => el("li", {}, a))) : null,
            s.checklist_pdf
              ? el("div", {}, el("a", { href: s.checklist_pdf, target: "_blank", rel: "noopener" }, "PDF checklist pièces"))
              : null
          )
        )
      )
    ),
    el("div", { class: "card" },
      el("h3", {}, "Plan d’action FT"),
      el("ol", { class: "list" }, ...(ft.action_plan_dina || []).map((a) => el("li", {}, a))),
      el("p", { class: "muted" }, "Founders : pas de 30 k€ · ressources ≥ SMIC 22 404,20 €/an.")
    ),
    el("details", { class: "card span-2 details-block" },
      el("summary", {}, el("strong", {}, "Doctrine & contexte"), el("span", { class: "muted" }, " — qu’est-ce que FT · 3 visas · innovant")),
      el("div", { class: "exec-layout", style: "margin-top:1rem" },
        el("div", { class: "card" },
          el("h3", {}, "Qu’est-ce que La French Tech ?"),
          el("p", {}, ft.what_is_french_tech?.mission || ""),
          el("p", {}, ft.what_is_french_tech?.not_an_incubator || ""),
          el("div", { class: "stat-grid" },
            el("div", { class: "stat" }, el("div", { class: "stat-v" }, String(net.capitales || "19")), el("div", { class: "stat-l" }, "Capitales")),
            el("div", { class: "stat" }, el("div", { class: "stat-v" }, String(net.communautes_fr || "28")), el("div", { class: "stat-l" }, "Communautés FR")),
            el("div", { class: "stat" }, el("div", { class: "stat-v" }, "78"), el("div", { class: "stat-l" }, "Communautés intl")),
            el("div", { class: "stat" }, el("div", { class: "stat-v" }, "~125"), el("div", { class: "stat-l" }, "Structures labellisées"))
          ),
          el("p", { style: "margin-top:0.85rem" },
            el("a", { href: ft.what_is_french_tech?.official_site, target: "_blank", rel: "noopener" }, "lafrenchtech.gouv.fr"),
            " · ",
            el("a", { href: ft.what_is_french_tech?.visa_page, target: "_blank", rel: "noopener" }, "Page French Tech Visa")
          )
        ),
        el("div", { class: "card" },
          el("h3", {}, "3 visas French Tech"),
          el("ul", { class: "list" },
            ...(ft.three_visa_tracks || []).map((t) =>
              el("li", {},
                el("strong", {}, t.name),
                " — ",
                el("span", { class: t.for_dina?.includes("PRIORITAIRE") ? "status-pill status-done" : "status-pill status-n_a" }, t.for_dina),
                el("div", { class: "muted" }, t.legal || t.note || ""),
                t.guide_url
                  ? el("div", {}, el("a", { href: t.guide_url, target: "_blank", rel: "noopener" }, "Guide Business France"))
                  : null
              )
            )
          )
        ),
        el("div", { class: "card span-2" },
          el("h3", {}, "Définition officielle « innovant »"),
          el("p", {}, ft.innovation_definition_official?.text_fr || ""),
          el("p", { class: "muted" }, ft.innovation_definition_official?.company_status || ""),
          el("p", {}, el("strong", {}, "Claim Dina : "), ft.innovation_definition_official?.dina_claim || "")
        )
      )
    ),
    el("details", { class: "card span-2 details-block" },
      el("summary", {}, el("strong", {}, "Organismes & contacts"), el("span", { class: "muted" }, " — Mission FT · BF · DRIEETS · Bordeaux · Athens · Pépite")),
      el("div", { class: "incubators-grid", style: "margin-top:1rem" },
        ...orgs.map((o) =>
          el("article", { class: "incubator-card" },
            el("h3", {}, o.name),
            el("p", {}, o.role),
            el("p", { class: "muted" }, o.for_dina || ""),
            o.address ? el("p", { class: "muted" }, o.address) : null,
            el("div", { class: "incubator-actions" },
              o.url || o.website
                ? el("a", { class: "btn-link", href: o.url || o.website, target: "_blank", rel: "noopener" }, "Site")
                : null,
              o.email
                ? el("span", { class: "contact-inline" },
                    el("a", { href: `mailto:${o.email}` }, o.email),
                    " ",
                    copyBtn(o.email)
                  )
                : null,
              o.linkedin
                ? el("a", { class: "btn-link", href: o.linkedin, target: "_blank", rel: "noopener" }, "LinkedIn")
                : null,
              o.platform
                ? el("a", { class: "btn-link primary", href: o.platform, target: "_blank", rel: "noopener" }, "Plateforme")
                : null
            )
          )
        )
      ),
      el("div", { class: "card", style: "margin-top:1rem" },
        el("h3", {}, "Incubateurs NA (indice FTB)"),
        el("p", { class: "muted" }, "Historiquement cités par French Tech Bordeaux — à confirmer par écrit."),
        el("ul", { class: "list" },
          ...(ft.na_partner_incubators_osint || []).map((i) =>
            el("li", {},
              el("a", { href: i.url, target: "_blank", rel: "noopener" }, i.name),
              " — ",
              i.note
            )
          )
        )
      )
    ),
    el("details", { class: "card span-2 details-block" },
      el("summary", {}, el("strong", {}, "Emails prêts à envoyer"), el("span", { class: "muted" }, " — Bordeaux · Business France · Athens")),
      el("div", { style: "margin-top:1rem" },
        ...Object.entries(templates).map(([key, text]) =>
          el("div", { class: "ft-mail-block" },
            el("div", { class: "ft-mail-head" },
              el("strong", {}, key.replace(/_/g, " ")),
              el("button", {
                type: "button",
                class: "copy-btn",
                onclick: async () => {
                  try { await navigator.clipboard.writeText(text); } catch (_) { /* */ }
                },
              }, "copier")
            ),
            el("pre", { class: "email-tpl" }, text)
          )
        )
      )
    ),
    el("details", { class: "card span-2 details-block" },
      el("summary", {}, el("strong", {}, "Autres programmes & sources"), el("span", { class: "muted" }, " — Tremplin · Employees · OSINT")),
      el("div", { style: "margin-top:1rem" },
        el("ul", { class: "list" },
          ...(ft.other_ft_programs_relevance || []).map((p) =>
            el("li", {},
              el("strong", {}, p.name),
              " — ",
              p.relevance,
              p.url ? el("div", {}, el("a", { href: p.url, target: "_blank", rel: "noopener" }, "Lien")) : null
            )
          )
        ),
        el("h3", {}, "Sources"),
        el("ol", { class: "list" },
          ...(ft.sources || []).map((u) =>
            el("li", {}, el("a", { href: u, target: "_blank", rel: "noopener" }, u))
          )
        ),
        el("p", { class: "muted" }, "Doc : docs/FRENCH_TECH_OSINT_2026-10-25.md · data/french_tech_osint.json")
      )
    )
  );
}

function renderSources(root, synthesis) {
  const official = (synthesis.osint_wave_urls || []).slice(0, 10);
  root.replaceChildren(
    el("h2", {}, "Sources officielles (extrait OSINT)"),
    el("p", { class: "muted" },
      `Intégré ${synthesis.integrated_at || "—"} · rapport : ${synthesis.osint_report || "docs/OSINT_CAMPAGNE_2026-10-24.md"} · détail : docs/SOURCES.md`
    ),
    el("ol", { class: "list" },
      ...official.map((u) =>
        el("li", {}, el("a", { href: u, target: "_blank", rel: "noopener" }, u))
      )
    ),
    el("h3", {}, "Docs agents (chemins locaux)"),
    el("ul", { class: "list" },
      ...(synthesis.sources_from_other_agents || []).map((d) => el("li", {}, el("code", {}, d)))
    )
  );
}

function setupNav(anglesData) {
  const buttons = [...document.querySelectorAll(".nav-journey button")];
  const panels = [...document.querySelectorAll(".panel")];
  const activate = (id) => {
    const resolved = HASH_ALIASES[id] || id;
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.panel === resolved));
    panels.forEach((p) => p.classList.toggle("active", p.id === resolved));
    if (resolved !== "panel-angles") showAnglesList();
    if (!location.hash.startsWith("#angle-") && location.hash !== `#${resolved}`) {
      history.replaceState(null, "", `#${resolved}`);
    }
  };
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.panel));
  });
  window.__goTo = goTo;

  const applyHash = () => {
    const hash = location.hash.replace(/^#/, "");
    const angleMatch = /^angle-(\d+)$/.exec(hash);
    if (angleMatch && anglesData) {
      activate("panel-angles");
      const n = Number(angleMatch[1]);
      const angle = anglesData.angles.find((a) => a.n === n);
      if (angle) openAngleDetail(anglesData, angle);
      return;
    }
    if (hash === "eco-inc" || hash === "panel-incubators") {
      activate("panel-eco");
      requestAnimationFrame(() => document.querySelector('[data-sub="eco-inc"]')?.click());
      return;
    }
    if (hash === "eco-ft" || hash === "panel-frenchtech") {
      activate("panel-eco");
      return;
    }
    const mapped = HASH_ALIASES[hash] || hash;
    if (mapped && document.getElementById(mapped)) activate(mapped);
    else activate("panel-home");
  };
  window.addEventListener("hashchange", applyHash);
  applyHash();
}

async function main() {
  const [profile, emails, analysis, product, angles, synthesis, checklist, pitchMd, incubators, frenchTech, graphics, plan90, chanceSim] = await Promise.all([
    loadJSON("./data/profile.json"),
    loadJSON("./data/emails.json"),
    loadJSON("./data/analysis.json"),
    loadJSON("./data/project_pack/product_facts.json"),
    loadJSON("./data/angles_15.json"),
    loadJSON("./data/research_synthesis.json"),
    loadJSON("./data/checklist_pieces.json"),
    loadText("./data/project_pack/pitch_1page_fr.md").catch(() => null),
    loadJSON("./data/incubators_targets.json"),
    loadJSON("./data/french_tech_osint.json"),
    loadJSON("./data/graphics_manifest.json").catch(() => null),
    loadJSON("./data/plan_90.json"),
    loadJSON("./data/chance_simulator.json"),
  ]);

  setupNav(angles);
  setupSubnav("eco-subnav");
  setupSubnav("dossier-subnav");

  const c = profile.candidate;
  const brand = c.entrepreneurship.product_brand || "DinaResearch";

  document.getElementById("hero-sub").textContent =
    `${c.full_name} · ${brand} · Athènes → France (Talent Founders)`;
  const heroMeta = document.getElementById("hero-meta");
  if (heroMeta) {
    // Scores only on Accueil / Décision — avoid triple repeat in header
    heroMeta.replaceChildren(
      el("div", { class: "pill" }, c.email),
      el("div", { class: "pill" }, "Non-UE · consulat Athènes"),
      el("div", { class: "pill" }, "D2E non inscrit (scores = simulation)")
    );
  }

  renderHome(document.getElementById("home-root"), {
    analysis, checklist, product, synthesis, frenchTech, graphics,
  });
  renderPlan90(document.getElementById("plan90-root"), plan90, graphics, chanceSim);
  renderProgressStrip(checklist);
  fillVizRow("decide-charts", ["scores_pathways", "criteria_talent"], graphics, true);
  fillVizRow("angles-charts", ["timeline_softlanding"], graphics, false);

  const hypEl = document.getElementById("hyp-banner");
  if (hypEl) {
    hypEl.hidden = false;
    hypEl.replaceChildren(
      el("strong", {}, "Comment lire les scores : "),
      "D2E = diplôme / parcours étudiant-entrepreneur (Pépite). ",
      el("strong", {}, "Réel au 24/10 : pas inscrit. "),
      "Les chiffres ci-dessous font comme si l’inscription était faite (rentrée admin ~3 nov). ",
      "SNEE (avis favorable 13/10) ≠ titre de séjour."
    );
  }

  const rec = analysis.recommendation;
  const recChildren = [
    el("h2", {}, "Lecture rapide des 3 cartes"),
    el("p", {},
      "Talent (68) gagne sur le papier mais reste ",
      el("strong", {}, "bloqué sans attestation DRIEETS"),
      " — le document État qui dit « projet innovant ». ",
      "Études (51) = filet si attestation de présence IAE. ",
      "Créateur (53) = plan B seulement avec ≥ 30 000 €."
    ),
    el("p", { class: "muted", style: "opacity:0.9;margin:0.5rem 0 0" },
      "La décision stratégique est sur Accueil. Ici = diagnostic par voie."
    ),
    el("details", { style: "margin-top:0.75rem" },
      el("summary", { style: "cursor:pointer;opacity:0.9" }, "Ne pas faire / pièges"),
      el("ul", { class: "list", style: "margin-top:0.5rem" }, ...rec.do_not.map((x) => el("li", {}, x)))
    ),
    el("details", { style: "margin-top:0.5rem" },
      el("summary", { style: "cursor:pointer;opacity:0.9" }, "Synthèse agents (détail)"),
      el("p", { style: "margin-top:0.5rem;opacity:0.9" }, rec.summary)
    )
  ];
  document.getElementById("rec").replaceChildren(...recChildren);

  renderPathway(document.getElementById("card-talent"), analysis.pathways.talent, "talent");
  renderPathway(document.getElementById("card-etudes"), analysis.pathways.etudes, "etudes");
  if (analysis.pathways.talent_createur) {
    renderPathway(document.getElementById("card-createur"), analysis.pathways.talent_createur, "createur");
  }

  const note = document.getElementById("research-note");
  if (note) {
    const nDocs = (analysis.research_integrated?.from || []).length;
    const fees = synthesis?.fees_talent_founders_eur;
    note.textContent =
      `Base documentaire : ${nDocs}+ docs agents/OSINT. ` +
      `Ressources Talent ≥ SMIC annuel 22 404,20 € (souvent via oncle garant). ` +
      `Le seuil 30 000 € concerne seulement le Talent créateur (R.421-33-2), pas Founders. ` +
      (fees
        ? `Frais Founders indicatifs : visa ${fees.visa_long_stay} € + taxe titre ${fees.titre_tax} € + timbre ${fees.timbre} €.`
        : "");
  }
  const glossRoot = document.getElementById("gloss-root");
  if (glossRoot) {
    const gloss = [
      ["DRIEETS", "Direction régionale de l’économie… — guichet qui délivre l’attestation « projet innovant » (pièce killer Founders)."],
      ["French Tech Founders", "Marque / procédure simplifiée du Passeport Talent innovant (L.421-16 2°) — pas un 4ᵉ visa séparé."],
      ["SNEE", "Statut national étudiant-entrepreneur (Pépite) — avis positif = crédibilité, pas un droit au séjour."],
      ["D2E", "Diplôme / parcours étudiant-entrepreneur — inscription encore à faire (hypothèse de scoring)."],
      ["FAD", "Formation à distance — risque élevé pour un visa études sans preuve de présence sur site."],
      ["IAE", "École de management Poitiers (master M2IE) — interlocuteur pour attestation de présence."],
    ];
    glossRoot.replaceChildren(
      ...gloss.map(([k, v]) =>
        el("div", { class: "kv" }, el("dt", {}, k), el("dd", {}, v))
      )
    );
  }

  const alerts = document.getElementById("alerts");
  const alertChildren = [el("h2", {}, "Alertes dossier")];
  const hard = synthesis?.hard_rules || rec.hard_rules || [];
  if (hard.length) {
    alertChildren.push(
      el("h3", {}, "Règles dures"),
      el("ul", { class: "list" }, ...hard.slice(0, 8).map((r) => el("li", {}, r)))
    );
  }
  alertChildren.push(...(analysis.alerts || []).map((a) => el("div", { class: "alert" }, a)));
  alerts.replaceChildren(...alertChildren);

  renderProduct(document.getElementById("product-root"), product, c.entrepreneurship);
  if (pitchMd) {
    document.getElementById("pitch-root").replaceChildren(simpleMarkdown(pitchMd));
  }

  renderExec(document.getElementById("exec-root"), synthesis, checklist, graphics);
  setupIncubatorFilters(
    document.getElementById("incubators-intro"),
    document.getElementById("incubator-filters"),
    document.getElementById("incubators-root"),
    incubators
  );
  renderFrenchTech(document.getElementById("frenchtech-root"), frenchTech, graphics);
  const tpl = document.getElementById("incubator-email-tpl");
  if (tpl) tpl.textContent = incubators.email_template_fr || "";
  const copyTpl = document.getElementById("copy-email-tpl");
  if (copyTpl) {
    copyTpl.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(incubators.email_template_fr || "");
      } catch (_) { /* ignore */ }
    });
  }
  renderSources(document.getElementById("sources-root"), synthesis);

  const angleFilters = document.getElementById("angle-filters");
  const anglesRoot = document.getElementById("angles-root");
  let angleMode = "p0";
  function paintAngleFilters() {
    angleFilters.replaceChildren(
      ...[["p0", "P0 seulement"], ["all", "Tous (15)"]].map(([key, label]) =>
        el("button", {
          type: "button",
          class: key === angleMode ? "active" : "",
          onclick: () => {
            angleMode = key;
            paintAngleFilters();
            renderAngles(anglesRoot, angles, angleMode);
          },
        }, label)
      )
    );
  }
  paintAngleFilters();
  renderAngles(anglesRoot, angles, angleMode);

  const support = c.support;
  const profileRoot = document.getElementById("profile");
  profileRoot.replaceChildren(
    el("div", { class: "card" },
      el("h3", {}, "Identité"),
      el("dl", {},
        el("div", { class: "kv" }, el("dt", {}, "Nom"), el("dd", {}, c.full_name)),
        c.date_of_birth_fr
          ? el("div", { class: "kv" }, el("dt", {}, "Naissance"), el("dd", {}, `${c.date_of_birth_fr}${c.age != null ? ` · ${c.age} ans` : ""}`))
          : null,
        el("div", { class: "kv" }, el("dt", {}, "Email"), el("dd", {}, c.email)),
        el("div", { class: "kv" }, el("dt", {}, "Téléphone"), el("dd", {}, c.phone)),
        c.linkedin
          ? el("div", { class: "kv" }, el("dt", {}, "LinkedIn"), el("dd", {},
              el("a", { href: c.linkedin, target: "_blank", rel: "noopener" }, c.linkedin)
            ))
          : null,
        el("div", { class: "kv" }, el("dt", {}, "Adresse"), el("dd", {}, c.address)),
        el("div", { class: "kv" }, el("dt", {}, "Contexte"), el("dd", {}, c.nationality_context || "—")),
        Array.isArray(c.languages) && c.languages.length
          ? el("div", { class: "kv" }, el("dt", {}, "Langues"), el("dd", {}, c.languages.map((l) => `${l.language} (${l.level})`).join(" · ")))
          : null
      )
    ),
    el("div", { class: "card" },
      el("h3", {}, "Études"),
      el("dl", {},
        el("div", { class: "kv" }, el("dt", {}, "Actuel"), el("dd", {}, c.education.current)),
        el("div", { class: "kv" }, el("dt", {}, "Année"), el("dd", {}, c.education.academic_year)),
        el("div", { class: "kv" }, el("dt", {}, "Antérieur"), el("dd", {}, c.education.prior)),
        el("div", { class: "kv" }, el("dt", {}, "Expérience"), el("dd", {}, c.education.experience)),
        el("div", { class: "kv" }, el("dt", {}, "RP"), el("dd", {}, c.education.responsable_pedagogique)),
        c.education.gestionnaire_fad
          ? el("div", { class: "kv" }, el("dt", {}, "FAD"), el("dd", {}, c.education.gestionnaire_fad))
          : null
      )
    ),
    el("div", { class: "card" },
      el("h3", {}, "Entrepreneuriat & produit"),
      el("dl", {},
        el("div", { class: "kv" }, el("dt", {}, "SNEE"), el("dd", {}, c.entrepreneurship.snee_status)),
        el("div", { class: "kv" }, el("dt", {}, "Pépite"), el("dd", {}, c.entrepreneurship.pepite)),
        el("div", { class: "kv" }, el("dt", {}, "D2E"), el("dd", {}, c.entrepreneurship.d2e_status)),
        el("div", { class: "kv" }, el("dt", {}, "Marque"), el("dd", {}, brand)),
        el("div", { class: "kv" }, el("dt", {}, "Live"), el("dd", {},
          el("a", { href: c.entrepreneurship.project_url, target: "_blank", rel: "noopener" }, c.entrepreneurship.project_url)
        )),
        el("div", { class: "kv" }, el("dt", {}, "Résumé"), el("dd", {}, c.entrepreneurship.project_summary))
      )
    ),
    support
      ? el("div", { class: "card" },
          el("h3", {}, "Garant (oncle FR)"),
          el("dl", {},
            el("div", { class: "kv" }, el("dt", {}, "Lien"), el("dd", {}, support.guarantor_label_fr || support.guarantor_relationship)),
            el("div", { class: "kv" }, el("dt", {}, "Nationalité"), el("dd", {}, support.guarantor_nationality_fr || support.guarantor_nationality)),
            el("div", { class: "kv" }, el("dt", {}, "Logement + financier"), el("dd", {},
              `${support.housing_guarantor ? "oui" : "non"} / ${support.financial_guarantor ? "oui" : "non"}`
            )),
            el("div", { class: "kv" }, el("dt", {}, "Période"), el("dd", {}, support.coverage_note_fr || support.coverage_period)),
            el("div", { class: "kv" }, el("dt", {}, "Statut"), el("dd", {}, support.status_note_fr || support.status))
          )
        )
      : null,
    c.cv
      ? el("div", { class: "card" },
          el("h3", {}, "CV"),
          el("dl", {},
            el("div", { class: "kv" }, el("dt", {}, "Headline"), el("dd", {}, c.cv.headline || "—")),
            el("div", { class: "kv" }, el("dt", {}, "PDF"), el("dd", {},
              c.cv.pdf
                ? el("a", { href: `./${c.cv.pdf}`, target: "_blank", rel: "noopener" }, c.cv.pdf)
                : "—"
            )),
            Array.isArray(c.certifications)
              ? el("div", { class: "kv" }, el("dt", {}, "Certifications"), el("dd", {}, c.certifications.join(" · ")))
              : null,
            Array.isArray(c.professional_experience_summary)
              ? el("div", { class: "kv" }, el("dt", {}, "XP"), el("dd", {},
                  el("ul", { class: "list" }, ...c.professional_experience_summary.map((x) => el("li", {}, x)))
                ))
              : null
          )
        )
      : null
  );

  const emailRoot = document.getElementById("emails");
  const filters = document.getElementById("email-filters");
  const filterDefs = [
    ["all", "Tous"],
    ["iae_admission", "IAE / M2IE"],
    ["pepite_snee_d2e", "PEPITE / SNEE / D2E"],
    ["visa_consulat", "Visa Consulat"],
  ];
  let current = "all";
  function paintFilters() {
    filters.replaceChildren(
      ...filterDefs.map(([key, label]) =>
        el("button", {
          class: key === current ? "active" : "",
          type: "button",
          onclick: () => {
            current = key;
            paintFilters();
            renderEmails(emailRoot, emails, current);
          },
        }, label)
      )
    );
  }
  paintFilters();
  renderEmails(emailRoot, emails, current);

}

main().catch((err) => {
  console.error(err);
  const rec = document.getElementById("rec");
  if (rec) {
    rec.textContent = "Erreur de chargement. Servir le dossier : python -m http.server 8765";
  }
});
