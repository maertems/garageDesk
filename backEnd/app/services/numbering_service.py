"""Chronological numbering for billing documents.

Seven independent series, reset yearly. Numbers are gap-free: the counter row is
locked with SELECT ... FOR UPDATE, so this MUST be called with a cursor from
db_transaction (single connection / single commit). Calling it with db_cursor would
not hold the lock across the increment.
"""

# series code -> default format. {year} and {number} are substituted.
SERIES_FORMATS = {
    "repairOrder": "OR-{year}-{number:04d}",
    "quote": "DV-{year}-{number:04d}",
    "amendment": "AV-{year}-{number:04d}",
    "counterSale": "VD-{year}-{number:04d}",
    "invoice": "FA-{year}-{number:04d}",
    "creditNote": "AV-{year}-{number:04d}",
}


def next_number(cur, series: str, year: int) -> tuple[int, str]:
    """Reserve and return the next (number, formatted) for a series/year.

    Must run inside db_transaction. Creates the counter row lazily on first use.
    Returns (rawNumber, formattedNumber).
    """
    if series not in SERIES_FORMATS:
        raise ValueError(f"Unknown numbering series: {series}")
    fmt = SERIES_FORMATS[series]

    cur.execute(
        "SELECT id, lastNumber, format FROM numberingSequences WHERE series = %s AND year = %s FOR UPDATE",
        (series, year),
    )
    row = cur.fetchone()
    if row is None:
        cur.execute(
            "INSERT INTO numberingSequences (series, year, lastNumber, format) VALUES (%s, %s, 0, %s)",
            (series, year, fmt),
        )
        cur.execute(
            "SELECT id, lastNumber, format FROM numberingSequences WHERE series = %s AND year = %s FOR UPDATE",
            (series, year),
        )
        row = cur.fetchone()

    next_num = int(row["lastNumber"]) + 1
    cur.execute(
        "UPDATE numberingSequences SET lastNumber = %s WHERE id = %s",
        (next_num, row["id"]),
    )
    stored_fmt = row["format"] or fmt
    formatted = stored_fmt.format(year=year, number=next_num)
    return next_num, formatted
