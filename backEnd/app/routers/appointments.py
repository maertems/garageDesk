import logging
from datetime import datetime, timezone, time as dt_time
from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate, AppointmentResponse, AppointmentWithJoinsResponse
from app.services.notification_service import send_notification_on_create

router = APIRouter(prefix="/appointments", tags=["appointments"])


@router.get(
    "",
    response_model=list[AppointmentWithJoinsResponse],
    summary="List appointments",
    description="List appointments with client, vehicle, category and status. Use start and end (ISO datetime) to filter by date range (overlapping).",
)
def list_appointments(
    current_user: dict = Depends(get_current_user),
    start: datetime | None = Query(None, description="Start of date range"),
    end: datetime | None = Query(None, description="End of date range"),
):
    with db_cursor() as cur:
        if start is not None and end is not None:
            cur.execute(
                """
                SELECT a.id, a.clientId, a.vehicleId, a.categoryId, a.statusId, a.loanVehicleId,
                       a.loanStartDate, a.loanEndDate, a.prestation, a.appointmentType, a.appointmentSubType,
                       a.comment, a.smsReminder, a.startTime, a.endTime,
                       c.firstName AS clientFirstName, c.lastName AS clientLastName,
                       v.licensePlate AS vehicleLicensePlate, v.brand AS vehicleBrand, v.model AS vehicleModel, v.type AS vehicleType,
                       lv.uniqueNumber AS loanVehicleUniqueNumber, lv.brand AS loanVehicleBrand, lv.model AS loanVehicleModel,
                       ac.code AS categoryCode, ac.color AS categoryColor,
                       ast.code AS statusCode, ast.color AS statusColor
                FROM appointments a
                LEFT JOIN clients c ON c.id = a.clientId
                LEFT JOIN vehicles v ON v.id = a.vehicleId
                LEFT JOIN loanVehicles lv ON lv.id = a.loanVehicleId
                LEFT JOIN appointmentCategories ac ON ac.id = a.categoryId
                LEFT JOIN appointmentStatuses ast ON ast.id = a.statusId
                WHERE a.startTime < %s AND a.endTime > %s
                ORDER BY a.startTime
                """,
                (end, start),
            )
        else:
            cur.execute(
                """
                SELECT a.id, a.clientId, a.vehicleId, a.categoryId, a.statusId, a.loanVehicleId,
                       a.loanStartDate, a.loanEndDate, a.prestation, a.appointmentType, a.appointmentSubType,
                       a.comment, a.smsReminder, a.startTime, a.endTime,
                       c.firstName AS clientFirstName, c.lastName AS clientLastName,
                       v.licensePlate AS vehicleLicensePlate, v.brand AS vehicleBrand, v.model AS vehicleModel, v.type AS vehicleType,
                       lv.uniqueNumber AS loanVehicleUniqueNumber, lv.brand AS loanVehicleBrand, lv.model AS loanVehicleModel,
                       ac.code AS categoryCode, ac.color AS categoryColor,
                       ast.code AS statusCode, ast.color AS statusColor
                FROM appointments a
                LEFT JOIN clients c ON c.id = a.clientId
                LEFT JOIN vehicles v ON v.id = a.vehicleId
                LEFT JOIN loanVehicles lv ON lv.id = a.loanVehicleId
                LEFT JOIN appointmentCategories ac ON ac.id = a.categoryId
                LEFT JOIN appointmentStatuses ast ON ast.id = a.statusId
                ORDER BY a.startTime DESC
                LIMIT 500
                """
            )
        rows = cur.fetchall()
    return [AppointmentWithJoinsResponse(**r) for r in rows]


