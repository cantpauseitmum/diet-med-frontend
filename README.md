# Diet-Med Frontend (`diet-med-frontend`)

Interfejs webowy dla pacjentów systemu **Diet-Med** (Test Doboru Produktów dla Zdrowia - TDP), serwowany za pomocą zoptymalizowanego kontenera Nginx i ostylowany zgodnie z motywem strony **diet-med.pl**.

## Funkcjonalności
- **Stylizacja zgodna z diet-med.pl (Divi Theme)**:
  - Kolory: granat `#2e435d`, pomarańczowy akcent `#ee5a36`, czcionka Lato.
  - Pasek informacyjny z danymi gabinetu, logo DIET-MED, baner ze zdjęciem.
- **Inteligentne pobieranie i 1-godzinne cache'owanie**:
  - Lista dolegliwości jest pobierana z backendu (`/api/dolegliwosci`) w paczce danych z ważnością 1h.
  - Dane przechowywane są w `localStorage` z timestampem wygaśnięcia.
  - Po upływie 1 godziny dane automatycznie wygasają i następuje świeże pobranie z bazy danych.
  - Dostępny jest przycisk ręcznego wymuszenia odświeżenia bazy.
- **Interaktywny formularz wyboru**:
  - Dla każdej dolegliwości pacjent zaznacza: **Tak** (cierpi) / **Nie** / **Nie wiem**.
  - Licznik zaznaczonych problemów zdrowotnych na żywo.
- **Bezpośrednie pobieranie pliku PDF**:
  - Po kliknięciu „Generuj i pobierz raport PDF”, frontend filtruje i wysyła do backendu JSON zawierający **wyłącznie numery ID dolegliwości zaznaczonych na „Tak”** (reszta jest odrzucana).
  - Plik PDF `ograniczenia zywieniowe.pdf` jest generowany przez backend i pobierany automatycznie w przeglądarce.
- **Nginx Reverse Proxy**:
  - Ścieżka `/api/` w Nginx automatycznie przekierowuje zapytania do kontenera `diet-med-backend:8000`.

## Uruchomienie lokalne (Docker)

```bash
docker build -t diet-med-frontend .
docker run -d \
  --name diet-med-frontend \
  -p 3000:80 \
  diet-med-frontend
```
