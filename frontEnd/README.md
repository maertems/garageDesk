# WPSCLS Intranet — Frontend

Interface web basée sur **Next.js 14 + Tailwind CSS + shadcn/ui**.

## Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS 3
- shadcn/ui (composants Radix + Tailwind, copiés dans `src/components/ui/`)
- lucide-react (icônes)
- date-fns (dates en français)

## Pages avec le design actuel

- `/login` — Connexion (carte centrée, design moderne)
- `/` — Calendrier (sidebar latérale, vues jour/semaine/mois)

Les autres pages (clients, véhicules, employés, congés, véhicules de prêt, admin, paramètres) utilisent encore un CSS hérité de l'ancienne interface, importé via `src/app/legacy.css` et activé via la classe `.legacy-scope` (appliquée automatiquement par `AppShell`). Elles seront refaites une à une.

## Configuration

- **BACKEND_URL** : URL de l'API backend telle que le serveur Next.js peut l'atteindre.
  - En local : `http://localhost:7780`
  - Frontend en Docker, backend sur la même machine : `http://<IP-HÔTE>:7780` (ex. `http://192.168.1.10:7780`)
- **APP_NAME** : nom affiché de l'application (sidebar, page de connexion, titre d'onglet). Voir `.env.example`.

## Développement

```bash
npm install
export BACKEND_URL=http://localhost:7780
npm run dev
```

Ouvrir http://localhost:3000. Connexion : **garage** / **garage** ou **admin** / **admin**.

## Docker

Image : `gd-frontend`. Port hôte : **8081**.

```bash
docker build -t gd-frontend .
docker run -d -p 8081:80 \
  -e BACKEND_URL=http://<IP-BACKEND>:7780 \
  -e APP_NAME="Mon Intranet" \
  --name gd-frontend \
  gd-frontend
```

Script tout-en-un : `../updateFront.sh` (rebuild + run sur 8081, lit `../deploy.env`).

- Interface : `http://<IP>:8081`

## Architecture UI

```
src/
├── app/                    # Routes Next.js (App Router)
│   ├── globals.css         # Tailwind + variables shadcn
│   ├── legacy.css          # Anciens styles (pages non refaites)
│   ├── layout.tsx          # RootLayout
│   ├── login/              # ✅ refait
│   ├── page.tsx            # ✅ refait (calendrier)
│   ├── calendar/           # ✅ refait (CalendarView, AppointmentForm)
│   └── ...                 # autres pages : legacy (à refaire)
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx    # Sidebar + main
│   │   └── Sidebar.tsx     # Sidebar collapsible
│   └── ui/                 # Composants shadcn (Button, Input, Dialog, ...)
└── lib/
    ├── api.ts              # Client API
    ├── labels.ts           # Libellés FR
    └── utils.ts            # cn() helper
```

## Roadmap de refonte (par page)

- [x] Connexion
- [x] Calendrier (jour / semaine / mois)
- [ ] Clients
- [ ] Véhicules
- [ ] Employés / Congés
- [ ] Véhicules de prêt
- [ ] Admin (catégories, statuts, notifications)
- [ ] Paramètres
