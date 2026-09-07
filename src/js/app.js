/**
 * Diet-Med • Test Doboru Produktów dla Zdrowia (TDP)
 * Obsługa formularza, 1-godzinnego cache'owania listy dolegliwości oraz pobierania raportu PDF.
 */

const CACHE_KEY_DATA = 'diet_med_tdp_dolegliwosci_cache_v2';
const CACHE_KEY_EXPIRY = 'diet_med_tdp_expiry_v2';
const ONE_HOUR_MS = 60 * 60 * 1000; // 3600 sekund = 1 godzina

// Stan aplikacji
const state = {
  dolegliwosci: [],
  answers: {}, // id -> 'tak' | 'nie' | 'nie_wiem'
  currentPdfUrl: null,
  currentPdfFilename: 'ograniczenia zywieniowe.pdf'
};

// Elementy DOM
const elements = {
  ailmentsList: document.getElementById('ailmentsList'),
  tdpForm: document.getElementById('tdpForm'),
  selectedCount: document.getElementById('selectedCount'),
  submitBtn: document.getElementById('submitBtn'),
  formValidationError: document.getElementById('formValidationError'),
  unansweredCount: document.getElementById('unansweredCount'),
  resultModal: document.getElementById('resultModal'),
  modalMessage: document.getElementById('modalMessage'),
  modalDetails: document.getElementById('modalDetails'),
  downloadPdfBtn: document.getElementById('downloadPdfBtn'),
  closeModalBtn: document.getElementById('closeModalBtn')
};

/**
 * Inicjalizacja aplikacji
 */
document.addEventListener('DOMContentLoaded', () => {
  loadAilments();
  setupEventListeners();
});

/**
 * Konfiguracja nasłuchu zdarzeń
 */
function setupEventListeners() {
  elements.tdpForm.addEventListener('submit', handleFormSubmit);

  if (elements.downloadPdfBtn) {
    elements.downloadPdfBtn.addEventListener('click', handleDownloadPdf);
  }

  elements.closeModalBtn.addEventListener('click', closeModal);
  elements.resultModal.addEventListener('click', (e) => {
    if (e.target === elements.resultModal) closeModal();
  });
}

/**
 * Główna funkcja ładująca dolegliwości (sprawdza ważność 1h w localStorage)
 */
async function loadAilments() {
  const cachedDataStr = localStorage.getItem(CACHE_KEY_DATA);
  const cachedExpiryStr = localStorage.getItem(CACHE_KEY_EXPIRY);
  const now = Date.now();

  if (cachedDataStr && cachedExpiryStr && now < Number(cachedExpiryStr)) {
    // Dane w cache są nadal ważne (mniej niż 1h)
    try {
      const data = JSON.parse(cachedDataStr);
      if (Array.isArray(data) && data.length > 0 && data[0].dostepna !== undefined) {
        state.dolegliwosci = data;
        renderAilments(data);
        return;
      }
    } catch (e) {
      console.warn('Błąd parsowania cache, pobieram z serwera:', e);
    }
  }

  // W przeciwnym razie: dane wygasły lub to pierwsze otwarcie
  await fetchAilmentsFromBackend();
}

/**
 * Pobiera paczkę danych z backendu przez API (/api/dolegliwosci)
 */
