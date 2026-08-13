"""Contrat de prêt de véhicule — génération PDF (migration 025).

Même socle que billing_pdf.py : reportlab pur Python, Helvetica (Latin-1 couvre
le français), A4. Les helpers y sont réutilisés plutôt que recopiés.

API publique :
  generate_loan_contract_pdf(res, vehicle, client, company, damages, terms) → bytes

Le contrat comporte deux schémas de la voiture :
  * « État au départ » — les dégâts enregistrés sur le véhicule sont pré-imprimés,
    sous forme de marqueurs numérotés renvoyant à un tableau ;
  * « Constat de retour » — le même schéma, vierge, à annoter au stylo.

Limite assumée du schéma : une vue de dessus ne montre pas l'axe vertical d'un
élément (le haut d'une portière n'est pas distinguable de son bas). La grille 3×3
sert donc de grille de placement dans l'empreinte de l'élément, et la case exacte
est énoncée en clair dans le tableau. C'est la convention des constats papier :
marqueurs numérotés + tableau descriptif.
"""

import io

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors

from app.services.billing_pdf import (
    PAGE_W,
    PAGE_H,
    ML,
    MR,
    MT,
    MB,
    CW,
    BLUE,
    GRAY_BG,
    GRAY_LINE,
    GRAY_TXT,
    GRAY_MUTED,
    _State,
    _date,
    _s,
    _wrap,
)

# ── Libellés français ─────────────────────────────────────────────────────────
# Codes en anglais côté API, libellés français ici. Le miroir côté interface est
# frontEnd/src/lib/loanDamage.ts — les deux doivent rester d'accord.

ELEMENT_LABELS: dict[str, str] = {
    # Centraux
    "bumperFront": "Pare-choc avant",
    "hood": "Capot",
    "windshield": "Pare-brise",
    "roof": "Toit",
    "rearWindow": "Lunette arrière",
    "trunk": "Coffre",
    "bumperRear": "Pare-choc arrière",
    # Côté gauche
    "fenderFrontLeft": "Aile avant gauche",
    "doorFrontLeft": "Porte avant gauche",
    "windowFrontLeft": "Vitre avant gauche",
    "windowRearLeft": "Vitre arrière gauche",
    "doorRearLeft": "Porte arrière gauche",
    "fenderRearLeft": "Aile arrière gauche",
    "rockerPanelLeft": "Bas de caisse gauche",
    # Côté droit
    "fenderFrontRight": "Aile avant droite",
    "doorFrontRight": "Porte avant droite",
    "windowFrontRight": "Vitre avant droite",
    "windowRearRight": "Vitre arrière droite",
    "doorRearRight": "Porte arrière droite",
    "fenderRearRight": "Aile arrière droite",
    "rockerPanelRight": "Bas de caisse droit",
}

ROW_LABELS: dict[str, str] = {"top": "haut", "middle": "milieu", "bottom": "bas"}
COL_LABELS: dict[str, str] = {"left": "gauche", "center": "milieu", "right": "droite"}
TYPE_LABELS: dict[str, str] = {
    "scratch": "Rayure",
    "dent": "Enfoncement",
    "broken": "Bris",
    "missing": "Manquant",
}

_ROW_INDEX = {"top": 0, "middle": 1, "bottom": 2}
_COL_INDEX = {"left": 0, "center": 1, "right": 2}

# ── Géométrie de la vue de dessus ─────────────────────────────────────────────
# Repère normalisé 100 × 240 (largeur × longueur), avant en haut, y croissant vers
# l'arrière. Chaque élément est un rectangle (x, y, w, h) ; l'ensemble pave
# l'empreinte de la voiture. Ce pavage est repris à l'identique dans
# frontEnd/src/lib/loanDamage.ts pour que le schéma cliquable et le schéma
# imprimé désignent les mêmes zones.
CAR_W = 100.0
CAR_H = 240.0

