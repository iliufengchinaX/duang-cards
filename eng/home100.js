/* Theme word catalog: search, practice mode, week rail. No audio. */
(function () {
  var page = document.querySelector(".page");
  var practice = document.querySelector("[data-practice]");
  var search = document.querySelector("[data-search]");
  var searchCount = document.querySelector("[data-search-count]");
  var empty = document.querySelector("[data-empty]");
  var words = Array.prototype.slice.call(document.querySelectorAll(".word"));
  var units = Array.prototype.slice.call(document.querySelectorAll(".unit"));
  var railLinks = Array.prototype.slice.call(document.querySelectorAll(".rail a"));

  function setPractice(on) {
    if (!page || !practice) return;
    page.classList.toggle("is-practice", on);
    practice.setAttribute("aria-pressed", on ? "true" : "false");
    practice.textContent = on ? "显示中文" : "遮住中文";
    words.forEach(function (el) {
      var zh = el.querySelector(".zh");
      var ex = el.querySelector(".ex");
      if (zh) zh.classList.remove("shown");
      if (ex) ex.classList.remove("shown");
    });
  }

  if (practice) {
    practice.addEventListener("click", function () {
      setPractice(practice.getAttribute("aria-pressed") !== "true");
    });
  }

  document.addEventListener("click", function (ev) {
    if (!page || !page.classList.contains("is-practice")) return;
    var zh = ev.target.closest(".zh");
    if (!zh) return;
    var card = zh.closest(".word");
    zh.classList.toggle("shown");
    var ex = card && card.querySelector(".ex");
    if (ex) ex.classList.toggle("shown", zh.classList.contains("shown"));
  });

  function applySearch() {
    var q = search ? fold(search.value) : "";
    var shown = 0;
    words.forEach(function (el) {
      var hay = el.getAttribute("data-search") || "";
      var ok = !q || hay.indexOf(q) !== -1;
      el.hidden = !ok;
      if (ok) shown += 1;
    });
    units.forEach(function (unit) {
      var any = unit.querySelector(".word:not([hidden])");
      unit.classList.toggle("is-empty", !any);
    });
    if (searchCount) {
      searchCount.textContent = q ? ("找到 " + shown + " 个") : "";
    }
    if (empty) empty.classList.toggle("is-on", q && shown === 0);
  }

  function fold(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  if (search) {
    search.addEventListener("input", applySearch);
  }

  function setCurrent(id) {
    railLinks.forEach(function (a) {
      var on = a.getAttribute("href") === "#" + id;
      a.classList.toggle("is-current", on);
      if (on) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }

  if ("IntersectionObserver" in window && units.length) {
    var io = new IntersectionObserver(
      function (entries) {
        var vis = entries
          .filter(function (e) { return e.isIntersecting; })
          .sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });
        if (vis[0] && vis[0].target.id) setCurrent(vis[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.2, 0.5, 1] }
    );
    units.forEach(function (u) { io.observe(u); });
  }
  if (units[0]) setCurrent(units[0].id);
})();
