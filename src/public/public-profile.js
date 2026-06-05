/* Public profile (Shell B) — remote-interaction dialog + copy handle.
 * Intercepts action clicks for logged-out visitors and routes them to a
 * "follow @handle from your home instance" dialog (WebFinger-style flow).
 */
(function () {
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (m) {
      return (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
          m
        ] || m
      );
    });
  }

  function init() {
    var back = document.getElementById("riBack");
    if (back == null) return;
    var msg = document.getElementById("riMsg");
    var input = document.getElementById("riInput");
    var go = document.getElementById("riGo");
    var close = document.getElementById("riClose");
    var handle = back.getAttribute("data-handle") || "@eeruwang";
    var handleAm = '<span style="color:var(--am)">' + escapeHtml(handle) + "</span>";

    function open(text) {
      if (text) msg.innerHTML = text;
      back.classList.add("open");
      if (input) input.focus();
    }
    function closeRI() {
      back.classList.remove("open");
    }

    close.addEventListener("click", closeRI);
    back.addEventListener("click", function (e) {
      if (e.target === back) closeRI();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeRI();
    });

    function defaultMsg() {
      return (
        "To follow " +
        handleAm +
        ", enter your fediverse handle — you'll confirm on your home server."
      );
    }
    function actionMsg() {
      return (
        "To reply, boost, favourite, or react, follow " +
        handleAm +
        " from your own fediverse account."
      );
    }
    if (go) {
      go.addEventListener("click", function () {
        var v = (input && input.value.trim()) || "";
        if (!v) {
          open(defaultMsg());
          return;
        }
        // Strip leading @ then redirect to WebFinger
        var dest = v.replace(/^@/, "");
        var parts = dest.split("@");
        if (parts.length !== 2 || !parts[1]) {
          open(defaultMsg());
          return;
        }
        var host = parts[1];
        // Try Mastodon-style authorize_interaction first; fall back to
        // a generic redirect — both pages exist on most fediverse
        // implementations.
        var target =
          "https://" +
          host +
          "/authorize_interaction?uri=" +
          encodeURIComponent(window.location.origin + window.location.pathname);
        window.location.href = target;
      });
    }

    var followBtn = document.getElementById("followBtn");
    if (followBtn) {
      followBtn.addEventListener("click", function () {
        open(defaultMsg());
      });
    }
    var moreBtn = document.getElementById("moreBtn");
    if (moreBtn) {
      moreBtn.addEventListener("click", function () {
        open(
          "Options for " +
            handleAm +
            " live on your home instance once you follow.",
        );
      });
    }
    var remoteFollow = document.getElementById("remoteFollow");
    if (remoteFollow) {
      remoteFollow.addEventListener("click", function () {
        var v = document.getElementById("remoteInput").value.trim();
        if (input) input.value = v;
        if (go) go.click();
      });
    }

    var copyBtn = document.getElementById("copyHandle");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var h = copyBtn.getAttribute("data-handle") || handle;
        if (navigator.clipboard) navigator.clipboard.writeText(h);
        var old = copyBtn.textContent;
        copyBtn.textContent = "✓ copied";
        copyBtn.style.color = "var(--ac)";
        setTimeout(function () {
          copyBtn.textContent = old;
          copyBtn.style.color = "";
        }, 1400);
      });
    }

    // Intercept action clicks on entries — any reply/boost/fav/reaction
    // becomes a remote-interaction prompt for the visitor.
    document.addEventListener("click", function (e) {
      var act = e.target.closest(".acts .a, .rxn-mini .chip");
      if (act) {
        e.preventDefault();
        e.stopPropagation();
        open(actionMsg());
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
