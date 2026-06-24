import { useState, useRef, useEffect } from "react";
import { User, Calendar, Clock, Heart, ArrowRight, ChevronDown } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { toDateInputValue, validateDateOfBirth } from "@/lib/profile/date";

interface ProfileData {
  display_name: string | null;
  date_of_birth: string | null;
  retirement_age: number | null;
  relationship_status: string | null;
}

interface Props {
  profile: ProfileData;
  redirectTo?: string;
  submitLabel?: string;
}

const RELATIONSHIP_OPTIONS = [
  { value: "", label: "Wolę nie podawać" },
  { value: "single", label: "Singiel/ka" },
  { value: "married", label: "Małżeństwo" },
  { value: "partnership", label: "Związek partnerski" },
];

export default function ProfileForm({ profile, redirectTo, submitLabel = "Zapisz" }: Props) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(toDateInputValue(profile.date_of_birth));
  const [retirementAge, setRetirementAge] = useState(profile.retirement_age?.toString() ?? "");
  const [relationshipStatus, setRelationshipStatus] = useState(profile.relationship_status ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [dateError, setDateError] = useState<string | undefined>();
  const [ageError, setAgeError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  function validate(): boolean {
    let valid = true;

    if (!displayName.trim()) {
      setNameError("Imię jest wymagane");
      valid = false;
    } else {
      setNameError(undefined);
    }

    if (retirementAge.trim()) {
      const age = parseInt(retirementAge, 10);
      if (isNaN(age) || age < 30 || age > 100) {
        setAgeError("Wiek musi być między 30 a 100");
        valid = false;
      } else {
        setAgeError(undefined);
      }
    } else {
      setAgeError(undefined);
    }

    const dobError = validateDateOfBirth(dateOfBirth);
    if (dobError) {
      setDateError(dobError);
      valid = false;
    } else {
      setDateError(undefined);
    }

    return valid;
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError(null);
    try {
      const body = new URLSearchParams();
      body.set("display_name", displayName.trim());
      body.set("date_of_birth", dateOfBirth.trim());
      if (retirementAge.trim()) body.set("retirement_age", retirementAge.trim());
      body.set("relationship_status", relationshipStatus);

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!json.success) {
        setError(json.error ?? "Nie udało się zapisać profilu");
        return;
      }
      if (redirectTo) {
        window.location.href = redirectTo;
        return;
      }
      setSuccess(true);
      successTimer.current = setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch {
      setError("Błąd sieci. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField
        id="display_name"
        type="text"
        label="Imię"
        value={displayName}
        onChange={(v) => {
          setDisplayName(v);
          if (nameError) setNameError(undefined);
        }}
        placeholder="Jak mamy się do Ciebie zwracać?"
        error={nameError}
        icon={<User className="size-4" />}
      />

      <FormField
        id="date_of_birth"
        type="date"
        label="Data urodzenia"
        value={dateOfBirth}
        onChange={(v) => {
          setDateOfBirth(v);
          if (dateError) setDateError(undefined);
        }}
        error={dateError}
        hint={
          !dateError ? (
            <p className="text-muted-foreground mt-1 text-xs">Użyj kalendarza — ręczne wpisywanie może nie działać.</p>
          ) : undefined
        }
        icon={<Calendar className="size-4" />}
        inputProps={{
          max: new Date().toISOString().slice(0, 10),
          className:
            "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70",
        }}
      />

      <FormField
        id="retirement_age"
        type="number"
        label="Planowany wiek emerytalny"
        value={retirementAge}
        onChange={(v) => {
          setRetirementAge(v);
          if (ageError) setAgeError(undefined);
        }}
        placeholder="np. 65"
        error={ageError}
        icon={<Clock className="size-4" />}
      />

      <div>
        <label htmlFor="relationship_status" className="text-foreground mb-1 block text-sm">
          Status związku
        </label>
        <div className="relative">
          <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">
            <Heart className="size-4" />
          </span>
          <select
            id="relationship_status"
            name="relationship_status"
            value={relationshipStatus}
            onChange={(e) => {
              setRelationshipStatus(e.target.value);
            }}
            className="border-input bg-background text-foreground focus:border-ring focus:ring-ring w-full appearance-none rounded-lg border px-3 py-2 pr-9 pl-10 transition-colors focus:ring-2 focus:outline-none"
          >
            {RELATIONSHIP_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
            <ChevronDown className="size-4" />
          </span>
        </div>
      </div>

      <ServerError message={error} />

      {success && (
        <p className="rounded-lg border border-green-200 bg-green-100 px-3 py-2 text-center text-sm text-green-800">
          Zapisano!
        </p>
      )}

      <SubmitButton pendingText="Zapisywanie..." icon={<ArrowRight className="size-4" />} disabled={loading}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
