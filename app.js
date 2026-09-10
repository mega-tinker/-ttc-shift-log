
document.addEventListener("DOMContentLoaded", function () {
  const KEY = "ttcShiftRecordsV2";
  const LEGACY_KEY = "ttcShiftRecordsV1";
  let editingId = null;
  const $ = id => document.getElementById(id);

  function loadRecords() {
    try {
      const current = localStorage.getItem(KEY);
      if (current) return JSON.parse(current);

      // Import old records once, if present.
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const old = JSON.parse(legacy);
        const migrated = old.map(r => ({
          id: r.id || String(Date.now()) + Math.random(),
          date: r.date || "",
          routes: r.routes || "",
          crew: r.crew || "",
          run: r.run || "",
          bus: r.bus || "",
          scheduledStart: r.start || "",
          scheduledFinish: r.finish || "",
          actualFinish: r.finish || "",
          paid: r.paid || "",
          ot: r.ot || "",
          camera: r.camera || "Unknown",
          incident: r.incident || "None",
          notes: r.notes || ""
        }));
        localStorage.setItem(KEY, JSON.stringify(migrated));
        return migrated;
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  function saveRecords(records) {
    localStorage.setItem(KEY, JSON.stringify(records));
  }

  function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function toMinutes(value) {
    if (!value) return null;
    const parts = value.split(":").map(Number);
    return parts[0] * 60 + parts[1];
  }

  function diffMinutes(start, finish) {
    const s = toMinutes(start), f = toMinutes(finish);
    if (s == null || f == null) return null;
    let diff = f - s;
    if (diff < 0) diff += 24 * 60; // overnight shift
    return diff;
  }

  function hm(total) {
    if (total == null) return "";
    total = Math.max(0, Math.round(total));
    return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
  }

  function recalc() {
    const paidMin = diffMinutes($("scheduledStart").value, $("scheduledFinish").value);
    $("paid").value = hm(paidMin);

    const sf = $("scheduledFinish").value;
    const af = $("actualFinish").value;
    if (!sf || !af) {
      $("ot").value = "Pending";
      return;
    }
    let otMin = diffMinutes(sf, af);
    // If actual finish equals scheduled finish => 0
    if (sf === af) otMin = 0;
    $("ot").value = hm(otMin);
  }

  ["scheduledStart","scheduledFinish","actualFinish"].forEach(id => {
    $(id).addEventListener("input", recalc);
    $(id).addEventListener("change", recalc);
  });

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach(btn =>
      btn.classList.toggle("active", btn.dataset.tab === name)
    );
    document.querySelectorAll(".panel").forEach(panel =>
      panel.classList.toggle("active", panel.id === name)
    );
    if (name === "history") renderHistory();
    if (name === "summary") renderSummary();
  }

  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  function resetForm() {
    editingId = null;
    $("shiftForm").reset();
    $("date").value = todayISO();
    $("camera").value = "Unknown";
    $("incident").value = "None";
    $("paid").value = "";
    $("ot").value = "Pending";
    $("saveMessage").textContent = "";
    document.querySelector("#shiftForm .primary").textContent = "Save Shift";
  }

  $("shiftForm").addEventListener("submit", function (e) {
    e.preventDefault();
    recalc();

    const record = {
      id: editingId || (Date.now().toString(36) + Math.random().toString(36).slice(2,8)),
      date: $("date").value,
      routes: $("routes").value.trim(),
      crew: $("crew").value.trim(),
      run: $("run").value.trim(),
      bus: $("bus").value.trim(),
      scheduledStart: $("scheduledStart").value,
      scheduledFinish: $("scheduledFinish").value,
      actualFinish: $("actualFinish").value,
      paid: $("paid").value,
      ot: $("ot").value,
      camera: $("camera").value,
      incident: $("incident").value,
      notes: $("notes").value.trim()
    };

    const records = loadRecords();
    const idx = records.findIndex(r => r.id === record.id);
    if (idx >= 0) records[idx] = record;
    else records.push(record);

    saveRecords(records);
    $("saveMessage").textContent = editingId ? "Shift updated." : "Shift saved.";
    renderHistory();
    renderSummary();
    setTimeout(resetForm, 700);
  });

  $("clearForm").addEventListener("click", resetForm);
  $("search").addEventListener("input", renderHistory);

  function renderHistory() {
    const q = $("search").value.trim().toLowerCase();
    const list = $("historyList");
    const records = loadRecords()
      .slice()
      .sort((a,b) => String(b.date||"").localeCompare(String(a.date||"")))
      .filter(r => !q || Object.values(r).some(v => String(v ?? "").toLowerCase().includes(q)));

    list.innerHTML = "";
    if (!records.length) {
      list.innerHTML = '<div class="record-card">No matching records.</div>';
      return;
    }

    records.forEach(r => {
      const card = document.createElement("article");
      card.className = "record-card";
      card.innerHTML = `
        <div class="card-head">
          <div><strong>${r.date || ""}</strong><span class="card-route">Route(s): ${r.routes || ""}</span></div>
          <button class="edit-btn" type="button">Edit</button>
        </div>
        <div class="card-grid">
          <div><b>Crew:</b> ${r.crew || ""}</div>
          <div><b>Run:</b> ${r.run || ""}</div>
          <div><b>Bus:</b> ${r.bus || ""}</div>
          <div><b>Scheduled Start:</b> ${r.scheduledStart || ""}</div>
          <div><b>Scheduled Finish:</b> ${r.scheduledFinish || ""}</div>
          <div><b>Actual Finish:</b> ${r.actualFinish || ""}</div>
          <div><b>Paid:</b> ${r.paid || ""}</div>
          <div><b>OT:</b> ${r.ot || ""}</div>
          <div><b>Camera:</b> ${r.camera || ""}</div>
          <div><b>Incident:</b> ${r.incident || ""}</div>
        </div>
        <div class="card-notes"></div>
        <button class="delete-btn" type="button">Delete</button>`;
      card.querySelector(".card-notes").textContent = r.notes || "";
      card.querySelector(".edit-btn").addEventListener("click", () => editRecord(r.id));
      card.querySelector(".delete-btn").addEventListener("click", () => deleteRecord(r.id));
      list.appendChild(card);
    });
  }

  function editRecord(id) {
    const r = loadRecords().find(x => x.id === id);
    if (!r) return;
    editingId = id;
    $("date").value = r.date || "";
    $("routes").value = r.routes || "";
    $("crew").value = r.crew || "";
    $("run").value = r.run || "";
    $("bus").value = r.bus || "";
    $("scheduledStart").value = r.scheduledStart || "";
    $("scheduledFinish").value = r.scheduledFinish || "";
    $("actualFinish").value = r.actualFinish || "";
    $("camera").value = r.camera || "Unknown";
    $("incident").value = r.incident || "None";
    $("notes").value = r.notes || "";
    recalc();
    document.querySelector("#shiftForm .primary").textContent = "Update Shift";
    switchTab("new");
    window.scrollTo(0,0);
  }

  function deleteRecord(id) {
    if (!confirm("Delete this shift record?")) return;
    saveRecords(loadRecords().filter(r => r.id !== id));
    renderHistory();
    renderSummary();
  }

  function totalField(records, field) {
    return records.reduce((sum,r) => sum + (function(v){
      const m = String(v||"").match(/^(\d+):(\d{2})$/);
      return m ? Number(m[1])*60 + Number(m[2]) : 0;
    })(r[field]), 0);
  }

  function renderSummary() {
    const records = loadRecords();
    $("sumShifts").textContent = records.length;
    $("sumPaid").textContent = hm(totalField(records, "paid"));
    $("sumOT").textContent = hm(totalField(records, "ot"));
    $("sumIncidents").textContent = records.filter(r => r.incident && r.incident !== "None").length;

    const routes = [];
    records.forEach(r => String(r.routes||"").split(/[\\/,]+/).map(x=>x.trim()).filter(Boolean).forEach(x=>routes.push(x)));
    $("sumRoutes").textContent = new Set(routes).size;
    $("sumBuses").textContent = new Set(records.map(r=>r.bus).filter(Boolean)).size;
  }

  function download(content, filename, type) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }

  $("exportCsv").addEventListener("click", function () {
    const headers = ["Date","Route(s)","Crew","Run","Bus","Scheduled Start","Scheduled Finish","Actual Finish","Paid","OT","Side Camera","Incident","Notes"];
    const rows = loadRecords().map(r => [r.date,r.routes,r.crew,r.run,r.bus,r.scheduledStart,r.scheduledFinish,r.actualFinish,r.paid,r.ot,r.camera,r.incident,r.notes]);
    const csv = [headers,...rows].map(row => row.map(v => '"' + String(v ?? "").replace(/"/g,'""') + '"').join(",")).join("\\n");
    download(csv, "TTC_Shift_Log.csv", "text/csv;charset=utf-8");
  });

  $("exportJson").addEventListener("click", () =>
    download(JSON.stringify(loadRecords(), null, 2), "TTC_Shift_Log_Backup.json", "application/json")
  );

  $("importJson").addEventListener("change", async function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error();
      if (confirm("Restore " + data.length + " records? This replaces current records.")) {
        saveRecords(data);
        renderHistory();
        renderSummary();
        alert("Backup restored.");
      }
    } catch {
      alert("Could not read backup file.");
    }
    e.target.value = "";
  });

  $("deleteAll").addEventListener("click", function () {
    if (confirm("Delete ALL TTC records from this device?")) {
      localStorage.removeItem(KEY);
      renderHistory();
      renderSummary();
    }
  });

  resetForm();
  renderHistory();
  renderSummary();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./service-worker.js?v=3").catch(function(){});
    });
  }
});
