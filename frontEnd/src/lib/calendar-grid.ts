/**
 * Réglages de la grille du calendrier, partagés entre le serveur et le client.
 *
 * Ils vivent ici et non dans `CalendarView.tsx` pour une raison de mécanique, pas
 * de rangement : ce fichier-là porte « use client », et un composant serveur qui
 * importerait une constante d'un module client n'en recevrait pas la valeur mais
 * une référence — `HOUR_HEIGHT_ALLOWED_PX.includes(…)` échouerait à l'exécution,
 * sans que TypeScript n'y voie rien.
 *
 * La validation des réglages se fait donc côté serveur, dans `app/page.tsx`, avec
 * ces listes ; la grille les reçoit en props déjà validées.
 */

// Hauteur d'une HEURE à l'écran, et non d'un bloc : c'est elle qui reste constante
// quand on change le découpage. 88 px historiquement, soit 4 blocs de 22.
export const HOUR_HEIGHT_DEFAULT_PX = 88;

// Hauteurs proposées, nommées côté réglages : petit 56, compact 68, normal 88,
// large 112. La valeur stockée reste le nombre de pixels — la clé s'appelle
// `calendarHourHeightPx` et le garage a déjà 68 enregistré ; passer au libellé aurait
// silencieusement tout ramené au défaut.
//
// Toutes MULTIPLES DE 4, et ce n'est pas une coquetterie : la colonne des heures et
// les lignes de la grille sont deux colonnes distinctes du DOM, et leur alignement
// n'est exact que si la hauteur de l'heure se divise sans reste par 4 (blocs de
// 15 min) et par 2 (blocs de 30). À 50 px, un bloc ferait 12,5 px et les traits se
// décaleraient d'un pixel selon l'arrondi du navigateur.
export const HOUR_HEIGHT_ALLOWED_PX = [56, 68, 88, 112];

// Découpages proposés (réglage `calendarSlotMinutes`). Une heure y est coupée en 4,
// en 2, ou pas du tout.
export const SLOT_MINUTES_ALLOWED = [15, 30, 60];
