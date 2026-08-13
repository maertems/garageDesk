"""Contrat de prêt de véhicule — génération PDF (migration 025).

Même socle que billing_pdf.py : reportlab pur Python, Helvetica (Latin-1 couvre
le français), A4. Les helpers y sont réutilisés plutôt que recopiés.

API publique :
  generate_loan_contract_pdf(res, vehicle, client, company, damages, terms) → bytes

Le contrat tient sur une page. Sa partie basse est en deux colonnes séparées par
un filet vertical — état de départ à gauche, état de restitution à droite — et
chacune porte sa date, son kilométrage, sa jauge de carburant, un schéma du
véhicule, un cadre d'observations, une date et une signature. Seul le schéma de
départ reçoit les dégâts enregistrés en base, sous forme de points marqués de
l'initiale de leur nature (R/E/B/M) ; celui de restitution est vierge, à annoter
au stylo. Les conditions du prêt ferment le document : leur longueur est libre,
c'est donc le seul élément susceptible de déborder sur un second feuillet.

Limite assumée du schéma : une vue de dessus ne montre pas l'axe vertical d'un
élément (le haut d'une portière n'est pas distinguable de son bas). La grille 3×3
sert donc de grille de placement dans l'empreinte de l'élément.
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

# Référentiel des libellés français, tenu en phase avec frontEnd/src/lib/loanDamage.ts.
# Depuis la refonte du contrat en deux colonnes, ils ne sont plus imprimés : le
# schéma porte des points marqués R/E/B/M et l'emplacement se lit sur le dessin.
# Ils restent la source à utiliser pour réintroduire un tableau descriptif.
ROW_LABELS: dict[str, str] = {"top": "haut", "middle": "milieu", "bottom": "bas"}
COL_LABELS: dict[str, str] = {"left": "gauche", "center": "milieu", "right": "droite"}
TYPE_LABELS: dict[str, str] = {
    "scratch": "Rayure",
    "dent": "Enfoncement",
    "broken": "Bris",
    "missing": "Manquant",
}

# Initiale portée par le point posé sur le schéma. Une lettre plutôt qu'une
# couleur : les contrats sortent d'une imprimante noir et blanc, où quatre teintes
# deviendraient quatre gris voisins.
TYPE_INITIALS: dict[str, str] = {
    "scratch": "R",
    "dent": "E",
    "broken": "B",
    "missing": "M",
}
LEGEND_TEXT = "R rayure · E enfoncement · B bris · M manquant"

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



def _km(v) -> str:
    """Kilométrage espacé par milliers. Vide si inconnu : pas de tiret de
    remplissage, la place reste blanche pour une saisie à la main."""
    if v is None:
        return ""
    try:
        return f"{int(v):,}".replace(",", " ") + " km"
    except (TypeError, ValueError):
        return ""



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

    # Points de dégât, portant l'initiale de leur nature (R/E/B/M). Plusieurs
    # dégâts peuvent viser la même case (une rayure ET un enfoncement, autorisé en
    # base) : on les décale horizontalement autour du centre de la case au lieu de
    # les superposer.
    groups: dict[tuple[str, str, str], list[dict]] = {}
    for d in damages:
        key = (_s(d.get("element")), _s(d.get("cellRow")), _s(d.get("cellCol")))
        groups.setdefault(key, []).append(d)

    # Rayon exprimé en unités de la voiture, donc proportionnel au dessin : le même
    # code sert au grand schéma d'origine et aux deux petits, côte à côte.
    radius = 3.2 * scale
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

        # Sens de l'éventail. Un éventail horizontal dans une zone étroite est
        # écrasé par le bornage ci-dessous et les points finissent superposés — une
        # portière fait 11 unités de large pour 56 de haut. On éventaille donc selon
        # l'axe qui a de la place, en comprimant le pas plutôt qu'en empilant.
        n = len(items)
        step = radius * 2.1
        span_x = max(0.0, x_max - x_min)
        span_y = max(0.0, y_max - y_min)
        horizontal = (n - 1) * step <= span_x
        if not horizontal and n > 1 and (n - 1) * step > span_y:
            step = span_y / (n - 1)

        for i, d in enumerate(items):
            offset = (i - (n - 1) / 2) * step
            mx = px(cx) + (offset if horizontal else 0.0)
            my = py(cy) + (0.0 if horizontal else offset)
            # Zone plus étroite que le marqueur : on centre, faute de mieux.
            mx = (px(zx) + px(zx + zw)) / 2 if x_max < x_min else min(max(mx, x_min), x_max)
            my = (py(zy) + py(zy + zh)) / 2 if y_max < y_min else min(max(my, y_min), y_max)
            c.setFillColor(colors.HexColor("#C2410C"))
            c.setStrokeColor(colors.white)
            c.setLineWidth(0.6)
            c.circle(mx, my, radius, fill=1, stroke=1)
            initial = TYPE_INITIALS.get(_s(d.get("type")), "")
            if initial:
                size = radius * 1.35
                c.setFont("Helvetica-Bold", size)
                c.setFillColor(colors.white)
                c.drawCentredString(mx, my - size * 0.36, initial)

    return height


def _fuel_gauge(c: canvas.Canvas, x: float, y_top: float, width: float, level) -> float:
    """Jauge de carburant, même dessin que FuelGauge.tsx de la fiche de réservation.

    Huit segments séparés par trois repères sombres — vide, moitié, plein — et
    remplis jusqu'au niveau. Les proportions viennent du composant (repère 6 px,
    segment 28 px, hauteur 36 px), pour que le papier et l'écran montrent la même
    chose. Niveau inconnu : jauge vide, à noircir à la main.

    Retourne la hauteur totale occupée, libellés E/½/F compris.
    """
    unit = width / 242.0
    tick_w = 6 * unit
    seg_w = 28 * unit
    h = 36 * unit
    y = y_top - h

    try:
        lvl = int(level) if level is not None else 0
    except (TypeError, ValueError):
        lvl = 0

    # Cadre général
    c.setFillColor(colors.white)
    c.setStrokeColor(GRAY_LINE)
    c.setLineWidth(0.4)
    c.roundRect(x, y, width, h, 0.5 * mm, fill=1, stroke=1)

    cx = x
    tick_centers: list[float] = []
    for group in (0, 1):
        # Repère sombre (E, puis ½, puis F après la seconde série)
        c.setFillColor(GRAY_TXT)
        c.rect(cx, y, tick_w, h, fill=1, stroke=0)
        tick_centers.append(cx + tick_w / 2)
        cx += tick_w
        for i in range(1, 5):
            seg = group * 4 + i
            c.setFillColor(BLUE if seg <= lvl else colors.white)
            c.setStrokeColor(GRAY_LINE)
            c.setLineWidth(0.3)
            c.rect(cx, y, seg_w, h, fill=1, stroke=1)
            cx += seg_w
    c.setFillColor(GRAY_TXT)
    c.rect(cx, y, tick_w, h, fill=1, stroke=0)
    tick_centers.append(cx + tick_w / 2)

    # Libellés sous les trois repères
    c.setFont("Helvetica-Bold", 5)
    c.setFillColor(GRAY_MUTED)
    for center, label in zip(tick_centers, ("E", "½", "F")):
        c.drawCentredString(center, y - 3 * mm, label)

    return h + 4 * mm


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


def _column_field(
    c: canvas.Canvas, x: float, y: float, label: str, value: str
) -> float:
    """Un couple libellé / valeur dans une colonne. Retourne le y suivant.

    Une valeur vide laisse la place blanche : au retour, le kilométrage et la
    jauge ne sont pas connus à l'impression et se remplissent à la main.
    """
    c.setFont("Helvetica", 6.5)
    c.setFillColor(GRAY_MUTED)
    c.drawString(x, y, label.upper())
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(GRAY_TXT)
    c.drawString(x + 26 * mm, y, value)
    return y - 5 * mm


def _comment_box(c: canvas.Canvas, x: float, y_top: float, w: float, h: float) -> float:
    """Cadre de commentaire manuscrit, avec lignes d'écriture. Retourne son bas."""
    c.setStrokeColor(GRAY_LINE)
    c.setLineWidth(0.4)
    c.rect(x, y_top - h, w, h, fill=0, stroke=1)
    c.setFont("Helvetica", 6)
    c.setFillColor(GRAY_MUTED)
    c.drawString(x + 1.5 * mm, y_top - 3.5 * mm, "Observations")
    c.setStrokeColor(colors.HexColor("#E5E7EB"))
    c.setLineWidth(0.3)
    line_y = y_top - 8 * mm
    while line_y > y_top - h + 2 * mm:
        c.line(x + 1.5 * mm, line_y, x + w - 1.5 * mm, line_y)
        line_y -= 4.5 * mm
    return y_top - h


