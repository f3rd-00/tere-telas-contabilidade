(function () {
  "use strict";

  var STORAGE_KEY = "livro-caixa:entries";
  var BUSINESS_NAME = "Terê Telas";
  var MONTH_NAMES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
  ];
  var WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

  var state = {
    entries: loadEntries(),
    view: "lancamentos",
    filter: "all",
    search: "",
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(),
    editingId: null,
    confirmAction: null,
    activeDay: null
  };

  // ---------- persistence ----------

  function loadEntries() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data;
    } catch (e) {
      return [];
    }
  }

  function saveEntries() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
    } catch (e) {
      showToast("Não foi possível salvar os dados neste dispositivo.");
    }
  }

  // ---------- helpers ----------

  function uid() {
    return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatBRL(value) {
    var sign = value < 0 ? "-" : "";
    var abs = Math.abs(value);
    var formatted = abs.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return sign + "R$ " + formatted;
  }

  function formatCompact(value) {
    var sign = value < 0 ? "-" : value > 0 ? "+" : "";
    var abs = Math.abs(value);
    return sign + abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  }

  function parseAmountInput(text) {
    if (!text) return NaN;
    var cleaned = text.replace(/[^\d,.-]/g, "");
    if (cleaned.indexOf(",") !== -1) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    }
    return parseFloat(cleaned);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function entryDateParts(iso) {
    var parts = iso.split("-");
    return { y: parseInt(parts[0], 10), m: parseInt(parts[1], 10) - 1, d: parseInt(parts[2], 10) };
  }

  function isoFor(y, m, d) {
    return y + "-" + pad(m + 1) + "-" + pad(d);
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function formatGroupDate(iso) {
    var p = entryDateParts(iso);
    var d = new Date(p.y, p.m, p.d);
    var wd = WEEKDAY_NAMES[d.getDay()];
    return capitalize(d.getDate() + " de " + MONTH_NAMES[d.getMonth()] + " · " + wd);
  }

  function showToast(message) {
    var toast = document.getElementById("toast");
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.remove("is-visible");
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toast.hidden = true;
    }, 2400);
  }

  // ---------- filtering & derived data ----------

  function entriesForMonth(year, month) {
    var y = year === undefined ? state.viewYear : year;
    var m = month === undefined ? state.viewMonth : month;
    return state.entries.filter(function (e) {
      var p = entryDateParts(e.date);
      return p.y === y && p.m === m;
    });
  }

  function monthTotals(year, month) {
    var list = entriesForMonth(year, month);
    var totalIn = 0, totalOut = 0;
    list.forEach(function (e) {
      if (e.type === "income") totalIn += e.amount;
      else totalOut += e.amount;
    });
    return { totalIn: totalIn, totalOut: totalOut, saldo: totalIn - totalOut };
  }

  function visibleEntries() {
    var list = entriesForMonth();
    if (state.filter !== "all") {
      list = list.filter(function (e) { return e.type === state.filter; });
    }
    if (state.search.trim()) {
      var q = state.search.trim().toLowerCase();
      list = list.filter(function (e) {
        return (e.description || "").toLowerCase().indexOf(q) !== -1;
      });
    }
    return list;
  }

  function groupByDate(list) {
    var map = {};
    var order = [];
    list.forEach(function (e) {
      if (!map[e.date]) {
        map[e.date] = [];
        order.push(e.date);
      }
      map[e.date].push(e);
    });
    order.sort(function (a, b) { return a < b ? 1 : a > b ? -1 : 0; });
    return order.map(function (date) {
      var items = map[date].slice().sort(function (a, b) {
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      return { date: date, items: items };
    });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function iconSvg(type) {
    if (type === "income") {
      return '<svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5m0 0l-6 6m6-6l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14m0 0l-6-6m6 6l6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function createEntryRow(entry) {
    var row = document.createElement("button");
    row.type = "button";
    row.className = "ledger-row ledger-row--" + entry.type;
    row.dataset.id = entry.id;
    row.innerHTML =
      '<span class="ledger-mark">' + iconSvg(entry.type) + "</span>" +
      '<span class="ledger-info">' +
        '<div class="ledger-desc">' + escapeHtml(entry.description) + "</div>" +
      "</span>" +
      '<span class="ledger-amount">' +
        (entry.type === "income" ? "+ " : "- ") + formatBRL(entry.amount) +
      "</span>";
    row.addEventListener("click", function () {
      closeDayDetail();
      openForm(entry);
    });
    return row;
  }

  // ---------- view switching ----------

  function switchView(view) {
    state.view = view;
    document.getElementById("app").dataset.view = view;
    document.querySelectorAll(".view").forEach(function (el) {
      el.hidden = el.id !== "view-" + view;
    });
    document.querySelectorAll(".bottom-nav-btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.tab === view);
    });
    if (view === "grafico") renderChart();
    if (view === "calendario") renderCalendar();
  }

  // ---------- rendering: lançamentos ----------

  function render() {
    renderMonthLabel();
    renderBalance();
    renderSegmented();
    renderLedger();
    if (state.view === "grafico") renderChart();
    if (state.view === "calendario") renderCalendar();
  }

  function renderMonthLabel() {
    document.getElementById("month-label").textContent =
      MONTH_NAMES[state.viewMonth] + " " + state.viewYear;
  }

  function renderBalance() {
    var totals = monthTotals();
    var figure = document.getElementById("balance-figure");
    figure.textContent = formatBRL(totals.saldo);
    figure.classList.toggle("is-negative", totals.saldo < 0);
    document.getElementById("total-in").textContent = formatBRL(totals.totalIn);
    document.getElementById("total-out").textContent = formatBRL(totals.totalOut);
  }

  function renderSegmented() {
    document.querySelectorAll(".segmented-btn").forEach(function (btn) {
      var active = btn.dataset.filter === state.filter;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function renderLedger() {
    var ledger = document.getElementById("ledger");
    var empty = document.getElementById("empty-state");
    var list = visibleEntries();
    var groups = groupByDate(list);

    ledger.innerHTML = "";

    if (groups.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    groups.forEach(function (group) {
      var groupTotal = group.items.reduce(function (sum, e) {
        return sum + (e.type === "income" ? e.amount : -e.amount);
      }, 0);

      var section = document.createElement("div");
      section.className = "ledger-group";

      var header = document.createElement("div");
      header.className = "ledger-date";
      header.innerHTML =
        "<span>" + formatGroupDate(group.date) + "</span>" +
        '<span class="ledger-date-total">' + formatBRL(groupTotal) + "</span>";
      section.appendChild(header);

      group.items.forEach(function (entry) {
        section.appendChild(createEntryRow(entry));
      });

      ledger.appendChild(section);
    });
  }

  // ---------- rendering: gráfico ----------

  function monthsEndingAt(year, month, count) {
    var list = [];
    var y = year, m = month;
    for (var i = 0; i < count; i++) {
      list.unshift({ year: y, month: m });
      m--;
      if (m < 0) { m = 11; y--; }
    }
    return list;
  }

  function renderChart() {
    var months = monthsEndingAt(state.viewYear, state.viewMonth, 6);
    var data = months.map(function (mo) {
      var totals = monthTotals(mo.year, mo.month);
      return {
        label: MONTH_NAMES[mo.month].slice(0, 3),
        totalIn: totals.totalIn,
        totalOut: totals.totalOut,
        saldo: totals.saldo
      };
    });

    var maxVal = 1;
    data.forEach(function (d) {
      maxVal = Math.max(maxVal, d.totalIn, d.totalOut);
    });

    var width = 320, height = 190;
    var padBottom = 24, padTop = 10;
    var usableH = height - padBottom - padTop;
    var groupW = width / data.length;
    var barW = Math.min(20, groupW / 2 - 6);
    var gap = 3;

    var svgParts = [];

    svgParts.push('<line x1="0" y1="' + (height - padBottom) + '" x2="' + width + '" y2="' + (height - padBottom) + '" stroke="#e4e1da" stroke-width="1"/>');

    data.forEach(function (d, i) {
      var cx = groupW * i + groupW / 2;
      var inH = (d.totalIn / maxVal) * usableH;
      var outH = (d.totalOut / maxVal) * usableH;
      var xIn = cx - barW - gap / 2;
      var xOut = cx + gap / 2;
      var yBase = height - padBottom;

      svgParts.push('<rect x="' + xIn.toFixed(1) + '" y="' + (yBase - inH).toFixed(1) + '" width="' + barW + '" height="' + Math.max(inH, 1).toFixed(1) + '" rx="3" fill="#2f7d52"/>');
      svgParts.push('<rect x="' + xOut.toFixed(1) + '" y="' + (yBase - outH).toFixed(1) + '" width="' + barW + '" height="' + Math.max(outH, 1).toFixed(1) + '" rx="3" fill="#ab3b35"/>');
      svgParts.push('<text x="' + cx.toFixed(1) + '" y="' + (height - 6) + '" text-anchor="middle" font-size="10" font-family="Inter, sans-serif" fill="#9aa19d">' + d.label + '</text>');
    });

    document.getElementById("chart-svg").innerHTML = svgParts.join("");

    var trendEl = document.getElementById("chart-trend");
    if (data.length >= 2) {
      var last = data[data.length - 1];
      var prev = data[data.length - 2];
      var diff = last.saldo - prev.saldo;
      var arrowUp = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5m0 0l-6 6m6-6l6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var arrowDown = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14m0 0l-6-6m6 6l6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      trendEl.classList.remove("is-up", "is-down");
      if (diff > 0) {
        trendEl.classList.add("is-up");
        trendEl.innerHTML = arrowUp + formatBRL(Math.abs(diff)) + " a mais que " + monthFullLabel(months[months.length - 2]);
      } else if (diff < 0) {
        trendEl.classList.add("is-down");
        trendEl.innerHTML = arrowDown + formatBRL(Math.abs(diff)) + " a menos que " + monthFullLabel(months[months.length - 2]);
      } else {
        trendEl.textContent = "Mesmo saldo de " + monthFullLabel(months[months.length - 2]);
      }
    } else {
      trendEl.textContent = "Ainda sem mês anterior para comparar.";
    }
  }

  function monthFullLabel(mo) {
    return MONTH_NAMES[mo.month] + " de " + mo.year;
  }

  // ---------- rendering: calendário ----------

  function renderCalendar() {
    var grid = document.getElementById("calendar-grid");
    grid.innerHTML = "";

    var firstWeekday = new Date(state.viewYear, state.viewMonth, 1).getDay();
    var daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
    var today = todayISO();

    for (var i = 0; i < firstWeekday; i++) {
      var blank = document.createElement("div");
      blank.className = "calendar-cell calendar-cell--blank";
      grid.appendChild(blank);
    }

    for (var d = 1; d <= daysInMonth; d++) {
      var iso = isoFor(state.viewYear, state.viewMonth, d);
      var dayEntries = state.entries.filter(function (e) { return e.date === iso; });
      var net = dayEntries.reduce(function (sum, e) {
        return sum + (e.type === "income" ? e.amount : -e.amount);
      }, 0);

      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "calendar-cell";
      if (dayEntries.length) {
        cell.classList.add(net >= 0 ? "calendar-cell--income" : "calendar-cell--expense");
      }
      if (iso === today) cell.classList.add("calendar-cell--today");

      cell.innerHTML =
        '<span class="calendar-day-num">' + d + "</span>" +
        (dayEntries.length ? '<span class="calendar-amount">' + formatCompact(net) + "</span>" : "");

      cell.addEventListener("click", function (dateIso) {
        return function () { openDayDetail(dateIso); };
      }(iso));

      grid.appendChild(cell);
    }
  }

  function openDayDetail(iso) {
    var dayEntries = state.entries.filter(function (e) { return e.date === iso; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    if (dayEntries.length === 0) {
      openForm(null, iso);
      return;
    }

    state.activeDay = iso;
    var net = dayEntries.reduce(function (sum, e) {
      return sum + (e.type === "income" ? e.amount : -e.amount);
    }, 0);

    document.getElementById("day-title").textContent = formatGroupDate(iso);
    var totalEl = document.getElementById("day-total");
    totalEl.textContent = formatBRL(net);
    totalEl.classList.toggle("is-negative", net < 0);

    var list = document.getElementById("day-ledger");
    list.innerHTML = "";
    dayEntries.forEach(function (entry) {
      list.appendChild(createEntryRow(entry));
    });

    document.getElementById("day-overlay").hidden = false;
  }

  function closeDayDetail() {
    document.getElementById("day-overlay").hidden = true;
    state.activeDay = null;
  }

  // ---------- month picker ----------

  function openMonthPicker() {
    var grid = document.getElementById("month-grid");
    grid.innerHTML = "";
    var now = new Date();
    var cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    cursor.setMonth(cursor.getMonth() - 11);
    for (var i = 0; i < 24; i++) {
      var y = cursor.getFullYear(), m = cursor.getMonth();
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "month-cell";
      if (y === state.viewYear && m === state.viewMonth) cell.classList.add("is-active");
      cell.textContent = MONTH_NAMES[m].slice(0, 3) + " " + y;
      cell.addEventListener("click", function (yy, mm) {
        return function () {
          state.viewYear = yy;
          state.viewMonth = mm;
          closeMonthPicker();
          render();
        };
      }(y, m));
      grid.appendChild(cell);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    document.getElementById("month-overlay").hidden = false;
    requestAnimationFrame(function () {
      var active = grid.querySelector(".is-active");
      if (active) active.scrollIntoView({ block: "center" });
    });
  }

  function closeMonthPicker() {
    document.getElementById("month-overlay").hidden = true;
  }

  // ---------- entry form ----------

  function openForm(entry, prefillDate) {
    var form = document.getElementById("entry-form");
    form.reset();
    document.getElementById("entry-delete").hidden = !entry;
    document.getElementById("sheet-title").textContent = entry ? "Editar lançamento" : "Novo lançamento";
    document.getElementById("entry-submit").textContent = entry ? "Salvar alterações" : "Salvar lançamento";

    if (entry) {
      state.editingId = entry.id;
      document.getElementById("entry-id").value = entry.id;
      document.getElementById(entry.type === "income" ? "type-income" : "type-expense").checked = true;
      document.getElementById("entry-amount").value = entry.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      document.getElementById("entry-desc").value = entry.description;
      document.getElementById("entry-date").value = entry.date;
    } else {
      state.editingId = null;
      document.getElementById("entry-id").value = "";
      document.getElementById("type-income").checked = true;
      if (prefillDate) {
        document.getElementById("entry-date").value = prefillDate;
      } else {
        var isCurrentMonthView = state.viewYear === new Date().getFullYear() && state.viewMonth === new Date().getMonth();
        document.getElementById("entry-date").value = isCurrentMonthView ? todayISO() : isoFor(state.viewYear, state.viewMonth, 1);
      }
    }

    document.getElementById("sheet-overlay").hidden = false;
    setTimeout(function () {
      document.getElementById("entry-desc").focus();
    }, 50);
  }

  function closeForm() {
    document.getElementById("sheet-overlay").hidden = true;
    state.editingId = null;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    var amount = parseAmountInput(document.getElementById("entry-amount").value);
    if (!amount || amount <= 0 || isNaN(amount)) {
      document.getElementById("entry-amount").focus();
      showToast("Informe um valor válido.");
      return;
    }
    var type = document.querySelector('input[name="type"]:checked').value;
    var description = document.getElementById("entry-desc").value.trim();
    var date = document.getElementById("entry-date").value;

    if (!description || !date) return;

    if (state.editingId) {
      var existing = state.entries.find(function (e) { return e.id === state.editingId; });
      if (existing) {
        existing.type = type;
        existing.amount = amount;
        existing.description = description;
        existing.date = date;
      }
      showToast("Lançamento atualizado.");
    } else {
      state.entries.push({
        id: uid(),
        type: type,
        amount: amount,
        description: description,
        date: date,
        createdAt: Date.now()
      });
      showToast(type === "income" ? "Entrada registrada." : "Saída registrada.");
    }

    var p = entryDateParts(date);
    state.viewYear = p.y;
    state.viewMonth = p.m;

    saveEntries();
    closeForm();
    render();
  }

  function handleDelete() {
    if (!state.editingId) return;
    var id = state.editingId;
    closeForm();
    askConfirm("Excluir lançamento?", "Essa ação não pode ser desfeita.", function () {
      state.entries = state.entries.filter(function (e) { return e.id !== id; });
      saveEntries();
      render();
      showToast("Lançamento excluído.");
    });
  }

  // ---------- confirm dialog ----------

  function askConfirm(title, text, onConfirm) {
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-text").textContent = text;
    state.confirmAction = onConfirm;
    document.getElementById("confirm-overlay").hidden = false;
  }

  function closeConfirm() {
    document.getElementById("confirm-overlay").hidden = true;
    state.confirmAction = null;
  }

  // ---------- share summary as text ----------

  function buildShareText() {
    var monthName = MONTH_NAMES[state.viewMonth].toUpperCase();
    var daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
    var lines = [monthName, BUSINESS_NAME.toUpperCase(), ""];

    for (var d = 1; d <= daysInMonth; d++) {
      var iso = isoFor(state.viewYear, state.viewMonth, d);
      var dayEntries = state.entries.filter(function (e) { return e.date === iso; });
      if (dayEntries.length === 0) {
        lines.push("DIA " + d + ": R$ 0,00");
        continue;
      }
      var net = dayEntries.reduce(function (sum, e) {
        return sum + (e.type === "income" ? e.amount : -e.amount);
      }, 0);
      var descs = dayEntries.map(function (e) {
        return (e.type === "expense" ? "- " : "") + e.description;
      }).join(", ");
      lines.push("DIA " + d + ": " + formatBRL(net) + " - " + descs);
    }

    var totals = monthTotals();
    lines.push("");
    lines.push("TOTAL ENTRADAS: " + formatBRL(totals.totalIn));
    lines.push("TOTAL SAÍDAS: " + formatBRL(totals.totalOut));
    lines.push("SALDO: " + formatBRL(totals.saldo));

    return lines.join("\n");
  }

  function shareSummary() {
    closeMenu();
    var text = buildShareText();
    var title = "Resumo " + MONTH_NAMES[state.viewMonth] + " " + state.viewYear;

    if (navigator.share) {
      navigator.share({ title: title, text: text }).catch(function () {});
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast("Resumo copiado! Cole no WhatsApp.");
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
      showToast("Resumo copiado! Cole no WhatsApp.");
    } catch (e) {
      showToast("Não foi possível copiar automaticamente.");
    }
    document.body.removeChild(ta);
  }

  // ---------- menu actions ----------

  function exportData() {
    var blob = new Blob([JSON.stringify(state.entries, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var stamp = todayISO();
    a.href = url;
    a.download = "tere-telas-backup-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    closeMenu();
    showToast("Backup exportado.");
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("formato inválido");
        var valid = data.filter(function (e) {
          return e && e.id && e.date && e.description && typeof e.amount === "number" &&
                 (e.type === "income" || e.type === "expense");
        });
        var existingIds = {};
        state.entries.forEach(function (e) { existingIds[e.id] = true; });
        valid.forEach(function (e) {
          if (!existingIds[e.id]) {
            state.entries.push(e);
            existingIds[e.id] = true;
          }
        });
        saveEntries();
        render();
        showToast(valid.length + " lançamento(s) importado(s).");
      } catch (e) {
        showToast("Não foi possível ler esse arquivo.");
      }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    askConfirm("Apagar todos os lançamentos?", "Todos os dados salvos neste dispositivo serão removidos.", function () {
      state.entries = [];
      saveEntries();
      render();
      showToast("Todos os lançamentos foram apagados.");
    });
  }

  function openMenu() {
    document.getElementById("menu-sheet").hidden = false;
  }

  function closeMenu() {
    document.getElementById("menu-sheet").hidden = true;
  }

  // ---------- search ----------

  function toggleSearch() {
    var bar = document.getElementById("search-bar");
    bar.hidden = !bar.hidden;
    if (!bar.hidden) {
      document.getElementById("search-input").focus();
    } else {
      state.search = "";
      document.getElementById("search-input").value = "";
      render();
    }
  }

  // ---------- wiring ----------

  function init() {
    document.getElementById("entry-date").value = todayISO();

    document.getElementById("btn-menu").addEventListener("click", openMenu);
    document.querySelectorAll("[data-close-menu]").forEach(function (el) {
      el.addEventListener("click", closeMenu);
    });

    document.getElementById("action-share").addEventListener("click", shareSummary);
    document.getElementById("action-export").addEventListener("click", exportData);
    document.getElementById("action-import").addEventListener("click", function () {
      document.getElementById("import-input").click();
    });
    document.getElementById("import-input").addEventListener("change", function (ev) {
      var file = ev.target.files[0];
      closeMenu();
      if (file) importData(file);
      ev.target.value = "";
    });
    document.getElementById("action-clear").addEventListener("click", function () {
      closeMenu();
      clearAll();
    });

    document.getElementById("month-switch").addEventListener("click", openMonthPicker);
    document.getElementById("month-close").addEventListener("click", closeMonthPicker);
    document.querySelectorAll("[data-close-month]").forEach(function (el) {
      el.addEventListener("click", closeMonthPicker);
    });

    document.getElementById("fab").addEventListener("click", function () { openForm(null); });
    document.getElementById("sheet-close").addEventListener("click", closeForm);
    document.querySelectorAll("[data-close-sheet]").forEach(function (el) {
      el.addEventListener("click", closeForm);
    });
    document.getElementById("entry-form").addEventListener("submit", handleSubmit);
    document.getElementById("entry-delete").addEventListener("click", handleDelete);

    document.getElementById("day-close").addEventListener("click", closeDayDetail);
    document.querySelectorAll("[data-close-day]").forEach(function (el) {
      el.addEventListener("click", closeDayDetail);
    });
    document.getElementById("day-add").addEventListener("click", function () {
      var iso = state.activeDay;
      closeDayDetail();
      openForm(null, iso);
    });

    document.querySelectorAll(".segmented-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filter = btn.dataset.filter;
        renderSegmented();
        renderLedger();
      });
    });

    document.querySelectorAll(".bottom-nav-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchView(btn.dataset.tab);
      });
    });

    document.getElementById("btn-search").addEventListener("click", toggleSearch);
    document.getElementById("search-clear").addEventListener("click", toggleSearch);
    document.getElementById("search-input").addEventListener("input", function (ev) {
      state.search = ev.target.value;
      renderLedger();
    });

    document.getElementById("confirm-cancel").addEventListener("click", closeConfirm);
    document.querySelectorAll("[data-close-confirm]").forEach(function (el) {
      el.addEventListener("click", closeConfirm);
    });
    document.getElementById("confirm-ok").addEventListener("click", function () {
      var action = state.confirmAction;
      closeConfirm();
      if (action) action();
    });

    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