@router.get("/{appointment_id}", response_model=AppointmentWithJoinsResponse)
def get_appointment(appointment_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT a.id, a.clientId, a.vehicleId, a.categoryId, a.statusId, a.loanVehicleId,
                   a.loanStartDate, a.loanEndDate, a.prestation, a.appointmentType, a.appointmentSubType,
                   a.comment, a.smsReminder, a.startTime, a.endTime,
                   c.firstName AS clientFirstName, c.lastName AS clientLastName,
                   v.licensePlate AS vehicleLicensePlate, v.brand AS vehicleBrand, v.model AS vehicleModel, v.type AS vehicleType,
                   lv.uniqueNumber AS loanVehicleUniqueNumber, lv.brand AS loanVehicleBrand, lv.model AS loanVehicleModel,
                   ac.code AS categoryCode, ac.color AS categoryColor,
                   ast.code AS statusCode, ast.color AS statusColor
            FROM appointments a
            LEFT JOIN clients c ON c.id = a.clientId
            LEFT JOIN vehicles v ON v.id = a.vehicleId
            LEFT JOIN loanVehicles lv ON lv.id = a.loanVehicleId
            LEFT JOIN appointmentCategories ac ON ac.id = a.categoryId
            LEFT JOIN appointmentStatuses ast ON ast.id = a.statusId
            WHERE a.id = %s
            """,
            (appointment_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Appointment not found"})
    return AppointmentWithJoinsResponse(**row)


@router.post("", response_model=AppointmentResponse, status_code=201)
def create_appointment(data: AppointmentCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO appointments (clientId, vehicleId, categoryId, statusId, loanVehicleId, loanStartDate, loanEndDate, prestation, appointmentType, appointmentSubType, comment, smsReminder, startTime, endTime)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                data.clientId,
                data.vehicleId,
                data.categoryId,
                data.statusId,
                data.loanVehicleId,
                data.loanStartDate,
                data.loanEndDate,
                data.prestation,
                data.appointmentType or "client",
                data.appointmentSubType if (data.appointmentType or "client") == "client" else None,
                data.comment,
                data.smsReminder,
                data.startTime,
                data.endTime,
            ),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        aid = cur.fetchone()["id"]
    # Postit atelier si visite ou restitution
    _appt_type = data.appointmentType or "client"
    if _appt_type == "client" and data.appointmentSubType in ("visite", "restitution") and data.vehicleId:
        plan_date = data.startTime.date()
        with db_cursor(commit=True) as cur:
            cur.execute(
                "INSERT INTO workshopPlanning (vehicleId, planDate, appointmentId) VALUES (%s, %s, %s)",
                (data.vehicleId, plan_date, aid),
            )
    # Si le RDV a un véhicule de prêt + une date de début + un client, créer la
    # réservation liée (elle seule alimente le calendrier de flotte et la liste des
    # réservations).
    #
    # La date de FIN n'est pas exigée : `loanReservations.endDate` est nullable et
    # tout l'applicatif affiche « en cours » quand elle manque — c'est même ce que
    # le formulaire annonce en ambre sous « Fin prêt ». L'exiger ici faisait
    # enregistrer le RDV avec ses champs de prêt sans jamais créer la réservation,
    # donc un prêt invisible partout.
    if data.loanVehicleId and data.loanStartDate and data.clientId:
        start_dt = datetime.combine(data.loanStartDate, dt_time.min)
        end_dt = (
            datetime.combine(data.loanEndDate, dt_time(23, 59, 59, 999999))
            if data.loanEndDate
            else None
        )
        with db_cursor(commit=True) as cur:
            cur.execute(
                """
                INSERT INTO loanReservations (loanVehicleId, clientId, appointmentId, startDate, endDate)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (data.loanVehicleId, data.clientId, aid, start_dt, end_dt),
            )
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, clientId, vehicleId, categoryId, statusId, loanVehicleId, loanStartDate, loanEndDate, prestation, appointmentType, appointmentSubType, comment, smsReminder, startTime, endTime FROM appointments WHERE id = %s",
            (aid,),
        )
        row = cur.fetchone()
    # Notification à la création si activée (RDV client) et si l'utilisateur l'a demandé
    avertissement = None
    if (data.appointmentType or "client") == "client" and data.clientId and data.smsReminder:
        log = logging.getLogger(__name__)
        log.warning("Notification: tentative envoi à la création pour RDV id=%s (clientId=%s)", aid, data.clientId)
        try:
            resultat = send_notification_on_create(aid)
            avertissement = (resultat or {}).get("message")
        except Exception as e:
            # L'exception ne fait plus disparaître l'information : le rendez-vous est
            # créé, et l'utilisateur apprend que la notification a échoué.
            log.warning("Notification à la création (RDV %s): erreur %s", aid, e)
            avertissement = f"Notification non envoyée — erreur interne : {e}"
    return AppointmentResponse(**row, notificationWarning=avertissement)


def _value_for_db(v):
    """Convertit les datetime timezone-aware en naive UTC pour MySQL."""
    if isinstance(v, datetime) and v.tzinfo is not None:
        return v.astimezone(timezone.utc).replace(tzinfo=None)
    return v


