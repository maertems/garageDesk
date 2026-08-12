"""Validation helper for companySettings mandatory legal mentions.

Called before invoice/credit-note issuance (Lot F/I) and exposed via GET /companySettings.
Returns the list of missing required field names (empty = settings are complete).
"""

_ALWAYS_REQUIRED = [
    "name",
    "siren",
    "siretHeadquarters",
    "rcsCity",
    "addressLine1",
    "postalCode",
    "city",
    "mediatorName",
]


def check_mandatory_fields(settings: dict) -> list[str]:
    """Return list of missing mandatory field names. Empty list = ready to issue invoices."""
    missing: list[str] = []

    for field in _ALWAYS_REQUIRED:
        v = settings.get(field)
        if not v or (isinstance(v, str) and not v.strip()):
            missing.append(field)

    # Mediator contact: at least one of url or address
    if not settings.get("mediatorUrl") and not settings.get("mediatorAddress"):
        missing.append("mediatorUrl")  # representative missing field name

    # vatIntracom required unless the garage is exempt from VAT
    if not settings.get("vatExemption") and not settings.get("vatIntracom"):
        missing.append("vatIntracom")

    return missing
