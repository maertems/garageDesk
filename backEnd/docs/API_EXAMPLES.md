# Exemples et cas d'usage API GarageDesk

## Authentification

1. **Login**  
   `POST /api/v1/auth/login`  
   Body: `{"login": "garage", "password": "garage"}`  
   Réponse : `user` (id, login, role) et `sessionId`. Le cookie `sessionId` est aussi envoyé.  
   Pour les appels suivants, envoyer le header `X-Session-Id: <sessionId>` (ou le cookie).

2. **Vérifier la session**  
   `GET /api/v1/auth/me` avec header `X-Session-Id`.

3. **Logout**  
   `POST /api/v1/auth/logout` avec header `X-Session-Id` (invalide la session côté serveur).

---

## Rendez-vous

- **Récupérer les RDV de la semaine**  
  `GET /api/v1/appointments?start=2025-02-10T00:00:00&end=2025-02-16T23:59:59`  
  Retourne les RDV qui chevauchent cette plage, avec client, véhicule, catégorie et statut (codes et couleurs).

- **Créer un RDV avec client et véhicule**  
  `POST /api/v1/appointments`  
  Body (exemple) :
  ```json
  {
    "clientId": 1,
    "vehicleId": 1,
    "categoryId": 1,
    "statusId": 1,
    "startTime": "2025-02-10T09:00:00",
    "endTime": "2025-02-10T10:00:00",
    "comment": "Révision",
    "smsReminder": true
  }
  ```

- **Listes déroulantes catégories / statuts**  
  `GET /api/v1/appointmentCategories` et `GET /api/v1/appointmentStatuses`  
  Réponse : tableau avec `id`, `code` (anglais), `color`.

---

## Clients et véhicules

- **Préchargement pour le calendrier (clients + véhicules)**  
  `GET /api/v1/clients?withVehicles=true`  
  Retourne chaque client avec un tableau `vehicles`. À mettre en cache côté front ; invalider après toute modification clients/véhicules.

- **Véhicules d’un client**  
  `GET /api/v1/vehicles?clientId=1`

---

## Congés

- **Lister les congés du mois**  
  `GET /api/v1/leaveRequests?month=2&year=2025`  
  Toutes les demandes qui touchent février 2025.

- **Filtrer par statut**  
  `GET /api/v1/leaveRequests?status=pending`

---

## Véhicules de prêt et réservations

- **Réservations sur une plage de dates**  
  `GET /api/v1/loanReservations?start=2025-02-10T00:00:00&end=2025-02-16T23:59:59`

- **Réservations d’un véhicule de prêt**  
  `GET /api/v1/loanReservations?loanVehicleId=1`

---

## Erreurs

Toutes les réponses d’erreur sont en JSON : `{"code": "...", "message": "..."}`.  
Exemples de codes : `validationError`, `unauthorized`, `forbidden`, `notFound`, `invalidCredentials`.
