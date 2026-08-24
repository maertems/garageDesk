"""Contrat de prêt de véhicule — génération PDF (migration 025).

reportlab pur Python, Helvetica, A4. Seuls les helpers NEUTRES de billing_pdf.py
sont réutilisés — `_wrap`, `_date`, `_s` — et non son habillage. `_State` non plus :
son curseur saute la page sans retracer le cadre, et ses couleurs par défaut sont
les gris des factures.

API publique :
  generate_loan_contract_pdf(res, vehicle, client, company, damages, terms, logo) → bytes

Habillage : imprimé administratif, calqué sur les factures que le garage édite
déjà, pour que les deux papiers se rangent dans le même dossier client. Mesuré sur
un exemplaire de référence :

  * un cadre noir à 6,2 mm des quatre bords, règles sur 197,6 mm ;
  * aucune couleur, aucun aplat — noir sur blanc, filets fins ;
  * une seule police (Arimo sur la référence, clone métrique d'Arial, donc
    Helvetica ici transpose les largeurs sans embarquer de fonte) ;
  * un corps unique de 10 pt, 14 gras pour la raison sociale, 8 pt pour le menu ;
  * des relevés en cellules réglées plutôt qu'en blocs colorés ;
  * le logo en haut à droite, jusqu'à 78 × 30 mm, posé sur le blanc.

Deux écarts assumés par rapport à la référence :

  * les blocs d'identité gardent leurs libellés PRÊTEUR et EMPRUNTEUR. Sur une
    facture l'émetteur se devine ; sur un contrat, savoir qui prête et qui emprunte
    a une portée juridique ;
  * le vitrage du schéma garde un aplat très clair. C'est le seul du document :
    sans lui, les vitres latérales — qui n'ont pas la place de porter un libellé —
    ne se distinguent plus des portières.

Le contrat tient sur une page. Sa partie basse est en deux colonnes séparées par un
filet vertical — état de départ à gauche, restitution à droite — et chacune porte
sa date, son kilométrage, sa jauge de carburant, un schéma du véhicule, un cadre
d'observations, une date et une signature. Le corps y descend à 8 et 7 pt : c'est
le compromis qui garde le document sur un seul feuillet. Seul le schéma de départ
reçoit les dégâts enregistrés en base, sous forme de points marqués de l'initiale
de leur nature (R/E/B/M) ; celui de restitution est vierge, à annoter au stylo. Les
conditions du prêt ferment le document : leur longueur est libre, c'est donc le
seul élément susceptible de déborder sur un second feuillet.

Limite assumée du schéma : une vue de dessus ne montre pas l'axe vertical d'un
élément (le haut d'une portière n'est pas distinguable de son bas). La grille 3×3
sert donc de grille de placement dans l'empreinte de l'élément.
"""

import io

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.lib.units import mm
from reportlab.lib import colors

from app.services.billing_pdf import (
    PAGE_W,
    PAGE_H,
    _date,
    _s,
    _wrap,
)

# ── Habillage : cadre, filets, corps ─────────────────────────────────────────
# Valeurs relevées sur la facture de référence. Le cadre est à 6,2 mm des quatre
# bords ; le texte respire de 3 mm à l'intérieur, sinon il colle au filet.
FRAME = 6.2 * mm
PAD = 3 * mm
CL = FRAME + PAD                    # bord gauche du texte
CR = PAGE_W - FRAME - PAD           # bord droit du texte
CONTENT_W = CR - CL

INK = colors.black                  # une seule encre : le document part sur une
                                    # imprimante noir et blanc et se photocopie.
FRAME_LW = 0.8
RULE_LW = 0.5
HAIR_LW = 0.3

# Corps. La référence n'en emploie que trois ; les deux plus petits servent
# uniquement à la partie départ/restitution, pour tenir sur une page.
FS_NAME = 14        # raison sociale
FS_BODY = 10        # texte courant, en-têtes de tableau
FS_TERMS = 8        # conditions du prêt
FS_FIELD = 8        # relevés des deux colonnes
FS_LABEL = 7        # libellés des relevés
LEAD = 4.6 * mm     # interligne du texte courant, relevé sur la référence

