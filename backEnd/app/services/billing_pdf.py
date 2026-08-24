"""Facture et avoir — génération PDF.

Habillage : celui de `pdf_template`, commun à tous les papiers remis au client et
relevé sur une facture que le garage édite déjà. Cadre noir à 6,2 mm des bords,
aucune couleur, corps de 10 pt, relevés en cellules réglées, logo en haut à droite.

La structure suit celle de cette référence, de haut en bas :

  * émetteur en haut à gauche — raison sociale en 14 gras, adresse, téléphone,
    courriel, puis les identifiants : Siret, NAF, capital social, TVA intra ;
  * logo en haut à droite ;
  * titre portant le numéro, sans bandeau : « FACTURE N° : FA-2026-0187 » ;
  * client en regard, à droite, sans libellé — comme sur la référence, où l'on
    reconnaît le destinataire à sa place sur la feuille ;
  * réceptionnaire, compte client, courriel et téléphones ;
  * bandeau d'identification : Page · Date · Kms · Marque · Modèle · Immat. ·
    N° Série · N° Doc./O.R. ;
  * lignes du document, en-têtes sur deux lignes comme la référence ;
  * sous-total, message commercial, mentions légales ;
  * bande de règlement, puis le récapitulatif de TVA qui ferme la page.

API publique :
  generate_invoice_pdf(inv, lines, logo)      → bytes
  generate_credit_note_pdf(cn, lines, logo)   → bytes

`_s`, `_eur`, `_pct`, `_date` et `_wrap` restent exportés : loan_contract_pdf s'en
sert, et ils sont neutres — ils ne portent aucun habillage.
"""

import io
import json as _json

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm

from app.services.pdf_template import (
    CL,
    CR,
    FRAME,
    FRAME_W,
    FS_BODY,
    FS_NAME,
    FS_TERMS,
    INK,
    LEAD,
    PAD,
    PAGE_H,
    PAGE_W,
    ROW_H,
    cell_row,
    draw_frame,
    draw_logo_plain,
    fit,
    identity_block,
    rule,
    widths,
)

# ── Formatage ────────────────────────────────────────────────────────────────

def _s(v, default: str = "") -> str:
    return default if v is None else str(v)


def _eur(v) -> str:
    if v is None:
        return ""
    try:
        return f"{float(v):,.2f} €".replace(",", " ").replace(".", ",")
    except (TypeError, ValueError):
        return str(v)


def _num(v) -> str:
    """Nombre à deux décimales, à la française. Vide si inconnu."""
    if v is None:
        return ""
    try:
        return f"{float(v):,.2f}".replace(",", " ").replace(".", ",")
    except (TypeError, ValueError):
        return str(v)


def _pct(v) -> str:
    if v is None:
        return ""
    try:
        return f"{float(v):.1f} %".replace(".", ",")
    except (TypeError, ValueError):
        return str(v)


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
    """Découpe sur les espaces, à la largeur donnée."""
    if not text:
        return []
    mots = str(text).split()
    lignes: list[str] = []
    courante = ""
    for mot in mots:
        essai = f"{courante} {mot}".strip()
        if c.stringWidth(essai, font, size) <= max_w or not courante:
            courante = essai
        else:
            lignes.append(courante)
            courante = mot
    if courante:
        lignes.append(courante)
    return lignes


# ── Colonnes des lignes de document ──────────────────────────────────────────
# Mêmes colonnes que la référence, et ses en-têtes sur deux lignes : « Prix Unit.
# H.T. » ne tient pas sur une seule à 10 pt dans la largeur qu'on peut lui donner.
# La dernière, « C T », porte le code de TVA de la ligne (facturXVatCategory).
COLS = [
    ("designation", ["Désignation"], "left", 63.0),
    ("reference", ["Référence"], "left", 20.0),
    ("quantity", ["Temps/", "Quantité"], "right", 19.0),
    ("unit_price", ["Prix Unit.", "H.T."], "right", 21.0),
    ("discount", ["%Rem"], "right", 17.0),
    ("net_price", ["Prix Net", "H.T."], "right", 21.0),
    ("total_ht", ["Montant", "H.T."], "right", 22.0),
    ("vat_code", ["C", "T"], "center", 14.6),
]
COL_W = widths([c[3] for c in COLS])
HEADER_H = 10.5 * mm     # deux lignes d'en-tête
BAND_PAD = 1.5 * mm      # marge intérieure des bandes denses (voir cell_row)
LINE_H = 4.6 * mm        # une ligne de désignation


