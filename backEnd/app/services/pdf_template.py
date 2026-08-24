"""Habillage commun des papiers remis au client : cadre, filets, cellules réglées.

Ce module ne connaît aucun document. Il porte le vocabulaire visuel, et lui seul,
pour que le contrat de prêt, la facture, l'avoir, le devis et l'ordre de réparation
se rangent dans le même dossier client sans avoir l'air de venir de deux bureaux.

La direction a été **relevée** sur une facture que le garage édite déjà, et non
choisie : cadre noir à 6,2 mm des quatre bords, règles sur 197,6 mm, aucune
couleur, aucun aplat, une seule police, un corps unique de 10 pt (14 gras pour la
raison sociale, 8 pt pour le menu), relevés en cellules réglées, logo en haut à
droite jusqu'à 78 × 30 mm posé sur le blanc.

La référence est composée en Arimo, clone métrique d'Arial ; Arial partage ses
largeurs avec Helvetica, si bien que les mesures se transposent sans embarquer de
fonte dans le PDF.

Pourquoi un module à part : ces primitives n'appartiennent à aucun document. Les
loger dans l'un d'eux ferait des autres ses tributaires, et le premier qui aurait
besoin d'une variante la prendrait en copie.
"""

import io

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.lib.units import mm
from reportlab.lib import colors

PAGE_W, PAGE_H = A4

# ── Cadre, filets, corps ─────────────────────────────────────────────────────
# Valeurs relevées sur la facture de référence. Le cadre est à 6,2 mm des quatre
# bords ; le texte respire de 3 mm à l'intérieur, sinon il colle au filet.
FRAME = 6.2 * mm
PAD = 3 * mm
CL = FRAME + PAD                    # bord gauche du texte
CR = PAGE_W - FRAME - PAD           # bord droit du texte
CONTENT_W = CR - CL
FRAME_W = PAGE_W - 2 * FRAME        # largeur entre les filets, celle des règles

INK = colors.black                  # une seule encre : ces documents partent sur
                                    # une imprimante noir et blanc et se photocopient.
FRAME_LW = 0.8
RULE_LW = 0.5
HAIR_LW = 0.3

# Corps. La référence n'en emploie que trois. Les deux plus petits servent aux
# parties denses — colonnes d'état du contrat, lignes d'un document de vente.
FS_NAME = 14        # raison sociale
FS_BODY = 10        # texte courant, en-têtes de tableau
FS_TERMS = 8        # conditions, mentions légales
FS_FIELD = 8        # relevés en colonnes
FS_LABEL = 7        # libellés de relevés
LEAD = 4.6 * mm     # interligne du texte courant, relevé sur la référence

ROW_H = 6.2 * mm    # hauteur d'une ligne de cellules réglées

# Logo : jusqu'à 78 × 30 mm en haut à droite, sans plaque ni cadre derrière.
# L'emprise vient de la référence, où le logo mesure 77,6 × 30 mm.
#
# Conséquence pour le fichier fourni dans les réglages : à cette emprise, 300 dpi
# demandent 920 × 355 px. C'est cette valeur qu'affiche CompanyLogoSection.tsx ;
# les deux doivent rester d'accord.
LOGO_W = 78 * mm
LOGO_H = 30 * mm


def draw_frame(c: canvas.Canvas) -> float:
    """Trace le cadre de la page et retourne le y du premier texte.

    À appeler pour CHAQUE page, y compris celles qu'un texte long provoque : un
    feuillet sans cadre ne ressemble plus à l'imprimé, et c'est le cadre qui fait
    l'unité entre les documents.
    """
    c.setStrokeColor(INK)
    c.setLineWidth(FRAME_LW)
    c.rect(FRAME, FRAME, FRAME_W, PAGE_H - 2 * FRAME, fill=0, stroke=1)
    return PAGE_H - FRAME - PAD


def rule(c: canvas.Canvas, y: float, x0: float = FRAME, x1: float | None = None,
         lw: float = RULE_LW) -> None:
    """Règle horizontale. Par défaut, toute la largeur du cadre — c'est ainsi que
    la référence sépare ses blocs, d'un filet qui touche les deux bords."""
    c.setStrokeColor(INK)
    c.setLineWidth(lw)
    c.line(x0, y, PAGE_W - FRAME if x1 is None else x1, y)


def widths(parts: list[float]) -> list[float]:
    """Largeurs de colonnes, données en proportions et normalisées à la largeur
    exacte du cadre.

    Une somme arrondie à la main laisserait le dernier filet vertical à côté du
    bord, d'un dixième de millimètre qui se voit.
    """
    total = sum(parts)
    return [FRAME_W * part / total for part in parts]


def fit(c: canvas.Canvas, texte: str, police: str, corps: float, largeur: float) -> str:
    """Écourte à la largeur disponible, suffixé d'une ellipse.

    Sans cela une valeur trop longue — un modèle à rallonge, une désignation
    d'article — déborde sur la cellule voisine et vient coller sa valeur.
    """
    if not texte or c.stringWidth(texte, police, corps) <= largeur:
        return texte
    ellipse = "…"
    coupe = texte
    while coupe and c.stringWidth(coupe + ellipse, police, corps) > largeur:
        coupe = coupe[:-1]
    return (coupe + ellipse) if coupe else ""