# Logo : jusqu'à 78 × 30 mm en haut à droite, sans plaque ni cadre derrière —
# contrairement aux factures de l'application, dont le bandeau sombre en impose
# une. L'image garde ses proportions et se cale en haut à droite du cadre.
#
# Conséquence pour le fichier fourni dans les réglages : à cette emprise, 300 dpi
# demandent 920 × 355 px. C'est donc CE cadre qui fixe la consigne affichée dans
# CompanyLogoSection.tsx, et non celui des factures qui ne réclamerait que
# 440 × 140 px — un fichier calibré pour la facture sortirait deux fois trop
# grossier ici. Les trois endroits doivent rester d'accord : ici,
# billing_pdf.draw_logo et CompanyLogoSection.tsx.
LOGO_W = 78 * mm
LOGO_H = 30 * mm

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

# Aplat du vitrage — le seul du document. Voir l'écart assumé, en tête de module.
GLASS = colors.HexColor("#EDEDED")


def _km(v) -> str:
    """Kilométrage espacé par milliers. Vide si inconnu : pas de tiret de
    remplissage, la place reste blanche pour une saisie à la main."""
    if v is None:
        return ""
    try:
        return f"{int(v):,}".replace(",", " ") + " km"
    except (TypeError, ValueError):
        return ""


def _draw_frame(c: canvas.Canvas) -> float:
    """Trace le cadre de la page et retourne le y du premier texte.

    Appelée pour chaque page, y compris la seconde qu'un texte de conditions
    volumineux peut provoquer : un feuillet sans cadre ne ressemblerait plus à
    l'imprimé, et c'est le cadre qui fait l'unité avec les factures du garage.
    """
    c.setStrokeColor(INK)
    c.setLineWidth(FRAME_LW)
    c.rect(FRAME, FRAME, PAGE_W - 2 * FRAME, PAGE_H - 2 * FRAME, fill=0, stroke=1)
    return PAGE_H - FRAME - PAD


def _datetime(v) -> str:
    """Date suivie de l'heure, celle-ci omise quand elle vaut minuit.

    `loanReservations.startDate/endDate` sont des DATETIME(3), mais la fiche de
    réservation ne propose que des champs `type="date"` : la valeur arrive donc à
    00:00 et imprimer « 12/08/2026 00:00 » serait du bruit sur chaque contrat. Le
    jour où la fiche saisira une heure, elle s'affichera d'elle-même, sans rien
    changer ici.

    `_date` de billing_pdf n'est pas modifié : il tronque à la date, et il sert aux
    factures.
    """
    if not v:
        return ""
    texte = str(v)
    jour = _date(texte)
    heure = texte[11:16] if len(texte) >= 16 else ""
    if not heure or heure == "00:00":
        return jour
    return f"{jour} {heure}"


def _periode(debut, fin) -> str:
    """Libellé de la période de location, tel qu'il figure dans le bandeau.

    Sans terme connu — un prêt en cours —, « du 12/08/2026 » resterait en suspens :
    on écrit « à partir du », qui se lit et qui dit la même chose.
    """
    d, f = _datetime(debut), _datetime(fin)
    if not d:
        return "-"
    return f"du {d} au {f}" if f else f"à partir du {d}"


def _rule(c: canvas.Canvas, y: float, x0: float = FRAME, x1: float | None = None,
          lw: float = RULE_LW) -> None:
    """Règle horizontale. Par défaut, toute la largeur du cadre — c'est ainsi que
    la référence sépare ses blocs, d'un filet qui touche les deux bords."""
    c.setStrokeColor(INK)
    c.setLineWidth(lw)
    c.line(x0, y, PAGE_W - FRAME if x1 is None else x1, y)