ZONES: dict[str, tuple[float, float, float, float]] = {
    # Pare-chocs : toute la largeur, c'est là que se concentrent les impacts d'angle
    "bumperFront": (2, 2, 96, 18),
    "bumperRear": (2, 220, 96, 18),
    # Colonne centrale
    "hood": (30, 20, 40, 44),
    "windshield": (30, 64, 40, 24),
    "roof": (30, 88, 40, 64),
    "rearWindow": (30, 152, 40, 24),
    "trunk": (30, 176, 40, 44),
    # Côté gauche : bas de caisse au plus extérieur, vitres au plus près de l'habitacle
    "rockerPanelLeft": (2, 64, 7, 112),
    "fenderFrontLeft": (2, 20, 28, 44),
    "doorFrontLeft": (9, 64, 11, 56),
    "windowFrontLeft": (20, 64, 10, 56),
    "doorRearLeft": (9, 120, 11, 56),
    "windowRearLeft": (20, 120, 10, 56),
    "fenderRearLeft": (2, 176, 28, 44),
    # Côté droit : miroir
    "rockerPanelRight": (91, 64, 7, 112),
    "fenderFrontRight": (70, 20, 28, 44),
    "doorFrontRight": (80, 64, 11, 56),
    "windowFrontRight": (70, 64, 10, 56),
    "doorRearRight": (80, 120, 11, 56),
    "windowRearRight": (70, 120, 10, 56),
    "fenderRearRight": (70, 176, 28, 44),
}

# Roues décoratives : à cheval sur le bord de caisse, aux quatre positions
# d'essieu. Purement graphiques — elles ne portent aucune zone cliquable ni aucun
# dégât. Mêmes valeurs côté front (frontEnd/src/lib/loanDamage.ts).
WHEEL_W = 5.0
WHEEL_H = 20.0
WHEELS_X = (0.0, 95.0)
WHEELS_Y = (36.0, 186.0)

# Étiquettes portées sur le schéma : seuls les éléments centraux ont la place. Les
# éléments latéraux restent muets, les marqueurs numérotés et le tableau les
# nomment.
_ZONE_CAPTIONS = {
    "hood": "Capot",
    "windshield": "Pare-brise",
    "roof": "Toit",
    "rearWindow": "Lunette",
    "trunk": "Coffre",
}


def _eighths(v) -> str:
    """Jauge de carburant en huitièmes : 5 → « 5/8 »."""
    if v is None:
        return "—"
    try:
        n = int(v)
    except (TypeError, ValueError):
        return "—"
    return f"{n}/8"


def _km(v) -> str:
    if v is None:
        return "—"
    try:
        return f"{int(v):,}".replace(",", " ") + " km"
    except (TypeError, ValueError):
        return "—"


def _damage_location(d: dict) -> str:
    """« bas gauche », « milieu », … — la case en clair."""
    row = ROW_LABELS.get(_s(d.get("cellRow")), "")
    col = COL_LABELS.get(_s(d.get("cellCol")), "")
    if row == col:  # « milieu milieu » se lit mal
        return row
    return f"{row} {col}".strip()


