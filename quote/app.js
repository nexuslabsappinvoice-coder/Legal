/* Nexus Billings — Public Quote Viewer (client-only)
 * ═══════════════════════════════════════════════════════
 * Reads a compressed payload from the URL fragment (`#data=…`),
 * decompresses it via lz-string, then renders the quote 100 % in
 * the browser. No backend calls; the page is a plain static asset
 * hosted on GitHub Pages.
 *
 * Response mechanism (Accept / Decline):
 *   The Accept and Decline buttons open a bottom-sheet with three
 *   channels — WhatsApp, SMS and Copy-to-clipboard. Each generates a
 *   pre-filled message that contains:
 *     1) A human-readable line ("✅ ACEPTO cotización EST-123…")
 *     2) A deep link back to the Nexus Billings app of the sender
 *        (`nexusbillings://quote-response?…`) so tapping it opens
 *        the app and auto-updates the estimate status.
 */
(function () {
  "use strict";

  // ─── i18n (ES / EN) ────────────────────────────────────
  const STRINGS = {
    es: {
      docStatusDraft: "Borrador",
      docStatusSent: "Enviada",
      docStatusAccepted: "Aceptada",
      docStatusRejected: "Rechazada",
      docStatusConverted: "Convertida",
      client: "Cliente",
      name: "Nombre",
      address: "Dirección",
      phone: "Teléfono",
      email: "Email",
      colDesc: "Descripción", colQty: "Cant.", colPrice: "Precio", colTotal: "Total",
      subtotal: "Subtotal", discount: "Descuento", tax: "Impuesto", total: "Total",
      validUntil: "Válida hasta",
      notesTitle: "Notas y términos", payTitle: "Métodos de pago",
      pdfBtn: "PDF",
      acceptBtn: "Aceptar", declineBtn: "Declinar",
      modalTitleAccept: "Confirmar aceptación",
      modalTitleDecline: "Rechazar cotización",
      modalSubAccept: "Envía tu confirmación al remitente. Elige el canal:",
      modalSubDecline: "Puedes añadir un motivo (opcional) y elegir el canal:",
      reasonLabel: "Motivo (opcional)",
      reasonPlaceholder: "Ej: Precio fuera de presupuesto",
      cancel: "Cancelar",
      channelWa: "WhatsApp", channelWaSub: "Enviar por WhatsApp",
      channelSms: "SMS", channelSmsSub: "Enviar por mensaje",
      channelCopy: "Copiar mensaje", channelCopySub: "Al portapapeles",
      channelUnavailable: "El remitente no configuró este canal en su app.",
      copied: "Mensaje copiado ✓",
      acceptText: "✅ ACEPTO la cotización {NUM} por {TOTAL}.",
      declineText: "❌ RECHAZO la cotización {NUM} por {TOTAL}.",
      reasonPrefix: "Motivo:",
      appLinkNote: "▶ Actualizar en la app:",
      errorTitle: "Enlace no válido",
      errorMsg: "Este enlace parece incompleto o dañado. Solicita al remitente que te envíe una copia actualizada.",
      pdfError: "No pudimos generar el PDF. Intenta nuevamente.",
      quotePrefix: "Cotización",
    },
    en: {
      docStatusDraft: "Draft",
      docStatusSent: "Sent",
      docStatusAccepted: "Accepted",
      docStatusRejected: "Rejected",
      docStatusConverted: "Converted",
      client: "Client",
      name: "Name",
      address: "Address",
      phone: "Phone",
      email: "Email",
      colDesc: "Description", colQty: "Qty", colPrice: "Price", colTotal: "Total",
      subtotal: "Subtotal", discount: "Discount", tax: "Tax", total: "Total",
      validUntil: "Valid until",
      notesTitle: "Notes & terms", payTitle: "Payment methods",
      pdfBtn: "PDF",
      acceptBtn: "Accept", declineBtn: "Decline",
      modalTitleAccept: "Confirm acceptance",
      modalTitleDecline: "Decline estimate",
      modalSubAccept: "Send your confirmation to the sender. Choose a channel:",
      modalSubDecline: "You may add a reason (optional) and choose a channel:",
      reasonLabel: "Reason (optional)",
      reasonPlaceholder: "e.g. Out of budget",
      cancel: "Cancel",
      channelWa: "WhatsApp", channelWaSub: "Send via WhatsApp",
      channelSms: "SMS", channelSmsSub: "Send via message",
      channelCopy: "Copy message", channelCopySub: "To clipboard",
      channelUnavailable: "The sender didn't set up this channel in their app.",
      copied: "Message copied ✓",
      acceptText: "✅ I ACCEPT estimate {NUM} for {TOTAL}.",
      declineText: "❌ I DECLINE estimate {NUM} for {TOTAL}.",
      reasonPrefix: "Reason:",
      appLinkNote: "▶ Update in the app:",
      errorTitle: "Invalid link",
      errorMsg: "This link seems incomplete or corrupted. Please ask the sender for an updated copy.",
      pdfError: "Couldn't generate PDF. Please try again.",
      quotePrefix: "Estimate",
    },
  };

  let T = STRINGS.es;
  let currentPayload = null;
  let currentAction = "accepted";

  const $ = (id) => document.getElementById(id);
  const show = (id) => $(id) && $(id).classList.remove("hidden");
  const hide = (id) => $(id) && $(id).classList.add("hidden");
  const setText = (id, value) => { const el = $(id); if (el) el.textContent = value == null ? "" : String(value); };
  const setHTML = (id, value) => { const el = $(id); if (el) el.innerHTML = value == null ? "" : String(value); };

  function money(amount, currency) {
    const n = Number(amount || 0);
    const cur = (currency || "USD").toUpperCase();
    try {
      return new Intl.NumberFormat(T === STRINGS.es ? "es-US" : "en-US", {
        style: "currency", currency: cur, maximumFractionDigits: 2,
      }).format(n);
    } catch (_e) { return `$${n.toFixed(2)}`; }
  }
  function formatQty(q, kind) {
    const n = Number(q || 0);
    if (kind === "retail") return String(Math.round(n));
    return n % 1 === 0 ? String(n) : n.toFixed(2);
  }
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function readPayload() {
    const hash = window.location.hash || "";
    const m = hash.match(/#(?:.*&)?data=([^&]+)/);
    if (!m || !m[1]) return null;
    try {
      const decompressed = LZString.decompressFromEncodedURIComponent(m[1]);
      if (!decompressed) return null;
      const obj = JSON.parse(decompressed);
      if (!obj || typeof obj !== "object") return null;
      return obj;
    } catch (e) {
      console.error("[quote-viewer] Failed to decode payload", e);
      return null;
    }
  }

  function renderStatusChip(status) {
    const key = "docStatus" + (String(status || "draft").charAt(0).toUpperCase() + String(status || "draft").slice(1));
    return T[key] || T.docStatusDraft;
  }

  function renderClient(cl) {
    const rows = [];
    if (cl?.name) rows.push([T.name, cl.name]);
    const addrParts = [cl?.address, [cl?.city, cl?.state, cl?.zip].filter(Boolean).join(", ")].filter(Boolean);
    const address = addrParts.join(" · ");
    if (address) rows.push([T.address, address]);
    if (cl?.phone) rows.push([T.phone, cl.phone]);
    if (cl?.email) rows.push([T.email, cl.email]);

    if (rows.length === 0) { hide("client-card"); return; }
    show("client-card");
    $("client-kv").innerHTML = rows.map(([k, v]) =>
      `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`
    ).join("");
  }

  function render(p) {
    currentPayload = p;
    T = p.lang === "en" ? STRINGS.en : STRINGS.es;
    document.documentElement.lang = p.lang === "en" ? "en" : "es";

    if (p.biz) {
      setText("biz-name", p.biz.name || "Nexus Billings");
      setText("biz-tagline", p.biz.tagline || "");
      setText("biz-footer-name", p.biz.name || "Nexus Billings");
      setText("biz-footer-contact", [p.biz.phone, p.biz.email].filter(Boolean).join("  ·  "));
      if (p.biz.logo) {
        const img = $("biz-logo");
        img.src = p.biz.logo;
        img.classList.remove("hidden");
        img.alt = p.biz.name || "";
      }
      if (p.biz.brand && typeof p.biz.brand === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(p.biz.brand)) {
        document.documentElement.style.setProperty("--brand", p.biz.brand);
        document.documentElement.style.setProperty("--brand-2", p.biz.brand);
      }
    }

    const doc = p.doc || {};
    setText("doc-number", doc.number || "—");
    setText("doc-date", doc.date || "");
    setText("doc-status", renderStatusChip(doc.status));
    if (doc.valid_until) {
      show("doc-valid");
      setText("doc-valid-date", doc.valid_until);
    }

    document.title = `${T.quotePrefix} ${doc.number || ""} — ${p.biz?.name || "Nexus Billings"}`;

    renderClient(p.client || {});

    const items = Array.isArray(p.items) ? p.items : [];
    const rows = items.map((it) => {
      const qtyLabel = formatQty(it.q, doc.kind);
      const typeTag = it.type ? `<div class="item-desc-sub">${escapeHtml(it.type)}</div>` : "";
      return `
        <tr>
          <td class="col-desc">
            <div class="item-desc-main">${escapeHtml(it.d || "—")}</div>
            ${typeTag}
          </td>
          <td class="col-qty">${qtyLabel}</td>
          <td class="col-price">${money(it.p, p.totals?.currency)}</td>
          <td class="col-total">${money(it.t, p.totals?.currency)}</td>
        </tr>`;
    }).join("");
    setHTML("items-body", rows || `<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:20px">—</td></tr>`);

    const tot = p.totals || {};
    setText("sum-sub", money(tot.subtotal, tot.currency));
    if (Number(tot.discount || 0) > 0) {
      show("sum-discount-row");
      setText("sum-discount", "−" + money(tot.discount, tot.currency));
    }
    if (Number(tot.tax || 0) > 0) {
      const pct = Number(tot.tax_rate || 0) * 100;
      if (pct > 0) {
        const pctLabel = pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
        setText("sum-tax-label", `${T.tax} (${pctLabel}%)`);
      } else {
        setText("sum-tax-label", T.tax);
      }
      setText("sum-tax", money(tot.tax, tot.currency));
    } else {
      hide("sum-tax-row");
    }
    setText("sum-total", money(tot.total, tot.currency));
    setText("doc-total", money(tot.total, tot.currency));

    const notes = [doc.notes, doc.terms].filter(Boolean).join("\n\n").trim();
    if (notes) {
      show("notes-card");
      setText("notes-text", notes);
    }

    const pay = p.pay || {};
    const payRows = [
      ["Zelle", pay.zelle], ["Venmo", pay.venmo],
      ["Cash App", pay.cashapp], ["PayPal", pay.paypal],
    ].filter(([, v]) => v && String(v).trim());
    if (payRows.length) {
      show("pay-card");
      $("pay-list").innerHTML = payRows.map(([k, v]) =>
        `<div class="pay-row"><span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span></div>`
      ).join("");
    }

    $("btn-accept").querySelector("span").textContent = T.acceptBtn;
    $("btn-decline").querySelector("span").textContent = T.declineBtn;
    $("modal-cancel").textContent = T.cancel;
    $("reason-input").placeholder = T.reasonPlaceholder;
    setText("channel-wa-sub", T.channelWaSub);
    setText("channel-sms-sub", T.channelSmsSub);

    document.querySelector("#channel-wa .channel-title").textContent = T.channelWa;
    document.querySelector("#channel-sms .channel-title").textContent = T.channelSms;
    document.querySelector("#channel-copy .channel-title").textContent = T.channelCopy;
    document.querySelector("#channel-copy .channel-sub").textContent = T.channelCopySub;

    $("btn-accept").addEventListener("click", () => openResponseModal("accepted"));
    $("btn-decline").addEventListener("click", () => openResponseModal("declined"));
    $("btn-pdf").addEventListener("click", () => onDownloadPdf(p));
    $("modal-cancel").addEventListener("click", closeResponseModal);
    $("modal-backdrop").addEventListener("click", closeResponseModal);
    $("channel-wa").addEventListener("click", () => sendVia("wa"));
    $("channel-sms").addEventListener("click", () => sendVia("sms"));
    $("channel-copy").addEventListener("click", () => sendVia("copy"));

    hide("loading");
    show("viewer");
    show("action-bar");
  }

  function openResponseModal(action) {
    currentAction = action;
    setText("modal-title", action === "accepted" ? T.modalTitleAccept : T.modalTitleDecline);
    setText("modal-sub", action === "accepted" ? T.modalSubAccept : T.modalSubDecline);

    if (action === "declined") {
      show("reason-wrap");
      $("reason-wrap").querySelector(".reason-label").textContent = T.reasonLabel;
      $("reason-input").value = "";
    } else {
      hide("reason-wrap");
    }
    show("response-modal");
    if (action === "declined") setTimeout(() => $("reason-input")?.focus(), 260);
  }

  function closeResponseModal() {
    hide("response-modal");
  }

  function normalizePhone(raw) {
    if (!raw) return "";
    return String(raw).trim().replace(/[^\d]/g, "");
  }

  function buildResponseMessage() {
    const p = currentPayload || {};
    const num = p.doc?.number || "";
    const total = money(p.totals?.total, p.totals?.currency);
    const tpl = currentAction === "accepted" ? T.acceptText : T.declineText;
    let msg = tpl.replace("{NUM}", num).replace("{TOTAL}", total);
    const reason = ($("reason-input")?.value || "").trim();
    if (currentAction === "declined" && reason) {
      msg += `\n${T.reasonPrefix} ${reason}`;
    }
    const deepLink = buildDeepLink(reason);
    if (deepLink) {
      msg += `\n\n${T.appLinkNote}\n${deepLink}`;
    }
    return msg;
  }

  function buildDeepLink(reason) {
    const p = currentPayload || {};
    const id = p.doc?.id || "";
    const num = p.doc?.number || "";
    if (!id && !num) return "";
    const params = new URLSearchParams();
    if (id) params.set("id", id);
    if (num) params.set("num", num);
    params.set("action", currentAction);
    if (reason) params.set("reason", reason.substring(0, 200));
    return `nexusbillings://quote-response?${params.toString()}`;
  }

  function sendVia(channel) {
    const p = currentPayload || {};
    const message = buildResponseMessage();

    if (channel === "copy") {
      navigator.clipboard.writeText(message).then(() => {
        showToast(T.copied);
        closeResponseModal();
      }).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = message;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (_e) {}
        document.body.removeChild(ta);
        showToast(T.copied);
        closeResponseModal();
      });
      return;
    }

    const wa = normalizePhone(p.contact?.wa || p.biz?.phone || "");
    const sms = normalizePhone(p.contact?.sms || p.biz?.phone || "");
    let url = "";
    if (channel === "wa") {
      if (!wa) { alert(T.channelUnavailable); return; }
      url = `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
    } else if (channel === "sms") {
      if (!sms) { alert(T.channelUnavailable); return; }
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const sep = isIOS ? "&" : "?";
      url = `sms:${sms}${sep}body=${encodeURIComponent(message)}`;
    }
    if (url) {
      closeResponseModal();
      window.open(url, "_blank", "noopener");
    }
  }

  function showToast(text) {
    const el = $("toast");
    el.textContent = text;
    el.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  function onDownloadPdf(p) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 40;
      let cursorY = margin;

      const brand = p.biz?.brand || "#EA580C";
      const cur = p.totals?.currency || "USD";

      const logo = p.biz?.logo;
      if (logo && typeof logo === "string" && logo.startsWith("data:image/")) {
        try {
          const ext = logo.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(logo, ext, margin, cursorY, 60, 60, undefined, "FAST");
        } catch (_e) {}
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(30, 30, 30);
      doc.text(p.biz?.name || "Nexus Billings", margin + 72, cursorY + 22);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      let by = cursorY + 38;
      if (p.biz?.address) { doc.text(String(p.biz.address), margin + 72, by); by += 12; }
      const contactLine = [p.biz?.phone, p.biz?.email].filter(Boolean).join("  ·  ");
      if (contactLine) { doc.text(contactLine, margin + 72, by); by += 12; }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(brand);
      doc.text(T.quotePrefix.toUpperCase(), pageW - margin, cursorY + 22, { align: "right" });
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text(`#${p.doc?.number || ""}`, pageW - margin, cursorY + 40, { align: "right" });
      if (p.doc?.date) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(p.doc.date, pageW - margin, cursorY + 54, { align: "right" });
      }
      if (p.doc?.valid_until) {
        doc.text(`${T.validUntil}: ${p.doc.valid_until}`, pageW - margin, cursorY + 66, { align: "right" });
      }

      cursorY = Math.max(cursorY + 88, by + 6);

      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.5);
      doc.line(margin, cursorY, pageW - margin, cursorY);
      cursorY += 18;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(brand);
      doc.text(T.client.toUpperCase(), margin, cursorY);
      cursorY += 12;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      const cl = p.client || {};
      const clLines = [
        cl.name, cl.address,
        [cl.city, cl.state, cl.zip].filter(Boolean).join(", "),
        cl.phone, cl.email,
      ].filter(Boolean);
      clLines.forEach((line) => { doc.text(String(line), margin, cursorY); cursorY += 13; });
      cursorY += 8;

      const items = Array.isArray(p.items) ? p.items : [];
      const body = items.map((it) => [
        (it.d || "") + (it.type ? `\n(${it.type})` : ""),
        formatQty(it.q, p.doc?.kind),
        money(it.p, cur),
        money(it.t, cur),
      ]);
      doc.autoTable({
        startY: cursorY,
        head: [[T.colDesc, T.colQty, T.colPrice, T.colTotal]],
        body: body.length ? body : [["—", "", "", ""]],
        margin: { left: margin, right: margin },
        theme: "grid",
        styles: { fontSize: 10, cellPadding: 6, textColor: [40, 40, 40] },
        headStyles: { fillColor: brand, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
        columnStyles: {
          0: { cellWidth: "auto" },
          1: { cellWidth: 50, halign: "right" },
          2: { cellWidth: 80, halign: "right" },
          3: { cellWidth: 80, halign: "right", fontStyle: "bold" },
        },
      });
      cursorY = doc.lastAutoTable.finalY + 14;

      const tot = p.totals || {};
      const rightX = pageW - margin;
      const labelX = pageW - margin - 130;
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      doc.text(T.subtotal, labelX, cursorY);
      doc.setTextColor(30, 30, 30);
      doc.text(money(tot.subtotal, cur), rightX, cursorY, { align: "right" });
      cursorY += 14;
      if (Number(tot.discount || 0) > 0) {
        doc.setTextColor(90, 90, 90);
        doc.text(T.discount, labelX, cursorY);
        doc.setTextColor(200, 60, 60);
        doc.text("-" + money(tot.discount, cur), rightX, cursorY, { align: "right" });
        cursorY += 14;
      }
      if (Number(tot.tax || 0) > 0) {
        const pct = Number(tot.tax_rate || 0) * 100;
        const pctLabel = pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2);
        doc.setTextColor(90, 90, 90);
        doc.text(`${T.tax} (${pctLabel}%)`, labelX, cursorY);
        doc.setTextColor(30, 30, 30);
        doc.text(money(tot.tax, cur), rightX, cursorY, { align: "right" });
        cursorY += 14;
      }
      doc.setDrawColor(30, 30, 30);
      doc.setLineWidth(0.8);
      doc.line(labelX, cursorY - 2, rightX, cursorY - 2);
      cursorY += 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(30, 30, 30);
      doc.text(T.total.toUpperCase(), labelX, cursorY);
      doc.setTextColor(brand);
      doc.text(money(tot.total, cur), rightX, cursorY, { align: "right" });
      cursorY += 22;

      const notes = [p.doc?.notes, p.doc?.terms].filter(Boolean).join("\n\n").trim();
      if (notes) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(brand);
        doc.text(T.notesTitle.toUpperCase(), margin, cursorY);
        cursorY += 12;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        const wrapped = doc.splitTextToSize(notes, pageW - margin * 2);
        doc.text(wrapped, margin, cursorY);
        cursorY += wrapped.length * 12 + 6;
      }

      const footerY = doc.internal.pageSize.getHeight() - 30;
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, footerY - 12, pageW - margin, footerY - 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Generated with Nexus Billings", pageW / 2, footerY, { align: "center" });

      const filename = `${T.quotePrefix}-${(p.doc?.number || "quote").replace(/[^\w.-]+/g, "_")}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error("[quote-viewer] PDF generation failed", err);
      alert(T.pdfError);
    }
  }

  function showError(msg) {
    hide("loading");
    if (msg) setText("error-msg", msg);
    show("error");
  }

  window.addEventListener("DOMContentLoaded", () => {
    const payload = readPayload();
    if (!payload) { showError(); return; }
    if (payload.v !== 1) { showError(); return; }
    try { render(payload); }
    catch (e) {
      console.error("[quote-viewer] Render failed", e);
      showError();
    }
  });
})();
