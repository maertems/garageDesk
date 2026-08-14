"""Billing PDF generation — Lots G and I.

Generates professional A4 PDFs using reportlab (pure Python, no system deps).
Standard Helvetica font covers Latin-1 (all French characters included).

Public API:
  generate_invoice_pdf(inv, lines, logo)     → bytes
  generate_credit_note_pdf(cn, lines, logo)  → bytes
"""

import io
import json as _json

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader

PAGE_W, PAGE_H = A4
ML = 20 * mm   # margin left
MR = 20 * mm   # margin right
MT = 20 * mm   # margin top
MB = 25 * mm   # margin bottom
CW = PAGE_W - ML - MR  # content width

BLUE = colors.HexColor("#1E3A5F")
GRAY_BG = colors.HexColor("#F5F5F5")
GRAY_LINE = colors.HexColor("#CCCCCC")
GRAY_TXT = colors.HexColor("#333333")
GRAY_MUTED = colors.HexColor("#888888")

# Column definitions: (key, x_offset_mm, width_mm, h_align)
_COLS = [
    ("num",       0,    7,  "center"),
    ("label",     7,   63,  "left"),
    ("qty",      70,   13,  "right"),
    ("unit",     83,   11,  "center"),
    ("price",    94,   22,  "right"),
    ("disc",    116,   14,  "right"),
    ("vat",     130,   14,  "right"),
    ("total_ht",144,   26,  "right"),
]
_COL = {k: (x * mm, w * mm, a) for k, x, w, a in _COLS}
_HEADERS = {
    "num": "#", "label": "Désignation", "qty": "Qté", "unit": "U.",
    "price": "P.U. HT", "disc": "Remise", "vat": "TVA", "total_ht": "Total HT",
}


# ── helpers ───────────────────────────────────────────────────────────────────

def _s(v, default: str = "") -> str:
    return default if v is None else str(v)


def _eur(v) -> str:
    return f"{float(v or 0):.2f}".replace(".", ",") + " €"


def _pct(v) -> str:
    return f"{float(v or 0):.1f}".replace(".", ",") + " %"


def _date(v) -> str:
    if not v:
        return ""
    s = str(v)[:10]
    try:
        y, m, d = s.split("-")
        return f"{d}/{m}/{y}"
    except Exception:
        return s


def _wrap(c: canvas.Canvas, text: str, font: str, size: float, max_w: float) -> list[str]:
    """Split text into lines that fit within max_w."""
    words = str(text).split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        if c.stringWidth(test, font, size) <= max_w:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


# ── Logo ──────────────────────────────────────────────────────────────────────
# Cadre FIXE : quel que soit le fichier fourni, l'encombrement sur le document est
# le même, donc la mise en page reste prévisible. 40 × 15 mm est dimensionné par
# la contrainte la plus serrée — le bandeau du contrat de prêt ne fait que 21 mm
# de haut, et sa mise en page tient tout juste sur une page.
LOGO_BOX_W = 40 * mm
LOGO_BOX_H = 15 * mm
_LOGO_PAD = 1.5 * mm


