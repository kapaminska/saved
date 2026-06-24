import { useState, useEffect, useCallback } from "react";
import { Mail, ArrowRight, KeyRound, RotateCw } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  serverError?: string | null;
}

const COOLDOWN_SECONDS = 60;

export default function MagicLinkForm({ serverError }: Props) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(serverError ?? null);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [tokenError, setTokenError] = useState<string | undefined>();
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

  function validateToken(): boolean {
    if (!token.trim()) {
      setTokenError("Kod jest wymagany");
      return false;
    }
    if (!/^\d{6}$/.test(token.trim())) {
      setTokenError("Podaj 6-cyfrowy kod");
      return false;
    }
    setTokenError(undefined);
    return true;
  }

  const sendOtp = useCallback(async () => {
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
        setError(json.error ?? "Nie udało się wysłać kodu");
        return;
      }
      setStep("otp");
      setCooldown(COOLDOWN_SECONDS);
    } catch {
      setError("Błąd sieci. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }, [email]);

  async function handleEmailSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateEmail()) return;
    await sendOtp();
  }

  function handleOtpSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateToken()) return;
    e.currentTarget.submit();
  }

  async function handleResend() {
    setToken("");
    setTokenError(undefined);
    await sendOtp();
  }

  if (step === "email") {
    return (
      <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
        <FormField
          id="email"
          type="email"
          label="E-mail"
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (emailError) setEmailError(undefined);
          }}
          placeholder="ty@example.com"
          error={emailError}
          icon={<Mail className="size-4" />}
        />

        <ServerError message={error} />

        <SubmitButton pendingText="Wysyłanie kodu..." icon={<ArrowRight className="size-4" />} disabled={loading}>
          Kontynuuj
        </SubmitButton>
      </form>
    );
  }

  return (
    <form method="POST" action="/api/auth/verify-otp" onSubmit={handleOtpSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="email" value={email} />
      <p className="text-muted-foreground text-center text-sm">
        Wysłaliśmy 6-cyfrowy kod na <span className="text-foreground font-medium">{email}</span>
      </p>

      <FormField
        id="token"
        name="token"
        type="text"
        label="Kod weryfikacyjny"
        value={token}
        onChange={(v) => {
          const digits = v.replace(/\D/g, "").slice(0, 6);
          setToken(digits);
          if (tokenError) setTokenError(undefined);
        }}
        placeholder="000000"
        error={tokenError}
        icon={<KeyRound className="size-4" />}
        inputProps={{ maxLength: 6, inputMode: "numeric", pattern: "[0-9]*", autoComplete: "one-time-code" }}
      />

      <ServerError message={error} />

      <SubmitButton pendingText="Weryfikacja..." icon={<ArrowRight className="size-4" />} disabled={loading}>
        Zaloguj się
      </SubmitButton>

      <div className="text-center">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || loading}
          className="text-primary hover:text-primary/80 disabled:text-muted-foreground/50 inline-flex items-center gap-1 text-sm transition-colors hover:underline disabled:cursor-not-allowed disabled:no-underline"
        >
          <RotateCw className="size-3" />
          {cooldown > 0 ? `Wyślij kod ponownie (${cooldown}s)` : "Wyślij kod ponownie"}
        </button>
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setToken("");
            setError(null);
            setTokenError(undefined);
          }}
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          Użyj innego adresu e-mail
        </button>
      </div>
    </form>
  );
}
