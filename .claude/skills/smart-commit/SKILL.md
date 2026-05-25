---
description: Commituje zmiany za użytkownika z akceptacją commit message
---

# Smart Commit — inteligentny flow gitowy

Jesteś asystentem git. Analizujesz zmiany w repozytorium, wykrywasz konwencję commit messages, proponujesz logiczny podział na commity i przeprowadzasz pełen flow: pull → commit → push.

## Parametr

Brak — skill operuje na bieżącym stanie working tree.

## Flow

### 1. PULL

Uruchom `git pull`.

- Jeśli sukces → kontynuuj.
- Jeśli błąd (konflikty, brak remote, detached HEAD) → wyświetl komunikat błędu i STOP: "Pull nie powiódł się. Rozwiąż problem ręcznie i uruchom ponownie."

### 2. ANALIZA ZMIAN

Uruchom równolegle:
- `git status` — lista zmienionych, staged, unstaged i untracked plików
- `git diff` — unstaged changes
- `git diff --cached` — staged changes

Jeśli brak zmian (czyste working tree, brak untracked) → STOP: "Brak zmian do commitowania."

**Security check** — sprawdź czy wśród zmienionych/nowych plików nie ma potencjalnie wrażliwych:
- Pliki: `.env`, `.env.*`, `credentials.*`, `*secret*`, `*.key`, `*.pem`, `id_rsa*`, `*.p12`, `token*`
- Katalogi: `.aws/`, `.ssh/`

Jeśli znaleziono → ostrzeż użytkownika: "Uwaga: wśród zmian znajdują się potencjalnie wrażliwe pliki: {lista}. Czy na pewno chcesz je commitować?" Poczekaj na potwierdzenie. Jeśli użytkownik odmówi — wyklucz te pliki z dalszego flow.

### 3. WYKRYCIE KONWENCJI

Uruchom `git log -5 --format="%s"` (ostatnie 5 commit messages).

Przeanalizuj wzorzec:
- **Prefix**: czy jest stały format? (np. `feat:`, `fix:`, `JIRA-123:`, brak prefixu)
- **Język**: polski / angielski / mieszany
- **Styl**: imperatyw ("add feature") vs opis ("added feature") vs rzeczownik ("feature addition")
- **Długość**: krótkie (< 50 znaków) / średnie / długie
- **Co-author**: nie uwzgledniaj LLMów jako co-author

Zapamiętaj wykryty wzorzec — użyjesz go do generowania messages.

### 4. PROPOZYCJA PODZIAŁU

Na podstawie analizy zmian (krok 2) zaproponuj podział na logicznie spójne commity.

**Kryterium grupowania**: logiczna spójność — grupuj po sensie biznesowym/technicznym:
- Nowy endpoint + jego test + DTO → jeden commit
- Refaktor helpera niezwiązany z feature → osobny commit
- Zmiany konfiguracyjne → osobny commit
- Zmiany dokumentacji → osobny commit (chyba że ściśle powiązane z kodem)

**Jeśli wszystkie zmiany są logicznie spójne** → zaproponuj jeden commit (nie wymuszaj sztucznego podziału).

**Format prezentacji** — użyj AskUserQuestion. Dla każdego proponowanego commita pokaż:

```
## Commit {N}: {proponowany message zgodny z konwencją repo}

Pliki:
- {ścieżka/plik1} (modified)
- {ścieżka/plik2} (new)
- {ścieżka/plik3} (deleted)

Uzasadnienie: {dlaczego te pliki idą razem — 1 zdanie}
```

Opcje: "Akceptuję" / "Chcę zmodyfikować"

### 5. MODYFIKACJA (opcjonalna)

Jeśli użytkownik wybrał "Chcę zmodyfikować":
- Poczekaj na opis słowny (np. "połącz commit 1 i 2", "przenieś X.java do commita 3", "zmień message commita 1 na ...")
- Zregeneruj propozycję z uwzględnieniem feedbacku
- Ponownie prezentuj do akceptacji (krok 4)

Powtarzaj aż użytkownik zaakceptuje.

### 6. WYKONANIE COMMITÓW

Dla każdego zaakceptowanego commita, sekwencyjnie:

1. `git add {lista plików}` — dodaj tylko pliki przypisane do tego commita
2. `git commit -m "{message}"` — użyj zaakceptowanego message

Jeśli commit się nie powiedzie → wyświetl błąd i STOP.

Po wykonaniu wszystkich commitów potwierdź: "Wykonano {N} commitów."

### 7. PUSH (opcjonalny)

Zapytaj użytkownika: "Czy pushować zmiany?"

- Jeśli tak → uruchom `git push`
  - Jeśli sukces → "Push wykonany."
  - Jeśli błąd → wyświetl komunikat i STOP
- Jeśli nie → "OK, zmiany pozostają lokalne."

## Reguły

- **Nie rób amend** — skill tworzy tylko nowe commity
- **Happy path** — przy jakimkolwiek błędzie git informuj i kończ, nie próbuj naprawiać
- **Konwencja z repo** — messages MUSZĄ pasować do wykrytego wzorca z historii
- **Użytkownik decyduje** — nigdy nie commituj ani nie pushuj bez akceptacji
- **Wrażliwe pliki** — zawsze ostrzegaj, nigdy nie dodawaj po cichu
- **Logiczna spójność** — nie wymuszaj sztucznego podziału; jeden commit jest OK jeśli zmiany są spójne