def _header_row(c: canvas.Canvas, y_top: float) -> float:
    """En-têtes des lignes, sur deux niveaux. Retourne le bas de la ligne."""
    y_bot = y_top - HEADER_H
    rule(c, y_top)
    x = FRAME
    c.setStrokeColor(INK)
    c.setLineWidth(0.5)
    for w in COL_W:
        c.line(x, y_top, x, y_bot)
        x += w
    c.line(PAGE_W - FRAME, y_top, PAGE_W - FRAME, y_bot)

    c.setFont("Helvetica-Bold", FS_BODY)
    c.setFillColor(INK)
    x = FRAME
    for (_, libelles, align, _p), w in zip(COLS, COL_W):
        for i, libelle in enumerate(libelles):
            yy = y_top - 4.2 * mm - i * 4.2 * mm
            if align == "right":
                c.drawRightString(x + w - PAD, yy, libelle)
            elif align == "center":
                c.drawCentredString(x + w / 2, yy, libelle)
            else:
                c.drawString(x + PAD, yy, libelle)
        x += w
    rule(c, y_bot)
    return y_bot


def _line_cells(ln: dict) -> dict[str, str]:
    """Valeurs d'une ligne, colonne par colonne.

    « Prix Net H.T. » est le prix unitaire remise déduite : la référence l'affiche
    à côté du prix catalogue, ce qui rend la remise vérifiable d'un coup d'œil.
    """
    pu = ln.get("unitPriceHt")
    remise = float(ln.get("discountPercent") or 0)
    net = None
    if pu is not None:
        try:
            net = float(pu) * (1 - remise / 100)
        except (TypeError, ValueError):
            net = None
    return {
        "designation": _s(ln.get("label")),
        # `articleReference` n'existe pas sur les lignes de facture aujourd'hui : la
        # cellule reste vide sur les documents déjà émis, et se remplira pour les
        # suivants une fois la colonne ajoutée.
        "reference": _s(ln.get("articleReference")),
        "quantity": _num(ln.get("quantity")),
        "unit_price": _num(pu),
        "discount": (_pct(remise) if remise else ""),
        "net_price": _num(net),
        "total_ht": _num(ln.get("totalHt")),
        "vat_code": _s(ln.get("facturXVatCategory")),
    }


def _draw_lines(c: canvas.Canvas, y: float, lines: list[dict], plancher: float) -> float:
    """Trace les lignes du document. Retourne le y atteint.

    Les filets verticaux courent sur toute la hauteur de chaque ligne, y compris
    celles dont la désignation se replie sur plusieurs niveaux : la référence ne
    laisse jamais une cellule ouverte.
    """
    x_desi_w = COL_W[0] - 2 * PAD
    for ln in lines:
        cells = _line_cells(ln)
        replis = _wrap(c, cells["designation"], "Helvetica", FS_BODY, x_desi_w) or [""]
        # La description longue suit la désignation, dans la même cellule et en plus
        # petit. Elle est COMPTÉE dans la hauteur de la ligne — c'est ce qui manquait
        # à la version précédente, où elle était dessinée sous la ligne puis
        # recouverte par le fond de la suivante.
        desc = _wrap(c, _s(ln.get("longDescription")), "Helvetica", FS_TERMS, x_desi_w)
        h = max(ROW_H, len(replis) * LINE_H + len(desc) * 3.6 * mm + 2.2 * mm)

        if y - h < plancher:
            break

        y_bot = y - h
        x = FRAME
        c.setStrokeColor(INK)
        c.setLineWidth(0.5)
        for w in COL_W:
            c.line(x, y, x, y_bot)
            x += w
        c.line(PAGE_W - FRAME, y, PAGE_W - FRAME, y_bot)

        c.setFillColor(INK)
        yy = y - 4.2 * mm
        c.setFont("Helvetica", FS_BODY)
        for repli in replis:
            c.drawString(FRAME + PAD, yy, repli)
            yy -= LINE_H
        c.setFont("Helvetica", FS_TERMS)
        for d in desc:
            c.drawString(FRAME + PAD, yy, d)
            yy -= 3.6 * mm

        x = COL_W[0] + FRAME
        c.setFont("Helvetica", FS_BODY)
        for (cle, _lib, align, _p), w in list(zip(COLS, COL_W))[1:]:
            texte = fit(c, cells[cle], "Helvetica", FS_BODY, w - 2 * PAD)
            base = y - 4.2 * mm
            if align == "right":
                c.drawRightString(x + w - PAD, base, texte)
            elif align == "center":
                c.drawCentredString(x + w / 2, base, texte)
            else:
                c.drawString(x + PAD, base, texte)
            x += w

        rule(c, y_bot)
        y = y_bot
    return y


