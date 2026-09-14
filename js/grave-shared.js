/* GRAVE shared read-only helpers — used by the dashboard (app.js) and the
   public read-only vault page (vault.js). Depends on ethers (global) and
   window.GRAVE_CONFIG. Exposes window.GraveShared. */
(() => {
  "use strict";
  const CFG = window.GRAVE_CONFIG;
  const ABI = CFG.ABI;

  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

  /* ---------- formatting ---------- */
  function fmtDur(s) {
    s = Number(s);
    if (s <= 0) return "0";
    const d = Math.floor(s / 86400);
    if (d >= 1) return d + (d === 1 ? " day" : " days");
    const h = Math.floor(s / 3600);
    if (h >= 1) return h + (h === 1 ? " hour" : " hours");
    const m = Math.floor(s / 60);
    return m + " min";
  }
  function fmtAgo(ts) {
    if (!ts) return "";
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    return Math.floor(diff / 86400) + "d ago";
  }
  function fmtDate(ts) { return ts ? new Date(ts * 1000).toLocaleString() : ""; }

  /* ---------- proof-of-life status ---------- */
  // Returns everything the UI needs to paint the status + progress bar.
  function computeLife(lastCheckIn, interval, grace, executed) {
    lastCheckIn = Number(lastCheckIn); interval = Number(interval); grace = Number(grace);
    const now = Math.floor(Date.now() / 1000);
    const intervalEnd = lastCheckIn + interval;
    const deadline = intervalEnd + grace;

    let state, label;
    if (executed) { state = "executed"; label = "Executed"; }
    else if (now > deadline) { state = "expired"; label = "Execution ready"; }
    else if (now >= intervalEnd) { state = "grace"; label = "In grace period"; }
    else { state = "active"; label = "Active"; }

    const intervalFrac = interval > 0 ? Math.min(Math.max((now - lastCheckIn) / interval, 0), 1) : 1;
    const graceFrac = grace > 0 ? Math.min(Math.max((now - intervalEnd) / grace, 0), 1) : 0;

    return { now, intervalEnd, deadline, state, label, intervalFrac, graceFrac,
             lastCheckIn, interval, grace };
  }

  // Paint the proof-of-life card. `els` maps names to DOM nodes (may be null).
  function paintLife(els, life) {
    if (els.state) {
      els.state.textContent = life.label;
      els.state.className = "life-state " + life.state;
    }
    if (els.fillInterval) els.fillInterval.style.width = (life.intervalFrac * 100).toFixed(2) + "%";
    if (els.fillGrace) els.fillGrace.style.width = (life.graceFrac * 100).toFixed(2) + "%";
    // weight the two segments by their real durations
    if (els.track) {
      const segI = els.track.querySelector(".life-seg-interval");
      const segG = els.track.querySelector(".life-seg-grace");
      if (segI && segG) {
        if (life.grace > 0) {
          segG.style.display = "";
          segI.style.flex = String(Math.max(life.interval, 1));
          segG.style.flex = String(Math.max(life.grace, 1));
        } else {
          segG.style.display = "none";
          segI.style.flex = "1";
        }
      }
    }
    if (els.intervalLbl) els.intervalLbl.textContent = fmtDur(life.interval);
    if (els.graceLbl) els.graceLbl.textContent = life.grace > 0 ? fmtDur(life.grace) : "none";
    if (els.lastLbl) els.lastLbl.textContent = fmtDate(life.lastCheckIn);
  }

  /* ---------- activity timeline ---------- */
  const _tokMeta = {};
  async function tokenMeta(provider, addr) {
    if (addr in _tokMeta) return _tokMeta[addr];
    try {
      const erc = new ethers.Contract(addr, ABI.erc20, provider);
      const [sym, dec] = await Promise.all([erc.symbol(), erc.decimals()]);
      _tokMeta[addr] = { sym, dec: Number(dec) };
    } catch (_) { _tokMeta[addr] = { sym: short(addr), dec: 18 }; }
    return _tokMeta[addr];
  }

  const EV_NAMES = ["CheckedIn", "Deposited", "Withdrawn", "Executed", "Claimed",
                    "ScheduleUpdated", "BeneficiariesUpdated", "GuardianUpdated"];

  async function fetchActivity(provider, vaultAddr, limit = 30) {
    const v = new ethers.Contract(vaultAddr, ABI.vault, provider);
    let logs = [];
    for (const n of EV_NAMES) {
      try {
        const evs = await v.queryFilter(v.filters[n](), 0, "latest");
        for (const e of evs) logs.push({ e, name: n });
      } catch (_) { /* an RPC may reject a wide range for one filter; skip it */ }
    }
    logs.sort((a, b) =>
      (b.e.blockNumber - a.e.blockNumber) || ((b.e.index ?? 0) - (a.e.index ?? 0)));
    logs = logs.slice(0, limit);

    // resolve block timestamps (cached)
    const tsCache = {};
    for (const l of logs) {
      const bn = l.e.blockNumber;
      if (!(bn in tsCache)) {
        try { tsCache[bn] = Number((await provider.getBlock(bn)).timestamp); }
        catch (_) { tsCache[bn] = null; }
      }
      l.ts = tsCache[bn];
    }
    return logs;
  }

  const DOT = { CheckedIn: "in", Deposited: "dep", Withdrawn: "wd", Executed: "exe",
                Claimed: "clm", ScheduleUpdated: "cfg", BeneficiariesUpdated: "cfg",
                GuardianUpdated: "cfg" };

  async function describe(provider, l) {
    const a = l.e.args || [];
    switch (l.name) {
      case "CheckedIn":
        return { title: "Checked in", detail: "by " + short(a.by || a[0]) };
      case "Deposited": {
        const token = a.token || a[0]; const amount = a.amount ?? a[1];
        if (token === ethers.ZeroAddress)
          return { title: "Deposited ETH", detail: (+ethers.formatEther(amount)).toLocaleString(undefined, { maximumFractionDigits: 6 }) + " ETH" };
        const m = await tokenMeta(provider, token);
        return { title: "Deposited " + m.sym, detail: (+ethers.formatUnits(amount, m.dec)).toLocaleString(undefined, { maximumFractionDigits: 6 }) + " " + m.sym };
      }
      case "Withdrawn": {
        const token = a.token || a[0]; const amount = a.amount ?? a[2];
        if (token === ethers.ZeroAddress)
          return { title: "Withdrew ETH", detail: (+ethers.formatEther(amount)).toLocaleString(undefined, { maximumFractionDigits: 6 }) + " ETH" };
        const m = await tokenMeta(provider, token);
        return { title: "Withdrew " + m.sym, detail: (+ethers.formatUnits(amount, m.dec)).toLocaleString(undefined, { maximumFractionDigits: 6 }) + " " + m.sym };
      }
      case "Executed":
        return { title: "Vault executed", detail: "by " + short(a.by || a[0]) };
      case "Claimed":
        return { title: "Inheritance claimed", detail: short(a.beneficiary || a[0]) + " · " + (Number(a.bps ?? a[1]) / 100) + "%" };
      case "ScheduleUpdated":
        return { title: "Schedule updated", detail: fmtDur(a.checkInInterval ?? a[0]) + " interval · " + fmtDur(a.gracePeriod ?? a[1]) + " grace" };
      case "BeneficiariesUpdated":
        return { title: "Beneficiaries updated", detail: (a.count ?? a[0]).toString() + " beneficiaries" };
      case "GuardianUpdated":
        return { title: (a.enabled ?? a[1]) ? "Guardian added" : "Guardian removed", detail: short(a.guardian || a[0]) };
      default:
        return { title: l.name, detail: "" };
    }
  }

  async function renderActivity(provider, vaultAddr, container) {
    let logs;
    try { logs = await fetchActivity(provider, vaultAddr); }
    catch (_) { container.innerHTML = '<div class="muted-row">Activity is unavailable right now.</div>'; return; }
    if (!logs.length) { container.innerHTML = '<div class="muted-row">No activity yet.</div>'; return; }
    const explorer = CFG.NETWORKS[CFG.DEFAULT_NETWORK].explorer;
    const parts = [];
    for (const l of logs) {
      const d = await describe(provider, l);
      const tx = l.e.transactionHash;
      parts.push(
        `<div class="act-item">` +
          `<span class="act-dot act-${DOT[l.name] || "cfg"}"></span>` +
          `<div class="act-body">` +
            `<div class="act-line"><span class="act-title">${d.title}</span>` +
              `<a class="act-time" href="${explorer}/tx/${tx}" target="_blank" rel="noopener" title="${fmtDate(l.ts)}">${fmtAgo(l.ts)} ↗</a>` +
            `</div>` +
            (d.detail ? `<div class="act-detail">${d.detail}</div>` : "") +
          `</div>` +
        `</div>`
      );
    }
    container.innerHTML = parts.join("");
  }

  /* ---------- calendar reminder (.ics) ---------- */
  function pad(n) { return String(n).padStart(2, "0"); }
  function icsStamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" +
           pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
  }
  // Build an .ics with the check-in due date (grace begins) and two alarms.
  function buildICS(intervalEndSec, vaultAddr, publicUrl) {
    const start = new Date(intervalEndSec * 1000);
    const end = new Date((intervalEndSec + 3600) * 1000);
    const uid = "grave-" + vaultAddr.toLowerCase() + "-" + intervalEndSec + "@grave.cash";
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GRAVE//Check-in//EN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + icsStamp(new Date()),
      "DTSTART:" + icsStamp(start),
      "DTEND:" + icsStamp(end),
      "SUMMARY:GRAVE — check in to keep your vault active",
      "DESCRIPTION:Your GRAVE grace period begins now. Open " + (publicUrl || "https://app.grave.cash") + " and check in to reset the countdown.",
      "URL:" + (publicUrl || "https://app.grave.cash"),
      // 7 days before
      "BEGIN:VALARM", "TRIGGER:-P7D", "ACTION:DISPLAY", "DESCRIPTION:GRAVE check-in due in 7 days", "END:VALARM",
      // 1 day before
      "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:GRAVE check-in due tomorrow", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ];
    return lines.join("\r\n");
  }
  function downloadICS(text, filename) {
    const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename || "grave-checkin.ics";
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }

  window.GraveShared = {
    short, fmtDur, fmtAgo, fmtDate,
    computeLife, paintLife,
    fetchActivity, renderActivity, tokenMeta,
    buildICS, downloadICS,
  };
})();