def _draw_logo_plain(c: canvas.Canvas, logo: bytes | None, right_x: float, top_y: float) -> float:
    """Logo posé sur le blanc, sans plaque ni cadre. Retourne la hauteur occupée.

    Variante propre au contrat : `draw_logo` de billing_pdf pose une plaque blanche
    sous l'image, indispensable sur le bandeau sombre d'une facture, parasite ici où
    le fond est déjà blanc. L'emprise est aussi bien plus large (78 × 30 mm contre
    40 × 15), à l'image de la référence.

    L'image garde ses proportions et se cale en HAUT à droite : un logo allongé
    occupe alors toute la largeur disponible, un logo carré reste haut de 30 mm.

    Ne dessine rien et ne consomme aucune hauteur si `logo` est None.
    """
    if not logo:
        return 0.0
    try:
        img = ImageReader(io.BytesIO(logo))
        iw, ih = img.getSize()
    except Exception:
        # Fichier illisible malgré le contrôle à l'upload : le contrat sort sans
        # logo plutôt que de ne pas sortir du tout.
        return 0.0
    if not iw or not ih:
        return 0.0

    scale = min(LOGO_W / iw, LOGO_H / ih)
    w, h = iw * scale, ih * scale
    c.drawImage(img, right_x - w, top_y - h, width=w, height=h, mask="auto")
    return h


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

    # Zones : blanches et cernées d'un filet fin. Le vitrage seul reçoit un aplat
    # très clair, sans quoi les vitres latérales ne se distinguent plus des
    # portières — elles n'ont pas la place de porter un libellé.
    c.setLineWidth(HAIR_LW)
    for code, (zx, zy, zw, zh) in ZONES.items():
        is_glass = code.startswith("window") or code in ("windshield", "rearWindow")
        c.setFillColor(GLASS if is_glass else colors.white)
        c.setStrokeColor(INK)
        c.rect(px(zx), py(zy + zh), zw * scale, zh * scale, fill=1, stroke=1)

    # Étiquettes des éléments centraux
    c.setFont("Helvetica", 5.5)
    c.setFillColor(INK)
    for code, caption in _ZONE_CAPTIONS.items():
        zx, zy, zw, _zh = ZONES[code]
        # En haut de la zone, pas en son centre : un dégât en case « milieu milieu »
        # tombe pile au centre et masquait l'étiquette.
        c.drawCentredString(px(zx + zw / 2), py(zy + 7), caption)

    # Contour de la caisse par-dessus le pavage
    c.setStrokeColor(INK)
    c.setLineWidth(1.0)
    c.roundRect(px(2), py(238), 96 * scale, 236 * scale, 6 * scale, fill=0, stroke=1)

    # Roues, purement décoratives (aucune zone cliquable, aucun dégât ne s'y pose) :
    # sans elles le pavage se lit comme une grille de rectangles et non comme une
    # voiture. À cheval sur le bord de caisse, aux quatre positions d'essieu. Pleines
    # et noires : sur un tirage en noir et blanc, c'est ce qui se lit comme un pneu.
    c.setFillColor(INK)
    c.setStrokeColor(INK)
    c.setLineWidth(HAIR_LW)
    for wx in WHEELS_X:
        for wy in WHEELS_Y:
            c.roundRect(
                px(wx), py(wy + WHEEL_H), WHEEL_W * scale, WHEEL_H * scale,
                1.2 * scale, fill=1, stroke=1,
            )

    # Repère « AVANT »
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColor(INK)
    c.drawCentredString(px(50), y_top + 2.2 * mm, "AVANT")
    c.setStrokeColor(INK)
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
            # Pastille noire, lettre en réserve : la seule façon de rester lisible
            # sur un document sans couleur.
            c.setFillColor(INK)
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

    # Cadre général. Angles droits et non arrondis : la référence ne connaît que
    # l'angle droit, tous ses cadres sont des cellules.
    c.setFillColor(colors.white)
    c.setStrokeColor(INK)
    c.setLineWidth(RULE_LW)
    c.rect(x, y, width, h, fill=1, stroke=1)

    cx = x
    tick_centers: list[float] = []
    for group in (0, 1):
        # Repère sombre (E, puis ½, puis F après la seconde série)
        c.setFillColor(INK)
        c.rect(cx, y, tick_w, h, fill=1, stroke=0)
        tick_centers.append(cx + tick_w / 2)
        cx += tick_w
        for i in range(1, 5):
            seg = group * 4 + i
            c.setFillColor(INK if seg <= lvl else colors.white)
            c.setStrokeColor(INK)
            c.setLineWidth(HAIR_LW)
            c.rect(cx, y, seg_w, h, fill=1, stroke=1)
            cx += seg_w
    c.setFillColor(INK)
    c.rect(cx, y, tick_w, h, fill=1, stroke=0)
    tick_centers.append(cx + tick_w / 2)

    # Libellés sous les trois repères
    c.setFont("Helvetica-Bold", 5)
    c.setFillColor(INK)
    for center, label in zip(tick_centers, ("E", "½", "F")):
        c.drawCentredString(center, y - 3 * mm, label)

    return h + 4 * mm