# ── Blocs communs ────────────────────────────────────────────────────────────

def _issuer(c: canvas.Canvas, doc: dict, y_top: float) -> float:
    """Bloc émetteur, dans l'ordre de la référence : identité, puis identifiants."""
    ville = f"{_s(doc.get('issuerPostalCode'))} {_s(doc.get('issuerCity'))}".strip().upper()
    y = identity_block(
        c, CL, y_top, "", _s(doc.get("issuerName")).upper(),
        [
            _s(doc.get("issuerAddressLine1")).upper(),
            ville,
            (f"TEL : {doc['issuerPhone']}" if doc.get("issuerPhone") else ""),
            (f"EMAIL : {doc['issuerEmail']}" if doc.get("issuerEmail") else ""),
        ],
        name_size=FS_NAME,
    )
    # Ligne blanche, puis les identifiants légaux — la référence les sépare ainsi de
    # l'adresse, ce qui rend le bloc lisible malgré sa densité.
    y -= 2.4 * mm
    identifiants = []
    siret = _s(doc.get("issuerSiret"))
    naf = _s(doc.get("issuerNafCode"))
    if siret or naf:
        identifiants.append(" - ".join(filter(None, [
            f"Siret : {siret}" if siret else "",
            f"NAF : {naf}" if naf else "",
        ])))
    if doc.get("issuerShareCapital"):
        identifiants.append(f"Capital social : {_eur(doc['issuerShareCapital'])}")
    if doc.get("issuerVatIntracom"):
        identifiants.append(f"TVA Intra-communaut. : {doc['issuerVatIntracom']}")
    if doc.get("issuerRcsCity"):
        identifiants.append(f"RCS {doc['issuerRcsCity']}")

    c.setFont("Helvetica", FS_BODY)
    c.setFillColor(INK)
    for ligne in identifiants:
        c.drawString(CL, y, ligne)
        y -= LEAD
    return y


def _client(c: canvas.Canvas, doc: dict, x: float, y_top: float) -> float:
    """Bloc client, sans libellé — comme sur la référence, où la place sur la
    feuille suffit à désigner le destinataire."""
    nom = " ".join(filter(None, [
        (_s(doc.get("clientName")) or "").upper(),
        _s(doc.get("clientFirstName")),
    ])).strip() or _s(doc.get("clientLegalName"))
    return identity_block(
        c, x, y_top, "", nom,
        [
            _s(doc.get("clientAddressLine1")),
            _s(doc.get("clientAddressLine2")),
            f"{_s(doc.get('clientPostalCode'))} {_s(doc.get('clientCity'))}".strip().upper(),
        ],
    )


def _reception(c: canvas.Canvas, doc: dict, y_top: float) -> float:
    """Réceptionnaire, compte client, courriel et téléphones.

    Chaque ligne est sautée si son information manque : sur une base qui ne les
    renseigne pas encore, le bloc disparaît entièrement au lieu de laisser quatre
    libellés vides.
    """
    lignes = []
    if doc.get("receptionistName"):
        lignes.append(f"Réceptionnaire : {doc['receptionistName']}")
    if doc.get("clientAccountNumber"):
        lignes.append(f"Compte : {doc['clientAccountNumber']}")
    if doc.get("clientEmail"):
        lignes.append(f"e-mail : {doc['clientEmail']}")
    if doc.get("clientPhone"):
        lignes.append(f"Tél. : {doc['clientPhone']}")
    if not lignes:
        return y_top

    c.setFont("Helvetica", FS_BODY)
    c.setFillColor(INK)
    y = y_top
    for ligne in lignes:
        c.drawString(CL, y, ligne)
        y -= LEAD
    return y