def draw_logo(c: canvas.Canvas, logo: bytes | None, right_x: float, center_y: float) -> None:
    """Dessine le logo dans le cadre fixe, bord droit sur `right_x`.

    L'image est redimensionnée pour tenir DANS le cadre en conservant ses
    proportions — jamais déformée — puis centrée. La marge intérieure de 1,5 mm
    laisse 37 × 12 mm utiles : un logo carré occupe donc 12 × 12 mm, un logo au
    format 300 × 80 occupe 37 × 9,9 mm (valeurs mesurées).

    Taille de fichier conseillée à l'utilisateur (écran de réglage) : 440 × 140 px
    pour un logo allongé, soit 300 dpi sur les 37 × 12 mm utiles. Le dpi inscrit
    dans le fichier est sans effet ici — seul le nombre de pixels compte, puisque
    l'image est redimensionnée au cadre. Ces valeurs et celles de
    CompanyLogoSection.tsx doivent rester d'accord.

    Une plaque blanche est posée sous l'image : les bandeaux sont bleu foncé ou
    rouge, où un logo sombre ou opaque serait illisible. Elle donne le même rendu
    quel que soit le fichier, avec ou sans couche de transparence.

    Ne dessine rien si `logo` est None : le document reste alors exactement ce
    qu'il était avant l'ajout de cette fonctionnalité.
    """
    if not logo:
        return
    try:
        img = ImageReader(io.BytesIO(logo))
        iw, ih = img.getSize()
    except Exception:
        # Fichier illisible (corrompu, format inattendu malgré le contrôle à
        # l'upload) : on imprime le document sans logo plutôt que de faire échouer
        # toute la génération — une facture doit sortir.
        return
    if not iw or not ih:
        return

    box_x = right_x - LOGO_BOX_W
    box_y = center_y - LOGO_BOX_H / 2

    c.setFillColor(colors.white)
    c.roundRect(box_x, box_y, LOGO_BOX_W, LOGO_BOX_H, 1.2 * mm, fill=1, stroke=0)

    scale = min((LOGO_BOX_W - 2 * _LOGO_PAD) / iw, (LOGO_BOX_H - 2 * _LOGO_PAD) / ih)
    w, h = iw * scale, ih * scale
    c.drawImage(
        img, box_x + (LOGO_BOX_W - w) / 2, box_y + (LOGO_BOX_H - h) / 2,
        width=w, height=h, mask="auto",
    )


class _State:
    """Tracks y cursor and handles page breaks."""

    def __init__(self, c: canvas.Canvas):
        self.c = c
        self.y = PAGE_H - MT

    def need(self, h: float) -> None:
        if self.y - h < MB:
            self.c.showPage()
            self.y = PAGE_H - MT

    def move(self, dy: float) -> None:
        self.y -= dy

    def hrule(self, stroke_color=GRAY_LINE, lw: float = 0.4) -> None:
        self.c.setStrokeColor(stroke_color)
        self.c.setLineWidth(lw)
        self.c.line(ML, self.y, PAGE_W - MR, self.y)

    def text(self, x: float, txt: str, font: str = "Helvetica",
             size: float = 9, color=GRAY_TXT, align: str = "left") -> None:
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        if align == "right":
            self.c.drawRightString(x, self.y, txt)
        elif align == "center":
            self.c.drawCentredString(x, self.y, txt)
        else:
            self.c.drawString(x, self.y, txt)

    def cell(self, key: str, txt: str, row_y: float) -> None:
        x_off, w, align = _COL[key]
        x = ML + x_off
        yy = row_y - 5 * mm
        self.c.setFont("Helvetica", 8)
        self.c.setFillColor(GRAY_TXT)
        if align == "right":
            self.c.drawRightString(x + w - 1 * mm, yy, txt)
        elif align == "center":
            self.c.drawCentredString(x + w / 2, yy, txt)
        else:
            self.c.drawString(x + 1 * mm, yy, txt)


# ── main entry point ──────────────────────────────────────────────────────────