def cell_row(
    c: canvas.Canvas, y_top: float, cols: list[float], valeurs: list[str],
    gras: bool = False, aligns: list[str] | None = None, h: float = ROW_H,
    pad: float | None = None,
) -> float:
    """Une ligne de cellules réglées. Retourne son bas.

    Trace la règle du haut, les filets verticaux et le texte ; la règle du bas est
    laissée à l'appelant, qui sait s'il enchaîne une autre ligne ou s'il ferme le
    tableau — deux règles superposées épaississent le trait à l'impression.

    `pad` resserre la marge intérieure des cellules. Les 3 mm par défaut coûtent
    6 mm par colonne : sur une bande de huit, cela fait 48 mm de la largeur utile, et
    un numéro de série de dix-sept caractères ne rentre plus. La référence resserre
    de la même façon ses bandes denses.
    """
    marge = PAD if pad is None else pad
    y_bot = y_top - h
    rule(c, y_top)

    x = FRAME
    c.setStrokeColor(INK)
    c.setLineWidth(RULE_LW)
    for w in cols:
        c.line(x, y_top, x, y_bot)
        x += w
    c.line(PAGE_W - FRAME, y_top, PAGE_W - FRAME, y_bot)

    police = "Helvetica-Bold" if gras else "Helvetica"
    c.setFont(police, FS_BODY)
    c.setFillColor(INK)
    x = FRAME
    for i, (valeur, w) in enumerate(zip(valeurs, cols)):
        align = (aligns[i] if aligns else "left")
        texte = fit(c, valeur, police, FS_BODY, w - 2 * marge)
        if align == "right":
            c.drawRightString(x + w - marge, y_bot + 1.9 * mm, texte)
        elif align == "center":
            c.drawCentredString(x + w / 2, y_bot + 1.9 * mm, texte)
        else:
            c.drawString(x + marge, y_bot + 1.9 * mm, texte)
        x += w
    return y_bot


def cell_table(
    c: canvas.Canvas, y_top: float, headers: list[str], valeurs: list[str],
    cols: list[float], aligns: list[str] | None = None, pad: float | None = None,
) -> float:
    """Tableau à deux lignes : en-têtes en gras, puis valeurs. Retourne son bas.

    C'est la forme qu'emploie la référence pour identifier le véhicule.
    """
    y = cell_row(c, y_top, cols, headers, gras=True, aligns=aligns, pad=pad)
    y = cell_row(c, y, cols, valeurs, aligns=aligns, pad=pad)
    rule(c, y)
    return y


def identity_block(
    c: canvas.Canvas, x: float, y_top: float, label: str, name: str,
    rows: list[str], name_size: float = FS_BODY,
) -> float:
    """Bloc d'identité : libellé, nom en gras, puis les lignes de coordonnées.

    Retourne le y atteint. Les lignes vides sont sautées — une base neuve n'a ni
    téléphone ni courriel, et le bloc se resserre au lieu de laisser des trous.
    """
    y = y_top
    if label:
        c.setFont("Helvetica-Bold", FS_TERMS)
        c.setFillColor(INK)
        c.drawString(x, y, label)
        y -= 5.2 * mm

    if name:
        c.setFont("Helvetica-Bold", name_size)
        c.setFillColor(INK)
        c.drawString(x, y, name)
        y -= LEAD if name_size <= FS_BODY else LEAD + 1.4 * mm

    c.setFont("Helvetica", FS_BODY)
    c.setFillColor(INK)
    for row in rows:
        if not row:
            continue
        c.drawString(x, y, row)
        y -= LEAD
    return y


def draw_logo_plain(c: canvas.Canvas, logo: bytes | None, right_x: float, top_y: float) -> float:
    """Logo posé sur le blanc, sans plaque ni cadre. Retourne la hauteur occupée.

    Contrairement à `billing_pdf.draw_logo`, aucune plaque blanche n'est posée
    dessous : elle est indispensable sur un bandeau sombre, parasite sur un fond
    déjà blanc.

    L'image garde ses proportions et se cale en HAUT à droite : un logo allongé
    occupe toute la largeur disponible, un logo carré reste haut de 30 mm.

    Ne dessine rien et ne consomme aucune hauteur si `logo` est None.
    """
    if not logo:
        return 0.0
    try:
        img = ImageReader(io.BytesIO(logo))
        iw, ih = img.getSize()
    except Exception:
        # Fichier illisible malgré le contrôle à l'envoi : le document sort sans
        # logo plutôt que de ne pas sortir du tout.
        return 0.0
    if not iw or not ih:
        return 0.0

    scale = min(LOGO_W / iw, LOGO_H / ih)
    w, h = iw * scale, ih * scale
    c.drawImage(img, right_x - w, top_y - h, width=w, height=h, mask="auto")
    return h
