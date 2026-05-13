/**
 * Builds a standalone HTML report from reports/manufacturing-inventory-2026-05-11-viz-data.json
 * Run: node scripts/build-manufacturing-inventory-viz.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataPath = path.join(root, "reports", "manufacturing-inventory-2026-05-11-viz-data.json");
const outPath = path.join(root, "reports", "manufacturing-inventory-2026-05-11-visualization.html");

const dataJson = fs.readFileSync(dataPath, "utf8");
const data = JSON.parse(dataJson);
const sheet = data.sheets.find((s) => s.name === "Inventory Export") || data.sheets[0];
if (!sheet?.rows?.length) {
  console.error("No inventory rows in JSON");
  process.exit(1);
}

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const headers = sheet.headers.filter(Boolean);
const tableHeaders = [
  "sku",
  "name",
  "category",
  "status",
  "quantity",
  "unitCost",
  "totalValue",
  "location",
].filter((h) => headers.includes(h));

const rowsHtml = sheet.rows
  .map((r) => {
    const cells = tableHeaders.map((h) => `<td>${esc(r[h])}</td>`).join("");
    return `<tr>${cells}</tr>`;
  })
  .join("\n");

const thHtml = tableHeaders.map((h) => `<th data-col="${esc(h)}">${esc(h)}</th>`).join("");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Manufacturing inventory — ${esc(data.source)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,600&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --bg: #0f1419;
      --surface: #1a222d;
      --border: #2a3544;
      --text: #e8eef5;
      --muted: #8b9cb3;
      --accent: #3dd6c3;
      --accent-dim: #2a9d8f;
      --warn: #e9c46a;
      --chart-1: #3dd6c3;
      --chart-2: #6ea8fe;
      --chart-3: #c77dff;
      --chart-4: #ffb86b;
      --chart-5: #f472b6;
      --radius: 12px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "DM Sans", system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      font-size: 15px;
    }
    .wrap { max-width: 1280px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    header {
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
    }
    h1 {
      font-family: Fraunces, Georgia, serif;
      font-weight: 600;
      font-size: clamp(1.75rem, 4vw, 2.35rem);
      margin: 0 0 0.35rem;
      letter-spacing: -0.02em;
    }
    .subtitle { color: var(--muted); font-size: 0.95rem; }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .kpi {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.1rem 1.25rem;
    }
    .kpi label {
      display: block;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 0.35rem;
    }
    .kpi strong {
      font-family: Fraunces, Georgia, serif;
      font-size: 1.65rem;
      font-weight: 600;
      color: var(--accent);
    }
    .charts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem 1rem 1.25rem;
    }
    .card h2 {
      font-family: Fraunces, Georgia, serif;
      font-size: 1.05rem;
      font-weight: 600;
      margin: 0 0 0.75rem;
      color: var(--text);
    }
    .chart-box { position: relative; height: 280px; }
    .chart-box.tall { height: 340px; }
    .section-title {
      font-family: Fraunces, Georgia, serif;
      font-size: 1.25rem;
      margin: 2rem 0 1rem;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    .toolbar input {
      flex: 1;
      min-width: 200px;
      padding: 0.55rem 0.85rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      font: inherit;
    }
    .table-wrap {
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      max-height: 520px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }
    th, td {
      padding: 0.55rem 0.65rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    th {
      position: sticky;
      top: 0;
      background: #232d3a;
      z-index: 1;
      cursor: pointer;
      user-select: none;
    }
    th:hover { color: var(--accent); }
    tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
    td:nth-child(2) { white-space: normal; max-width: 280px; }
    .footnote {
      margin-top: 2rem;
      font-size: 0.8rem;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Manufacturing inventory snapshot</h1>
      <p class="subtitle">Source file: <strong>${esc(data.source)}</strong> · ${sheet.rowCount} line items (export summary row excluded from rollups)</p>
    </header>

    <div class="kpis" id="kpis"></div>

    <div class="charts">
      <div class="card"><h2>Value by category</h2><div class="chart-box tall"><canvas id="chartCat"></canvas></div></div>
      <div class="card"><h2>Value by location</h2><div class="chart-box tall"><canvas id="chartLoc"></canvas></div></div>
      <div class="card"><h2>Line items by status</h2><div class="chart-box"><canvas id="chartStat"></canvas></div></div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <h2>Highest total value (top 25)</h2>
      <div class="chart-box tall"><canvas id="chartTop"></canvas></div>
    </div>

    <h2 class="section-title">Full export</h2>
    <div class="toolbar">
      <input type="search" id="filter" placeholder="Filter by SKU, name, category, location…" />
    </div>
    <div class="table-wrap">
      <table id="tbl">
        <thead><tr>${thHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    <p class="footnote">Generated from ERP export JSON. Rebuild with: <code>node scripts/build-manufacturing-inventory-viz.mjs</code> after updating the JSON extractor.</p>
  </div>

  <script>
  const INVENTORY_DATA = ${dataJson};

  (function () {
    const sheet = INVENTORY_DATA.sheets.find(s => s.name === "Inventory Export") || INVENTORY_DATA.sheets[0];
    const kpis = sheet.kpis || {};
    const fmtMoney = (n) =>
      new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n || 0);
    const fmtNum = (n) => new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 }).format(n || 0);

    document.getElementById("kpis").innerHTML = [
      ["Line items", fmtNum(kpis.lineItems)],
      ["Sum of quantity", fmtNum(kpis.sumQuantity)],
      ["Sum of total value", fmtMoney(kpis.sumTotalValue)],
      ["Export grand total row", kpis.reportedGrandTotalValue != null ? fmtMoney(kpis.reportedGrandTotalValue) : "—"],
    ].map(([label, val]) => '<div class="kpi"><label>' + label + '</label><strong>' + val + '</strong></div>').join("");

    const palette = ["#3dd6c3", "#6ea8fe", "#c77dff", "#ffb86b", "#f472b6", "#a3e635", "#facc15", "#fb7185", "#38bdf8", "#c4b5fd"];

    Chart.defaults.color = "#8b9cb3";
    Chart.defaults.borderColor = "#2a3544";

    const byCat = sheet.rollup?.byCategory || {};
    const catLabels = Object.keys(byCat).slice(0, 16);
    const catVals = catLabels.map((k) => byCat[k].value);

    new Chart(document.getElementById("chartCat"), {
      type: "bar",
      data: {
        labels: catLabels,
        datasets: [{ label: "Total value (ZAR)", data: catVals, backgroundColor: palette }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { callback: (v) => (v >= 1e6 ? v / 1e6 + "M" : v >= 1e3 ? v / 1e3 + "k" : v) } } },
      },
    });

    const byLoc = sheet.rollup?.byLocation || {};
    const locLabels = Object.keys(byLoc).slice(0, 14);
    const locVals = locLabels.map((k) => byLoc[k].value);

    new Chart(document.getElementById("chartLoc"), {
      type: "bar",
      data: {
        labels: locLabels,
        datasets: [{ label: "Total value (ZAR)", data: locVals, backgroundColor: palette.map((c, i) => palette[(i + 3) % palette.length]) }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { callback: (v) => (v >= 1e6 ? v / 1e6 + "M" : v >= 1e3 ? v / 1e3 + "k" : v) } } },
      },
    });

    const byStat = sheet.rollup?.byStatus || {};
    const statLabels = Object.keys(byStat);
    const statVals = statLabels.map((k) => byStat[k]);

    new Chart(document.getElementById("chartStat"), {
      type: "doughnut",
      data: {
        labels: statLabels,
        datasets: [{ data: statVals, backgroundColor: palette }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right" } } },
    });

    const top = sheet.topByValue || [];
    new Chart(document.getElementById("chartTop"), {
      type: "bar",
      data: {
        labels: top.map((r) => (r.sku || "") + " — " + (r.name || "").slice(0, 40) + (r.name && r.name.length > 40 ? "…" : "")),
        datasets: [{ label: "Value (ZAR)", data: top.map((r) => r.value), backgroundColor: "#6ea8fe" }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { callback: (v) => (v >= 1e6 ? v / 1e6 + "M" : v >= 1e3 ? v / 1e3 + "k" : v) } } },
      },
    });

    const input = document.getElementById("filter");
    const tbody = document.querySelector("#tbl tbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      rows.forEach((tr) => {
        const t = tr.textContent.toLowerCase();
        tr.style.display = !q || t.includes(q) ? "" : "none";
      });
    });

    const ths = document.querySelectorAll("#tbl th");
    let sortCol = null;
    let sortDir = 1;
    ths.forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.dataset.col;
        sortDir = sortCol === col ? -sortDir : 1;
        sortCol = col;
        const idx = Array.from(th.parentNode.children).indexOf(th);
        const sorted = rows.slice().sort((a, b) => {
          const va = a.children[idx]?.textContent ?? "";
          const vb = b.children[idx]?.textContent ?? "";
          const na = parseFloat(va.replace(/[^0-9.-]/g, ""));
          const nb = parseFloat(vb.replace(/[^0-9.-]/g, ""));
          if (!isNaN(na) && !isNaN(nb) && va.match(/^\\s*[\\d.+-]/)) return (na - nb) * sortDir;
          return va.localeCompare(vb) * sortDir;
        });
        sorted.forEach((tr) => tbody.appendChild(tr));
      });
    });
  })();
  </script>
</body>
</html>`;

fs.writeFileSync(outPath, html, "utf8");
console.log("Wrote", outPath, "(" + Math.round(fs.statSync(outPath).size / 1024) + " KB)");
