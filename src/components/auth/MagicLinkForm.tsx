import { useState, useEffect, useCallback } from "react";
import { Mail, ArrowRight } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  serverError?: string | null;
}

const COOLDOWN_SECONDS = 60;

export default function MagicLinkForm({ serverError }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(serverError ?? null);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => {
      setCooldown((c) => c - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [cooldown]);

  function validateEmail(): boolean {
    if (!email.trim()) {
      setEmailError("E-mail jest wymagany");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Podaj poprawny adres e-mail");
      return false;
    }
    setEmailError(undefined);
    return true;
  }

  const sendMagicLink = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = new URLSearchParams({ email: email.trim() });
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!json.success) {
        setSent(false);
        setError(json.error ?? "Nie udało się wysłać linku");
        return;
      }
      setSent(true);
      setCooldown(COOLDOWN_SECONDS);
    } catch {
      setSent(false);
      setError("Błąd sieci. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }, [email]);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading || cooldown > 0) return;
    if (!validateEmail()) return;
    await sendMagicLink();
  }

  const buttonLabel = cooldown > 0 ? `Wyślij ponownie (${cooldown}s)` : "Zaloguj się magic linkiem";

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField
        id="email"
        type="email"
        label="E-mail"
        value={email}
        onChange={(v) => {
          setEmail(v);
          setSent(false);
          if (emailError) setEmailError(undefined);
        }}
        placeholder="ty@example.com"
        error={emailError}
        icon={<Mail className="size-4" />}
      />

      {sent ? (
        <p className="text-muted-foreground text-center text-sm">
          Wysłaliśmy link na <span className="text-foreground font-medium">{email}</span>. Kliknij go, żeby się
          zalogować.
        </p>
      ) : null}

      <ServerError message={error} />

      <SubmitButton
        pendingText="Wysyłanie linku..."
        icon={<ArrowRight className="size-4" />}
        loading={loading}
        disabled={cooldown > 0}
      >
        {buttonLabel}
      </SubmitButton>
    </form>
  );
}
