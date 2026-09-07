/**
 * Diet-Med • Test Doboru Produktów dla Zdrowia (TDP)
 * Obsługa formularza, 1-godzinnego cache'owania listy dolegliwości oraz pobierania raportu PDF.
 */

const CACHE_KEY_DATA = 'diet_med_tdp_dolegliwosci_cache';
const CACHE_KEY_EXPIRY = 'diet_med_tdp_expiry';
const ONE_HOUR_MS = 60 * 60 * 1000; // 3600 sekund = 1 godzina

// Stan aplikacji
const state = {
  dolegliwosci: [],
  answers: {} // id -> 'tak' | 'nie' | 'nie_wiem'
};

// Elementy DOM
const elements = {
  ailmentsList: document.getElementById('ailmentsList'),
  cacheStatusText: document.getElementById('cacheStatusText'),
  refreshCacheBtn: document.getElementById('refreshCacheBtn'),
  tdpForm: document.getElementById('tdpForm'),
  selectedCount: document.getElementById('selectedCount'),
  submitBtn: document.getElementById('submitBtn'),
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
  elements.refreshCacheBtn.addEventListener('click', () => {
    fetchAilmentsFromBackend(true);
  });

  elements.tdpForm.addEventListener('submit', handleFormSubmit);

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
      const remainingMinutes = Math.round((Number(cachedExpiryStr) - now) / 60000);
      const expiryDate = new Date(Number(cachedExpiryStr)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      updateCacheStatus(`Paczka z pamięci podręcznej (ważna do ${expiryDate}, jeszcze ${remainingMinutes} min)`);
      state.dolegliwosci = data;
      renderAilments(data);
      return;
    } catch (e) {
      console.warn('Błąd parsowania cache, pobieram z serwera:', e);
    }
  }

  // W przeciwnym razie: dane wygasły lub to pierwsze otwarcie
  await fetchAilmentsFromBackend(false);
}

/**
 * Pobiera paczkę danych z backendu przez API (/api/dolegliwosci)
 */
async function fetchAilmentsFromBackend(isManualRefresh = false) {
  updateCacheStatus('Pobieranie świeżych danych z bazy...');
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

    const expiryTimeStr = new Date(expiryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    updateCacheStatus(`Świeże dane z bazy (ważne do ${expiryTimeStr})`);

  } catch (err) {
    console.error('Błąd pobierania dolegliwości:', err);
    updateCacheStatus('Nie udało się połączyć z bazą. Spróbuj ponownie.');
    elements.ailmentsList.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--color-accent);">
        Wystąpił błąd podczas ładowania listy dolegliwości z serwera. Upewnij się, że backend jest uruchomiony.
      </div>
    `;
  }
}

/**
 * Aktualizuje tekst w pasku statusu cache
 */
function updateCacheStatus(message) {
  elements.cacheStatusText.textContent = message;
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
    const row = document.createElement('div');
    row.className = 'ailment-row';
    row.id = `ailment-row-${item.id}`;

    const currentVal = state.answers[item.id] || null;
    if (currentVal === 'tak') row.classList.add('selected-tak');

    row.innerHTML = `
      <div class="ailment-name">${escapeHtml(item.kod)}</div>
      <div class="options-group" role="radiogroup" aria-label="${escapeHtml(item.kod)}">
        <button 
          type="button" 
          class="option-btn ${currentVal === 'tak' ? 'active' : ''}" 
          data-id="${item.id}" 
          data-value="tak"
          aria-checked="${currentVal === 'tak'}"
        >Tak</button>
        <button 
          type="button" 
          class="option-btn ${currentVal === 'nie' ? 'active' : ''}" 
          data-id="${item.id}" 
          data-value="nie"
          aria-checked="${currentVal === 'nie'}"
        >Nie</button>
        <button 
          type="button" 
          class="option-btn ${currentVal === 'nie_wiem' ? 'active' : ''}" 
          data-id="${item.id}" 
          data-value="nie_wiem"
          aria-checked="${currentVal === 'nie_wiem'}"
        >Nie wiem</button>
      </div>
    `;

    // Obsługa kliknięcia przycisków
    const buttons = row.querySelectorAll('.option-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-value');
        handleOptionSelect(item.id, val, row);
      });
    });

    elements.ailmentsList.appendChild(row);
  });

  updateSelectedCount();
}

/**
 * Zaznaczenie opcji Tak / Nie / Nie wiem
 */
function handleOptionSelect(id, value, rowElement) {
  state.answers[id] = value;

  // Aktualizacja klas przycisków w wierszu
  const buttons = rowElement.querySelectorAll('.option-btn');
  buttons.forEach((b) => {
    const isSelected = b.getAttribute('data-value') === value;
    b.classList.toggle('active', isSelected);
    b.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });

  // Stylizacja wiersza jeśli "Tak"
  rowElement.classList.toggle('selected-tak', value === 'tak');

  updateSelectedCount();
}

/**
 * Aktualizacja licznika zaznaczonych na "Tak"
 */
function updateSelectedCount() {
  const takCount = Object.values(state.answers).filter(val => val === 'tak').length;
  elements.selectedCount.textContent = takCount;
}

/**
 * Obsługa wysyłki formularza i generowania PDF
 */
async function handleFormSubmit(e) {
  e.preventDefault();

  // Wyfiltrowanie WYŁĄCZNIE ID dolegliwości zaznaczonych jako "tak" (reszta zbędna)
  const takIds = Object.keys(state.answers)
    .filter(id => state.answers[id] === 'tak')
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
    showResultModal(result, takIds);

    // Automatyczne pobranie pliku PDF
    if (result.pdf_download_url) {
      const autoDownloadLink = document.createElement('a');
      autoDownloadLink.href = result.pdf_download_url;
      autoDownloadLink.download = 'ograniczenia zywieniowe.pdf';
      document.body.appendChild(autoDownloadLink);
      autoDownloadLink.click();
      document.body.removeChild(autoDownloadLink);
    }

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
    btnText.textContent = 'Przygotowywanie pliku PDF...';
  } else {
    btnText.textContent = 'Generuj i pobierz raport PDF';
  }
}

/**
 * Wyświetla modal z podsumowaniem i opcją ponownego pobrania PDF
 */
function showResultModal(result, takIds) {
  elements.modalMessage.innerHTML = `
    Twój spersonalizowany dokument <strong>ograniczenia zywieniowe.pdf</strong> został wygenerowany. 
    Pobieranie pliku powinno rozpocząć się automatycznie. Jeśli tak się nie stało, kliknij przycisk poniżej.
  `;

  elements.modalDetails.innerHTML = `
    <div><strong>Przeanalizowane dolegliwości:</strong> ${result.dolegliwosci_wybrane && result.dolegliwosci_wybrane.length ? result.dolegliwosci_wybrane.join(', ') : 'Brak zaznaczonych problemów (ogólne zalecenia)'}</div>
    <div style="margin-top: 4px;"><strong>Liczba zidentyfikowanych problemów:</strong> ${takIds.length}</div>
  `;

  if (result.pdf_download_url) {
    elements.downloadPdfBtn.href = result.pdf_download_url;
    elements.downloadPdfBtn.style.display = 'inline-flex';
  } else {
    elements.downloadPdfBtn.style.display = 'none';
  }

  elements.resultModal.classList.add('show');
  elements.resultModal.setAttribute('aria-hidden', 'false');
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