def _draw_car(
    c: canvas.Canvas,
    x0: float,
    y_top: float,
    width: float,
    damages: list[dict] | None = None,
) -> float:
    """Dessine la vue de dessus. Retourne la hauteur occupée.

    x0 / y_top : coin supérieur gauche sur la page. `damages` est la liste déjà
    numérotée (clé `_n` posée par l'appelant) ; None ou vide ⇒ schéma vierge.
    """
    scale = width / CAR_W
    height = CAR_H * scale

    def px(cx: float) -> float:
        return x0 + cx * scale

    def py(cy: float) -> float:
        # Repère voiture : y croît vers l'arrière ; page : y croît vers le haut.
        return y_top - cy * scale

    # Zones : fond très clair, filets fins. Le vitrage se distingue par un fond
    # légèrement plus soutenu, sinon la lecture du schéma est confuse.
    c.setLineWidth(0.3)
    for code, (zx, zy, zw, zh) in ZONES.items():
        is_glass = code.startswith("window") or code in ("windshield", "rearWindow")
        c.setFillColor(colors.HexColor("#E8EDF2") if is_glass else colors.white)
        c.setStrokeColor(GRAY_LINE)
        c.rect(px(zx), py(zy + zh), zw * scale, zh * scale, fill=1, stroke=1)

    # Étiquettes des éléments centraux
    c.setFont("Helvetica", 5.5)
    c.setFillColor(GRAY_MUTED)
    for code, caption in _ZONE_CAPTIONS.items():
        zx, zy, zw, _zh = ZONES[code]
        # En haut de la zone, pas en son centre : un dégât en case « milieu milieu »
        # tombe pile au centre et masquait l'étiquette.
        c.drawCentredString(px(zx + zw / 2), py(zy + 7), caption)

    # Contour de la caisse par-dessus le pavage
    c.setStrokeColor(BLUE)
    c.setLineWidth(1.1)
    c.roundRect(px(2), py(238), 96 * scale, 236 * scale, 6 * scale, fill=0, stroke=1)

    # Roues, purement décoratives (aucune zone cliquable, aucun dégât ne s'y pose) :
    # sans elles le pavage se lit comme une grille de rectangles et non comme une
    # voiture. À cheval sur le bord de caisse, aux quatre positions d'essieu.
    c.setFillColor(colors.HexColor("#4B5563"))
    c.setStrokeColor(colors.HexColor("#374151"))
    c.setLineWidth(0.3)
    for wx in WHEELS_X:
        for wy in WHEELS_Y:
            c.roundRect(
                px(wx), py(wy + WHEEL_H), WHEEL_W * scale, WHEEL_H * scale,
                1.2 * scale, fill=1, stroke=1,
            )

    # Repère « AVANT »
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColor(BLUE)
    c.drawCentredString(px(50), y_top + 2.2 * mm, "AVANT")
    c.setLineWidth(0.7)
    c.line(px(50), y_top + 1.8 * mm, px(50), y_top + 0.4 * mm)
    c.line(px(50), y_top + 1.9 * mm, px(48.5), y_top + 1.0 * mm)
    c.line(px(50), y_top + 1.9 * mm, px(51.5), y_top + 1.0 * mm)

    if not damages:
        return height

    # Marqueurs numérotés. Plusieurs dégâts peuvent viser la même case (une rayure
    # ET un enfoncement, autorisé en base) : on les décale horizontalement autour
    # du centre de la case au lieu de les superposer.
    groups: dict[tuple[str, str, str], list[dict]] = {}
    for d in damages:
        key = (_s(d.get("element")), _s(d.get("cellRow")), _s(d.get("cellCol")))
        groups.setdefault(key, []).append(d)

    radius = 1.5 * mm
    for (element, row, col), items in groups.items():
        zone = ZONES.get(element)
        if zone is None:  # code inconnu (donnée plus récente que ce code) : ignoré
            continue
        zx, zy, zw, zh = zone
        ci = _COL_INDEX.get(col, 1)
        ri = _ROW_INDEX.get(row, 1)
        cx = zx + (ci + 0.5) * zw / 3
        cy = zy + (ri + 0.5) * zh / 3
        # Bornes de la zone, en coordonnées page. Un marqueur doit rester DANS son
        # élément : le bas de caisse ne fait que 7 unités de large, soit à peine
        # plus que le marqueur, et sans bornage le cercle chevauchait le contour de
        # la caisse — on le lisait comme un dégât hors du véhicule.
        x_min, x_max = px(zx) + radius, px(zx + zw) - radius
        y_min, y_max = py(zy + zh) + radius, py(zy) - radius
        for i, d in enumerate(items):
            offset = (i - (len(items) - 1) / 2) * (radius * 2.1)
            mx = px(cx) + offset
            my = py(cy)
            # Zone plus étroite que le marqueur : on centre, faute de mieux.
            mx = (px(zx) + px(zx + zw)) / 2 if x_max < x_min else min(max(mx, x_min), x_max)
            my = (py(zy) + py(zy + zh)) / 2 if y_max < y_min else min(max(my, y_min), y_max)
            c.setFillColor(colors.HexColor("#C2410C"))
            c.setStrokeColor(colors.white)
            c.setLineWidth(0.6)
            c.circle(mx, my, radius, fill=1, stroke=1)
            c.setFont("Helvetica-Bold", 5)
            c.setFillColor(colors.white)
            c.drawCentredString(mx, my - 1.7, str(d.get("_n", "")))

    return height