def _signature_box(c: canvas.Canvas, x: float, y_top: float, w: float) -> float:
    """Date + signature d'un état. Retourne son bas."""
    c.setFont("Helvetica", 6.5)
    c.setFillColor(GRAY_MUTED)
    c.drawString(x, y_top, "DATE")
    c.setStrokeColor(GRAY_LINE)
    c.setLineWidth(0.4)
    c.line(x + 10 * mm, y_top - 0.7 * mm, x + w, y_top - 0.7 * mm)

    y = y_top - 6 * mm
    c.setFont("Helvetica", 6.5)
    c.setFillColor(GRAY_MUTED)
    c.drawString(x, y, "SIGNATURE")
    box_h = 12 * mm
    c.setStrokeColor(GRAY_LINE)
    c.rect(x, y - 2 * mm - box_h, w, box_h, fill=0, stroke=1)
    return y - 2 * mm - box_h


def generate_loan_contract_pdf(
    res: dict,
    vehicle: dict,
    client: dict,
    company: dict | None,
    damages: list[dict],
    terms: str | None,
) -> bytes:
    """Contrat de prêt, tenant sur une page (hors conditions volumineuses).

    La partie basse est en deux colonnes séparées par un filet vertical : état de
    départ à gauche, état de restitution à droite. Chaque colonne porte ses relevés,
    son schéma du véhicule, un espace de commentaire, une date et une signature.
    Seul le schéma de départ reçoit les dégâts enregistrés en base ; celui de
    restitution est vierge, à annoter au stylo.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    s = _State(c)

    # ── Bandeau ───────────────────────────────────────────────────────────────
    c.setFillColor(BLUE)
    c.rect(0, PAGE_H - 21 * mm, PAGE_W, 21 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 17)
    c.drawString(ML, PAGE_H - 11 * mm, "CONTRAT DE PRÊT DE VÉHICULE")
    c.setFont("Helvetica", 8)
    c.drawString(ML, PAGE_H - 16.5 * mm, "Véhicule de courtoisie mis à disposition")
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(PAGE_W - MR, PAGE_H - 11 * mm, f"N° {_s(res.get('id'))}")

    s.y = PAGE_H - 25 * mm

    # ── Prêteur / Emprunteur ──────────────────────────────────────────────────
    col2 = ML + CW / 2 + 5 * mm
    y_top = s.y
    company = company or {}

    c.setFont("Helvetica-Bold", 7.5)
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

    y_l = y_r = y_top - 4.5 * mm
    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY_TXT)
    for row in garage_rows:
        if row:
            c.drawString(ML, y_l, row)
            y_l -= 3.7 * mm
    for row in client_rows:
        if row:
            c.drawString(col2, y_r, row)
            y_r -= 3.7 * mm

    s.y = min(y_l, y_r) - 1 * mm

    # ── Véhicule prêté ────────────────────────────────────────────────────────
    # Le numéro de parc a été retiré : la plaque et le couple marque/modèle
    # identifient le véhicule sans ambiguïté pour l'emprunteur.
    # Titre compact : un bandeau de section pleine largeur coûtait 13 mm de haut,
    # trop cher en tête de page pour un bloc d'une seule ligne.
    s.move(4 * mm)
    s.text(ML, "VÉHICULE PRÊTÉ", font="Helvetica-Bold", size=7, color=BLUE)
    s.move(1.5 * mm)
    s.hrule()
    s.move(4.5 * mm)
    brand_model = " ".join(
        filter(None, [_s(vehicle.get("brand")), _s(vehicle.get("model"))])
    ).strip()
    _kv_row(
        s,
        [
            ("Marque et modèle", brand_model),
            ("Immatriculation", _s(vehicle.get("licensePlate"))),
        ],
    )

    # ── Départ / Restitution, en deux colonnes ────────────────────────────────
    section_top = s.y - 1 * mm
    gutter = 10 * mm
    col_w = (CW - gutter) / 2
    left_x = ML
    right_x = ML + col_w + gutter

    c.setFillColor(GRAY_BG)
    c.rect(ML, section_top - 6 * mm, CW, 6 * mm, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(BLUE)
    c.drawString(left_x + 2 * mm, section_top - 4.2 * mm, "ÉTAT DE DÉPART")
    c.drawString(right_x + 2 * mm, section_top - 4.2 * mm, "ÉTAT DE RESTITUTION")

    y = section_top - 9.5 * mm

    # Relevés : mêmes intitulés de part et d'autre, valeurs vides quand inconnues
    yl = _column_field(c, left_x, y, "Date", _date(res.get("startDate")))
    yl = _column_field(c, left_x, yl, "Kilométrage", _km(res.get("startMileage")))

    yr = _column_field(c, right_x, y, "Date", _date(res.get("endDate")))
    yr = _column_field(c, right_x, yr, "Kilométrage", _km(res.get("endMileage")))

    # Carburant : la jauge dessinée, comme dans la fiche de réservation. Le libellé
    # garde son alignement, la jauge prend la place de la valeur.
    y_fuel = min(yl, yr)
    gauge_w = 40 * mm
    for x0, lvl in (
        (left_x, res.get("fuelLevelEighths")),
        (right_x, res.get("endFuelLevelEighths")),
    ):
        c.setFont("Helvetica", 6.5)
        c.setFillColor(GRAY_MUTED)
        c.drawString(x0, y_fuel, "CARBURANT")
        gauge_h = _fuel_gauge(c, x0 + 26 * mm, y_fuel + 2.6 * mm, gauge_w, lvl)

    # Une ligne sautée entre le carburant et les dessins
    y = y_fuel - gauge_h - 5 * mm

    # Les deux schémas, côte à côte, centrés dans leur colonne
    diagram_w = 38 * mm
    diagram_x_left = left_x + (col_w - diagram_w) / 2
    diagram_x_right = right_x + (col_w - diagram_w) / 2
    diagram_h = _draw_car(c, diagram_x_left, y, diagram_w, damages)
    _draw_car(c, diagram_x_right, y, diagram_w, None)
    y -= diagram_h + 4 * mm

    # Légende, sous le seul schéma qui porte des points
    if damages:
        c.setFont("Helvetica", 5.5)
        c.setFillColor(GRAY_MUTED)
        c.drawCentredString(left_x + col_w / 2, y, LEGEND_TEXT)
    c.setFont("Helvetica-Oblique", 5.5)
    c.setFillColor(GRAY_MUTED)
    c.drawCentredString(
        right_x + col_w / 2, y, "Entourer les dégâts constatés à la restitution"
    )
    y -= 3.5 * mm

    # Espace commentaire, un par état
    box_h = 16 * mm
    _comment_box(c, left_x, y, col_w, box_h)
    _comment_box(c, right_x, y, col_w, box_h)
    y -= box_h + 5 * mm

    # Deux dates, deux signatures
    bottom_left = _signature_box(c, left_x, y, col_w)
    bottom_right = _signature_box(c, right_x, y, col_w)
    section_bottom = min(bottom_left, bottom_right) - 2 * mm

    # Filet vertical sur toute la hauteur de la partie : c'est lui qui sépare
    # visuellement le départ de la restitution, du bandeau des titres jusqu'au bas
    # des signatures.
    c.setStrokeColor(GRAY_LINE)
    c.setLineWidth(0.6)
    c.line(ML + col_w + gutter / 2, section_top - 6 * mm, ML + col_w + gutter / 2, section_bottom)

    s.y = section_bottom - 2 * mm

    # ── Conditions ────────────────────────────────────────────────────────────
    # Texte libre saisi par le garage : sa longueur décide seule d'un éventuel
    # second feuillet, le corps du contrat tenant sur une page.
    if terms and terms.strip():
        # Titre compact : chaque millimètre gagné ici est une ligne de clauses
        # de plus sur la page.
        s.move(4 * mm)
        s.text(ML, "CONDITIONS DU PRÊT", font="Helvetica-Bold", size=7, color=BLUE)
        s.move(1.5 * mm)
        s.hrule()
        s.move(3.5 * mm)
        c.setFillColor(GRAY_TXT)
        for paragraph in terms.replace("\r\n", "\n").split("\n"):
            if not paragraph.strip():
                s.move(2 * mm)
                continue
            for line in _wrap_hard(c, paragraph, "Helvetica", 6.5, CW - 4 * mm):
                s.need(5 * mm)
                s.text(ML + 2 * mm, line, size=6.5)
                s.move(3 * mm)

    c.showPage()
    c.save()
    return buf.getvalue()
