const EMO = {
  sadness:  { emoji: "😪", color: "#5b8def" },
  joy:      { emoji: "😄", color: "#f5b941" },
  love:     { emoji: "❤️", color: "#f0648c" },
  anger:    { emoji: "😖", color: "#e8573f" },
  fear:     { emoji: "😨", color: "#8b6ce0" },
  surprise: { emoji: "😯", color: "#36c5b0" },
};
const EXAMPLES = [
  ["I finally got the job and I can't stop smiling", "joy"],
  ["I miss the way things used to be", "sadness"],
  ["Why would you lie to me again?", "anger"],
  ["Something is moving in the dark downstairs", "fear"],
  ["I never expected you to show up today!", "surprise"],
  ["You make every ordinary day feel special", "love"],
];
const PLACEHOLDERS = ["I feel so happy and excited…", "I'm not sure what's going to happen next…", "That message really hurt me…"];

const $ = (id) => document.getElementById(id);
const form = $("form"), text = $("text"), go = $("go"), result = $("result");
const orbs = [...document.querySelectorAll(".orb")];
let history = [];
try { history = JSON.parse(localStorage.getItem("emotion-history") || "[]"); } catch (_) {}

/* ---------- backdrop: orb brightness follows probabilities ---------- */
function setField(probs) {
  orbs.forEach((o) => o.style.setProperty("--w", probs ? probs[o.dataset.e] || 0 : 0));
}

/* ---------- spotlight on panels ---------- */
document.querySelectorAll(".spot").forEach((el) =>
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", e.clientX - r.left + "px");
    el.style.setProperty("--my", e.clientY - r.top + "px");
  })
);

/* ---------- input ---------- */
function syncInput() {
  $("count").textContent = `${text.value.length} / 2000`;
  go.disabled = !text.value.trim();
}
text.addEventListener("input", syncInput);
text.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") form.requestSubmit();
});

// typewriter placeholder, stops once the user interacts
let phTimer, phStop = false;
(function type(i = 0, n = 0, del = false) {
  if (phStop) return;
  const s = PLACEHOLDERS[i];
  text.placeholder = s.slice(0, n) + (n % 2 ? "" : "");
  if (!del && n < s.length) phTimer = setTimeout(() => type(i, n + 1, false), 55);
  else if (!del) phTimer = setTimeout(() => type(i, n, true), 1700);
  else if (n > 0) phTimer = setTimeout(() => type(i, n - 1, true), 22);
  else phTimer = setTimeout(() => type((i + 1) % PLACEHOLDERS.length, 0, false), 300);
})();
text.addEventListener("focus", () => { phStop = true; clearTimeout(phTimer); text.placeholder = "Write something…"; }, { once: true });

EXAMPLES.forEach(([s, e]) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.textContent = EMO[e].emoji + " " + s;
  b.style.setProperty("--c", EMO[e].color);
  b.onclick = () => { phStop = true; clearTimeout(phTimer); text.value = s; syncInput(); form.requestSubmit(); };
  $("chips").appendChild(b);
});

/* ---------- health ---------- */
async function checkHealth(tries = 0) {
  const st = $("status"), t = $("statusText");
  try {
    const r = await fetch("/health");
    const d = await r.json();
    if (d.model_loaded) { st.dataset.state = "ok"; t.textContent = "Model ready"; return; }
    throw new Error("loading");
  } catch (_) {
    if (tries > 40) { st.dataset.state = "err"; t.textContent = "Server unreachable"; return; }
    st.dataset.state = "wait"; t.textContent = "Waking the model…";
    setTimeout(() => checkHealth(tries + 1), 3000);
  }
}
checkHealth();

/* ---------- predict ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = text.value.trim();
  if (!value) return;
  go.disabled = true; go.classList.add("busy"); result.classList.add("loading");
  $("error").hidden = true;
  try {
    const r = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: value }),
    });
    if (r.status === 503) throw new Error("The model is still loading. Try again in a few seconds.");
    if (!r.ok) throw new Error("Something went wrong on the server. Check your text and try again.");
    show(await r.json());
    remember(value);
  } catch (err) {
    $("idle").hidden = true; $("out").hidden = true;
    const el = $("error"); el.hidden = false;
    el.textContent = err instanceof TypeError ? "Can't reach the server. Check your connection and try again." : err.message;
  } finally {
    go.classList.remove("busy"); result.classList.remove("loading"); syncInput();
  }
});

function show(d) {
  const top = d.predicted_emotion, info = EMO[top];
  const probs = d.all_probabilites;
  $("idle").hidden = true; $("error").hidden = true; $("out").hidden = false;
  result.style.setProperty("--c", info.color);

  // retrigger emoji pop
  const em = $("emoji"); em.textContent = info.emoji;
  em.style.animation = "none"; void em.offsetWidth; em.style.animation = "";
  $("label").textContent = top;
  $("quote").textContent = "“" + d.text + "”";

  // confidence ring + count-up
  const arc = $("arc"), C = 326.7;
  arc.style.transition = "none"; arc.style.strokeDashoffset = C; void arc.getBoundingClientRect();
  arc.style.transition = ""; arc.style.strokeDashoffset = C * (1 - d.confidence);
  countUp($("pct"), d.confidence * 100);

  // bars sorted high -> low
  const rows = $("rows"); rows.innerHTML = "";
  Object.entries(probs).sort((a, b) => b[1] - a[1]).forEach(([k, p], i) => {
    const li = document.createElement("li");
    li.className = "row" + (i === 0 ? " top1" : "");
    li.style.cssText = `--i:${i};--c:${EMO[k].color}`;
    li.innerHTML = `<span>${EMO[k].emoji}</span><span class="n">${k}</span><div class="track-bar"><div class="fill"></div></div><span class="v">${(p * 100).toFixed(1)}%</span>`;
    rows.appendChild(li);
    requestAnimationFrame(() => requestAnimationFrame(() => (li.querySelector(".fill").style.width = Math.max(p * 100, 1.5) + "%")));
  });

  setField(probs);
}

function countUp(el, to) {
  const t0 = performance.now(), dur = 1100;
  (function tick(t) {
    const k = Math.min((t - t0) / dur, 1), eased = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(to * eased) + "%";
    if (k < 1) requestAnimationFrame(tick);
  })(t0);
}

/* ---------- history ---------- */
function remember(s) {
  const emotion = $("label").textContent;
  history = [{ s, emotion }, ...history.filter((h) => h.s !== s)].slice(0, 6);
  try { localStorage.setItem("emotion-history", JSON.stringify(history)); } catch (_) {}
  renderHistory();
}
function renderHistory() {
  $("historyWrap").hidden = !history.length;
  const box = $("history"); box.innerHTML = "";
  history.forEach(({ s, emotion }) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.title = s;
    b.style.setProperty("--c", EMO[emotion]?.color);
    b.textContent = (EMO[emotion]?.emoji || "") + " " + s;
    b.onclick = () => { text.value = s; syncInput(); form.requestSubmit(); };
    box.appendChild(b);
  });
}
renderHistory();
syncInput();