def _wrap_hard(c: canvas.Canvas, text: str, font: str, size: float, max_w: float) -> list[str]:
    """Comme _wrap, mais coupe aussi les mots plus larges que la colonne.

    _wrap (billing_pdf) ne découpe que sur les espaces : un mot trop long est écrit
    tel quel et sort de la marge. Une observation de dégât ou une clause peut
    contenir un jeton insécable (VIN, plaque collée, URL, texte tapé sans espaces),
    et la colonne note ne fait que 97 mm — d'où cette coupe caractère par caractère
    en dernier recours. _wrap n'est pas modifié : il sert aussi aux factures.
    """
    out: list[str] = []
    for line in _wrap(c, text, font, size, max_w):
        if c.stringWidth(line, font, size) <= max_w:
            out.append(line)
            continue
        current = ""
        for ch in line:
            if c.stringWidth(current + ch, font, size) > max_w and current:
                out.append(current)
                current = ch
            else:
                current += ch
        if current:
            out.append(current)
    return out or [""]


def _damage_blocks(c: canvas.Canvas, damages: list[dict], note_w: float) -> list[dict]:
    """Pré-découpe chaque ligne du tableau et mesure sa hauteur.

    Les observations sont enveloppées une seule fois, à la largeur de la colonne
    étroite (celle qui longe le schéma). Une ligne repoussée en pleine largeur
    reste donc enveloppée un peu court : sans conséquence, et cela garantit que la
    hauteur mesurée ici vaut partout.
    """
    blocks: list[dict] = []
    for d in damages:
        note = _s(d.get("note"))
        lines = _wrap_hard(c, note, "Helvetica-Oblique", 7, note_w) if note else []
        blocks.append({"d": d, "lines": lines, "h": 4.2 * mm + 3.6 * mm * len(lines)})
    return blocks


def _damage_table_header(c: canvas.Canvas, x: float, y: float, w: float) -> float:
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(BLUE)
    c.drawString(x, y, "N°")
    c.drawString(x + 7 * mm, y, "ÉLÉMENT")
    c.drawString(x + 42 * mm, y, "EMPLACEMENT")
    c.drawString(x + 66 * mm, y, "NATURE")
    y -= 2 * mm
    c.setStrokeColor(GRAY_LINE)
    c.setLineWidth(0.4)
    c.line(x, y, x + w, y)
    return y - 4 * mm


def _draw_damage_block(c: canvas.Canvas, b: dict, x: float, y: float) -> float:
    d = b["d"]
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(colors.HexColor("#C2410C"))
    c.drawString(x, y, str(d.get("_n", "")))
    c.setFont("Helvetica", 7.5)
    c.setFillColor(GRAY_TXT)
    c.drawString(x + 7 * mm, y, ELEMENT_LABELS.get(_s(d.get("element")), _s(d.get("element"))))
    c.drawString(x + 42 * mm, y, _damage_location(d))
    c.drawString(x + 66 * mm, y, TYPE_LABELS.get(_s(d.get("type")), _s(d.get("type"))))
    y -= 4.2 * mm
    if b["lines"]:
        c.setFont("Helvetica-Oblique", 7)
        c.setFillColor(GRAY_MUTED)
        for line in b["lines"]:
            c.drawString(x + 7 * mm, y, line)
            y -= 3.6 * mm
    return y


def _section_title(s: _State, title: str) -> None:
    s.need(14 * mm)
    s.move(6 * mm)
    s.c.setFillColor(GRAY_BG)
    s.c.rect(ML, s.y - 1.5 * mm, CW, 6 * mm, fill=1, stroke=0)
    s.text(ML + 2 * mm, title.upper(), font="Helvetica-Bold", size=8, color=BLUE)
    s.move(7 * mm)


def _kv_row(s: _State, pairs: list[tuple[str, str]]) -> None:
    """Une ligne de couples libellé/valeur répartis sur la largeur utile."""
    if not pairs:
        return
    s.need(10 * mm)
    col_w = CW / len(pairs)
    for i, (label, value) in enumerate(pairs):
        x = ML + i * col_w
        s.c.setFont("Helvetica", 7)
        s.c.setFillColor(GRAY_MUTED)
        s.c.drawString(x, s.y, label.upper())
        s.c.setFont("Helvetica-Bold", 9)
        s.c.setFillColor(GRAY_TXT)
        s.c.drawString(x, s.y - 4.5 * mm, value)
    s.move(9 * mm)