def _identification(c: canvas.Canvas, doc: dict, y_top: float, page: int, pages: int,
                    or_number: str) -> float:
    """Bandeau d'identification, les huit cellules de la référence."""
    # Largeurs prises sur le besoin réel de chaque colonne, en-tête ou valeur la plus
    # longue, marge intérieure comprise : le numéro de série réclame à lui seul 41 mm
    # pour ses dix-sept caractères. Le total tombe à 188 mm avec une marge de 1,5 mm,
    # là où 3 mm en demandaient 212 pour 197,6 disponibles.
    cols = widths([11.4, 20.7, 18.7, 27.7, 21.6, 21.0, 40.8, 26.3])
    entetes = ["Page", "Date", "Kms", "Marque", "Modèle", "Immat.", "N° Série", "N° Doc./O.R."]
    kms = doc.get("vehicleKilometrage")
    valeurs = [
        f"{page} /{pages}",
        _date(doc.get("issuedAt")),
        (f"{int(kms):,}".replace(",", " ") if kms is not None else "-"),
        _s(doc.get("vehicleMake")) or "-",
        _s(doc.get("vehicleModel")) or "-",
        _s(doc.get("vehicleLicensePlate")) or "-",
        _s(doc.get("vehicleVin")) or "-",
        or_number or "-",
    ]
    y = cell_row(c, y_top, cols, entetes, gras=True, pad=BAND_PAD)
    y = cell_row(c, y, cols, valeurs, pad=BAND_PAD)
    rule(c, y)
    return y


def _reglement(c: canvas.Canvas, doc: dict, y_top: float) -> float:
    """Bande « Mode de règlement » / « Règlement prévu le », en deux cellules."""
    cols = widths([1.0, 1.0])
    mode = _s(doc.get("expectedPaymentMethodCode")) or _s(doc.get("refundMethod")) or "-"
    echeance = _date(doc.get("paymentDueDate")) or _date(doc.get("refundedAt")) or "-"
    return cell_row(
        c, y_top, cols,
        [f"Mode de règlement : {mode}", f"Règlement prévu le : {echeance}"],
        aligns=["center", "center"],
    )


def _ventilation(doc: dict) -> list[dict]:
    """Ventilation de TVA du document, une entrée par taux.

    À défaut de ventilation enregistrée, on en fabrique une à partir des totaux :
    le tableau du bas doit être rempli, c'est lui qui porte le total à payer.
    """
    try:
        lignes = _json.loads(doc.get("vatBreakdownJson") or "[]") or []
    except Exception:
        lignes = []
    return lignes or [{
        "vatRate": None,
        "htAfterGlobalDiscount": doc.get("totalHt"),
        "vatAmount": doc.get("totalVat"),
    }]


def _recap_tva(c: canvas.Canvas, doc: dict, y_top: float, libelle_total: str) -> float:
    """Récapitulatif de TVA : ventilation à gauche, totaux à droite.

    Une ligne de ventilation par taux. La référence n'en montre qu'une, mais rien
    n'interdit deux taux sur une même facture — pièces et main d'œuvre à des taux
    différents, par exemple.
    """
    ventilation = _ventilation(doc)

    # Mêmes proportions mesurées : ici c'est l'en-tête qui commande, « Total Facture »
    # étant plus large que le montant qu'il surmonte.
    cols = widths([22.9, 22.3, 27.4, 27.8, 22.5, 28.2, 28.0])
    entetes = ["Code TVA", "Taux TVA", "Montant H.T.", "Montant TVA",
               "Total TVA", libelle_total, "Total à Payer"]
    aligns = ["center", "center", "center", "center", "center", "center", "center"]
    y = cell_row(c, y_top, cols, entetes, gras=True, aligns=aligns)

    for i, b in enumerate(ventilation):
        # Les trois totaux ne figurent que sur la première ligne : ils portent sur le
        # document entier, pas sur un taux.
        valeurs = [
            _s(b.get("vatCategory") or doc.get("vatCategory") or "S"),
            _pct(b.get("vatRate")),
            _num(b.get("htAfterGlobalDiscount")),
            _num(b.get("vatAmount")),
            _num(doc.get("totalVat")) if i == 0 else "",
            _num(doc.get("totalTtc")) if i == 0 else "",
            _num(doc.get("totalTtc")) if i == 0 else "",
        ]
        y = cell_row(c, y, cols, valeurs, aligns=aligns)
    rule(c, y)
    return y


