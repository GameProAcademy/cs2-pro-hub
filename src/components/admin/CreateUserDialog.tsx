import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import { createAdminUser } from "@/lib/admin.functions";

export function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    email: "",
    password: "",
    display_name: "",
    nickname: "",
    country: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createAdminUser({ data: form }),
    onSuccess: () => {
      setError(null);
      setMessage(t("admin.msg.userCreated"));
      setForm({ ...form, email: "", password: "", display_name: "", nickname: "" });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: () => {
      setMessage(null);
      setError(t("admin.error.generic"));
    },
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-tight">{t("admin.create.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("admin.create.subtitle")}</p>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!create.isPending) create.mutate();
          }}
        >
          <div>
            <Label htmlFor="c-email">{t("admin.table.email")}</Label>
            <Input
              id="c-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="c-password">{t("admin.field.password")}</Label>
            <Input
              id="c-password"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("admin.create.passwordHint")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="c-name">{t("admin.field.displayName")}</Label>
              <Input
                id="c-name"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="c-nick">{t("admin.table.nickname")}</Label>
              <Input
                id="c-nick"
                value={form.nickname}
                onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="c-country">{t("admin.table.country")}</Label>
              <Input
                id="c-country"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
          </div>

          {message ? <p className="text-sm text-primary">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t("admin.action.saving") : t("admin.action.createUser")}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("admin.action.close")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