def _wrap_hard(c: canvas.Canvas, text: str, font: str, size: float, max_w: float) -> list[str]:
    """Comme _wrap, mais coupe aussi les mots plus larges que la colonne.

    _wrap (billing_pdf) ne découpe que sur les espaces : un mot trop long est écrit
    tel quel et sort de la marge. Une observation de dégât ou une clause peut
    contenir un jeton insécable (VIN, plaque collée, URL, texte tapé sans espaces),
    d'où cette coupe caractère par caractère en dernier recours. _wrap n'est pas
    modifié : il sert aussi aux factures.
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


def _identity_block(
    c: canvas.Canvas, x: float, y_top: float, label: str, name: str,
    rows: list[str], name_size: float = FS_BODY,
) -> float:
    """Bloc d'identité : libellé, nom en gras, puis les lignes de coordonnées.

    Retourne le y atteint. Les lignes vides sont sautées — une base neuve n'a ni
    téléphone ni courriel, et le bloc se resserre au lieu de laisser des trous.
    """
    c.setFont("Helvetica-Bold", FS_TERMS)
    c.setFillColor(INK)
    c.drawString(x, y_top, label)
    y = y_top - 5.2 * mm

    if name:
        c.setFont("Helvetica-Bold", name_size)
        c.drawString(x, y, name)
        y -= LEAD if name_size <= FS_BODY else LEAD + 1.4 * mm

    c.setFont("Helvetica", FS_BODY)
    for row in rows:
        if not row:
            continue
        c.drawString(x, y, row)
        y -= LEAD
    return y


def _cell_table(
    c: canvas.Canvas, y_top: float, headers: list[str], values: list[str],
    widths: list[float],
) -> float:
    """Tableau à cellules réglées : une ligne d'en-têtes en gras, une de valeurs.

    C'est la forme qu'emploie la référence pour identifier le véhicule. Retourne le
    bas du tableau. Les filets verticaux ne descendent pas sous la dernière ligne :
    la référence les arrête là aussi.
    """
    h_row = 6.2 * mm
    y_mid = y_top - h_row
    y_bot = y_mid - h_row

    for y in (y_top, y_mid, y_bot):
        _rule(c, y)

    x = FRAME
    c.setStrokeColor(INK)
    c.setLineWidth(RULE_LW)
    for w in widths:
        c.line(x, y_top, x, y_bot)
        x += w
    c.line(PAGE_W - FRAME, y_top, PAGE_W - FRAME, y_bot)

    x = FRAME
    for header, value, w in zip(headers, values, widths):
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", FS_BODY)
        c.drawString(x + PAD, y_mid + 1.9 * mm, header)
        c.setFont("Helvetica", FS_BODY)
        c.drawString(x + PAD, y_bot + 1.9 * mm, _fit(c, value, "Helvetica", FS_BODY, w - 2 * PAD))
        x += w
    return y_bot


def _fit(c: canvas.Canvas, texte: str, police: str, corps: float, largeur: float) -> str:
    """Écourte à la largeur disponible, suffixé d'une ellipse.

    Sans cela une valeur trop longue — un modèle à rallonge, une raison sociale —
    déborde sur la cellule voisine et vient coller sa valeur. C'est exactement le
    défaut que présente la colonne des unités sur la facture ; autant ne pas le
    reproduire ici.
    """
    if not texte or c.stringWidth(texte, police, corps) <= largeur:
        return texte
    ellipse = "…"
    coupe = texte
    while coupe and c.stringWidth(coupe + ellipse, police, corps) > largeur:
        coupe = coupe[:-1]
    return (coupe + ellipse) if coupe else ""


def _column_field(
    c: canvas.Canvas, x: float, y: float, label: str, value: str
) -> float:
    """Un couple libellé / valeur dans une colonne. Retourne le y suivant.

    Une valeur vide laisse la place blanche : au retour, le kilométrage et la
    jauge ne sont pas connus à l'impression et se remplissent à la main.
    """
    c.setFont("Helvetica", FS_LABEL)
    c.setFillColor(INK)
    c.drawString(x, y, label)
    c.setFont("Helvetica-Bold", FS_FIELD)
    c.drawString(x + 26 * mm, y, value)
    return y - 5.2 * mm


def _comment_box(c: canvas.Canvas, x: float, y_top: float, w: float, h: float) -> float:
    """Cadre de commentaire manuscrit, avec lignes d'écriture. Retourne son bas."""
    c.setStrokeColor(INK)
    c.setLineWidth(RULE_LW)
    c.rect(x, y_top - h, w, h, fill=0, stroke=1)
    c.setFont("Helvetica", FS_LABEL)
    c.setFillColor(INK)
    c.drawString(x + 1.5 * mm, y_top - 3.8 * mm, "Observations")
    # Lignes d'écriture en filet fin : elles guident la main sans concurrencer le
    # cadre. C'est la seule nuance de trait du document, obtenue par l'épaisseur et
    # non par une couleur, pour rester noir sur blanc.
    c.setLineWidth(HAIR_LW)
    line_y = y_top - 8.5 * mm
    while line_y > y_top - h + 2 * mm:
        c.line(x + 1.5 * mm, line_y, x + w - 1.5 * mm, line_y)
        line_y -= 4.5 * mm
    return y_top - h


