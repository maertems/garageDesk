import LoginForm from "./LoginForm";

// Server Component : lit APP_NAME côté serveur au moment de la requête (pas
// de rebuild nécessaire pour changer la marque affichée) et le passe au
// formulaire (Client Component).
export default function LoginPage() {
  const appName = process.env.APP_NAME || "GarageDesk";
  return <LoginForm appName={appName} />;
}
