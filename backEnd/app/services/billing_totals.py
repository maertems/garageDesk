"""Server-side amount computation for billing documents and invoices.

The client never sends totals: they are always recomputed here from quantity,
unitPriceHt, discountPercent and vatRate. See cahierDesCharges spec sections
5.3 / 5.3.bis / 6.2 for the formulas and the global-discount VAT allocation.

All money handling uses Decimal. Totals are rounded to 2 decimals (ROUND_HALF_UP);
discountAmount keeps 4 decimals to avoid cumulative rounding loss.
"""

from decimal import Decimal, ROUND_HALF_UP

_Q2 = Decimal("0.01")
_Q4 = Decimal("0.0001")


def _d(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value if value is not None else 0))


def _r2(value: Decimal) -> Decimal:
    return value.quantize(_Q2, rounding=ROUND_HALF_UP)


def _r4(value: Decimal) -> Decimal:
    return value.quantize(_Q4, rounding=ROUND_HALF_UP)


def compute_line(quantity, unit_price_ht, discount_percent, vat_rate) -> dict:
    """Compute one line's amounts.

    Returns discountAmount (4 dp), totalHt/totalVat/totalTtc (2 dp) as Decimal.
    """
    qty = _d(quantity)
    unit = _d(unit_price_ht)
    disc_pct = _d(discount_percent)
    rate = _d(vat_rate)

    gross_ht = qty * unit
    discount_amount = gross_ht * disc_pct / Decimal(100)
    total_ht = gross_ht - discount_amount
    total_vat = _r2(total_ht) * rate / Decimal(100)
    total_ht_r = _r2(total_ht)
    total_vat_r = _r2(total_vat)
    return {
        "discountAmount": _r4(discount_amount),
        "totalHt": total_ht_r,
        "totalVat": total_vat_r,
        "totalTtc": _r2(total_ht_r + total_vat_r),
    }


def compute_document(lines: list[dict], global_discount_percent=0) -> dict:
    """Aggregate document/invoice totals from already-computed lines.

    Each line dict must carry: totalHt, vatRate, facturXVatCategory.
    Applies the global discount on subtotalHt, then allocates VAT pro-rata per
    (vatRate, facturXVatCategory) group AFTER the global discount.

    Returns subtotalHt, globalDiscountPercent, globalDiscountAmount, totalHt,
    totalVat, totalTtc (Decimal) and vatBreakdown (list of dicts).
    """
    g_pct = _d(global_discount_percent)
    subtotal_ht = sum((_d(l["totalHt"]) for l in lines), Decimal(0))
    subtotal_ht = _r2(subtotal_ht)
    global_discount_amount = _r2(subtotal_ht * g_pct / Decimal(100))
    total_ht = _r2(subtotal_ht - global_discount_amount)

    # Group lines by (vatRate, facturXVatCategory)
    groups: dict[tuple, dict] = {}
    for l in lines:
        rate = _d(l["vatRate"])
        cat = l.get("facturXVatCategory") or "S"
        key = (str(rate), cat)
        if key not in groups:
            groups[key] = {"vatRate": rate, "facturXVatCategory": cat, "htBefore": Decimal(0)}
        groups[key]["htBefore"] += _d(l["totalHt"])

    factor = (Decimal(1) - g_pct / Decimal(100)) if g_pct else Decimal(1)
    breakdown = []
    total_vat = Decimal(0)
    for g in groups.values():
        ht_before = _r2(g["htBefore"])
        ht_after = _r2(ht_before * factor)
        vat_amount = _r2(ht_after * g["vatRate"] / Decimal(100))
        global_alloc = _r2(ht_before - ht_after)
        total_vat += vat_amount
        breakdown.append({
            "vatRate": str(g["vatRate"]),
            "facturXVatCategory": g["facturXVatCategory"],
            "htBeforeGlobalDiscount": str(ht_before),
            "globalDiscountAllocated": str(global_alloc),
            "htAfterGlobalDiscount": str(ht_after),
            "vatAmount": str(vat_amount),
        })

    total_vat = _r2(total_vat)
    return {
        "subtotalHt": subtotal_ht,
        "globalDiscountPercent": g_pct,
        "globalDiscountAmount": global_discount_amount,
        "totalHt": total_ht,
        "totalVat": total_vat,
        "totalTtc": _r2(total_ht + total_vat),
        "vatBreakdown": breakdown,
    }