def _mentions(c: canvas.Canvas, doc: dict, y: float) -> float:
    """Mentions légales, en 8 pt. Absentes de la référence, obligatoires chez nous :
    garantie légale, médiateur de la consommation, exonération de TVA."""
    parties = [
        _s(doc.get("vatExemptionNotice")),
        _s(doc.get("mediatorNotice")),
        _s(doc.get("legalWarrantyNotice")),
        _s(doc.get("latePaymentNotice")),
    ]
    parties = [p for p in parties if p]
    if not parties:
        return y
    c.setFont("Helvetica", FS_TERMS)
    c.setFillColor(INK)
    for partie in parties:
        for ligne in _wrap(c, partie, "Helvetica", FS_TERMS, FRAME_W - 2 * PAD):
            c.drawString(CL, y, ligne)
            y -= 3.6 * mm
        y -= 1.2 * mm
    return y


# ── Corps commun ─────────────────────────────────────────────────────────────

def _document(doc: dict, lines: list[dict], logo: bytes | None,
              titre: str, numero: str, libelle_total: str,
              message: str | None, or_number: str, pages_total: int | None) -> tuple[bytes, int]:
    """Trace le document. Retourne (pdf, nombre de pages réellement employées).

    Deux passes sont nécessaires pour écrire « 1 /2 » dans la cellule Page : on ne
    connaît le total qu'une fois les lignes réparties. La première passe compte, la
    seconde imprime — c'est moins coûteux qu'un post-traitement du PDF, et le tracé
    reste identique d'une passe à l'autre.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    page = 1
    restantes = list(lines)

    while True:
        top = draw_frame(c)

        # Tête : émetteur à gauche, logo à droite, sur la première page seulement.
        # Les pages suivantes n'ont pas à répéter l'identité, mais gardent le bandeau
        # d'identification pour qu'un feuillet détaché reste rattachable.
        if page == 1:
            y_gauche = _issuer(c, doc, top)
            logo_h = draw_logo_plain(c, logo, CR, top)

            y = min(y_gauche, top - logo_h) - 5 * mm
            c.setFont("Helvetica-Bold", FS_BODY)
            c.setFillColor(INK)
            c.drawString(CL, y, f"{titre} N° : {numero}")

            y_client = _client(c, doc, CL + FRAME_W / 2, y)
            y_reception = _reception(c, doc, y - 6 * mm)
            y = min(y_client, y_reception) - 3 * mm
        else:
            y = top

        y = _identification(c, doc, y, page, pages_total or page, or_number)

        # Plancher : ce qu'il faut réserver sous les lignes pour le bas de page.
        # Sur la dernière page, tout y passe ; sur les autres, seul le filet de
        # clôture, les lignes continuant au feuillet suivant.
        y = _header_row(c, y)
        # Réserve sous les lignes : le bas de page — sous-total, message, mentions,
        # bande de règlement et récapitulatif — occupe environ 58 mm. Tant qu'il reste
        # des lignes à poser, on la garde libre pour ne pas se retrouver à devoir
        # fermer le document sans place.
        reserve = 58 * mm
        plancher = FRAME + PAD + reserve
        posees = _combien_tiennent(c, y, restantes, plancher)
        y_apres = _draw_lines(c, y, restantes, plancher)
        restantes = restantes[posees:]
        y = y_apres

        if restantes:
            page += 1
            c.showPage()
            continue

        # ── Bas de page, sur la dernière seulement ─────────────────────────────
        y -= 5 * mm
        c.setFont("Helvetica-Bold", FS_BODY)
        c.setFillColor(INK)
        c.drawRightString(CR, y, f"Sous Total H.T. :   {_num(doc.get('subtotalHt'))}")
        y -= 6 * mm

        if doc.get("globalDiscountPercent"):
            c.setFont("Helvetica", FS_BODY)
            c.drawRightString(
                CR, y,
                f"Remise globale ({_pct(doc['globalDiscountPercent'])}) :   "
                f"- {_num(doc.get('globalDiscountAmount'))}",
            )
            y -= 6 * mm

        if message and message.strip():
            c.setFont("Helvetica-Bold", FS_BODY)
            for ligne in _wrap(c, message, "Helvetica-Bold", FS_BODY, FRAME_W - 20 * mm):
                c.drawCentredString(PAGE_W / 2, y, ligne)
                y -= LEAD
            y -= 3 * mm

        y = _mentions(c, doc, y)

        # Les deux tableaux de bas de page sont calés sur le bas du cadre, comme sur
        # la référence : ils ferment la feuille, quelle que soit la place laissée par
        # les lignes.
        #
        # La hauteur du récapitulatif dépend du nombre de taux de TVA : une ligne
        # d'en-têtes plus une par taux. La compter en dur laissait une bande vide de la
        # hauteur d'une ligne entre lui et le cadre, qui se lisait comme une cellule
        # oubliée.
        haut_recap = FRAME + (1 + len(_ventilation(doc))) * ROW_H
        _reglement(c, doc, haut_recap + ROW_H)
        _recap_tva(c, doc, haut_recap, libelle_total)
        break

    c.showPage()
    c.save()
    return buf.getvalue(), page


def _combien_tiennent(c: canvas.Canvas, y: float, lines: list[dict], plancher: float) -> int:
    """Nombre de lignes qui tiennent à partir de `y`, sans rien tracer.

    Reproduit exactement le calcul de hauteur de `_draw_lines` : les deux doivent
    décider pareil, sinon une ligne serait comptée d'un côté et tracée de l'autre.
    """
    x_desi_w = COL_W[0] - 2 * PAD
    n = 0
    for ln in lines:
        cells = _line_cells(ln)
        replis = _wrap(c, cells["designation"], "Helvetica", FS_BODY, x_desi_w) or [""]
        desc = _wrap(c, _s(ln.get("longDescription")), "Helvetica", FS_TERMS, x_desi_w)
        h = max(ROW_H, len(replis) * LINE_H + len(desc) * 3.6 * mm + 2.2 * mm)
        if y - h < plancher:
            break
        y -= h
        n += 1
    return n


# ── Points d'entrée ──────────────────────────────────────────────────────────

def generate_invoice_pdf(inv: dict, lines: list[dict], logo: bytes | None = None) -> bytes:
    """Facture. `inv` porte les champs recopiés à l'émission, `lines` ses lignes."""
    # `sourceQuoteNumber` : le numéro du devis ou de l'OR dont la facture découle,
    # que le routeur obtient par jointure sur `documents`.
    or_number = _s(inv.get("sourceQuoteNumber"))
    message = inv.get("footerMessage")
    pdf, pages = _document(inv, lines, logo, "FACTURE", _s(inv.get("invoiceNumber")),
                           "Total Facture", message, or_number, None)
    if pages > 1:
        pdf, _ = _document(inv, lines, logo, "FACTURE", _s(inv.get("invoiceNumber")),
                           "Total Facture", message, or_number, pages)
    return pdf


def generate_credit_note_pdf(cn: dict, lines: list[dict], logo: bytes | None = None) -> bytes:
    """Avoir. Même habillage que la facture ; seuls le titre, le libellé du total et
    le motif changent. Aucune couleur ne les distingue plus — le titre suffit, et le
    document est en noir et blanc."""
    or_number = _s(cn.get("sourceInvoiceNumber"))
    message = cn.get("reason")
    pdf, pages = _document(cn, lines, logo, "AVOIR", _s(cn.get("creditNoteNumber")),
                           "Total Avoir", message, or_number, None)
    if pages > 1:
        pdf, _ = _document(cn, lines, logo, "AVOIR", _s(cn.get("creditNoteNumber")),
                           "Total Avoir", message, or_number, pages)
    return pdf