async function fetchAilmentsFromBackend() {
  elements.ailmentsList.innerHTML = `
    <div class="skeleton-loader">
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
    </div>
  `;

  try {
    const res = await fetch('/api/dolegliwosci');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    
    const data = await res.json();
    const ailments = data.dolegliwosci || [];
    
    // Zapisujemy do localStorage z czasem wygaśnięcia 1h
    const expiryTime = Date.now() + (data.expires_in_seconds ? data.expires_in_seconds * 1000 : ONE_HOUR_MS);
    localStorage.setItem(CACHE_KEY_DATA, JSON.stringify(ailments));
    localStorage.setItem(CACHE_KEY_EXPIRY, expiryTime.toString());

    state.dolegliwosci = ailments;
    renderAilments(ailments);

  } catch (err) {
    console.error('Błąd pobierania dolegliwości:', err);
    elements.ailmentsList.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--color-accent);">
        Wystąpił błąd podczas ładowania listy dolegliwości z serwera. Upewnij się, że backend jest uruchomiony.
      </div>
    `;
  }
}

/**
 * Renderuje wiersze dolegliwości w formularzu
 */
function renderAilments(ailments) {
  if (!ailments || ailments.length === 0) {
    elements.ailmentsList.innerHTML = '<div style="color: var(--color-text-muted); text-align: center; padding: 20px;">Brak dolegliwości w bazie danych.</div>';
    return;
  }

  elements.ailmentsList.innerHTML = '';

  ailments.forEach((item) => {
    const isAvailable = item.dostepna !== false;
    const row = document.createElement('div');
    row.className = 'ailment-row';
    row.id = `ailment-row-${item.id}`;

    if (!isAvailable) {
      row.classList.add('disabled-ailment');
    }

    const currentVal = isAvailable ? (state.answers[item.id] || null) : null;
    if (currentVal === 'tak') row.classList.add('selected-tak');

    row.innerHTML = `
      <div class="ailment-name-col">
        <div class="ailment-name">${escapeHtml(item.kod)}</div>
        ${!isAvailable ? '<span class="ailment-status-badge" title="W bazie danych brakuje tabeli z produktami dla tej dolegliwości">Brak tabeli w bazie</span>' : ''}
      </div>
      <div class="options-group" role="radiogroup" aria-label="${escapeHtml(item.kod)}">
        <button 
          type="button" 
          class="option-btn ${currentVal === 'tak' ? 'active' : ''}" 
          data-id="${item.id}" 
          data-value="tak"
          aria-checked="${currentVal === 'tak'}"
          ${!isAvailable ? 'disabled title="Dolegliwość niedostępna - brak tabeli w bazie danych"' : ''}
        >Tak</button>
        <button 
          type="button" 
          class="option-btn ${currentVal === 'nie' ? 'active' : ''}" 
          data-id="${item.id}" 
          data-value="nie"
          aria-checked="${currentVal === 'nie'}"
          ${!isAvailable ? 'disabled title="Dolegliwość niedostępna - brak tabeli w bazie danych"' : ''}
        >Nie</button>
        <button 
          type="button" 
          class="option-btn ${currentVal === 'nie_wiem' ? 'active' : ''}" 
          data-id="${item.id}" 
          data-value="nie_wiem"
          aria-checked="${currentVal === 'nie_wiem'}"
          ${!isAvailable ? 'disabled title="Dolegliwość niedostępna - brak tabeli w bazie danych"' : ''}
        >Nie wiem</button>
      </div>
    `;

    // Obsługa kliknięcia przycisków tylko dla dostępnych dolegliwości
    if (isAvailable) {
      const buttons = row.querySelectorAll('.option-btn');
      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const val = btn.getAttribute('data-value');
          handleOptionSelect(item.id, val, row);
        });
      });
    }

    elements.ailmentsList.appendChild(row);
  });

  updateSelectedCount();
}

/**
 * Zwraca listę aktywnych (niewyszarzonych) dolegliwości, które nie zostały jeszcze zaznaczone
 */
function getUnansweredAvailableAilments() {
  const availableAilments = state.dolegliwosci.filter(a => a.dostepna !== false);
  return availableAilments.filter(a => !state.answers[a.id]);
}

/**
 * Zaznaczenie opcji Tak / Nie / Nie wiem
 */
function handleOptionSelect(id, value, rowElement) {
  const item = state.dolegliwosci.find(a => a.id === id);
  if (item && item.dostepna === false) return; // Ochrona przed wyborem niedostępnej pozycji

  state.answers[id] = value;

  // Usunięcie wyróżnienia błędu z tego wiersza
  rowElement.classList.remove('unanswered-error');

  // Aktualizacja klas przycisków w wierszu
  const buttons = rowElement.querySelectorAll('.option-btn');
  buttons.forEach((b) => {
    const isSelected = b.getAttribute('data-value') === value;
    b.classList.toggle('active', isSelected);
    b.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });

  // Stylizacja wiersza jeśli "Tak"
  rowElement.classList.toggle('selected-tak', value === 'tak');

  // Jeśli widoczny był komunikat błędu, aktualizujemy liczbę pozostałych pytań lub go ukrywamy
  if (elements.formValidationError && elements.formValidationError.style.display !== 'none') {
    const remaining = getUnansweredAvailableAilments();
    if (remaining.length === 0) {
      elements.formValidationError.style.display = 'none';
    } else if (elements.unansweredCount) {
      elements.unansweredCount.textContent = remaining.length;
    }
  }

  updateSelectedCount();
}

/**
 * Aktualizacja licznika zaznaczonych na "Tak"
 */
function updateSelectedCount() {
  if (!elements.selectedCount) return;
  const availableIds = new Set(
    state.dolegliwosci
      .filter(a => a.dostepna !== false)
      .map(a => a.id)
  );

  const takCount = Object.keys(state.answers)
    .filter(id => state.answers[id] === 'tak' && availableIds.has(Number(id)))
    .length;
  elements.selectedCount.textContent = takCount;
}

/**
 * Obsługa wysyłki formularza i generowania PDF
 */
async function handleFormSubmit(e) {
  e.preventDefault();

  // Test walidacji: wszystkie aktywne (niewyszarzone) dolegliwości muszą być określone (Tak, Nie lub Nie wiem)
  const unanswered = getUnansweredAvailableAilments();
  if (unanswered.length > 0) {
    // Wyróżnij wszystkie nieuzupełnione aktywne wiersze
    unanswered.forEach((item) => {
      const row = document.getElementById(`ailment-row-${item.id}`);
      if (row) row.classList.add('unanswered-error');
    });

    // Wyświetl komunikat walidacyjny
    if (elements.formValidationError) {
      if (elements.unansweredCount) elements.unansweredCount.textContent = unanswered.length;
      elements.formValidationError.style.display = 'flex';
    }

    // Płynnie przewiń stronę do pierwszego nieuzupełnionego pytania
    const firstUnansweredEl = document.getElementById(`ailment-row-${unanswered[0].id}`);
    if (firstUnansweredEl) {
      firstUnansweredEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return;
  }

  // Jeśli walidacja przeszła, ukryj komunikat błędu
  if (elements.formValidationError) {
    elements.formValidationError.style.display = 'none';
  }

  const availableIds = new Set(
    state.dolegliwosci
      .filter(a => a.dostepna !== false)
      .map(a => a.id)
  );

  // Wyfiltrowanie WYŁĄCZNIE ID dostępnych dolegliwości zaznaczonych jako "tak"
  const takIds = Object.keys(state.answers)
    .filter(id => state.answers[id] === 'tak' && availableIds.has(Number(id)))
    .map(id => Number(id));

  const payload = {
    dolegliwosci: takIds
  };

  // Blokada przycisku i wskaźnik ładowania
  setSubmitLoading(true);

  try {
    const res = await fetch('/api/zgloszenia', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Błąd serwera (${res.status})`);
    }

    const result = await res.json();
    state.currentPdfUrl = result.pdf_download_url || null;
    state.currentPdfFilename = 'ograniczenia zywieniowe.pdf';

    // Wyświetlenie modalu z przyciskiem do pobrania raportu (bez automatycznego pobierania)
    showResultModal(result, takIds);

  } catch (err) {
    console.error('Błąd generowania PDF:', err);
    alert(`Wystąpił błąd podczas generowania raportu: ${err.message}`);
  } finally {
    setSubmitLoading(false);
  }
}

