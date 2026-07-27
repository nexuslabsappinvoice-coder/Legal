/* Nexus Billings — Public Quote Viewer (client-only)
 * ---------------------------------------------------
 * Reads a compressed payload from the URL fragment (`#data=…`),
 * decompresses it via lz-string, then renders the quote 100% in
 * the browser. No backend calls; the page is a plain static asset
 * hosted on GitHub Pages.
 */
(function () {
  "use strict";

  // ─── i18n (ES / EN) ────────────────────────────────────
  const STRINGS = {
    es: {
      title: "Cotización",
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
      detail: "Detalle",
      colDesc: "Descripción",
      colQty: "Cant.",
      colPrice: "Precio",
      colTotal: "Total",
      subtotal: "Subtotal",
      discount: "Descuento",
      tax: "Impuesto",
      total: "Total",
      validUntil: "Válida hasta",
      notesTitle: "Notas y términos",
      payTitle: "Métodos de pago",
      approveBtn: "Aprobar y confirmar por WhatsApp",
      pdfBtn: "Descargar PDF",
      errorTitle: "Enlace no válido",
      errorMsg: "Este enlace parece incompleto o dañado. Solicita al remitente que te envíe una copia actualizada.",
      approvalText: "Hola, acepto el presupuesto #{NUM} por {TOTAL}",
      noWhatsappSet: "El remitente no configuró un número de WhatsApp. Copia el enlace y contáctalo por otro medio.",
      quotePrefix: "Cotización",
      invalid: "No válido",
    },
    en: {
      title: "Estimate",
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
      detail: "Details",
      colDesc: "Description",
      colQty: "Qty",
      colPrice: "Price",
      colTotal: "Total",
      subtotal: "Subtotal",
      discount: "Discount",
      tax: "Tax",
      total: "Total",
      validUntil: "Valid until",
      notesTitle: "Notes & terms",
      payTitle: "Payment methods",
      approveBtn: "Approve & confirm via WhatsApp",
      pdfBtn: "Download PDF",
      errorTitle: "Invalid link",
      errorMsg: "This link seems incomplete or corrupted. Please ask the sender for an updated copy.",
      approvalText: "Hi, I accept estimate #{NUM} for {TOTAL}",
      noWhatsappSet: "The sender didn't configure a WhatsApp number. Copy the link and reach out another way.",
      quotePrefix: "Estimate",
      invalid: "Invalid",
    },
  };

  let T = STRINGS.es; // will be swapped based on payload

  // ─── DOM helpers ───────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const show = (id) => $(id).classList.remove("hidden");
  const hide = (id) => $(id).classList.add("hidden");
  const setText = (id, value) => { const el = $(id); if (el) el.textContent = value == null ? "" : String(value); };
  const setHTML = (id, value) => { const el = $(id); if (el) el.innerHTML = value == null ? "" : String(value); };

  // ─── Formatting ────────────────────────────────────────
  function money(amount, currency) {
    const n = Number(amount || 0);
    const cur = (currency || "USD").toUpperCase();
    try {
      return new Intl.NumberFormat(T === STRINGS.es ? "es-US" : "en-US", {
        style: "currency",
        currency: cur,
        maximumFractionDigits: 2,
      }).format(n);
    } catch (_e) {
      return `$${n.toFixed(2)}`;
    }
  }

  function formatQty(q, kind, itemType) {
    const n = Number(q || 0);
    if (kind === "retail") return String(Math.round(n));
    // Show as integer when it's clean, otherwise 2 decimals
    return n % 1 === 0 ? String(n) : n.toFixed(2);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ─── Payload decode ────────────────────────────────────
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

  // ─── Render ────────────────────────────────────────────
  function renderStatusChip(status) {
    const key = "docStatus" + (String(status || "draft").charAt(0).toUpperCase() + String(status || "draft").slice(1));
    return T[key] || T.docStatusDraft;
  }

  function render(p) {
    // Language
    T = p.lang === "en" ? STRINGS.en : STRINGS.es;
    document.documentElement.lang = p.lang === "en" ? "en" : "es";

    // Business branding
    if (p.biz) {
      setText("biz-name", p.biz.name || "Nexus Billings");
      setText("biz-tagline", p.biz.tagline || "");
      setText("biz-footer-name", p.biz.name || "Nexus Billings");
      const contactParts = [p.biz.phone, p.biz.email].filter(Boolean).join("  ·  ");
      setText("biz-footer-contact", contactParts);
      if (p.biz.logo) {
        const img = $("biz-logo");
        img.src = p.biz.logo;
        img.classList.remove("hidden");
        img.alt = p.biz.name || "";
      }
      // Apply brand colour override
      if (p.biz.brand && typeof p.biz.brand === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(p.biz.brand)) {
        document.documentElement.style.setProperty("--brand", p.biz.brand);
        // Compute a lighter shade for --brand-2 (fallback: same)
        document.documentElement.style.setProperty("--brand-2", p.biz.brand);
      }
    }

    // Doc header
    const doc = p.doc || {};
    setText("doc-number", doc.number || "—");
    setText("doc-date", doc.date || "");
    setText("doc-status", renderStatusChip(doc.status));
    if (doc.valid_until) {
      show("doc-valid");
      setText("doc-valid-date", doc.valid_until);
    }

    // Update <title>
    const num = doc.number || "";
    document.title = `${T.quotePrefix} ${num} — ${p.biz?.name || "Nexus Billings"}`;

    // Update section labels (i18n)
    setText("sum-tax-label", T.tax);

    // Client
    const cl = p.client || {};
    setText("cl-name", cl.name || "—");
    const addrParts = [cl.address, [cl.city, cl.state, cl.zip].filter(Boolean).join(", ")].filter(Boolean);
    setText("cl-address", addrParts.join(" · ") || "—");
    setText("cl-phone", cl.phone || "—");
    setText("cl-email", cl.email || "—");

    // Items
    const items = Array.isArray(p.items) ? p.items : [];
    const rows = items.map((it) => {
      const qtyLabel = formatQty(it.q, doc.kind, it.type);
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

    // Totals
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
      }
      setText("sum-tax", money(tot.tax, tot.currency));
    } else {
      hide("sum-tax-row");
    }
    setText("sum-total", money(tot.total, tot.currency));
    setText("doc-total", money(tot.total, tot.currency));

    // Notes / terms
    const notes = [doc.notes, doc.terms].filter(Boolean).join("\n\n").trim();
    if (notes) {
      show("notes-card");
      setText("notes-text", notes);
    }

    // Payment methods
    const pay = p.pay || {};
    const payRows = [
      ["Zelle", pay.zelle],
      ["Venmo", pay.venmo],
      ["Cash App", pay.cashapp],
      ["PayPal", pay.paypal],
    ].filter(([, v]) => v && String(v).trim());
    if (payRows.length) {
      show("pay-card");
      $("pay-list").innerHTML = payRows.map(([k, v]) =>
        `<div class="pay-row"><span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span></div>`
      ).join("");
    }

    // Localise CTA buttons
    $("btn-approve").lastChild.nodeValue = " " + T.approveBtn;
    $("btn-pdf").lastChild.nodeValue = " " + T.pdfBtn;

    // Wire actions (attach after render so payload closure is fresh)
    $("btn-approve").addEventListener("click", () => onApprove(p));
    $("btn-pdf").addEventListener("click", () => onDownloadPdf(p));

    // Reveal
    hide("loading");
    show("viewer");
  }

  // ─── Actions ───────────────────────────────────────────
  function normalizeWaNumber(raw) {
    if (!raw) return "";
    // Strip everything except digits and leading +
    let s = String(raw).trim();
    const hasPlus = s.startsWith("+");
    s = s.replace(/[^\d]/g, "");
    return (hasPlus ? "" : "") + s; // wa.me expects digits only, no +
  }

  function onApprove(p) {
    const wa = normalizeWaNumber(p.biz?.phone || p.wa || "");
    const num = p.doc?.number || "";
    const total = money(p.totals?.total, p.totals?.currency);
    const text = T.approvalText.replace("{NUM}", num).replace("{TOTAL}", total);
    if (!wa) {
      alert(T.noWhatsappSet);
      return;
    }
    const encoded = encodeURIComponent(text);
    const url = `https://wa.me/${wa}?text=${encoded}`;
    // On mobile, open in same tab so the WhatsApp app takes over
    // deep-linking gracefully. On desktop, opens web.whatsapp.com.
    window.open(url, "_blank", "noopener");
  }

  // ─── PDF generation (jsPDF + autotable) ────────────────
  function onDownloadPdf(p) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 40;
      let cursorY = margin;

      const brand = p.biz?.brand || "#EA580C";
      const cur = p.totals?.currency || "USD";

      // ─── Header (business info + doc number) ───
      // Logo on the left, business info centre, doc badge on the right.
      const logo = p.biz?.logo;
      if (logo && typeof logo === "string" && logo.startsWith("data:image/")) {
        try {
          const ext = logo.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(logo, ext, margin, cursorY, 60, 60, undefined, "FAST");
        } catch (_e) { /* ignore bad logo */ }
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

      // Right side: quote number & date
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(brand);
      const title = T.quotePrefix.toUpperCase();
      doc.text(title, pageW - margin, cursorY + 22, { align: "right" });
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

      // Divider
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.5);
      doc.line(margin, cursorY, pageW - margin, cursorY);
      cursorY += 18;

      // ─── Client block ───
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
        cl.name,
        cl.address,
        [cl.city, cl.state, cl.zip].filter(Boolean).join(", "),
        cl.phone,
        cl.email,
      ].filter(Boolean);
      clLines.forEach((line) => { doc.text(String(line), margin, cursorY); cursorY += 13; });
      cursorY += 8;

      // ─── Items table ───
      const items = Array.isArray(p.items) ? p.items : [];
      const body = items.map((it) => [
        (it.d || "") + (it.type ? `\n(${it.type})` : ""),
        formatQty(it.q, p.doc?.kind, it.type),
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

      // ─── Totals ───
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
      // Total (highlighted)
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

      // ─── Notes ───
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

      // ─── Footer ───
      const footerY = doc.internal.pageSize.getHeight() - 30;
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, footerY - 12, pageW - margin, footerY - 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Generated with Nexus Billings — voice-coder.github.io", pageW / 2, footerY, { align: "center" });

      // Save
      const filename = `${T.quotePrefix}-${(p.doc?.number || "quote").replace(/[^\w.-]+/g, "_")}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error("[quote-viewer] PDF generation failed", err);
      alert("No pudimos generar el PDF. Intenta nuevamente.");
    }
  }

  // ─── Bootstrap ─────────────────────────────────────────
  function showError(msg) {
    hide("loading");
    if (msg) setText("error-msg", msg);
    show("error");
  }

  window.addEventListener("DOMContentLoaded", () => {
    const payload = readPayload();
    if (!payload) {
      showError();
      return;
    }
    if (payload.v !== 1) {
      showError();
      return;
    }
    try {
      render(payload);
    } catch (e) {
      console.error("[quote-viewer] Render failed", e);
      showError();
    }
  });
})();

