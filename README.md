# Diet-Med Frontend (`diet-med-frontend`)

Interfejs webowy dla pacjentów systemu **Diet-Med** (Test Doboru Produktów dla Zdrowia - TDP), serwowany za pomocą zoptymalizowanego kontenera Nginx.

## Funkcjonalności
- **Inteligentne pobieranie i 1-godzinne cache'owanie**:
  - Lista dolegliwości jest pobierana z backendu (`/api/dolegliwosci`) w paczce danych z ważnością 1h.
  - Dane przechowywane są w `localStorage` z timestampem wygaśnięcia.
  - Po upływie 1 godziny dane automatycznie wygasają i następuje świeże pobranie z bazy danych.
  - Dostępny jest przycisk ręcznego wymuszenia odświeżenia bazy.
- **Interaktywny formularz wyboru**:
  - Dla każdej dolegliwości pacjent zaznacza: **Tak** (cierpi) / **Nie** / **Nie wiem**.
  - Licznik zaznaczonych problemów zdrowotnych na żywo.
- **Pole na adres e-mail**:
  - Walidacja adresu e-mail przed wysyłką.
- **Optymalna wysyłka danych**:
  - Po kliknięciu „Generuj i wyślij”, frontend filtruje i wysyła do backendu JSON zawierający **wyłącznie numery ID dolegliwości zaznaczonych na „Tak”** oraz adres e-mail (reszta jest odrzucana).
- **Potwierdzenie i pobieranie PDF**:
  - Informacja o wysłaniu e-maila oraz bezpośredni przycisk do pobrania pliku PDF `ograniczenia zywieniowe.pdf`.
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

## Publikacja na GitHub (jako osobne repozytorium)

```bash
cd diet-med-frontend
git init
git add .
git commit -m "Initial commit: diet-med-frontend TDP questionnaire UI with 1h cache and Nginx proxy"
git branch -M main
git remote add origin git@github.com:TWOJ_USER/diet-med-frontend.git
git push -u origin main
```
