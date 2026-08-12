import ClientForm from "../ClientForm";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

export default function NewClientPage() {
  return (
    <>
      <PageHeader title="Nouveau client" back={{ href: "/clients", label: "Clients" }} />
      <PageBody>
        <div className="max-w-3xl">
          <ClientForm />
        </div>
      </PageBody>
    </>
  );
}