def generate_invoice_pdf(inv: dict, lines: list[dict], logo: bytes | None = None) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    s = _State(c)

    # ── Blue header bar ───────────────────────────────────────────────────────
    c.setFillColor(BLUE)
    c.rect(0, PAGE_H - 32 * mm, PAGE_W, 32 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)

    c.setFont("Helvetica-Bold", 22)
    c.drawString(ML, PAGE_H - 14 * mm, "FACTURE")

    # Numéro et dates passés à gauche sous le titre : la droite du bandeau revient
    # au logo. Les deux dates tiennent sur une seule ligne, faute de hauteur pour
    # une troisième.
    c.setFont("Helvetica-Bold", 11)
    c.drawString(ML, PAGE_H - 21 * mm, _s(inv.get("invoiceNumber")))
    c.setFont("Helvetica", 8.5)
    dates = f"Émise le {_date(inv.get('issuedAt'))}"
    if inv.get("serviceDate"):
        dates += f"   ·   Prestation : {_date(inv.get('serviceDate'))}"
    c.drawString(ML, PAGE_H - 27 * mm, dates)

    draw_logo(c, logo, PAGE_W - MR, PAGE_H - 16 * mm)

    s.y = PAGE_H - 36 * mm
    s.move(8 * mm)

    # ── Issuer / Client ───────────────────────────────────────────────────────
    col2 = ML + CW / 2 + 5 * mm
    y_top = s.y

    # Issuer block (left)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(BLUE)
    c.drawString(ML, y_top, "ÉMETTEUR")

    y_l = y_top - 5 * mm
    issuer_rows = [
        _s(inv.get("issuerName")),
        (f"SIREN : {inv['issuerSiren']}" if inv.get("issuerSiren") else ""),
        (f"SIRET : {inv['issuerSiret']}" if inv.get("issuerSiret") else ""),
        (f"RCS {inv['issuerRcsCity']}" if inv.get("issuerRcsCity") else ""),
        (f"TVA intracommunautaire : {inv['issuerVatIntracom']}" if inv.get("issuerVatIntracom") else ""),
        _s(inv.get("issuerAddressLine1")),
        f"{_s(inv.get('issuerPostalCode'))} {_s(inv.get('issuerCity'))}".strip(),
    ]
    for row in issuer_rows:
        if row:
            c.setFont("Helvetica", 8.5)
            c.setFillColor(GRAY_TXT)
            c.drawString(ML, y_l, row)
            y_l -= 4.5 * mm

    # Client block (right)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(BLUE)
    c.drawString(col2, y_top, "CLIENT")

    y_r = y_top - 5 * mm
    client_name = " ".join(filter(None, [
        (_s(inv.get("clientName")) or "").upper(),
        _s(inv.get("clientFirstName")),
    ])).strip() or _s(inv.get("clientLegalName"))

    client_rows = [
        client_name,
        _s(inv.get("clientAddressLine1")),
        _s(inv.get("clientAddressLine2")),
        f"{_s(inv.get('clientPostalCode'))} {_s(inv.get('clientCity'))}".strip(),
        _s(inv.get("clientEmail")),
        _s(inv.get("clientPhone")),
    ]
    for row in client_rows:
        if row:
            c.setFont("Helvetica", 8.5)
            c.setFillColor(GRAY_TXT)
            c.drawString(col2, y_r, row)
            y_r -= 4.5 * mm

    # Vehicle
    vehicle = " — ".join(filter(None, [
        _s(inv.get("vehicleLicensePlate")),
        _s(inv.get("vehicleMake")),
        _s(inv.get("vehicleModel")),
    ]))
    if vehicle:
        c.setFont("Helvetica-Oblique", 8)
        c.setFillColor(GRAY_MUTED)
        c.drawString(col2, y_r, f"Véhicule : {vehicle}")
        y_r -= 4.5 * mm
    if inv.get("vehicleKilometrage") is not None:
        c.setFont("Helvetica-Oblique", 8)
        c.setFillColor(GRAY_MUTED)
        km_str = f"{int(inv['vehicleKilometrage']):,} km".replace(",", " ")
        c.drawString(col2, y_r, f"Kilométrage : {km_str}")
        y_r -= 4.5 * mm

    s.y = min(y_l, y_r) - 5 * mm
    s.hrule(GRAY_LINE, 0.8)
    s.move(6 * mm)

    # ── Table header ─────────────────────────────────────────────────────────
    c.setFillColor(BLUE)
    c.rect(ML, s.y - 6.5 * mm, CW, 6.5 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 7.5)
    for key, x_off, w, align in _COLS:
        x = ML + x_off * mm
        w_pt = w * mm
        lbl = _HEADERS[key]
        yy = s.y - 4.5 * mm
        if align == "right":
            c.drawRightString(x + w_pt - 1 * mm, yy, lbl)
        elif align == "center":
            c.drawCentredString(x + w_pt / 2, yy, lbl)
        else:
            c.drawString(x + 1 * mm, yy, lbl)
    s.move(6.5 * mm)

    # ── Lines ─────────────────────────────────────────────────────────────────
    for i, ln in enumerate(lines):
        label_text = _s(ln.get("label"))
        label_lines = _wrap(c, label_text, "Helvetica", 8, _COL["label"][1] - 2 * mm)
        row_h = max(7 * mm, len(label_lines) * 4 * mm + 3 * mm)

        s.need(row_h)
        row_y = s.y

        # Row background
        c.setFillColor(GRAY_BG if i % 2 else colors.white)
        c.rect(ML, row_y - row_h, CW, row_h, fill=1, stroke=0)

        # Label (possibly multi-line)
        c.setFont("Helvetica", 8)
        c.setFillColor(GRAY_TXT)
        x_label = ML + _COL["label"][0] + 1 * mm
        for j, ll in enumerate(label_lines):
            c.drawString(x_label, row_y - 5 * mm - j * 4 * mm, ll)
        if ln.get("longDescription"):
            desc_lines = _wrap(c, _s(ln["longDescription"]), "Helvetica-Oblique", 7, _COL["label"][1] - 2 * mm)
            c.setFont("Helvetica-Oblique", 7)
            c.setFillColor(GRAY_MUTED)
            for j, dl in enumerate(desc_lines[:2]):  # max 2 desc lines
                c.drawString(x_label, row_y - 5 * mm - len(label_lines) * 4 * mm - j * 3.5 * mm, dl)

        # Other cells
        disc = float(ln.get("discountPercent") or 0)
        s.cell("num", str(ln.get("lineNumber", i + 1)), row_y)
        s.cell("qty", f"{float(ln.get('quantity', 0)):.2f}".replace(".", ","), row_y)
        s.cell("unit", _s(ln.get("unitCode") or ""), row_y)
        s.cell("price", _eur(ln.get("unitPriceHt")), row_y)
        s.cell("disc", _pct(disc) if disc else "—", row_y)
        s.cell("vat", _pct(ln.get("vatRate")), row_y)
        s.cell("total_ht", _eur(ln.get("totalHt")), row_y)

        s.move(row_h)

    # Table bottom border
    s.hrule(GRAY_LINE, 0.8)
    s.move(7 * mm)

    # ── VAT breakdown ─────────────────────────────────────────────────────────
    try:
        breakdown = _json.loads(inv.get("vatBreakdownJson") or "[]")
        if breakdown:
            bk_x = ML + CW * 0.35
            s.need(5 * mm + len(breakdown) * 4.5 * mm)
            c.setFont("Helvetica-Bold", 7.5)
            c.setFillColor(GRAY_MUTED)
            c.drawString(bk_x, s.y, "Détail TVA")
            s.move(4.5 * mm)
            for b in breakdown:
                s.need(4.5 * mm)
                label = (
                    f"TVA {b.get('vatRate', '')} % — "
                    f"Base HT après remise : {_eur(b.get('htAfterGlobalDiscount', 0))} — "
                    f"Montant TVA : {_eur(b.get('vatAmount', 0))}"
                )
                c.setFont("Helvetica", 7.5)
                c.setFillColor(GRAY_MUTED)
                c.drawString(bk_x, s.y, label)
                s.move(4.5 * mm)
            s.move(3 * mm)
    except Exception:
        pass

    # ── Totals block (right-aligned) ──────────────────────────────────────────
    tot_x = ML + CW * 0.52

    def _tot(label: str, value: str, bold: bool = False) -> None:
        s.need(6 * mm)
        font = "Helvetica-Bold" if bold else "Helvetica"
        c.setFont(font, 9 if bold else 8.5)
        c.setFillColor(GRAY_TXT)
        c.drawString(tot_x, s.y, label)
        c.drawRightString(PAGE_W - MR, s.y, value)
        s.move(5.5 * mm)

    _tot("Sous-total HT", _eur(inv.get("subtotalHt")))
    disc_pct = float(inv.get("globalDiscountPercent") or 0)
    if disc_pct:
        _tot(f"Remise globale ({_pct(disc_pct)})", f"- {_eur(inv.get('globalDiscountAmount'))}")
    _tot("Total HT", _eur(inv.get("totalHt")))
    _tot("Total TVA", _eur(inv.get("totalVat")))

    # TTC highlighted row
    s.need(9 * mm)
    c.setFillColor(BLUE)
    c.rect(tot_x - 3 * mm, s.y - 2 * mm, PAGE_W - MR - tot_x + 3 * mm, 8 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(tot_x, s.y + 1.5 * mm, "TOTAL TTC")
    c.drawRightString(PAGE_W - MR, s.y + 1.5 * mm, _eur(inv.get("totalTtc")))
    s.move(11 * mm)

    s.hrule(GRAY_LINE, 0.5)
    s.move(6 * mm)

    # ── Payment info ──────────────────────────────────────────────────────────
    pay_parts = []
    if inv.get("paymentTerms"):
        pay_parts.append(_s(inv["paymentTerms"]))
    if inv.get("paymentDueDate"):
        pay_parts.append(f"Échéance : {_date(inv['paymentDueDate'])}")
    if inv.get("issuerIban"):
        pay_parts.append(f"IBAN : {_s(inv['issuerIban'])}" + (f"  BIC : {_s(inv['issuerBic'])}" if inv.get("issuerBic") else ""))

    if pay_parts:
        s.need(5 * mm + len(pay_parts) * 4.5 * mm)
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(BLUE)
        c.drawString(ML, s.y, "MODALITÉS DE PAIEMENT")
        s.move(5 * mm)
        for part in pay_parts:
            s.need(4.5 * mm)
            c.setFont("Helvetica", 8)
            c.setFillColor(GRAY_TXT)
            c.drawString(ML, s.y, part)
            s.move(4.5 * mm)
        s.move(4 * mm)

    # ── Legal mentions ────────────────────────────────────────────────────────
    legal_parts = [
        _s(inv.get("vatExemptionNotice")),
        _s(inv.get("mediatorNotice")),
        _s(inv.get("legalWarrantyNotice")),
    ]
    legal_parts = [p for p in legal_parts if p]

    if legal_parts:
        s.need(6 * mm)
        s.hrule(GRAY_LINE, 0.3)
        s.move(4 * mm)
        c.setFont("Helvetica-Bold", 6.5)
        c.setFillColor(GRAY_MUTED)
        c.drawString(ML, s.y, "MENTIONS LÉGALES")
        s.move(4 * mm)
        for part in legal_parts:
            for wl in _wrap(c, part, "Helvetica", 6.5, CW):
                s.need(4 * mm)
                c.setFont("Helvetica", 6.5)
                c.setFillColor(GRAY_MUTED)
                c.drawString(ML, s.y, wl)
                s.move(3.5 * mm)
            s.move(1.5 * mm)

    c.save()
    return buf.getvalue()


# ── Credit note PDF ────────────────────────────────────────────────────────────

def generate_credit_note_pdf(cn: dict, lines: list[dict], logo: bytes | None = None) -> bytes:
    """Generate a PDF for a credit note (avoir). Same layout as invoice, red header."""
    RED = colors.HexColor("#8B1A1A")

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    s = _State(c)

    # Header bar (red for avoir)
    c.setFillColor(RED)
    c.rect(0, PAGE_H - 32 * mm, PAGE_W, 32 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)

    c.setFont("Helvetica-Bold", 22)
    c.drawString(ML, PAGE_H - 14 * mm, "AVOIR")

    # Même réorganisation que la facture : informations à gauche, logo à droite.
    c.setFont("Helvetica-Bold", 11)
    c.drawString(ML, PAGE_H - 21 * mm, _s(cn.get("creditNoteNumber")))
    c.setFont("Helvetica", 8.5)
    c.drawString(
        ML, PAGE_H - 27 * mm,
        f"Émis le {_date(cn.get('issuedAt'))}   ·   Réf. facture : {_s(cn.get('sourceInvoiceId'))}",
    )

    draw_logo(c, logo, PAGE_W - MR, PAGE_H - 16 * mm)

    s.y = PAGE_H - 36 * mm
    s.move(8 * mm)

    # Issuer / Client (same structure as invoice)
    col2 = ML + CW / 2 + 5 * mm
    y_top = s.y

    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(RED)
    c.drawString(ML, y_top, "ÉMETTEUR")

    y_l = y_top - 5 * mm
    for row in [
        _s(cn.get("issuerName")),
        f"SIREN : {cn['issuerSiren']}" if cn.get("issuerSiren") else "",
        f"SIRET : {cn['issuerSiret']}" if cn.get("issuerSiret") else "",
        _s(cn.get("issuerAddressLine1")),
        f"{_s(cn.get('issuerPostalCode'))} {_s(cn.get('issuerCity'))}".strip(),
    ]:
        if row:
            c.setFont("Helvetica", 8.5)
            c.setFillColor(GRAY_TXT)
            c.drawString(ML, y_l, row)
            y_l -= 4.5 * mm

    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(RED)
    c.drawString(col2, y_top, "CLIENT")

    y_r = y_top - 5 * mm
    client_name = " ".join(filter(None, [
        (_s(cn.get("clientName")) or "").upper(),
        _s(cn.get("clientFirstName")),
    ])).strip() or _s(cn.get("clientLegalName"))

    for row in [
        client_name,
        _s(cn.get("clientAddressLine1")),
        _s(cn.get("clientAddressLine2")),
        f"{_s(cn.get('clientPostalCode'))} {_s(cn.get('clientCity'))}".strip(),
        _s(cn.get("clientEmail")),
    ]:
        if row:
            c.setFont("Helvetica", 8.5)
            c.setFillColor(GRAY_TXT)
            c.drawString(col2, y_r, row)
            y_r -= 4.5 * mm

    vehicle = " — ".join(filter(None, [_s(cn.get("vehicleLicensePlate")), _s(cn.get("vehicleMake")), _s(cn.get("vehicleModel"))]))
    if vehicle:
        c.setFont("Helvetica-Oblique", 8)
        c.setFillColor(GRAY_MUTED)
        c.drawString(col2, y_r, f"Véhicule : {vehicle}")
        y_r -= 4.5 * mm

    s.y = min(y_l, y_r) - 5 * mm

    # Reason + refund method
    s.hrule(GRAY_LINE, 0.8)
    s.move(5 * mm)

    _REFUND_LABELS = {
        "commercialCredit": "Avoir commercial", "wireTransferRefund": "Remboursement par virement",
        "cashRefund": "Remboursement en espèces", "other": "Autre",
    }
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(RED)
    c.drawString(ML, s.y, "MOTIF DE L'AVOIR")
    s.move(5 * mm)
    c.setFont("Helvetica", 8.5)
    c.setFillColor(GRAY_TXT)
    for wl in _wrap(c, _s(cn.get("reason")), "Helvetica", 8.5, CW):
        s.need(5 * mm)
        c.drawString(ML, s.y, wl)
        s.move(4.5 * mm)
    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY_MUTED)
    rm = _REFUND_LABELS.get(_s(cn.get("refundMethod")), _s(cn.get("refundMethod")))
    c.drawString(ML, s.y, f"Mode de remboursement : {rm}")
    s.move(8 * mm)

    # Lines table (red header)
    c.setFillColor(RED)
    c.rect(ML, s.y - 6.5 * mm, CW, 6.5 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 7.5)
    for key, x_off, w, align in _COLS:
        x = ML + x_off * mm
        w_pt = w * mm
        lbl = _HEADERS[key]
        yy = s.y - 4.5 * mm
        if align == "right":
            c.drawRightString(x + w_pt - 1 * mm, yy, lbl)
        elif align == "center":
            c.drawCentredString(x + w_pt / 2, yy, lbl)
        else:
            c.drawString(x + 1 * mm, yy, lbl)
    s.move(6.5 * mm)

    for i, ln in enumerate(lines):
        label_lines = _wrap(c, _s(ln.get("label")), "Helvetica", 8, _COL["label"][1] - 2 * mm)
        row_h = max(7 * mm, len(label_lines) * 4 * mm + 3 * mm)
        s.need(row_h)
        row_y = s.y

        c.setFillColor(GRAY_BG if i % 2 else colors.white)
        c.rect(ML, row_y - row_h, CW, row_h, fill=1, stroke=0)

        c.setFont("Helvetica", 8)
        c.setFillColor(GRAY_TXT)
        x_label = ML + _COL["label"][0] + 1 * mm
        for j, ll in enumerate(label_lines):
            c.drawString(x_label, row_y - 5 * mm - j * 4 * mm, ll)

        disc = float(ln.get("discountPercent") or 0)
        s.cell("num", str(ln.get("lineNumber", i + 1)), row_y)
        s.cell("qty", f"{float(ln.get('quantity', 0)):.2f}".replace(".", ","), row_y)
        s.cell("unit", _s(ln.get("unitCode") or ""), row_y)
        s.cell("price", _eur(ln.get("unitPriceHt")), row_y)
        s.cell("disc", _pct(disc) if disc else "—", row_y)
        s.cell("vat", _pct(ln.get("vatRate")), row_y)
        s.cell("total_ht", _eur(ln.get("totalHt")), row_y)
        s.move(row_h)

    s.hrule(GRAY_LINE, 0.8)
    s.move(7 * mm)

    # Totals
    tot_x = ML + CW * 0.52

    def _tot(label: str, value: str) -> None:
        s.need(6 * mm)
        c.setFont("Helvetica", 8.5)
        c.setFillColor(GRAY_TXT)
        c.drawString(tot_x, s.y, label)
        c.drawRightString(PAGE_W - MR, s.y, value)
        s.move(5.5 * mm)

    _tot("Sous-total HT", _eur(cn.get("subtotalHt")))
    _tot("Total HT", _eur(cn.get("totalHt")))
    _tot("Total TVA", _eur(cn.get("totalVat")))

    s.need(9 * mm)
    c.setFillColor(RED)
    c.rect(tot_x - 3 * mm, s.y - 2 * mm, PAGE_W - MR - tot_x + 3 * mm, 8 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(tot_x, s.y + 1.5 * mm, "TOTAL AVOIR TTC")
    c.drawRightString(PAGE_W - MR, s.y + 1.5 * mm, _eur(cn.get("totalTtc")))
    s.move(11 * mm)

    # Legal mentions
    legal_parts = [p for p in [_s(cn.get("vatExemptionNotice")), _s(cn.get("mediatorNotice")), _s(cn.get("legalWarrantyNotice"))] if p]
    if legal_parts:
        s.hrule(GRAY_LINE, 0.3)
        s.move(4 * mm)
        c.setFont("Helvetica-Bold", 6.5)
        c.setFillColor(GRAY_MUTED)
        c.drawString(ML, s.y, "MENTIONS LÉGALES")
        s.move(4 * mm)
        for part in legal_parts:
            for wl in _wrap(c, part, "Helvetica", 6.5, CW):
                s.need(4 * mm)
                c.setFont("Helvetica", 6.5)
                c.setFillColor(GRAY_MUTED)
                c.drawString(ML, s.y, wl)
                s.move(3.5 * mm)
            s.move(1.5 * mm)

    c.save()
    return buf.getvalue()