@router.patch("/{appointment_id}", response_model=AppointmentResponse)
def update_appointment(
    appointment_id: int, data: AppointmentUpdate, current_user: dict = Depends(get_current_user)
):
    # Clés en camelCase pour correspondre aux colonnes MySQL (by_alias=True)
    updates = data.model_dump(exclude_unset=True, by_alias=True)
    if not updates:
        with db_cursor() as cur:
            cur.execute(
                "SELECT id, clientId, vehicleId, categoryId, statusId, loanVehicleId, loanStartDate, loanEndDate, prestation, appointmentType, appointmentSubType, comment, smsReminder, startTime, endTime FROM appointments WHERE id = %s",
                (appointment_id,),
            )
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Appointment not found"})
        return AppointmentResponse(**row)
    # Vérifier que le rendez-vous existe avant l'UPDATE
    with db_cursor() as cur:
        cur.execute("SELECT id FROM appointments WHERE id = %s", (appointment_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Appointment not found"})
    # Ordre fixe des colonnes pour que les paramètres correspondent bien au WHERE id = %s
    columns_order = [
        "clientId", "vehicleId", "categoryId", "statusId", "loanVehicleId", "loanStartDate", "loanEndDate",
        "prestation", "appointmentType", "appointmentSubType", "comment", "smsReminder", "startTime", "endTime",
    ]
    keys = [k for k in columns_order if k in updates]
    if not keys:
        keys = list(updates.keys())
    set_clause = ", ".join(f"`{k}` = %s" for k in keys)
    set_values = [_value_for_db(updates[k]) for k in keys]
    with db_cursor(commit=True) as cur:
        cur.execute(
            f"UPDATE appointments SET {set_clause} WHERE id = %s",
            tuple(set_values) + (appointment_id,),
        )
        # rowcount = lignes *modifiées* : 0 si aucune valeur n'a changé (validation sans modification)
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, clientId, vehicleId, categoryId, statusId, loanVehicleId, loanStartDate, loanEndDate, prestation, appointmentType, appointmentSubType, comment, smsReminder, startTime, endTime FROM appointments WHERE id = %s",
            (appointment_id,),
        )
        row = cur.fetchone()
    # Synchroniser la réservation de prêt : créer/mettre à jour si RDV a véhicule de prêt + dates + client, sinon supprimer la réservation liée
    with db_cursor() as cur:
        cur.execute(
            "SELECT loanVehicleId, loanStartDate, loanEndDate, clientId FROM appointments WHERE id = %s",
            (appointment_id,),
        )
        apt = cur.fetchone()
    # Même règle qu'à la création : la date de fin est optionnelle. Sans ce
    # correctif, la branche `else` ci-dessous SUPPRIMAIT la réservation dès que la
    # date de fin était vide — y compris en effaçant celle d'un prêt en cours avec
    # le bouton ✕ du formulaire, ou en modifiant un tout autre champ du RDV.
    if apt and apt["loanVehicleId"] and apt["loanStartDate"] and apt["clientId"]:
        start_dt = datetime.combine(apt["loanStartDate"], dt_time.min)
        end_dt = (
            datetime.combine(apt["loanEndDate"], dt_time(23, 59, 59, 999999))
            if apt["loanEndDate"]
            else None
        )
        with db_cursor(commit=True) as cur:
            cur.execute("SELECT id FROM loanReservations WHERE appointmentId = %s", (appointment_id,))
            existing = cur.fetchone()
            if existing:
                cur.execute(
                    "UPDATE loanReservations SET loanVehicleId = %s, clientId = %s, startDate = %s, endDate = %s WHERE appointmentId = %s",
                    (apt["loanVehicleId"], apt["clientId"], start_dt, end_dt, appointment_id),
                )
            else:
                cur.execute(
                    "INSERT INTO loanReservations (loanVehicleId, clientId, appointmentId, startDate, endDate) VALUES (%s, %s, %s, %s, %s)",
                    (apt["loanVehicleId"], apt["clientId"], appointment_id, start_dt, end_dt),
                )
    else:
        with db_cursor(commit=True) as cur:
            cur.execute("DELETE FROM loanReservations WHERE appointmentId = %s", (appointment_id,))

    # Synchroniser le postit atelier
    with db_cursor() as cur:
        cur.execute(
            "SELECT appointmentType, appointmentSubType, vehicleId, startTime FROM appointments WHERE id = %s",
            (appointment_id,),
        )
        apt_state = cur.fetchone()
    if apt_state:
        should_have = (
            apt_state["appointmentType"] == "client"
            and apt_state["appointmentSubType"] in ("visite", "restitution")
            and apt_state["vehicleId"] is not None
        )
        plan_date = apt_state["startTime"].date() if isinstance(apt_state["startTime"], datetime) else apt_state["startTime"]
        with db_cursor() as cur:
            cur.execute("SELECT id FROM workshopPlanning WHERE appointmentId = %s", (appointment_id,))
            existing_wp = cur.fetchone()
        if should_have:
            if existing_wp:
                with db_cursor(commit=True) as cur:
                    cur.execute(
                        "UPDATE workshopPlanning SET planDate = %s, vehicleId = %s WHERE appointmentId = %s",
                        (plan_date, apt_state["vehicleId"], appointment_id),
                    )
            else:
                with db_cursor(commit=True) as cur:
                    cur.execute(
                        "INSERT INTO workshopPlanning (vehicleId, planDate, appointmentId) VALUES (%s, %s, %s)",
                        (apt_state["vehicleId"], plan_date, appointment_id),
                    )
        elif existing_wp:
            with db_cursor(commit=True) as cur:
                cur.execute("DELETE FROM workshopPlanning WHERE appointmentId = %s", (appointment_id,))

    return AppointmentResponse(**row)


@router.delete("/{appointment_id}", status_code=204)
def delete_appointment(appointment_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM loanReservations WHERE appointmentId = %s", (appointment_id,))
        cur.execute("DELETE FROM workshopPlanning WHERE appointmentId = %s", (appointment_id,))
        cur.execute("DELETE FROM appointments WHERE id = %s", (appointment_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Appointment not found"})
