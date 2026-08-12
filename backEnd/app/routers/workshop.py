from datetime import date
from fastapi import APIRouter, Depends, Query
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.workshop import WorkshopCarResponse

router = APIRouter(tags=["workshop"])

TERMINAL_STATUSES = ("comptabilise", "edite", "annule", "notFound")
WORKSHOP_TYPES = ("OR", "Fact")


@router.get(
    "/workshopCarsAvailable",
    response_model=list[WorkshopCarResponse],
    summary="Voitures en attente de réparation à une date donnée",
    description=(
        "Retourne les voitures dont le document le plus récent (OR ou Facture, "
        "à la date demandée) est encore actif — c'est-à-dire dont le statut n'est ni "
        "`comptabilise`, ni `edite`, ni `annule`, ni `notFound`. Les devis sont exclus."
    ),
)
def list_workshop_cars(
    target_date: date | None = Query(None, alias="date"),
    current_user: dict = Depends(get_current_user),
):
    if target_date is None:
        target_date = date.today()

    status_ph = ", ".join(["%s"] * len(TERMINAL_STATUSES))
    type_ph = ", ".join(["%s"] * len(WORKSHOP_TYPES))

    # Algo : pour chaque véhicule, on identifie son dernier OR ou Facture
    # (dateDoc DESC, id DESC) parmi ceux dont dateDoc <= target_date.
    # On ne garde le véhicule que si ce document le plus récent est encore actif.
    sql = f"""
        WITH latest_bill AS (
            SELECT
                vehicleId,
                dateDoc,
                type,
                status,
                ROW_NUMBER() OVER (
                    PARTITION BY vehicleId
                    ORDER BY dateDoc DESC, id DESC
                ) AS rn
            FROM bills
            WHERE vehicleId IS NOT NULL
              AND dateDoc IS NOT NULL
              AND dateDoc <= %s
              AND type IN ({type_ph})
        ),
        last_planning AS (
            SELECT vehicleId, MAX(planDate) AS lastPlanningDate
            FROM workshopPlanning
            GROUP BY vehicleId
        )
        SELECT
            v.id           AS vehicleId,
            v.brand        AS brand,
            v.model        AS model,
            v.type         AS type,
            v.licensePlate AS licensePlate,
            c.id           AS clientId,
            c.firstName    AS clientFirstName,
            c.lastName     AS clientLastName,
            lb.dateDoc     AS latestDocDate,
            lb.type        AS latestDocType,
            lp.lastPlanningDate AS lastPlanningDate
        FROM latest_bill lb
        JOIN vehicles v ON v.id = lb.vehicleId
        JOIN clients  c ON c.id = (
            SELECT b2.customerId FROM bills b2
            WHERE b2.vehicleId = lb.vehicleId AND b2.customerId IS NOT NULL
            ORDER BY b2.dateDoc DESC, b2.id DESC
            LIMIT 1
        )
        LEFT JOIN last_planning lp ON lp.vehicleId = lb.vehicleId
        WHERE lb.rn = 1
          AND lb.status NOT IN ({status_ph})
        ORDER BY GREATEST(lb.dateDoc, COALESCE(lp.lastPlanningDate, '0001-01-01')) DESC,
                 v.brand, v.licensePlate
    """
    params = (target_date, *WORKSHOP_TYPES, *TERMINAL_STATUSES)
    with db_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return [WorkshopCarResponse(**r) for r in rows]
