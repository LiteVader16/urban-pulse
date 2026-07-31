/* Urban Pulse — front end.
   No framework, no build step: the whole site is three files and a JSON
   payload, so it cannot rot between deploys.

   Two views share one filter state: a day sheet (one date at a time) and a
   month calendar that acts as a date picker. Filters live behind an icon rail;
   only one panel is open at a time. */

(function () {
  "use strict";

  var TIERS = [
    { id: "all", label: "All places" },
    { id: "ahmedabad", label: "Ahmedabad" },
    { id: "bengaluru", label: "Bengaluru" },
    { id: "national", label: "India" },
    { id: "international", label: "World" }
  ];

  var LEAN_ORDER = ["left", "centre-left", "centre", "centre-right", "right", "specialist"];
  var LEAN_LABEL = {
    "left": "Left",
    "centre-left": "Centre-left",
    "centre": "Centre",
    "centre-right": "Centre-right",
    "right": "Right",
    "specialist": "Specialist"
  };

  var FAMILY_COLOUR = {
    shelter: "var(--fam-shelter)",
    movement: "var(--fam-movement)",
    environment: "var(--fam-environment)",
    society: "var(--fam-society)",
    design: "var(--fam-design)",
    tech: "var(--fam-tech)"
  };

  var PANEL_TITLE = {
    places: "Places",
    newsrooms: "Newsrooms",
    topics: "Topics",
    search: "Search"
  };

  var state = {
    data: null,
    view: "day",          // "day" | "calendar" | "focus"
    date: null,           // YYYY-MM-DD currently shown
    focusIndex: 0,        // position within the filtered set, newest first
    calMonth: null,       // Date pinned to the 1st of the displayed month
    tier: "all",
    sources: new Set(),   // empty = all newsrooms
    themes: new Set(),    // empty = all themes
    query: "",
    openPanel: null
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ----------------------------------------------------------- utilities */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function iso(d) {
    // Local calendar date, not UTC: a story read at 1am should belong to the
    // day the reader thinks it is.
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function parseISO(s) {
    var p = s.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function localDay(article) {
    return iso(new Date(article.published));
  }

  function ordinal(n) {
    if (n % 100 >= 11 && n % 100 <= 13) return "th";
    return ["th", "st", "nd", "rd"][n % 10] || "th";
  }

  function themeLabel(id) {
    var t = state.data.themes[id];
    return t ? t.label : id;
  }

  function themeFamily(id) {
    var t = state.data.themes[id];
    return t ? t.family : null;
  }

  function familyColour(id) { return FAMILY_COLOUR[id] || "var(--ink-muted)"; }

  function sourceById(id) {
    var list = state.data.sources;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ------------------------------------------------------------ filtering */

  /* Every filter except one, so each control can show counts that reflect
     what picking it would actually do. */
  function passes(article, skip) {
    if (skip !== "tier" && state.tier !== "all" && article.tier !== state.tier) return false;
    if (skip !== "source" && state.sources.size && !state.sources.has(article.source)) return false;
    if (skip !== "theme" && state.themes.size) {
      var hit = article.themes.some(function (t) { return state.themes.has(t); });
      if (!hit) return false;
    }
    if (skip !== "query" && state.query) {
      var hay = (article.title + " " + article.summary + " " + article.sourceName + " " +
        article.themes.map(themeLabel).join(" ")).toLowerCase();
      if (hay.indexOf(state.query) === -1) return false;
    }
    return true;
  }

  function filtered(skip) {
    return state.data.articles.filter(function (a) { return passes(a, skip); });
  }

  function countsByDay(list) {
    var counts = {};
    list.forEach(function (a) {
      var d = localDay(a);
      counts[d] = (counts[d] || 0) + 1;
    });
    return counts;
  }

  /* Days that actually have stories, newest first — used to skip empty days
     when paging, so the arrows never dead-end on a silent weekend. */
  function activeDays(list) {
    return Object.keys(countsByDay(list)).sort().reverse();
  }

  /* --------------------------------------------------------------- panels */

  function activeCount(kind) {
    if (kind === "places") return state.tier === "all" ? 0 : 1;
    if (kind === "newsrooms") return state.sources.size;
    if (kind === "topics") return state.themes.size;
    if (kind === "search") return state.query ? 1 : 0;
    return 0;
  }

  function renderRailBadges() {
    Array.prototype.forEach.call(document.querySelectorAll(".rail-dot"), function (dot) {
      var n = activeCount(dot.getAttribute("data-count"));
      dot.hidden = n === 0;
      dot.textContent = n || "";
    });
  }

  function makePill(label, pressed, colour, count, onClick) {
    var pill = el("button", "pill");
    pill.type = "button";
    pill.setAttribute("aria-pressed", String(pressed));
    if (colour) pill.style.setProperty("--pill-colour", colour);
    if (colour) pill.appendChild(el("span", "dot"));
    pill.appendChild(document.createTextNode(label));
    if (count != null) pill.appendChild(el("span", "pill-count", String(count)));
    pill.addEventListener("click", onClick);
    return pill;
  }

  function renderPanel() {
    var panel = $("panel");
    var body = $("panel-body");
    if (!state.openPanel) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    $("panel-title").textContent = PANEL_TITLE[state.openPanel];
    body.textContent = "";

    if (state.openPanel === "places") {
      var poolT = filtered("tier");
      var wrap = el("div", "pills");
      TIERS.forEach(function (tier) {
        var n = tier.id === "all"
          ? poolT.length
          : poolT.filter(function (a) { return a.tier === tier.id; }).length;
        wrap.appendChild(makePill(tier.label, state.tier === tier.id, null, n, function () {
          state.tier = tier.id;
          afterFilterChange();
        }));
      });
      body.appendChild(wrap);

    } else if (state.openPanel === "newsrooms") {
      var poolS = filtered("source");
      var perSource = {};
      poolS.forEach(function (a) { perSource[a.source] = (perSource[a.source] || 0) + 1; });

      LEAN_ORDER.forEach(function (lean) {
        var inLean = state.data.sources.filter(function (s) { return s.lean === lean; });
        if (!inLean.length) return;
        var group = el("div", "panel-group");
        var title = el("h3", "panel-group-title");
        title.appendChild(document.createTextNode(LEAN_LABEL[lean]));
        group.appendChild(title);
        var pills = el("div", "pills");
        inLean.forEach(function (source) {
          var n = perSource[source.id] || 0;
          pills.appendChild(makePill(source.short, state.sources.has(source.id), null, n, function () {
            if (state.sources.has(source.id)) state.sources.delete(source.id);
            else state.sources.add(source.id);
            afterFilterChange();
          }));
        });
        group.appendChild(pills);
        body.appendChild(group);
      });

    } else if (state.openPanel === "topics") {
      var poolTh = filtered("theme");
      var perTheme = {};
      poolTh.forEach(function (a) {
        a.themes.forEach(function (t) { perTheme[t] = (perTheme[t] || 0) + 1; });
      });

      var families = Object.keys(state.data.families).sort(function (a, b) {
        return state.data.families[a].order - state.data.families[b].order;
      });

      families.forEach(function (fam) {
        var group = el("div", "panel-group");
        var title = el("h3", "panel-group-title");
        var dot = el("span", "dot");
        dot.style.setProperty("--group-colour", familyColour(fam));
        title.appendChild(dot);
        title.appendChild(document.createTextNode(state.data.families[fam].label));
        group.appendChild(title);

        var pills = el("div", "pills");
        Object.keys(state.data.themes)
          .filter(function (t) { return themeFamily(t) === fam; })
          .forEach(function (t) {
            pills.appendChild(makePill(themeLabel(t), state.themes.has(t),
              familyColour(fam), perTheme[t] || 0, function () {
                if (state.themes.has(t)) state.themes.delete(t);
                else state.themes.add(t);
                afterFilterChange();
              }));
          });
        group.appendChild(pills);
        body.appendChild(group);
      });

    } else if (state.openPanel === "search") {
      var input = document.createElement("input");
      input.type = "search";
      input.className = "panel-search";
      input.placeholder = "Headlines, newsrooms, themes…";
      input.value = state.query;
      input.autocomplete = "off";
      var debounce;
      input.addEventListener("input", function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          state.query = input.value.trim().toLowerCase();
          // Re-render everything except the panel, so focus is not stolen.
          renderRailBadges();
          renderMain();
          renderCharts();
        }, 180);
      });
      body.appendChild(input);
      body.appendChild(el("p", "search-hint",
        "Searches every story in the last " + state.data.retentionDays + " days, across all dates."));
      setTimeout(function () { input.focus(); }, 0);
    }

    renderRailBadges();
  }

  function afterFilterChange() {
    // Keep the reader on a day that still has something to read.
    var days = activeDays(filtered());
    if (days.length && days.indexOf(state.date) === -1) state.date = days[0];
    // The focus index points into the filtered list, so a changed filter makes
    // the old position meaningless — start again at the newest story.
    state.focusIndex = 0;
    renderPanel();
    renderMain();
    renderCharts();
  }

  /* ---------------------------------------------------------- day + list */

  function buildStory(article) {
    var row = el("article", "story");

    var media = el("div", "story-media");
    var family = themeFamily(article.themes[0]) || "society";
    if (article.image) {
      var img = document.createElement("img");
      img.src = article.image;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", function () {
        media.textContent = "";
        media.appendChild(buildPlate(article, family));
      });
      media.appendChild(img);
    } else {
      media.appendChild(buildPlate(article, family));
    }
    row.appendChild(media);

    var body = el("div", "story-body");

    var kicker = el("div", "story-kicker");
    kicker.appendChild(el("span", "source-name", article.sourceName));
    var badge = el("span", "lean-badge", LEAN_LABEL[article.lean] || article.lean);
    badge.setAttribute("data-lean", article.lean);
    kicker.appendChild(badge);
    kicker.appendChild(el("span", "", new Date(article.published)
      .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
    body.appendChild(kicker);

    var h = el("h3", "story-title");
    var link = document.createElement("a");
    link.href = article.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = article.title;
    h.appendChild(link);
    body.appendChild(h);

    if (article.summary) body.appendChild(el("p", "story-summary", article.summary));

    var tags = el("div", "story-tags");
    article.themes.forEach(function (t) {
      var tag = el("span", "theme-tag", themeLabel(t));
      tag.style.setProperty("--tag-colour", familyColour(themeFamily(t)));
      tags.appendChild(tag);
    });
    body.appendChild(tags);

    row.appendChild(body);
    return row;
  }

  function buildPlate(article, family) {
    var plate = el("div", "story-plate");
    plate.style.setProperty("--plate-colour", familyColour(family));
    plate.appendChild(el("span", "", article.sourceName));
    return plate;
  }

  function renderDayView() {
    var list = filtered();
    var days = activeDays(list);
    if (!state.date) state.date = days[0] || iso(new Date());

    var todays = list
      .filter(function (a) { return localDay(a) === state.date; })
      .sort(function (a, b) { return a.published < b.published ? 1 : -1; });

    var d = parseISO(state.date);
    var head = $("sheet-date");
    head.textContent = "";
    head.appendChild(document.createTextNode(String(d.getDate())));
    var sup = el("sup", "", ordinal(d.getDate()));
    head.appendChild(sup);
    head.appendChild(document.createTextNode(" " +
      d.toLocaleDateString(undefined, { month: "long" }) + " ’" +
      String(d.getFullYear()).slice(2)));

    var todayISO = iso(new Date());
    var rel = state.date === todayISO ? "Today" :
      (state.date === iso(new Date(Date.now() - 86400000)) ? "Yesterday" :
        d.toLocaleDateString(undefined, { weekday: "long" }));
    $("sheet-meta").textContent = rel + " · " + todays.length +
      (todays.length === 1 ? " story" : " stories") + describeFilters();

    var listEl = $("story-list");
    listEl.textContent = "";
    todays.forEach(function (a) { listEl.appendChild(buildStory(a)); });

    var empty = $("empty-state");
    if (todays.length) {
      empty.hidden = true;
      listEl.hidden = false;
    } else {
      listEl.hidden = true;
      empty.hidden = false;
      empty.textContent = days.length
        ? "Nothing on this day under these filters. Use the arrows or the calendar to jump to a day with stories."
        : "No stories match these filters. Try clearing one.";
    }

    // Arrows step to the next/previous day that actually has stories.
    var idx = days.indexOf(state.date);
    var older = days.filter(function (x) { return x < state.date; });
    var newer = days.filter(function (x) { return x > state.date; });
    $("prev-day").disabled = older.length === 0;
    $("next-day").disabled = newer.length === 0;
    $("prev-day").onclick = function () {
      if (older.length) { state.date = older[0]; renderMain(); renderCharts(); }
    };
    $("next-day").onclick = function () {
      if (newer.length) { state.date = newer[newer.length - 1]; renderMain(); renderCharts(); }
    };
    void idx;
  }

  function describeFilters() {
    var bits = [];
    if (state.tier !== "all") {
      TIERS.forEach(function (t) { if (t.id === state.tier) bits.push(t.label); });
    }
    if (state.themes.size) bits.push(state.themes.size + " topic" + (state.themes.size > 1 ? "s" : ""));
    if (state.sources.size) bits.push(state.sources.size + " newsroom" + (state.sources.size > 1 ? "s" : ""));
    if (state.query) bits.push("“" + state.query + "”");
    return bits.length ? " · " + bits.join(" · ") : "";
  }

  /* ------------------------------------------------------------ focus view */

  /* Everything currently in scope, newest first. Focus flips through this one
     item at a time and lets the date change underneath, rather than trapping
     the reader inside a single day. */
  function focusPool() {
    return filtered().sort(function (a, b) {
      return a.published < b.published ? 1 : -1;
    });
  }

  function renderFocusView() {
    var pool = focusPool();
    var card = $("focus-card");
    card.textContent = "";

    if (!pool.length) {
      $("focus").hidden = true;
      $("empty-state").hidden = false;
      $("empty-state").textContent = "No stories match these filters. Try clearing one.";
      $("sheet-date").textContent = "Nothing to read";
      $("sheet-meta").textContent = describeFilters().replace(/^ · /, "");
      return;
    }
    $("focus").hidden = false;
    $("empty-state").hidden = true;

    if (state.focusIndex >= pool.length) state.focusIndex = pool.length - 1;
    if (state.focusIndex < 0) state.focusIndex = 0;

    var article = pool[state.focusIndex];
    // Keep the rest of the page in step: the date header and the daily chart
    // both follow whichever story is on screen.
    state.date = localDay(article);

    var d = parseISO(state.date);
    var head = $("sheet-date");
    head.textContent = "";
    head.appendChild(document.createTextNode(String(d.getDate())));
    head.appendChild(el("sup", "", ordinal(d.getDate())));
    head.appendChild(document.createTextNode(" " +
      d.toLocaleDateString(undefined, { month: "long" }) + " ’" +
      String(d.getFullYear()).slice(2)));

    var todayISO = iso(new Date());
    var rel = state.date === todayISO ? "Today"
      : (state.date === iso(new Date(Date.now() - 86400000)) ? "Yesterday"
        : d.toLocaleDateString(undefined, { weekday: "long" }));
    $("sheet-meta").textContent = rel + describeFilters();

    var family = themeFamily(article.themes[0]) || "society";

    var media = el("div", "focus-media");
    if (article.image) {
      var img = document.createElement("img");
      img.src = article.image;
      img.alt = "";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", function () {
        media.textContent = "";
        media.appendChild(focusPlate(article, family));
      });
      media.appendChild(img);
    } else {
      media.appendChild(focusPlate(article, family));
    }
    card.appendChild(media);

    var kicker = el("div", "focus-kicker");
    kicker.appendChild(el("span", "source-name", article.sourceName));
    var badge = el("span", "lean-badge", LEAN_LABEL[article.lean] || article.lean);
    badge.setAttribute("data-lean", article.lean);
    kicker.appendChild(badge);
    kicker.appendChild(el("span", "", new Date(article.published)
      .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
    card.appendChild(kicker);

    var h = el("h3", "focus-title");
    var link = document.createElement("a");
    link.href = article.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = article.title;
    h.appendChild(link);
    card.appendChild(h);

    if (article.summary) card.appendChild(el("p", "focus-summary", article.summary));

    var tags = el("div", "focus-tags");
    article.themes.forEach(function (t) {
      var tag = el("span", "theme-tag", themeLabel(t));
      tag.style.setProperty("--tag-colour", familyColour(themeFamily(t)));
      tags.appendChild(tag);
    });
    card.appendChild(tags);

    var read = document.createElement("a");
    read.className = "focus-read";
    read.href = article.url;
    read.target = "_blank";
    read.rel = "noopener noreferrer";
    read.textContent = "Read at " + article.sourceName + " →";
    card.appendChild(read);

    card.appendChild(el("p", "focus-counter",
      (state.focusIndex + 1) + " of " + pool.length));
    card.appendChild(el("p", "focus-hint", "Use ← → to flip"));

    $("focus-prev").disabled = state.focusIndex === 0;
    $("focus-next").disabled = state.focusIndex >= pool.length - 1;
  }

  function focusPlate(article, family) {
    var plate = el("div", "focus-plate");
    plate.style.setProperty("--plate-colour", familyColour(family));
    plate.appendChild(el("span", "", article.sourceName));
    return plate;
  }

  function stepFocus(delta) {
    var pool = focusPool();
    var next = state.focusIndex + delta;
    if (next < 0 || next >= pool.length) return;
    state.focusIndex = next;
    renderFocusView();
    renderCharts();
  }

  /* -------------------------------------------------------------- calendar */

  function renderCalendarView() {
    var list = filtered();
    var counts = countsByDay(list);
    var month = state.calMonth || parseISO(state.date || iso(new Date()));
    month = new Date(month.getFullYear(), month.getMonth(), 1);
    state.calMonth = month;

    $("sheet-date").textContent = month.toLocaleDateString(undefined, { month: "long" }) +
      " ’" + String(month.getFullYear()).slice(2);
    $("sheet-meta").textContent = "Pick a day" + describeFilters();

    var cal = $("calendar");
    cal.textContent = "";

    var grid = el("div", "calendar-grid");
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(function (d) {
      grid.appendChild(el("div", "cal-dow", d));
    });

    // Monday-first grid.
    var firstDow = (month.getDay() + 6) % 7;
    for (var b = 0; b < firstDow; b++) {
      grid.appendChild(el("div", "cal-cell is-empty"));
    }

    var daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    var max = 1;
    Object.keys(counts).forEach(function (k) { max = Math.max(max, counts[k]); });
    var todayISO = iso(new Date());

    for (var day = 1; day <= daysInMonth; day++) {
      (function (day) {
        var key = iso(new Date(month.getFullYear(), month.getMonth(), day));
        var n = counts[key] || 0;
        var cell = el("button", "cal-cell");
        cell.type = "button";
        if (key === todayISO) cell.classList.add("is-today");
        if (key === state.date) cell.classList.add("is-selected");
        cell.disabled = n === 0;
        cell.setAttribute("aria-label", key + ", " + n + " stories");

        cell.appendChild(el("span", "cal-daynum", String(day)));
        if (n) {
          var bar = el("div", "cal-bar");
          bar.style.width = Math.max(12, Math.round((n / max) * 100)) + "%";
          cell.appendChild(bar);
          cell.appendChild(el("span", "cal-count", String(n)));
        }
        cell.addEventListener("click", function () {
          state.date = key;
          setView("day");
        });
        grid.appendChild(cell);
      })(day);
    }

    var nav = el("div", "calendar-nav");
    var prev = el("button", "nav-arrow", "←");
    prev.type = "button";
    prev.setAttribute("aria-label", "Previous month");
    var next = el("button", "nav-arrow", "→");
    next.type = "button";
    next.setAttribute("aria-label", "Next month");
    nav.appendChild(prev);
    nav.appendChild(el("h3", "", month.toLocaleDateString(undefined,
      { month: "long", year: "numeric" })));
    nav.appendChild(next);

    // The archive only reaches back retentionDays, so do not wander past it.
    var oldest = list.length ? activeDays(list).slice(-1)[0] : todayISO;
    prev.disabled = month <= new Date(parseISO(oldest).getFullYear(),
      parseISO(oldest).getMonth(), 1);
    next.disabled = month >= new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    prev.onclick = function () {
      state.calMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
      renderMain();
    };
    next.onclick = function () {
      state.calMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      renderMain();
    };

    cal.appendChild(nav);
    cal.appendChild(grid);
    $("empty-state").hidden = true;
  }

  function setView(view) {
    // Entering focus from a day lands on that day's newest story rather than
    // resetting to the top of the archive.
    if (view === "focus" && state.view !== "focus") {
      var pool = focusPool();
      var idx = 0;
      for (var i = 0; i < pool.length; i++) {
        if (localDay(pool[i]) === state.date) { idx = i; break; }
      }
      state.focusIndex = idx;
    }
    state.view = view;
    $("view-day").setAttribute("aria-pressed", String(view === "day"));
    $("view-calendar").setAttribute("aria-pressed", String(view === "calendar"));
    $("view-focus").setAttribute("aria-pressed", String(view === "focus"));
    renderMain();
    renderCharts();
  }

  function renderMain() {
    var view = state.view;
    $("story-list").hidden = view !== "day";
    $("calendar").hidden = view !== "calendar";
    $("focus").hidden = view !== "focus";
    // The head arrows page by day, which only means anything in the day view;
    // focus has its own arrows and calendar has month navigation.
    $("prev-day").hidden = view !== "day";
    $("next-day").hidden = view !== "day";
    $("sheet").classList.toggle("is-focus", view === "focus");

    if (view === "day") renderDayView();
    else if (view === "calendar") renderCalendarView();
    else renderFocusView();
  }

  /* --------------------------------------------------------------- charts */

  var SVG_NS = "http://www.w3.org/2000/svg";

  function svgEl(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    for (var key in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, key)) node.setAttribute(key, attrs[key]);
    }
    return node;
  }

  /* Bar with a rounded data-end only; the baseline stays square so the bar
     reads as anchored, per the mark spec. */
  function barPath(x, y, w, h, r, horizontal) {
    if (h <= 0 || w <= 0) return "";
    var rad = Math.min(r, horizontal ? Math.min(w, h / 2) : Math.min(h, w / 2));
    if (horizontal) {
      return "M" + x + "," + y + "H" + (x + w - rad) +
        "a" + rad + "," + rad + " 0 0 1 " + rad + "," + rad +
        "V" + (y + h - rad) +
        "a" + rad + "," + rad + " 0 0 1 " + (-rad) + "," + rad + "H" + x + "Z";
    }
    return "M" + x + "," + (y + h) + "V" + (y + rad) +
      "a" + rad + "," + rad + " 0 0 1 " + rad + "," + (-rad) +
      "H" + (x + w - rad) +
      "a" + rad + "," + rad + " 0 0 1 " + rad + "," + rad +
      "V" + (y + h) + "Z";
  }

  var tooltip = null;

  function showTip(html, evt) {
    if (!tooltip) tooltip = $("tooltip");
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    var pad = 12;
    var rect = tooltip.getBoundingClientRect();
    var x = evt.clientX + pad;
    var y = evt.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = evt.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = evt.clientY - rect.height - pad;
    tooltip.style.left = Math.max(8, x) + "px";
    tooltip.style.top = Math.max(8, y) + "px";
  }

  function hideTip() {
    if (!tooltip) tooltip = $("tooltip");
    tooltip.hidden = true;
  }

  function renderDailyChart(list) {
    var host = $("chart-daily");
    host.textContent = "";

    var counts = countsByDay(list);
    var days = [];
    var today = new Date();
    for (var i = 13; i >= 0; i--) {
      days.push(iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)));
    }

    var W = 300, H = 130;
    var m = { top: 10, right: 6, bottom: 22, left: 22 };
    var innerW = W - m.left - m.right;
    var innerH = H - m.top - m.bottom;
    var max = 4;
    days.forEach(function (k) { max = Math.max(max, counts[k] || 0); });

    var svg = svgEl("svg", {
      viewBox: "0 0 " + W + " " + H,
      role: "img",
      "aria-label": "Stories per day over the last fourteen days"
    });

    [0, Math.round(max / 2), max].forEach(function (t) {
      var y = m.top + innerH - (t / max) * innerH;
      svg.appendChild(svgEl("line", {
        x1: m.left, x2: W - m.right, y1: y, y2: y,
        "class": t === 0 ? "axis-line" : "grid-line"
      }));
      var label = svgEl("text", {
        x: m.left - 5, y: y + 3, "text-anchor": "end", "class": "axis-text"
      });
      label.textContent = t;
      svg.appendChild(label);
    });

    var band = innerW / days.length;
    var barW = Math.max(3, band - 4);

    days.forEach(function (key, idx) {
      var value = counts[key] || 0;
      var h = (value / max) * innerH;
      var x = m.left + idx * band + (band - barW) / 2;
      var y = m.top + innerH - h;
      var isSel = key === state.date && state.view === "day";

      if (h > 0) {
        svg.appendChild(svgEl("path", {
          d: barPath(x, y, barW, h, 3, false),
          fill: isSel ? "var(--ink)" : "var(--series)",
          "class": "bar", "data-idx": idx
        }));
      }

      var hit = svgEl("rect", {
        x: m.left + idx * band, y: m.top, width: band, height: innerH, "class": "bar-hit"
      });
      var label = parseISO(key).toLocaleDateString(undefined,
        { weekday: "short", day: "numeric", month: "short" });
      hit.addEventListener("mousemove", function (evt) {
        host.classList.add("is-hovered");
        Array.prototype.forEach.call(svg.querySelectorAll(".bar"), function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-idx") === String(idx));
        });
        showTip("<strong>" + value + "</strong> " + (value === 1 ? "story" : "stories") +
          "<br>" + label + (value ? "<br><span style=\"opacity:.7\">click to open</span>" : ""), evt);
      });
      hit.addEventListener("mouseleave", function () {
        host.classList.remove("is-hovered");
        hideTip();
      });
      hit.addEventListener("click", function () {
        if (!value) return;
        state.date = key;
        setView("day");
      });
      if (value) hit.style.cursor = "pointer";
      svg.appendChild(hit);

      if ((days.length - 1 - idx) % 4 === 0) {
        var t = svgEl("text", {
          x: m.left + idx * band + band / 2, y: H - 6,
          "text-anchor": "middle", "class": "axis-text"
        });
        t.textContent = parseISO(key).toLocaleDateString(undefined,
          { day: "numeric", month: "short" });
        svg.appendChild(t);
      }
    });

    host.appendChild(svg);
  }

  function renderThemeChart(list) {
    var host = $("chart-themes");
    host.textContent = "";

    var counts = {};
    list.forEach(function (a) {
      a.themes.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    });

    var rows = Object.keys(counts)
      .map(function (t) { return { id: t, count: counts[t] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 8);

    if (!rows.length) {
      host.appendChild(el("p", "chart-note", "No stories in this view."));
      return;
    }

    var W = 300;
    var rowH = 22;
    var H = rows.length * rowH + 6;
    // Wide enough for the longest theme name at the label size; anything
    // narrower silently clips the label off the left edge.
    var labelW = 150;
    var valueW = 22;
    var max = rows[0].count;
    var trackW = W - labelW - valueW - 6;

    var svg = svgEl("svg", {
      viewBox: "0 0 " + W + " " + H,
      role: "img",
      "aria-label": "Story count by theme in the current view"
    });

    rows.forEach(function (row, idx) {
      var y = idx * rowH + 4;
      var barH = 11;
      var w = Math.max(2, (row.count / max) * trackW);
      var colour = familyColour(themeFamily(row.id));

      var label = svgEl("text", {
        x: labelW - 8, y: y + barH - 1.5, "text-anchor": "end", "class": "bar-label"
      });
      label.textContent = themeLabel(row.id);
      svg.appendChild(label);

      svg.appendChild(svgEl("path", {
        d: barPath(labelW, y, w, barH, 3, true),
        fill: colour, "class": "bar", "data-idx": idx
      }));

      var value = svgEl("text", {
        x: labelW + w + 5, y: y + barH - 1.5, "class": "bar-value"
      });
      value.textContent = row.count;
      svg.appendChild(value);

      var hit = svgEl("rect", { x: 0, y: y - 3, width: W, height: rowH, "class": "bar-hit" });
      hit.style.cursor = "pointer";
      hit.addEventListener("mousemove", function (evt) {
        host.classList.add("is-hovered");
        Array.prototype.forEach.call(svg.querySelectorAll(".bar"), function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-idx") === String(idx));
        });
        showTip("<strong>" + row.count + "</strong> " +
          (row.count === 1 ? "story" : "stories") + "<br>" + themeLabel(row.id) +
          "<br><span style=\"opacity:.7\">click to filter</span>", evt);
      });
      hit.addEventListener("mouseleave", function () {
        host.classList.remove("is-hovered");
        hideTip();
      });
      hit.addEventListener("click", function () {
        if (state.themes.has(row.id)) state.themes.delete(row.id);
        else state.themes.add(row.id);
        afterFilterChange();
      });
      svg.appendChild(hit);
    });

    host.appendChild(svg);
  }

  function renderCharts() {
    var list = filtered();
    renderDailyChart(list);
    renderThemeChart(list);
  }

  function renderSources() {
    var listEl = $("source-list");
    listEl.textContent = "";
    var health = {};
    (state.data.health || []).forEach(function (h) { health[h.id] = h; });

    state.data.sources.forEach(function (source) {
      var row = el("div", "source-row");
      var dot = el("span", "status");
      var h = health[source.id];
      dot.setAttribute("data-ok", String(!h || h.ok));
      dot.title = (!h || h.ok) ? "Feed responding" : ("Feed failing: " + (h.error || "unknown"));
      row.appendChild(dot);

      var a = document.createElement("a");
      a.href = source.site;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = source.name;
      row.appendChild(a);

      var badge = el("span", "lean-badge", LEAN_LABEL[source.lean] || source.lean);
      badge.setAttribute("data-lean", source.lean);
      row.appendChild(badge);

      listEl.appendChild(row);
    });

    var ok = (state.data.health || []).filter(function (h) { return h.ok; }).length;
    $("source-count").textContent = ok + " of " + state.data.sources.length + " responding";
  }

  /* ------------------------------------------------------------------ boot */

  function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem("urban-pulse-theme"); } catch (e) { /* private mode */ }
    if (stored) document.documentElement.setAttribute("data-theme", stored);

    $("theme-toggle").addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme");
      if (!current) {
        var prefersDark = window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches;
        current = prefersDark ? "dark" : "light";
      }
      var next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("urban-pulse-theme", next); } catch (e) { /* ignore */ }
    });
  }

  function initChrome() {
    Array.prototype.forEach.call(document.querySelectorAll(".rail-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var kind = btn.getAttribute("data-panel");
        state.openPanel = state.openPanel === kind ? null : kind;
        Array.prototype.forEach.call(document.querySelectorAll(".rail-btn"), function (b) {
          b.setAttribute("aria-expanded",
            String(b.getAttribute("data-panel") === state.openPanel));
        });
        renderPanel();
      });
    });

    $("panel-close").addEventListener("click", function () {
      state.openPanel = null;
      Array.prototype.forEach.call(document.querySelectorAll(".rail-btn"), function (b) {
        b.setAttribute("aria-expanded", "false");
      });
      renderPanel();
    });

    $("clear-filters").addEventListener("click", function () {
      state.tier = "all";
      state.sources.clear();
      state.themes.clear();
      state.query = "";
      afterFilterChange();
    });

    $("view-day").addEventListener("click", function () { setView("day"); });
    $("view-calendar").addEventListener("click", function () { setView("calendar"); });
    $("view-focus").addEventListener("click", function () { setView("focus"); });

    $("focus-prev").addEventListener("click", function () { stepFocus(-1); });
    $("focus-next").addEventListener("click", function () { stepFocus(1); });

    document.addEventListener("keydown", function (evt) {
      if (evt.key === "Escape" && state.openPanel) {
        state.openPanel = null;
        Array.prototype.forEach.call(document.querySelectorAll(".rail-btn"), function (b) {
          b.setAttribute("aria-expanded", "false");
        });
        renderPanel();
        return;
      }
      // Do not hijack the arrows while someone is typing in the search box.
      var tag = evt.target && evt.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (state.view !== "focus") return;
      if (evt.key === "ArrowLeft") { evt.preventDefault(); stepFocus(-1); }
      else if (evt.key === "ArrowRight") { evt.preventDefault(); stepFocus(1); }
    });
  }

  function boot() {
    initTheme();
    $("daychip").textContent = String(new Date().getDate());

    fetch("data/news.json", { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        state.data = data;

        var when = new Date(data.generated);
        $("updated").textContent = when.toLocaleDateString(undefined,
          { day: "numeric", month: "short" }) + " · " +
          when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        var days = activeDays(data.articles);
        state.date = days[0] || iso(new Date());
        state.calMonth = parseISO(state.date);

        initChrome();
        renderSources();
        renderRailBadges();
        renderMain();
        renderCharts();
      })
      .catch(function (err) {
        $("updated").textContent = "unavailable";
        $("sheet-date").textContent = "Could not load";
        $("empty-state").hidden = false;
        $("empty-state").textContent =
          "Could not load data/news.json (" + err.message + "). If you opened this " +
          "file directly, run a local server instead: python3 -m http.server";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
