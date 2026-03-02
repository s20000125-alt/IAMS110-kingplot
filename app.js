const ISOTOPES = [170, 171, 172, 173, 174, 176];

const MASS = {
  170: 169.9347664,
  171: 170.9363302,
  172: 171.9363859,
  173: 172.9382151,
  174: 173.9388664,
  176: 175.9425717
};

function mu(mA, mref) {
  return (mA * mref) / Math.abs(mA - mref);
}

async function loadTransition(tr) {
  const r = await fetch(`data/${tr}.json`);
  if (!r.ok) throw new Error(`Failed to load data/${tr}.json (HTTP ${r.status})`);
  const j = await r.json();

  const map = new Map();
  for (const d of j.data) {
    map.set(Number(d.isotope), Number(d.average));
  }
  return map;
}

function linearFit(x, y) {
  // OLS: y = a + b x
  const n = x.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
    sxx += x[i] * x[i];
    sxy += x[i] * y[i];
  }
  const denom = n * sxx - sx * sx;
  const b = (n * sxy - sx * sy) / denom;
  const a = (sy - b * sx) / n;

  // R^2
  const ybar = sy / n;
  let ss_res = 0, ss_tot = 0;
  for (let i = 0; i < n; i++) {
    const yh = a + b * x[i];
    ss_res += (y[i] - yh) * (y[i] - yh);
    ss_tot += (y[i] - ybar) * (y[i] - ybar);
  }
  const r2 = 1 - (ss_res / ss_tot);

  return { a, b, r2 };
}

function dPerp(a, b, x0, y0) {
  // distance from point to line y = a + b x -> b x - y + a = 0
  return Math.abs(b * x0 - y0 + a) / Math.sqrt(b * b + 1);
}

function projPoint(a, b, x0, y0) {
  // projection of (x0,y0) onto y=a+bx
  const x_proj = (x0 + b * (y0 - a)) / (1 + b * b);
  const y_proj = a + b * x_proj;
  return { x_proj, y_proj };
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function linspace(xmin, xmax, n = 300) {
  const out = [];
  if (n <= 1) return [xmin];
  const step = (xmax - xmin) / (n - 1);
  for (let i = 0; i < n; i++) out.push(xmin + step * i);
  return out;
}

async function plot() {
  try {
    const tx = document.getElementById("tx").value;
    const ty = document.getElementById("ty").value;
    const ref = Number(document.getElementById("ref").value);

    if (tx === ty) {
      alert("X and Y must be different.");
      return;
    }

    const dx = await loadTransition(tx);
    const dy = await loadTransition(ty);

    if (!dx.has(ref) || !dy.has(ref)) {
      alert(`REF=${ref} not found in one of the transitions.`);
      return;
    }

    const nu_x_ref = dx.get(ref);
    const nu_y_ref = dy.get(ref);
    const mref = MASS[ref];

    const pts = [];
    for (const A of ISOTOPES) {
      if (A === ref) continue;
      if (!dx.has(A) || !dy.has(A)) continue;

      const dnu_x = dx.get(A) - nu_x_ref;
      const dnu_y = dy.get(A) - nu_y_ref;

      const muA = mu(MASS[A], mref);
      const mIS_x = muA * dnu_x;
      const mIS_y = muA * dnu_y;

      pts.push({ A, mIS_x, mIS_y });
    }

    if (pts.length < 2) {
      alert("Not enough isotope points to fit a line.");
      return;
    }

    const x = pts.map(p => p.mIS_x);
    const y = pts.map(p => p.mIS_y);

    const fit = linearFit(x, y);
    const a = fit.a, b = fit.b, r2 = fit.r2;

    // main fit line
    const xmin = Math.min(...x), xmax = Math.max(...x);
    const xr = (xmax - xmin) || 1;
    const xx = linspace(xmin - 0.05 * xr, xmax + 0.05 * xr, 400);
    const yy = xx.map(t => a + b * t);

    // main plot
    Plotly.newPlot("plot", [
      {
        x, y,
        mode: "markers+text",
        type: "scatter",
        text: pts.map(p => String(p.A)),
        textposition: "top right",
        name: "Isotopes"
      },
      {
        x: xx, y: yy,
        mode: "lines",
        type: "scatter",
        name: "Linear fit"
      }
    ], {
      title: `King Plot: ${ty} vs ${tx} (ref=${ref})`,
      xaxis: { title: `μΔν (${tx})` },
      yaxis: { title: `μΔν (${ty})` },
      margin: { l: 70, r: 20, t: 60, b: 60 }
    }, { responsive: true });

    // fit summary
    setHTML("fit",
      `<b>Fit:</b> mIS<sub>${ty}</sub> = a + b·mIS<sub>${tx}</sub> &nbsp; | &nbsp; ` +
      `<b>a</b> = ${a.toPrecision(6)} &nbsp; ` +
      `<b>b</b> = ${b.toPrecision(6)} &nbsp; ` +
      `<b>R²</b> = ${r2.toPrecision(6)}`
    );

    // table with d_perp
    const denom = Math.sqrt(b * b + 1);
    const rows = pts.map(p => {
      const d = Math.abs(b * p.mIS_x - p.mIS_y + a) / denom;
      return { ...p, d_perp: d };
    });

    let out = "A\tmIS_x\tmIS_y\td_perp\n";
    for (const r of rows) {
      out += `${r.A}\t${r.mIS_x}\t${r.mIS_y}\t${r.d_perp}\n`;
    }
    setText("out", out);

    // zoom plots
    const zoomWrap = document.getElementById("zooms");
    if (zoomWrap) {
      zoomWrap.innerHTML = "";

      // global span for pads
      const y_min = Math.min(...y), y_max = Math.max(...y);
      const xspan = (xmax - xmin) || 1;
      const yspan = (y_max - y_min) || 1;
      const pad_frac = 0.06;
      const hx = pad_frac * xspan;
      const hy = pad_frac * yspan;

      for (const p of rows) {
        const div = document.createElement("div");
        div.style.width = "300px";
        div.style.height = "240px";
        div.style.border = "1px solid #ddd";
        div.style.padding = "6px";
        div.style.boxSizing = "border-box";
        zoomWrap.appendChild(div);

        const x0 = p.mIS_x, y0 = p.mIS_y;

        const x1 = x0 - hx, x2 = x0 + hx;
        const zxx = linspace(x1, x2, 80);
        const zyy = zxx.map(t => a + b * t);

        const pr = projPoint(a, b, x0, y0);
        const d = dPerp(a, b, x0, y0);

        Plotly.newPlot(div, [
          { x: zxx, y: zyy, mode: "lines", type: "scatter", name: "fit", showlegend: false },
          { x: [x0], y: [y0], mode: "markers", type: "scatter", name: "pt", showlegend: false },
          { x: [x0, pr.x_proj], y: [y0, pr.y_proj], mode: "lines", type: "scatter", name: "perp", showlegend: false }
        ], {
          title: `${p.A}–${ref}   d⊥=${d.toPrecision(4)}`,
          margin: { l: 40, r: 10, t: 40, b: 35 },
          xaxis: { range: [x0 - hx, x0 + hx], title: "" },
          yaxis: { range: [y0 - hy, y0 + hy], title: "" }
        }, { displayModeBar: false, responsive: true });
      }
    }

  } catch (err) {
    alert(String(err));
    console.error(err);
  }
}

// 讓你的按鈕能觸發 plot()
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn");
  if (btn) btn.addEventListener("click", plot);

  // 如果你 index.html 的按鈕仍是 onclick="plot()"，也沒問題（這裡只是保險）
});