def generate_loan_contract_pdf(
    res: dict,
    vehicle: dict,
    client: dict,
    company: dict | None,
    damages: list[dict],
    terms: str | None,
) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    s = _State(c)

    numbered = [dict(d, _n=i + 1) for i, d in enumerate(damages)]

    # ── Bandeau ───────────────────────────────────────────────────────────────
    c.setFillColor(BLUE)
    c.rect(0, PAGE_H - 26 * mm, PAGE_W, 26 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(ML, PAGE_H - 13 * mm, "CONTRAT DE PRÊT DE VÉHICULE")
    c.setFont("Helvetica", 8.5)
    c.drawString(ML, PAGE_H - 20 * mm, "Véhicule de courtoisie mis à disposition")
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(PAGE_W - MR, PAGE_H - 12 * mm, f"N° {_s(res.get('id'))}")
    c.setFont("Helvetica", 8.5)
    c.drawRightString(PAGE_W - MR, PAGE_H - 19 * mm, _s(vehicle.get("uniqueNumber")))

    s.y = PAGE_H - 30 * mm

    # ── Prêteur / Emprunteur ──────────────────────────────────────────────────
    col2 = ML + CW / 2 + 5 * mm
    y_top = s.y
    company = company or {}

    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(BLUE)
    c.drawString(ML, y_top, "PRÊTEUR")
    c.drawString(col2, y_top, "EMPRUNTEUR")

    garage_rows = [
        _s(company.get("name")),
        _s(company.get("addressLine1")),
        f"{_s(company.get('postalCode'))} {_s(company.get('city'))}".strip(),
        (f"Tél. {company['phone']}" if company.get("phone") else ""),
        _s(company.get("email")),
    ]
    client_name = " ".join(
        filter(None, [(_s(client.get("lastName")) or "").upper(), _s(client.get("firstName"))])
    ).strip()
    client_rows = [
        client_name,
        _s(client.get("address")),
        f"{_s(client.get('postalCode'))} {_s(client.get('city'))}".strip(),
        (f"Tél. {client['phone']}" if client.get("phone") else ""),
        _s(client.get("email")),
    ]

    y_l = y_r = y_top - 5 * mm
    c.setFont("Helvetica", 8.5)
    c.setFillColor(GRAY_TXT)
    for row in garage_rows:
        if row:
            c.drawString(ML, y_l, row)
            y_l -= 4.3 * mm
    for row in client_rows:
        if row:
            c.drawString(col2, y_r, row)
            y_r -= 4.3 * mm

    s.y = min(y_l, y_r) - 1 * mm

    # ── Véhicule prêté ────────────────────────────────────────────────────────
    _section_title(s, "Véhicule prêté")
    brand_model = " ".join(filter(None, [_s(vehicle.get("brand")), _s(vehicle.get("model"))])).strip()
    _kv_row(
        s,
        [
            ("N° de parc", _s(vehicle.get("uniqueNumber")) or "—"),
            ("Marque et modèle", brand_model or "—"),
            ("Immatriculation", _s(vehicle.get("licensePlate")) or "—"),
        ],
    )

    # ── Période et relevés ────────────────────────────────────────────────────
    _section_title(s, "Période du prêt")
    end = _date(res.get("endDate")) if res.get("endDate") else "En cours"
    _kv_row(
        s,
        [
            ("Date de départ", _date(res.get("startDate")) or "—"),
            ("Date de retour prévue", end),
        ],
    )
    _kv_row(
        s,
        [
            ("Km au départ", _km(res.get("startMileage"))),
            ("Carburant au départ", _eighths(res.get("fuelLevelEighths"))),
            ("Km au retour", _km(res.get("endMileage"))),
            ("Carburant au retour", _eighths(res.get("endFuelLevelEighths"))),
        ],
    )

    # ── État au départ : schéma + tableau ─────────────────────────────────────
    _section_title(s, "État du véhicule au départ")
    s.need(95 * mm)

    diagram_w = 52 * mm
    diagram_top = s.y - 3 * mm
    diagram_h = _draw_car(c, ML + 4 * mm, diagram_top, diagram_w, numbered)
    diagram_bottom = diagram_top - diagram_h

    # Tableau des dégâts : d'abord dans la colonne qui longe le schéma, puis — s'il
    # reste des lignes — en pleine largeur sous le schéma, avec sauts de page. Les
    # marqueurs numérotés du schéma doivent TOUS avoir leur ligne : un contrat qui
    # montre un repère sans l'expliquer ne vaut rien.
    tx = ML + diagram_w + 14 * mm
    tw = PAGE_W - MR - tx

    if not numbered:
        c.setFont("Helvetica-Oblique", 8.5)
        c.setFillColor(GRAY_MUTED)
        c.drawString(tx, diagram_top - 4 * mm, "Aucun dégât relevé sur ce véhicule.")
        s.y = diagram_bottom
    else:
        blocks = _damage_blocks(c, numbered, tw - 7 * mm)
        ty = _damage_table_header(c, tx, diagram_top, tw)

        remaining = blocks
        for i, b in enumerate(blocks):
            # On s'arrête au bas du schéma : au-delà, la colonne passerait sous le
            # dessin et la lecture « marqueur → ligne » se perdrait.
            if ty - b["h"] < max(diagram_bottom, MB):
                remaining = blocks[i:]
                break
            ty = _draw_damage_block(c, b, tx, ty)
            remaining = []

        s.y = min(diagram_bottom, ty)

        if remaining:
            s.move(6 * mm)
            ty = _damage_table_header(c, ML, s.y, CW)
            for b in remaining:
                if ty - b["h"] < MB:
                    c.showPage()
                    ty = _damage_table_header(c, ML, PAGE_H - MT, CW)
                ty = _draw_damage_block(c, b, ML, ty)
            s.y = ty

    s.move(6 * mm)

    # ── Constat de retour : schéma vierge ─────────────────────────────────────
    _section_title(s, "Constat de retour — à compléter à la restitution")
    s.need(95 * mm)
    c.setFont("Helvetica-Oblique", 7.5)
    c.setFillColor(GRAY_MUTED)
    c.drawString(
        ML + 4 * mm,
        s.y,
        "Entourer les dégâts constatés au retour et les décrire ci-contre.",
    )
    s.move(5 * mm)
    blank_h = _draw_car(c, ML + 4 * mm, s.y - 3 * mm, diagram_w, None)

    # Lignes vierges pour la description manuscrite
    lx = ML + diagram_w + 14 * mm
    lw = PAGE_W - MR - lx
    ly = s.y - 6 * mm
    c.setStrokeColor(GRAY_LINE)
    c.setLineWidth(0.4)
    while ly > s.y - blank_h:
        c.line(lx, ly, lx + lw, ly)
        ly -= 8 * mm

    s.move(blank_h + 6 * mm)

    # ── Conditions ────────────────────────────────────────────────────────────
    if terms and terms.strip():
        _section_title(s, "Conditions du prêt")
        c.setFillColor(GRAY_TXT)
        for paragraph in terms.replace("\r\n", "\n").split("\n"):
            if not paragraph.strip():
                s.move(2.5 * mm)
                continue
            for line in _wrap_hard(c, paragraph, "Helvetica", 7.5, CW - 4 * mm):
                s.need(6 * mm)
                s.text(ML + 2 * mm, line, size=7.5)
                s.move(3.6 * mm)

    # ── Signatures ────────────────────────────────────────────────────────────
    _section_title(s, "Signatures")
    s.need(38 * mm)
    box_w = (CW - 8 * mm) / 2
    box_h = 26 * mm
    for i, (title, subtitle) in enumerate(
        [
            ("Le prêteur", _s(company.get("name"))),
            ("L'emprunteur", "Précédé de la mention « lu et approuvé »"),
        ]
    ):
        bx = ML + i * (box_w + 8 * mm)
        c.setStrokeColor(GRAY_LINE)
        c.setLineWidth(0.5)
        c.rect(bx, s.y - box_h, box_w, box_h, fill=0, stroke=1)
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(BLUE)
        c.drawString(bx + 2 * mm, s.y - 5 * mm, title)
        if subtitle:
            c.setFont("Helvetica-Oblique", 6.5)
            c.setFillColor(GRAY_MUTED)
            c.drawString(bx + 2 * mm, s.y - 9 * mm, subtitle)
    s.move(box_h + 4 * mm)
    s.text(ML, "Fait à ......................................  le ....../....../..........", size=8)

    c.showPage()
    c.save()
    return buf.getvalue()