def _signature_box(c: canvas.Canvas, x: float, y_top: float, w: float) -> float:
    """Date + signature d'un état. Retourne son bas."""
    c.setFont("Helvetica", FS_LABEL)
    c.setFillColor(INK)
    c.drawString(x, y_top, "Date")
    c.setStrokeColor(INK)
    c.setLineWidth(RULE_LW)
    c.line(x + 10 * mm, y_top - 0.7 * mm, x + w, y_top - 0.7 * mm)

    y = y_top - 6 * mm
    c.setFont("Helvetica", FS_LABEL)
    c.drawString(x, y, "Signature")
    box_h = 11 * mm
    c.setStrokeColor(INK)
    c.setLineWidth(RULE_LW)
    c.rect(x, y - 2 * mm - box_h, w, box_h, fill=0, stroke=1)
    return y - 2 * mm - box_h


def generate_loan_contract_pdf(
    res: dict,
    vehicle: dict,
    client: dict,
    company: dict | None,
    damages: list[dict],
    terms: str | None,
    logo: bytes | None = None,
) -> bytes:
    """Contrat de prêt, tenant sur une page (hors conditions volumineuses).

    Habillage calqué sur les factures du garage : cadre, filets, noir sur blanc,
    corps de 10 pt. La partie basse est en deux colonnes séparées par un filet
    vertical — état de départ à gauche, restitution à droite — où le corps descend à
    8 et 7 pt pour tenir sur le feuillet. Seul le schéma de départ reçoit les dégâts
    enregistrés en base ; celui de restitution est vierge, à annoter au stylo.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    company = company or {}

    # Le cadre d'abord : c'est lui qui donne au document son air d'imprimé, tout ce
    # qui suit vit à l'intérieur.
    top = _draw_frame(c)

    # ── Prêteur, en haut à gauche · logo en haut à droite ─────────────────────
    ville = f"{_s(company.get('postalCode'))} {_s(company.get('city'))}".strip().upper()
    y_left = _identity_block(
        c, CL, top, "PRÊTEUR", _s(company.get("name")).upper(),
        [
            _s(company.get("addressLine1")).upper(),
            ville,
            (f"TEL : {company['phone']}" if company.get("phone") else ""),
            (f"EMAIL : {company['email']}" if company.get("email") else ""),
        ],
        name_size=FS_NAME,
    )

    logo_h = _draw_logo_plain(c, logo, CR, top)

    # ── Titre du document, puis l'emprunteur en regard ────────────────────────
    # Le titre porte le numéro, comme « FACTURE Mécanique N° : … » sur la référence.
    y = min(y_left, top - logo_h) - 4 * mm
    c.setFont("Helvetica-Bold", FS_BODY)
    c.setFillColor(INK)
    c.drawString(CL, y, f"CONTRAT DE PRÊT DE VÉHICULE N° : {_s(res.get('id'))}")

    col2 = CL + CONTENT_W / 2
    client_name = " ".join(
        filter(None, [(_s(client.get("lastName")) or "").upper(), _s(client.get("firstName"))])
    ).strip()
    y_right = _identity_block(
        c, col2, y, "EMPRUNTEUR", client_name,
        [
            _s(client.get("address")),
            f"{_s(client.get('postalCode'))} {_s(client.get('city'))}".strip().upper(),
            (f"TEL : {client['phone']}" if client.get("phone") else ""),
            (f"EMAIL : {client['email']}" if client.get("email") else ""),
        ],
    )

    # ── Véhicule prêté et période, en cellules réglées ────────────────────────
    # La période tient dans UNE cellule, en fin de ligne : « du … au … », ou « à
    # partir du … » sans terme connu. Deux colonnes de dates laissaient une cellule
    # vide sur tout prêt en cours, alors que la phrase dit la même chose et se lit.
    #
    # Elle figure ici EN PLUS des colonnes d'état, où les dates se remplissent à la
    # main : le bandeau donne la période prévue, les colonnes constatent ce qui s'est
    # passé.
    #
    # Un tiret quand une valeur manque, et non une cellule blanche : dans un tableau
    # réglé, le vide se lit comme un oubli de saisie. Le kilométrage et la jauge, eux,
    # gardent leur place blanche (§ 53) : ils sont destinés à être écrits au stylo,
    # pas à constater une absence.
    #
    # Largeurs par proportions puis normalisées à la largeur exacte du cadre : une
    # somme arrondie laisserait un filet vertical à côté du bord. La cellule de
    # période est taillée sur son cas le plus long — « du 12/08/2026 09:00 au
    # 14/08/2026 17:30 » demande 71,7 mm, marges comprises.
    parts = [38.0, 44.0, 40.0, 75.6]
    total = PAGE_W - 2 * FRAME
    widths = [total * part / sum(parts) for part in parts]
    y = _cell_table(
        c, min(y_right, y - 4 * mm) - 3 * mm,
        ["Marque", "Modèle", "Immatriculation", "Location"],
        [
            _s(vehicle.get("brand")) or "-",
            _s(vehicle.get("model")) or "-",
            _s(vehicle.get("licensePlate")) or "-",
            _periode(res.get("startDate"), res.get("endDate")),
        ],
        widths,
    )

    # ── Départ / Restitution, en deux colonnes ────────────────────────────────
    section_top = y
    half = (PAGE_W - 2 * FRAME) / 2
    left_x = CL
    right_x = FRAME + half + PAD
    col_w = half - 2 * PAD
    mid_x = FRAME + half

    # Bandeau des deux titres, en cellules réglées comme le reste
    head_h = 6.2 * mm
    _rule(c, section_top - head_h)
    c.setFont("Helvetica-Bold", FS_BODY)
    c.setFillColor(INK)
    c.drawString(left_x, section_top - head_h + 1.9 * mm, "ÉTAT DE DÉPART")
    c.drawString(right_x, section_top - head_h + 1.9 * mm, "ÉTAT DE RESTITUTION")

    y = section_top - head_h - 5.5 * mm

    # Relevés : mêmes intitulés de part et d'autre, valeurs vides quand inconnues
    yl = _column_field(c, left_x, y, "Date", _date(res.get("startDate")))
    yl = _column_field(c, left_x, yl, "Kilométrage", _km(res.get("startMileage")))

    yr = _column_field(c, right_x, y, "Date", _date(res.get("endDate")))
    yr = _column_field(c, right_x, yr, "Kilométrage", _km(res.get("endMileage")))

    # Carburant : la jauge dessinée, comme dans la fiche de réservation. Le libellé
    # garde son alignement, la jauge prend la place de la valeur.
    y_fuel = min(yl, yr)
    gauge_w = 40 * mm
    gauge_h = 0.0
    for x0, lvl in (
        (left_x, res.get("fuelLevelEighths")),
        (right_x, res.get("endFuelLevelEighths")),
    ):
        c.setFont("Helvetica", FS_LABEL)
        c.setFillColor(INK)
        c.drawString(x0, y_fuel, "Carburant")
        gauge_h = _fuel_gauge(c, x0 + 26 * mm, y_fuel + 2.6 * mm, gauge_w, lvl)

    # Une ligne sautée entre le carburant et les dessins
    y = y_fuel - gauge_h - 5 * mm

    # Les deux schémas, côte à côte, centrés dans leur colonne. 37 mm et non 40 :
    # avec le corps de 10 pt de l'en-tête, c'est ce qui ramène les conditions du prêt
    # sur le premier feuillet. Mesuré, pas estimé.
    diagram_w = 37 * mm
    diagram_h = _draw_car(c, left_x + (col_w - diagram_w) / 2, y, diagram_w, damages)
    _draw_car(c, right_x + (col_w - diagram_w) / 2, y, diagram_w, None)
    y -= diagram_h + 4 * mm

    # Légende, sous le seul schéma qui porte des points
    c.setFillColor(INK)
    if damages:
        c.setFont("Helvetica", 6)
        c.drawCentredString(left_x + col_w / 2, y, LEGEND_TEXT)
    c.setFont("Helvetica-Oblique", 6)
    c.drawCentredString(
        right_x + col_w / 2, y, "Entourer les dégâts constatés à la restitution"
    )
    y -= 3.5 * mm

    # Espace commentaire, un par état
    box_h = 14 * mm
    _comment_box(c, left_x, y, col_w, box_h)
    _comment_box(c, right_x, y, col_w, box_h)
    y -= box_h + 4 * mm

    # Deux dates, deux signatures
    bottom_left = _signature_box(c, left_x, y, col_w)
    bottom_right = _signature_box(c, right_x, y, col_w)
    section_bottom = min(bottom_left, bottom_right) - 2 * mm

    # Filet vertical du bandeau des titres jusqu'au bas des signatures, et filet
    # horizontal de clôture : la partie devient une cellule à deux compartiments,
    # comme le bloc de règlement de la référence.
    c.setStrokeColor(INK)
    c.setLineWidth(RULE_LW)
    c.line(mid_x, section_top, mid_x, section_bottom)
    _rule(c, section_bottom)

    # ── Conditions ────────────────────────────────────────────────────────────
    # Texte libre saisi par le garage : sa longueur décide seule d'un éventuel
    # second feuillet, le corps du contrat tenant sur une page.
    if terms and terms.strip():
        y = section_bottom - 4 * mm
        c.setFont("Helvetica-Bold", FS_BODY)
        c.setFillColor(INK)
        c.drawString(CL, y, "CONDITIONS DU PRÊT")
        y -= 4 * mm

        # Saut de page tenu ici plutôt que par _State.need : celui-ci appelle
        # showPage() sans rien retracer, et la seconde page sortirait sans cadre.
        for paragraph in terms.replace("\r\n", "\n").split("\n"):
            if not paragraph.strip():
                y -= 2 * mm
                continue
            for line in _wrap_hard(c, paragraph, "Helvetica", FS_TERMS, CONTENT_W):
                if y - 4 * mm < FRAME + PAD:
                    c.showPage()
                    y = _draw_frame(c)
                c.setFont("Helvetica", FS_TERMS)
                c.setFillColor(INK)
                c.drawString(CL, y, line)
                y -= 4 * mm

    c.showPage()
    c.save()
    return buf.getvalue()
