"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ClientForm from "./ClientForm";

type ClientRecord = Record<string, unknown>;

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (client: ClientRecord) => void;
  initial?: ClientRecord | null;
};

export default function ClientFormModal({ open, onClose, onSaved, initial }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl flex flex-col max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>{initial ? "Modifier le client" : "Nouveau client"}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 min-h-0">
          <ClientForm initial={initial} onSaved={onSaved} onClose={onClose} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
