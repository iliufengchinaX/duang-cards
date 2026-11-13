(function () {
  var stage = document.getElementById("stage");
  var world = document.getElementById("world");
  var sheet = document.getElementById("sheet");
  var menuBtn = document.getElementById("menu");
  var nightBtn = document.getElementById("night");
  var note = document.getElementById("note");
  var turn = document.getElementById("turn");
  var layers = document.querySelectorAll(".parallax");
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var wechat = /MicroMessenger/i.test(navigator.userAgent);
  var armed = "";
  var busy = false;
  var nightLoaded = false;

  var NOTES = {
    math: "<h2 id=\"note-title\">数学</h2><p>准备中</p>",
    works: "<h2 id=\"note-title\">作品</h2><p>准备中</p>",
    album: "<h2 id=\"note-title\">家庭相册</h2><p>家庭相册需要密码</p><p><a href=\"#nas\">家庭相册</a></p><p class=\"hint\">NAS 链接尚未接入</p>",
    nas: "<h2 id=\"note-title\">家庭相册</h2><p>家庭相册需要密码</p><p><a href=\"#nas\">家庭相册</a></p><p class=\"hint\">NAS 链接尚未接入</p>",
    about: "<h2 id=\"note-title\">关于</h2><p>Duang 的听读目录。点城堡上的角楼，打开对应的一课。</p><p class=\"credit\">拼音音频来自密歇根州立大学 Tone Perfect 普通话声调数据库（Catherine Ryu 及其团队、MSU 图书馆）。<br>Catherine Ryu, Mandarin Tone Perception &amp; Production Team, and Michigan State University Libraries. Tone Perfect: Multimodal Database for Mandarin Chinese. <a href=\"https://tone.lib.msu.edu/\" target=\"_blank\" rel=\"noopener\">https://tone.lib.msu.edu/</a></p>"
  };

  function plainMotion() {
    return reduce.matches || wechat;
  }

  function loadNight() {
    if (nightLoaded) return;
    nightLoaded = true;
    var nodes = document.querySelectorAll("[data-night]");
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].getAttribute("src")) nodes[i].src = nodes[i].getAttribute("data-night");
    }
  }

  function hourNight() {
    var h = new Date().getHours();
    return h >= 19 || h < 6;
  }

  function applyNight(on) {
    document.body.classList.toggle("night", on);
    nightBtn.setAttribute("aria-pressed", on ? "true" : "false");
    var theme = document.querySelector("meta[name=theme-color]");
    if (theme) theme.setAttribute("content", on ? "#2f435c" : "#f4e9db");
    if (on) loadNight();
  }

  var stored = null;
  try { stored = sessionStorage.getItem("duang-night"); } catch (e) {}
  applyNight(stored === "1" ? true : stored === "0" ? false : hourNight());

  nightBtn.addEventListener("click", function () {
    var on = !document.body.classList.contains("night");
    try { sessionStorage.setItem("duang-night", on ? "1" : "0"); } catch (e) {}
    applyNight(on);
  });

  function openMenu() {
    sheet.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
    var first = sheet.querySelector("a");
    if (first) first.focus();
  }
  function closeMenu() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
  }
  menuBtn.addEventListener("click", function () {
    if (sheet.hidden) openMenu();
    else closeMenu();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeMenu();
      if (!note.hidden) hideNote();
    }
  });
  document.addEventListener("click", function (e) {
    if (sheet.hidden) return;
    if (sheet.contains(e.target) || menuBtn.contains(e.target)) return;
    closeMenu();
  });

  function arm(id) {
    armed = id;
    stage.setAttribute("data-hot", id);
  }
  function disarm() {
    armed = "";
    stage.removeAttribute("data-hot");
  }

  var hots = document.querySelectorAll(".hot");
  for (var i = 0; i < hots.length; i++) {
    (function (a) {
      var id = a.getAttribute("data-id");
      a.addEventListener("pointerenter", function (e) {
        if (!fine.matches || e.pointerType === "touch" || busy) return;
        arm(id);
      });
      a.addEventListener("pointerleave", function () {
        if (!fine.matches || busy) return;
        disarm();
      });
      a.addEventListener("focus", function () { if (!busy) arm(id); });
      a.addEventListener("click", function (e) {
        if (!fine.matches && e.detail !== 0 && armed !== id) {
          e.preventDefault();
          arm(id);
          return;
        }
        e.preventDefault();
        enter(a);
      });
    })(hots[i]);
  }

  function enter(a) {
    if (busy) return;
    busy = true;
    arm(a.getAttribute("data-id"));
    var href = a.getAttribute("href");
    var go = function () {
      if (href.charAt(0) !== "#") {
        location.href = href;
        return;
      }
      stage.classList.remove("zooming", "fadeout");
      turn.hidden = true;
      world.style.transformOrigin = "";
      busy = false;
      if (location.hash !== href) location.hash = href;
      else showNote(href.slice(1));
    };
    if (plainMotion()) {
      stage.classList.add("fadeout");
      window.setTimeout(go, 280);
      return;
    }
    var frame = stage.getBoundingClientRect();
    var box = a.getBoundingClientRect();
    var ox = ((box.left + box.width / 2 - frame.left) / frame.width) * 100;
    var oy = ((box.top + box.height * 0.42 - frame.top) / frame.height) * 100;
    world.style.transformOrigin = ox + "% " + oy + "%";
    stage.classList.add("zooming");
    window.setTimeout(function () {
      turn.hidden = false;
      var leaf = turn.querySelector(".leaf");
      if (leaf) {
        leaf.style.animation = "none";
        void leaf.offsetWidth;
        leaf.style.animation = "";
      }
      window.setTimeout(go, 700);
    }, 600);
  }

  sheet.addEventListener("click", function (e) {
    var a = e.target.closest("a");
    if (!a || a.getAttribute("href").indexOf("tone.lib") !== -1) return;
    closeMenu();
    var href = a.getAttribute("href");
    if (href.charAt(0) === "#") {
      e.preventDefault();
      if (location.hash !== href) location.hash = href;
      else showNote(href.slice(1));
      return;
    }
    if (plainMotion()) return;
    e.preventDefault();
    stage.classList.add("fadeout");
    window.setTimeout(function () { location.href = href; }, 240);
  });

  function showNote(id) {
    var html = NOTES[id];
    if (!html) { hideNote(); return; }
    note.className = "note" + (id === "about" ? " about" : "");
    note.innerHTML = html + "<button class=\"close\" type=\"button\">关闭</button>";
    note.hidden = false;
    var close = note.querySelector(".close");
    close.addEventListener("click", function () {
      if (location.hash) history.pushState("", document.title, location.pathname + location.search);
      hideNote();
    });
  }
  function hideNote() { note.hidden = true; note.innerHTML = ""; }
  function fromHash() {
    var id = (location.hash || "").replace("#", "");
    if (NOTES[id]) showNote(id);
    else hideNote();
  }
  window.addEventListener("hashchange", fromHash);
  fromHash();

  if (!plainMotion()) {
    var nx = 0, ny = 0;
    function paint() {
      for (var i = 0; i < layers.length; i++) {
        var d = parseFloat(layers[i].getAttribute("data-depth")) || 0;
        layers[i].style.transform = "translate3d(" + (nx * d).toFixed(2) + "px," + (ny * d).toFixed(2) + "px,0)";
      }
    }
    stage.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch" || busy) return;
      var r = stage.getBoundingClientRect();
      nx = (e.clientX - r.left) / r.width - 0.5;
      ny = (e.clientY - r.top) / r.height - 0.5;
      paint();
    });
    stage.addEventListener("pointerleave", function (e) {
      if (e.pointerType === "touch") return;
      nx = 0; ny = 0; paint();
    });
    stage.addEventListener("pointerdown", function () {
      var E = window.DeviceOrientationEvent;
      if (E && typeof E.requestPermission === "function") {
        E.requestPermission().catch(function () {});
      }
    }, { once: true });
    window.addEventListener("deviceorientation", function (e) {
      if (busy || e.gamma == null) return;
      nx = Math.max(-1, Math.min(1, e.gamma / 28));
      ny = Math.max(-1, Math.min(1, ((e.beta || 0) - 40) / 32));
      paint();
    });
  }
})();
