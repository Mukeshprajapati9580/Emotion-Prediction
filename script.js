(() => {
  // Same-origin when served by FastAPI; falls back to local server if opened as a file.
  const API = location.protocol === "file:" ? "http://127.0.0.1:8000/predict" : "";

  const EMOTIONS = {
    sadness:  { emoji: "😪", color: "#5b7db1" },
    joy:      { emoji: "😄", color: "#d9930d" },
    love:     { emoji: "❤️", color: "#d6457a" },
    anger:    { emoji: "😖", color: "#d1432f" },
    fear:     { emoji: "😨", color: "#7a5cb0" },
    surprise: { emoji: "😯", color: "#37c5b4" },
  };

  const $ = (id) => document.getElementById(id);
  const text = $("text"), go = $("go"), result = $("result"), done = result.querySelector(".done");
  let lastText = "";

  const setState = (s) => (result.dataset.state = s);
  const pct = (n) => (n * 100).toFixed(1) + "%";

  function setAccent(color) {
    const root = document.documentElement.style;
    root.setProperty("--accent", color);
    root.setProperty("--accent-soft", color + "22");
  }

  async function checkHealth() {
    const el = $("status"), msg = el.querySelector("b");
    try {
      const r = await fetch(API + "/health");
      const d = await r.json();
      el.className = "status " + (d.model_loaded ? "ok" : "bad");
      msg.textContent = d.model_loaded ? "Model ready" : "Model not loaded";
    } catch {
      el.className = "status bad";
      msg.textContent = "Server unreachable";
    }
  }

  function render(data) {
    const info = EMOTIONS[data.predicted_emotion] || { emoji: "🙂", color: "#4a5d85" };
    setAccent(info.color);
    $("emoji").textContent = info.emoji;
    $("label").textContent = data.predicted_emotion;
    $("conf").textContent = pct(data.confidence);
    $("quote").textContent = "“" + data.text + "”";

    // Backend key is spelled "all_probabilites"
    const probs = data.all_probabilites || {};
    const bars = $("bars");
    bars.innerHTML = "";
    Object.entries(probs).sort((a, b) => b[1] - a[1]).forEach(([name, p], i) => {
      const li = document.createElement("li");
      if (i === 0) li.className = "top";
      const n = document.createElement("span"); n.className = "name";
      n.textContent = (EMOTIONS[name]?.emoji || "") + " " + name;
      const track = document.createElement("span"); track.className = "track";
      const fill = document.createElement("span"); fill.className = "fill";
      fill.style.background = EMOTIONS[name]?.color || "#888";
      track.appendChild(fill);
      const v = document.createElement("span"); v.className = "pct"; v.textContent = pct(p);
      li.append(n, track, v);
      bars.appendChild(li);
      requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = p * 100 + "%")));
    });

    setState("done");
    done.classList.remove("pop"); void done.offsetWidth; done.classList.add("pop");
  }

  async function analyze() {
    const value = text.value.trim();
    if (!value) { text.focus(); return; }
    lastText = value;
    go.disabled = true;
    setState("loading");
    try {
      const res = await fetch(API + "/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        let detail = data.detail;
        if (Array.isArray(detail)) detail = detail.map((d) => d.msg).join(", ");
        throw new Error(detail || "Server returned " + res.status);
      }
      render(data);
    } catch (e) {
      $("errMsg").textContent = e instanceof TypeError
        ? "Can't reach the server. Check that uvicorn is running on port 8000."
        : e.message;
      setState("error");
    } finally {
      go.disabled = false;
    }
  }

  text.addEventListener("input", () => ($("count").textContent = text.value.length));
  text.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") analyze(); });
  go.addEventListener("click", analyze);
  $("retry").addEventListener("click", () => { text.value = lastText; analyze(); });
  $("clear").addEventListener("click", () => {
    text.value = ""; $("count").textContent = 0; setState("empty"); setAccent("#4a5d85"); text.focus();
  });
  document.querySelectorAll(".chip").forEach((c) =>
    c.addEventListener("click", () => {
      text.value = c.textContent; $("count").textContent = text.value.length; analyze();
    })
  );

  checkHealth();
})();