/**
 * Przełącza stan ładowania przycisku wysyłki
 */
function setSubmitLoading(isLoading) {
  elements.submitBtn.disabled = isLoading;
  const btnText = elements.submitBtn.querySelector('.btn-text');
  if (isLoading) {
    btnText.textContent = 'Generowanie raportu PDF...';
  } else {
    btnText.textContent = 'Generuj raport PDF';
  }
}

/**
 * Wyświetla modal z podsumowaniem i opcją pobrania PDF
 */
function showResultModal(result, takIds) {
  elements.modalMessage.innerHTML = `
    Twój spersonalizowany dokument <strong>ograniczenia zywieniowe.pdf</strong> został pomyślnie wygenerowany. 
    Kliknij przycisk poniżej, aby pobrać raport na swoje urządzenie.
  `;

  elements.modalDetails.innerHTML = `
    <div><strong>Przeanalizowane dolegliwości:</strong> ${result.dolegliwosci_wybrane && result.dolegliwosci_wybrane.length ? result.dolegliwosci_wybrane.join(', ') : 'Brak zaznaczonych problemów (ogólne zalecenia)'}</div>
    <div style="margin-top: 4px;"><strong>Liczba zidentyfikowanych problemów:</strong> ${takIds.length}</div>
  `;

  if (state.currentPdfUrl) {
    elements.downloadPdfBtn.style.display = 'inline-flex';
    elements.downloadPdfBtn.disabled = false;
    const btnText = elements.downloadPdfBtn.querySelector('.btn-download-text');
    if (btnText) btnText.textContent = 'Pobierz raport PDF';
  } else {
    elements.downloadPdfBtn.style.display = 'none';
  }

  elements.resultModal.classList.add('show');
  elements.resultModal.setAttribute('aria-hidden', 'false');
}

/**
 * Obsługa pobierania wygenerowanego pliku PDF z poziomu modalu
 */
async function handleDownloadPdf(e) {
  if (e) e.preventDefault();

  if (!state.currentPdfUrl) {
    alert('Brak adresu pliku PDF. Wygeneruj raport ponownie.');
    return;
  }

  const btnText = elements.downloadPdfBtn.querySelector('.btn-download-text');
  const originalText = btnText ? btnText.textContent : 'Pobierz raport PDF';

  try {
    elements.downloadPdfBtn.disabled = true;
    if (btnText) btnText.textContent = 'Pobieranie...';

    // Pobieranie przez Fetch + Blob gwarantuje niezawodne pobranie na każdej platformie
    const res = await fetch(state.currentPdfUrl);
    if (!res.ok) throw new Error(`Błąd pobierania pliku (${res.status})`);

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const tempLink = document.createElement('a');
    tempLink.style.display = 'none';
    tempLink.href = blobUrl;
    tempLink.download = state.currentPdfFilename || 'ograniczenia zywieniowe.pdf';
    document.body.appendChild(tempLink);
    tempLink.click();

    setTimeout(() => {
      document.body.removeChild(tempLink);
      window.URL.revokeObjectURL(blobUrl);
    }, 1000);

  } catch (err) {
    console.error('Błąd pobierania pliku:', err);
    // Fallback: bezpośrednie przejście
    window.location.href = state.currentPdfUrl;
  } finally {
    elements.downloadPdfBtn.disabled = false;
    if (btnText) btnText.textContent = originalText;
  }
}

/**
 * Zamyka modal
 */
function closeModal() {
  elements.resultModal.classList.remove('show');
  elements.resultModal.setAttribute('aria-hidden', 'true');
}

/**
 * Escapowanie HTML
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
