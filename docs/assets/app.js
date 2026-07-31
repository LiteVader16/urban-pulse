/* Urban Pulse — front end.
   No framework, no build step: the whole site is three files and a JSON
   payload, so it cannot rot between deploys. */

(function () {
  "use strict";

  var PAGE_SIZE = 24;

  var TIERS = [
    { id: "all", label: "All" },
    { id: "ahmedabad", label: "Ahmedabad" },
    { id: "bengaluru", label: "Bengaluru" },
    { id: "national", label: "India" },
    { id: "international", label: "World" }
  ];

  var LEANS = [
    { id: "left", label: "Left" },
    { id: "centre", label: "Centre" },
    { id: "right", label: "Right" },
    { id: "specialist", label: "Specialist" }
  ];

  // Which lean values roll up into each filter button.
  var LEAN_GROUPS = {
    left: ["left", "centre-left"],
    centre: ["centre"],
    right: ["right", "centre-right"],
    specialist: ["specialist"]
  };

  var FAMILY_COLOUR = {
    shelter: "var(--fam-shelter)",
    movement: "var(--fam-movement)",
    environment: "var(--fam-environment)",
    society: "var(--fam-society)",
    design: "var(--fam-design)",
    tech: "var(--fam-tech)"
  };

  var state = {
    data: null,
    tier: "all",
    families: new Set(),
    themes: new Set(),
    leans: new Set(),
    query: "",
    sort: "newest",
    shown: PAGE_SIZE
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ----------------------------------------------------------- utilities */

  function timeAgo(iso) {
    var then = new Date(iso).getTime();
    if (isNaN(then)) return "";
    var mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    var days = Math.round(hrs / 24);
    if (days < 7) return days + "d ago";
    return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function themeLabel(id) {
    var t = state.data.themes[id];
    return t ? t.label : id;
  }

  function themeFamily(id) {
    var t = state.data.themes[id];
    return t ? t.family : null;
  }

  function familyColour(id) {
    return FAMILY_COLOUR[id] || "var(--ink-muted)";
  }

  /* ------------------------------------------------------------ filtering */

  function matchesExceptTier(a) {
    if (state.families.size) {
      var famOk = a.themes.some(function (t) {
        return state.families.has(themeFamily(t));
      });
      if (!famOk) return false;
    }
    if (state.themes.size) {
      var themeOk = a.themes.some(function (t) { return state.themes.has(t); });
      if (!themeOk) return false;
    }
    if (state.leans.size) {
      var leanOk = false;
      state.leans.forEach(function (group) {
        if ((LEAN_GROUPS[group] || []).indexOf(a.lean) !== -1) leanOk = true;
      });
      if (!leanOk) return false;
    }
    if (state.query) {
      var hay = (a.title + " " + a.summary + " " + a.sourceName + " " +
        a.themes.map(themeLabel).join(" ")).toLowerCase();
      if (hay.indexOf(state.query) === -1) return false;
    }
    return true;
  }

  function currentArticles() {
    return state.data.articles.filter(function (a) {
      if (state.tier !== "all" && a.tier !== state.tier) return false;
      return matchesExceptTier(a);
    });
  }

  function sortArticles(list) {
    var sorted = list.slice();
    if (state.sort === "relevance") {
      sorted.sort(function (a, b) {
        return (b.score - a.score) || (b.published < a.published ? -1 : 1);
      });
    } else if (state.sort === "source") {
      sorted.sort(function (a, b) {
        return a.sourceName.localeCompare(b.sourceName) ||
          (a.published < b.published ? 1 : -1);
      });
    } else {
      sorted.sort(function (a, b) { return a.published < b.published ? 1 : -1; });
    }
    return sorted;
  }

  /* --------------------------------------------------------------- chrome */

  function renderTiers() {
    var nav = $("tier-nav");
    nav.textContent = "";
    var pool = state.data.articles.filter(matchesExceptTier);

    TIERS.forEach(function (tier) {
      var count = tier.id === "all"
        ? pool.length
        : pool.filter(function (a) { return a.tier === tier.id; }).length;

      var btn = el("button", "tier-btn");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(state.tier === tier.id));
      btn.appendChild(document.createTextNode(tier.label));
      btn.appendChild(el("span", "tier-count", String(count)));
      btn.addEventListener("click", function () {
        state.tier = tier.id;
        state.shown = PAGE_SIZE;
        render();
      });
      nav.appendChild(btn);
    });
  }

  function renderLeanFilter() {
    var wrap = $("lean-filter");
    wrap.textContent = "";
    LEANS.forEach(function (lean) {
      var btn = el("button", "lean-btn", lean.label);
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(state.leans.has(lean.id)));
      btn.addEventListener("click", function () {
        if (state.leans.has(lean.id)) state.leans.delete(lean.id);
        else state.leans.add(lean.id);
        state.shown = PAGE_SIZE;
        render();
      });
      wrap.appendChild(btn);
    });
  }

  function renderChips() {
    var famWrap = $("family-chips");
    famWrap.textContent = "";

    var families = Object.keys(state.data.families).sort(function (a, b) {
      return state.data.families[a].order - state.data.families[b].order;
    });

    families.forEach(function (fam) {
      var chip = el("button", "chip");
      chip.type = "button";
      chip.style.setProperty("--chip-colour", familyColour(fam));
      chip.setAttribute("aria-pressed", String(state.families.has(fam)));
      chip.appendChild(el("span", "dot"));
      chip.appendChild(document.createTextNode(state.data.families[fam].label));
      chip.addEventListener("click", function () {
        if (state.families.has(fam)) {
          state.families.delete(fam);
          // Drop any theme filters that belonged to the family just removed.
          Array.from(state.themes).forEach(function (t) {
            if (themeFamily(t) === fam) state.themes.delete(t);
          });
        } else {
          state.families.add(fam);
        }
        state.shown = PAGE_SIZE;
        render();
      });
      famWrap.appendChild(chip);
    });

    // Themes appear only once a family is chosen — seventeen chips at rest
    // would be a wall rather than a filter.
    var themeWrap = $("theme-chips");
    themeWrap.textContent = "";
    if (!state.families.size) return;

    Object.keys(state.data.themes)
      .filter(function (t) { return state.families.has(themeFamily(t)); })
      .forEach(function (t) {
        var chip = el("button", "chip");
        chip.type = "button";
        chip.style.setProperty("--chip-colour", familyColour(themeFamily(t)));
        chip.setAttribute("aria-pressed", String(state.themes.has(t)));
        chip.appendChild(el("span", "dot"));
        chip.appendChild(document.createTextNode(themeLabel(t)));
        chip.addEventListener("click", function () {
          if (state.themes.has(t)) state.themes.delete(t);
          else state.themes.add(t);
          state.shown = PAGE_SIZE;
          render();
        });
        themeWrap.appendChild(chip);
      });
  }

  /* --------------------------------------------------------------- charts */

  var SVG_NS = "http://www.w3.org/2000/svg";

  function svgEl(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    for (var key in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, key)) {
        node.setAttribute(key, attrs[key]);
      }
    }
    return node;
  }

  /* Bar with rounded data-end only: the baseline stays square so the bar
     reads as anchored, per the mark spec. */
  function barPath(x, y, w, h, r, horizontal) {
    if (h <= 0 || w <= 0) return "";
    var rad = Math.min(r, horizontal ? Math.min(w, h / 2) : Math.min(h, w / 2));
    if (horizontal) {
      return "M" + x + "," + y +
        "H" + (x + w - rad) +
        "a" + rad + "," + rad + " 0 0 1 " + rad + "," + rad +
        "V" + (y + h - rad) +
        "a" + rad + "," + rad + " 0 0 1 " + (-rad) + "," + rad +
        "H" + x + "Z";
    }
    return "M" + x + "," + (y + h) +
      "V" + (y + rad) +
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

  function renderDailyChart(articles) {
    var host = $("chart-daily");
    host.textContent = "";

    // Recount from the filtered set so the chart always describes what the
    // reader is actually looking at, not the whole archive.
    var counts = {};
    var days = [];
    var today = new Date();
    for (var i = 13; i >= 0; i--) {
      var d = new Date(today.getTime() - i * 86400000);
      var key = d.toISOString().slice(0, 10);
      days.push(key);
      counts[key] = 0;
    }
    articles.forEach(function (a) {
      var key = a.published.slice(0, 10);
      if (key in counts) counts[key] += 1;
    });

    var W = 520, H = 180;
    var m = { top: 12, right: 8, bottom: 26, left: 26 };
    var innerW = W - m.left - m.right;
    var innerH = H - m.top - m.bottom;
    var max = Math.max.apply(null, days.map(function (k) { return counts[k]; }));
    if (max < 4) max = 4;

    var svg = svgEl("svg", {
      viewBox: "0 0 " + W + " " + H,
      role: "img",
      "aria-label": "Stories published per day over the last fourteen days"
    });

    // Recessive gridlines with tick labels at a readable interval.
    var ticks = [0, Math.round(max / 2), max];
    ticks.forEach(function (t) {
      var y = m.top + innerH - (t / max) * innerH;
      svg.appendChild(svgEl("line", {
        x1: m.left, x2: W - m.right, y1: y, y2: y,
        class: t === 0 ? "axis-line" : "grid-line"
      }));
      var label = svgEl("text", { x: m.left - 6, y: y + 3.5, "text-anchor": "end", class: "axis-text" });
      label.textContent = t;
      svg.appendChild(label);
    });

    var band = innerW / days.length;
    var barW = Math.max(3, band - 4);   // 4px band gap keeps a 2px surface gap either side

    days.forEach(function (key, idx) {
      var value = counts[key];
      var h = (value / max) * innerH;
      var x = m.left + idx * band + (band - barW) / 2;
      var y = m.top + innerH - h;

      if (h > 0) {
        svg.appendChild(svgEl("path", {
          d: barPath(x, y, barW, h, 4, false),
          fill: "var(--series)",
          class: "bar",
          "data-idx": idx
        }));
      }

      // Hit target spans the full band and full height, so hovering never
      // requires the reader to find a three-pixel bar.
      var hit = svgEl("rect", {
        x: m.left + idx * band, y: m.top,
        width: band, height: innerH,
        class: "bar-hit"
      });
      var dateLabel = new Date(key + "T00:00:00Z").toLocaleDateString(undefined, {
        weekday: "short", day: "numeric", month: "short", timeZone: "UTC"
      });
      hit.addEventListener("mousemove", function (evt) {
        host.classList.add("is-hovered");
        Array.prototype.forEach.call(svg.querySelectorAll(".bar"), function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-idx") === String(idx));
        });
        showTip("<strong>" + value + "</strong> " +
          (value === 1 ? "story" : "stories") + "<br>" + dateLabel, evt);
      });
      hit.addEventListener("mouseleave", function () {
        host.classList.remove("is-hovered");
        hideTip();
      });
      svg.appendChild(hit);

      // Label every third day counting back from the most recent, so the
      // series always ends on a labelled tick and the last two never collide.
      if ((days.length - 1 - idx) % 3 === 0) {
        var t = svgEl("text", {
          x: m.left + idx * band + band / 2,
          y: H - 8, "text-anchor": "middle", class: "axis-text"
        });
        t.textContent = new Date(key + "T00:00:00Z").toLocaleDateString(undefined, {
          day: "numeric", month: "short", timeZone: "UTC"
        });
        svg.appendChild(t);
      }
    });

    host.appendChild(svg);
  }

  function renderThemeChart(articles) {
    var host = $("chart-themes");
    host.textContent = "";

    var counts = {};
    articles.forEach(function (a) {
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

    var W = 520;
    var rowH = 26;
    var H = rows.length * rowH + 10;
    // Wide enough for the longest theme name ("Urban Ecology & Biodiversity")
    // at the label type size — the labels are right-aligned into this gutter,
    // so anything narrower silently clips them off the left edge.
    var labelW = 182;
    var valueW = 34;
    var max = rows[0].count;
    var trackW = W - labelW - valueW - 8;

    var svg = svgEl("svg", {
      viewBox: "0 0 " + W + " " + H,
      role: "img",
      "aria-label": "Story count by theme in the current view"
    });

    rows.forEach(function (row, idx) {
      var y = idx * rowH + 5;
      var barH = 12;
      var w = Math.max(2, (row.count / max) * trackW);
      var colour = familyColour(themeFamily(row.id));

      var label = svgEl("text", {
        x: labelW - 10, y: y + barH - 1.5,
        "text-anchor": "end", class: "bar-label"
      });
      label.textContent = themeLabel(row.id);
      svg.appendChild(label);

      svg.appendChild(svgEl("path", {
        d: barPath(labelW, y, w, barH, 4, true),
        fill: colour, class: "bar", "data-idx": idx
      }));

      var value = svgEl("text", {
        x: labelW + w + 7, y: y + barH - 1.5, class: "bar-value"
      });
      value.textContent = row.count;
      svg.appendChild(value);

      var hit = svgEl("rect", {
        x: 0, y: y - 4, width: W, height: rowH, class: "bar-hit"
      });
      hit.addEventListener("mousemove", function (evt) {
        host.classList.add("is-hovered");
        Array.prototype.forEach.call(svg.querySelectorAll(".bar"), function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-idx") === String(idx));
        });
        showTip("<strong>" + row.count + "</strong> " +
          (row.count === 1 ? "story" : "stories") + "<br>" + themeLabel(row.id) +
          "<br><span style=\"opacity:.7\">" +
          state.data.families[themeFamily(row.id)].label + "</span>", evt);
      });
      hit.addEventListener("mouseleave", function () {
        host.classList.remove("is-hovered");
        hideTip();
      });
      svg.appendChild(hit);
    });

    host.appendChild(svg);
  }

  /* -------------------------------------------------------------- stories */

  function buildCard(article, isLead) {
    var card = el("article", "card" + (isLead ? " is-lead" : ""));

    var media = el("div", "card-media");
    var family = themeFamily(article.themes[0]) || "society";
    if (article.image) {
      var img = document.createElement("img");
      img.src = article.image;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      // Plenty of publishers block hotlinking; fall back rather than show a
      // broken frame.
      img.addEventListener("error", function () {
        media.textContent = "";
        media.appendChild(buildPlate(article, family));
      });
      media.appendChild(img);
    } else {
      media.appendChild(buildPlate(article, family));
    }
    card.appendChild(media);

    var body = el("div", "card-body");

    var kicker = el("div", "card-kicker");
    kicker.appendChild(el("span", "source-name", article.sourceName));
    var badge = el("span", "lean-badge", leanLabel(article.lean));
    badge.setAttribute("data-lean", article.lean);
    kicker.appendChild(badge);
    kicker.appendChild(el("span", "", timeAgo(article.published)));
    body.appendChild(kicker);

    var h = el("h3", "card-title");
    var link = document.createElement("a");
    link.href = article.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = article.title;
    h.appendChild(link);
    body.appendChild(h);

    if (article.summary) {
      body.appendChild(el("p", "card-summary", article.summary));
    }

    var foot = el("div", "card-foot");
    article.themes.forEach(function (t) {
      var tag = el("span", "theme-tag", themeLabel(t));
      tag.style.setProperty("--tag-colour", familyColour(themeFamily(t)));
      foot.appendChild(tag);
    });
    body.appendChild(foot);

    card.appendChild(body);
    return card;
  }

  function buildPlate(article, family) {
    var plate = el("div", "card-plate");
    plate.style.setProperty("--plate-colour", familyColour(family));
    plate.appendChild(el("span", "", article.sourceName));
    return plate;
  }

  function leanLabel(lean) {
    if (lean === "centre-left") return "Centre-left";
    if (lean === "centre-right") return "Centre-right";
    if (lean === "specialist") return "Specialist";
    return lean.charAt(0).toUpperCase() + lean.slice(1);
  }

  function renderStories(articles) {
    var grid = $("story-grid");
    grid.textContent = "";

    var slice = articles.slice(0, state.shown);
    slice.forEach(function (article, idx) {
      // Only lead the newest-sorted, unfiltered-ish view; a lead card in a
      // "by newsroom" sort would imply an editorial ranking that isn't there.
      var isLead = idx === 0 && state.sort === "newest" && articles.length > 3;
      grid.appendChild(buildCard(article, isLead));
    });

    $("empty-state").hidden = articles.length > 0;
    grid.hidden = articles.length === 0;

    var more = $("load-more");
    more.hidden = articles.length <= state.shown;

    var count = articles.length;
    $("result-count").textContent = count === 0
      ? "No stories"
      : count + (count === 1 ? " story" : " stories") +
        (state.shown < count ? " · showing " + state.shown : "");
  }

  function renderSources() {
    var list = $("source-list");
    list.textContent = "";
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

      var badge = el("span", "lean-badge", leanLabel(source.lean));
      badge.setAttribute("data-lean", source.lean);
      row.appendChild(badge);

      list.appendChild(row);
    });

    var ok = (state.data.health || []).filter(function (h) { return h.ok; }).length;
    $("source-count").textContent = state.data.sources.length + " newsrooms · " +
      ok + " responding";
  }

  /* ---------------------------------------------------------------- render */

  function render() {
    var articles = sortArticles(currentArticles());
    renderTiers();
    renderChips();
    renderLeanFilter();
    renderDailyChart(articles);
    renderThemeChart(articles);
    renderStories(articles);

    var scope = TIERS.filter(function (t) { return t.id === state.tier; })[0];
    $("pulse-sub").textContent = state.tier === "all"
      ? "Across every newsroom in the list"
      : "Filtered to " + scope.label;
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

  function initControls() {
    var search = $("search");
    var debounce;
    search.addEventListener("input", function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        state.query = search.value.trim().toLowerCase();
        state.shown = PAGE_SIZE;
        render();
      }, 160);
    });

    $("sort").addEventListener("change", function (evt) {
      state.sort = evt.target.value;
      render();
    });

    $("load-more").addEventListener("click", function () {
      state.shown += PAGE_SIZE;
      render();
    });
  }

  function boot() {
    initTheme();
    fetch("data/news.json", { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        state.data = data;
        var when = new Date(data.generated);
        $("updated").textContent = "Updated " + timeAgo(data.generated) +
          " · " + when.toLocaleString(undefined, {
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
          });
        initControls();
        renderSources();
        render();
      })
      .catch(function (err) {
        $("updated").textContent = "Could not load stories";
        var grid = $("story-grid");
        grid.textContent = "";
        var msg = el("p", "empty-state",
          "Could not load data/news.json (" + err.message + "). " +
          "If you opened this file directly, run a local server instead: python3 -m http.server");
        msg.hidden = false;
        grid.parentNode.insertBefore(msg, grid);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
