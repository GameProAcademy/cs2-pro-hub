import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Single reusable masked field with a show/hide toggle. Every password field in
 * the product uses this component: there is no per-page implementation.
 *
 * The toggle only swaps `type` — it never changes the value and never submits
 * the form (`type="button"`).
 */
export type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  containerClassName?: string | undefined;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, containerClassName, ...props }, ref) {
    const t = useT();
    const [visible, setVisible] = useState(false);
    const reactId = useId();
    const controls = props.id ?? reactId;

    return (
      <div className={cn("relative", containerClassName)}>
        <Input
          {...props}
          id={props.id ?? controls}
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-11", className)}
        />
        <button
          type="button"
          tabIndex={0}
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? t("password.hide") : t("password.show")}
          aria-pressed={visible}
          aria-controls={controls}
          disabled={props.disabled}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
    );
  },
);
