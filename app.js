document.addEventListener("DOMContentLoaded", function () {
  const KEY = "ttcShiftRecordsV1";
  const $ = id => document.getElementById(id);
  let editingId = null;

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  }

  function save(records) {
    localStorage.setItem(KEY, JSON.stringify(records));
  }

  function today() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === name);
    });

    document.querySelectorAll(".panel").forEach(panel => {
      panel.classList.toggle("active", panel.id === name);
    });

    if (name === "history") renderHistory();
    if (name === "summary") renderSummary();
  }

  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  function resetForm() {
    editingId = null;
    $("shiftForm").reset();
    $("date").value = today();
    $("camera").value = "Unknown";
    $("incident").value = "None";
    document.querySelector("#shiftForm .primary").textContent = "Save Shift";
  }

  $("shiftForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const record = {
      id: editingId || Date.now().toString(),
      date: $("date").value,
      routes: $("routes").value,
      crew: $("crew").value,
      run: $("run").value,
      bus: $("bus").value,
      start: $("start").value,
      finish: $("finish").value,
      paid: $("paid").value,
      ot: $("ot").value,
      camera: $("camera").value,
      incident: $("incident").value,
      notes: $("notes").value
    };

    const records = load();
    const index = records.findIndex(r => r.id === record.id);

    if (index >= 0) {
      records[index] = record;
    } else {
      records.push(record);
    }

    save(records);
    $("saveMessage").textContent = "Shift saved.";
    renderHistory();
    renderSummary();

    setTimeout(() => {
      $("saveMessage").textContent = "";
      resetForm();
    }, 700);
  });

  $("clearForm").addEventListener("click", resetForm);

  function renderHistory() {
    const list = $("historyList");
    const q = $("search").value.toLowerCase();
    const records = load()
      .slice()
      .reverse()
      .filter(r =>
        Object.values(r).some(v =>
          String(v || "").toLowerCase().includes(q)
        )
      );

    list.innerHTML = "";

    if (!records.length) {
      list.innerHTML = '<div class="record-card">No records yet.</div>';
      return;
    }

    records.forEach(r => {
      const card = document.createElement("article");
      card.className = "record-card";

      card.innerHTML =
        "<strong>" + r.date + "</strong>" +
        "<div class='card-route'>Route(s): " + r.routes + "</div>" +
        "<div class='card-grid'>" +
        "<div><b>Crew:</b> " + r.crew + "</div>" +
        "<div><b>Run:</b> " + r.run + "</div>" +
        "<div><b>Bus:</b> " + r.bus + "</div>" +
        "<div><b>Start:</b> " + r.start + "</div>" +
        "<div><b>Finish:</b> " + r.finish + "</div>" +
        "<div><b>Paid:</b> " + r.paid + "</div>" +
        "<div><b>OT:</b> " + r.ot + "</div>" +
        "<div><b>Camera:</b> " + r.camera + "</div>" +
        "<div><b>Incident:</b> " + r.incident + "</div>" +
        "</div>" +
        "<div class='card-notes'>" + (r.notes || "") + "</div>" +
        "<button class='delete-btn'>Delete</button>";

      card.querySelector(".delete-btn").onclick = function () {
        if (confirm("Delete this shift?")) {
          save(load().filter(x => x.id !== r.id));
          renderHistory();
          renderSummary();
        }
      };

      list.appendChild(card);
    });
  }

  $("search").addEventListener("input", renderHistory);

  function minutes(value) {
    const m = String(value || "").match(/^(\d+):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  }

  function timeText(total) {
    return Math.floor(total / 60) + ":" +
      String(total % 60).padStart(2, "0");
  }

  function renderSummary() {
    const records = load();

    $("sumShifts").textContent = records.length;

    $("sumPaid").textContent = timeText(
      records.reduce((a, r) => a + minutes(r.paid), 0)
    );

    $("sumOT").textContent = timeText(
      records.reduce((a, r) => a + minutes(r.ot), 0)
    );

    $("sumIncidents").textContent =
      records.filter(r => r.incident !== "None").length;

    const routes = [];
    records.forEach(r => {
      String(r.routes || "")
        .split(/[\/,]+/)
        .forEach(x => {
          if (x.trim()) routes.push(x.trim());
        });
    });

    $("sumRoutes").textContent = new Set(routes).size;

    $("sumBuses").textContent =
      new Set(records.map(r => r.bus).filter(Boolean)).size;
  }

  resetForm();
  renderHistory();
  renderSummary();
});
