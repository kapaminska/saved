import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
}

export function SubmitButton({ pendingText, icon, children, disabled, loading }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isBusy = pending || Boolean(loading);
  const isDisabled = isBusy || disabled;

  return (
    <Button type="submit" disabled={isDisabled} className="w-full rounded-lg">
      {isBusy ? (
        <span className="flex items-center gap-2">
          <span className="border-primary-foreground/30 border-t-primary-foreground size-4 animate-spin rounded-full border-2" />
          {pendingText}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {icon}
          {children}
        </span>
      )}
    </Button>
  );
}
