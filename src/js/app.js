/**
 * Diet-Med • Test Doboru Produktów dla Zdrowia (TDP)
 * Obsługa formularza, 1-godzinnego cache'owania listy dolegliwości oraz pobierania raportu PDF.
 */

const CACHE_KEY_DATA = 'diet_med_tdp_dolegliwosci_cache_v8';
const CACHE_KEY_EXPIRY = 'diet_med_tdp_expiry_v8';
const ONE_HOUR_MS = 60 * 60 * 1000; // 3600 sekund = 1 godzina

// Stan aplikacji
const state = {
  dolegliwosci: [],
  answers: {}, // id -> 'tak' (brak wpisu oznacza 'nie')
  currentPdfUrl: null,
  currentPdfFilename: 'Ograniczenia-Zywieniowe.pdf',
  currentXlsxUrl: null,
  currentXlsxFilename: 'Ograniczenia-Zywieniowe.xlsx'
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
  downloadXlsxBtn: document.getElementById('downloadXlsxBtn'),
  closeModalBtn: document.getElementById('closeModalBtn')
};

/**
 * Zwraca unikalną listę dolegliwości wg znormalizowanej nazwy, zapobiegając duplikatom
 */
function deduplicateAilments(ailments) {
  if (!Array.isArray(ailments)) return [];
  const seen = new Set();
  const unique = [];
  for (const item of ailments) {
    if (!item || !item.kod) continue;
    const norm = item.kod
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    if (!seen.has(norm)) {
      seen.add(norm);
      unique.push(item);
    }
  }
  return unique;
}

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

  if (elements.downloadXlsxBtn) {
    elements.downloadXlsxBtn.addEventListener('click', handleDownloadXlsx);
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
      const rawData = JSON.parse(cachedDataStr);
      if (Array.isArray(rawData) && rawData.length > 0 && rawData[0].dostepna !== undefined) {
        const data = deduplicateAilments(rawData);
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
    const rawAilments = data.dolegliwosci || [];
    const ailments = deduplicateAilments(rawAilments);
    
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
  const cleanAilments = deduplicateAilments(ailments);
  if (!cleanAilments || cleanAilments.length === 0) {
    elements.ailmentsList.innerHTML = '<div style="color: var(--color-text-muted); text-align: center; padding: 20px;">Brak dolegliwości w bazie danych.</div>';
    return;
  }

  elements.ailmentsList.innerHTML = '';

  cleanAilments.forEach((item) => {
    const isAvailable = item.dostepna !== false;
    const row = document.createElement('div');
    row.className = 'ailment-row';
    row.id = `ailment-row-${item.id}`;

    if (!isAvailable) {
      row.classList.add('disabled-ailment');
    }

    const isTak = isAvailable && state.answers[item.id] === 'tak';
    if (isTak) row.classList.add('selected-tak');

    row.innerHTML = `
      <div class="ailment-name-col">
        <div class="ailment-name">${escapeHtml(item.kod)}</div>
      </div>
      <div class="options-group">
        <button 
          type="button" 
          class="option-btn option-btn-tak ${isTak ? 'active' : ''}" 
          data-id="${item.id}" 
          data-value="tak"
          aria-pressed="${isTak ? 'true' : 'false'}"
          ${!isAvailable ? 'disabled title="Dolegliwość niedostępna - brak tabeli w bazie danych"' : ''}
        >
          <span class="btn-check-icon">${isTak ? '✓ ' : ''}</span>Tak
        </button>
      </div>
    `;

    // Obsługa kliknięcia (kliknięcie w wiersz lub przycisk przełącza wybór "Tak")
    if (isAvailable) {
      row.addEventListener('click', () => {
        toggleAilment(item.id, row);
      });
    }

    elements.ailmentsList.appendChild(row);
  });

  updateSelectedCount();
}

/**
 * Przełącza wybór dolegliwości na "Tak" lub usuwa zaznaczenie (domyślnie "Nie")
 */
function toggleAilment(id, rowElement) {
  const item = state.dolegliwosci.find(a => a.id === id);
  if (item && item.dostepna === false) return; // Ochrona przed wyborem niedostępnej pozycji

  const wasTak = state.answers[id] === 'tak';
  const isTak = !wasTak;

  if (isTak) {
    state.answers[id] = 'tak';
  } else {
    delete state.answers[id];
  }

  // Aktualizacja klas wiersza
  rowElement.classList.toggle('selected-tak', isTak);
  rowElement.classList.remove('unanswered-error');

  // Aktualizacja przycisku wiersza
  const btn = rowElement.querySelector('.option-btn-tak');
  if (btn) {
    btn.classList.toggle('active', isTak);
    btn.setAttribute('aria-pressed', isTak ? 'true' : 'false');
    const checkIcon = btn.querySelector('.btn-check-icon');
    if (checkIcon) {
      checkIcon.textContent = isTak ? '✓ ' : '';
    }
  }

  // Jeśli widoczny był błąd walidacji i wybrano co najmniej jedno Tak, ukryj go
  if (elements.formValidationError && elements.formValidationError.style.display !== 'none') {
    const hasAnyTak = Object.values(state.answers).some(v => v === 'tak');
    if (hasAnyTak) {
      elements.formValidationError.style.display = 'none';
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
 * Obsługa wysyłki formularza i generowania PDF oraz XLSX
 */
async function handleFormSubmit(e) {
  e.preventDefault();

  const availableIds = new Set(
    state.dolegliwosci
      .filter(a => a.dostepna !== false)
      .map(a => a.id)
  );

  // Wyfiltrowanie WYŁĄCZNIE ID dostępnych dolegliwości zaznaczonych jako "tak"
  const takIds = Object.keys(state.answers)
    .filter(id => state.answers[id] === 'tak' && availableIds.has(Number(id)))
    .map(id => Number(id));

  // Walidacja: użytkownik musi zaznaczyć co najmniej jedną dolegliwość (Tak)
  if (takIds.length === 0) {
    if (elements.formValidationError) {
      elements.formValidationError.style.display = 'flex';
      elements.formValidationError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  // Jeśli walidacja przeszła, ukryj komunikat błędu
  if (elements.formValidationError) {
    elements.formValidationError.style.display = 'none';
  }

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
    state.currentPdfFilename = result.pdf_filename || 'Ograniczenia-Zywieniowe.pdf';
    state.currentXlsxUrl = result.xlsx_download_url || null;
    state.currentXlsxFilename = result.xlsx_filename || 'Ograniczenia-Zywieniowe.xlsx';

    // Wyświetlenie modalu z przyciskami do pobrania raportów
    showResultModal(result, takIds);

  } catch (err) {
    console.error('Błąd generowania raportów:', err);
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
    btnText.textContent = 'Generowanie raportów (PDF & Excel)...';
  } else {
    btnText.textContent = 'Generuj raport (PDF & Excel)';
  }
}

/**
 * Wyświetla modal z podsumowaniem i opcją pobrania PDF oraz Excel
 */
function showResultModal(result, takIds) {
  const pdfFilename = state.currentPdfFilename || 'Ograniczenia-Zywieniowe.pdf';
  const xlsxFilename = state.currentXlsxFilename || 'Ograniczenia-Zywieniowe.xlsx';
  elements.modalMessage.innerHTML = `
    Twoje spersonalizowane dokumenty (<strong>${escapeHtml(pdfFilename)}</strong> oraz <strong>${escapeHtml(xlsxFilename)}</strong>) zostały pomyślnie przygotowane. 
    Raport zawiera zestawienie produktów pogrupowanych w podsekcje żywieniowe (np. nabiał, pieczywo, warzywa) oraz posortowanych alfabetycznie.
  `;

  let statsHtml = '';
  if (result.statystyki) {
    const s = result.statystyki;
    statsHtml = `
      <div class="modal-stats-container">
        <div class="modal-stats-title">Zestawienie produktów w raporcie:</div>
        <div class="modal-stats-grid">
          <div class="stat-pill stat-zalecane" title="Produkty szczególnie rekomendowane">
            <span class="stat-icon">★</span>
            <span class="stat-label">Zalecane:</span>
            <span class="stat-value">${s.zalecane || 0}</span>
          </div>
          <div class="stat-pill stat-dozwolone" title="Produkty dozwolone i bezpieczne">
            <span class="stat-icon">✓</span>
            <span class="stat-label">Dozwolone:</span>
            <span class="stat-value">${s.dozwolone || 0}</span>
          </div>
          <div class="stat-pill stat-ograniczone" title="Produkty dopuszczalne w wyznaczonych porcjach">
            <span class="stat-icon">⚠️</span>
            <span class="stat-label">Ograniczone:</span>
            <span class="stat-value">${s.ograniczone || 0}</span>
          </div>
          <div class="stat-pill stat-zakazane" title="Produkty przeciwwskazane">
            <span class="stat-icon">✕</span>
            <span class="stat-label">Zakazane:</span>
            <span class="stat-value">${s.zakazane || 0}</span>
          </div>
        </div>
      </div>
    `;
  }

  elements.modalDetails.innerHTML = `
    <div><strong>Przeanalizowane dolegliwości:</strong> ${result.dolegliwosci_wybrane && result.dolegliwosci_wybrane.length ? result.dolegliwosci_wybrane.join(', ') : 'Brak zaznaczonych problemów (ogólne zalecenia)'}</div>
    <div style="margin-top: 4px; margin-bottom: 8px;"><strong>Liczba zidentyfikowanych problemów:</strong> ${takIds.length}</div>
    ${statsHtml}
  `;

  if (state.currentPdfUrl) {
    elements.downloadPdfBtn.style.display = 'inline-flex';
    elements.downloadPdfBtn.disabled = false;
    const btnText = elements.downloadPdfBtn.querySelector('.btn-download-text');
    if (btnText) btnText.textContent = 'Pobierz raport PDF';
  } else {
    elements.downloadPdfBtn.style.display = 'none';
  }

  if (state.currentXlsxUrl && elements.downloadXlsxBtn) {
    elements.downloadXlsxBtn.style.display = 'inline-flex';
    elements.downloadXlsxBtn.disabled = false;
    const btnText = elements.downloadXlsxBtn.querySelector('.btn-download-text');
    if (btnText) btnText.textContent = 'Pobierz arkusz Excel (.xlsx)';
  } else if (elements.downloadXlsxBtn) {
    elements.downloadXlsxBtn.style.display = 'none';
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
    tempLink.download = state.currentPdfFilename || 'Ograniczenia-Zywieniowe.pdf';
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
 * Obsługa pobierania wygenerowanego arkusza Excel (.xlsx) z poziomu modalu
 */
async function handleDownloadXlsx(e) {
  if (e) e.preventDefault();

  if (!state.currentXlsxUrl) {
    alert('Brak adresu arkusza Excel. Wygeneruj raport ponownie.');
    return;
  }

  const btnText = elements.downloadXlsxBtn.querySelector('.btn-download-text');
  const originalText = btnText ? btnText.textContent : 'Pobierz arkusz Excel (.xlsx)';

  try {
    elements.downloadXlsxBtn.disabled = true;
    if (btnText) btnText.textContent = 'Pobieranie arkusza...';

    const res = await fetch(state.currentXlsxUrl);
    if (!res.ok) throw new Error(`Błąd pobierania pliku (${res.status})`);

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const tempLink = document.createElement('a');
    tempLink.style.display = 'none';
    tempLink.href = blobUrl;
    tempLink.download = state.currentXlsxFilename || 'Ograniczenia-Zywieniowe.xlsx';
    document.body.appendChild(tempLink);
    tempLink.click();

    setTimeout(() => {
      document.body.removeChild(tempLink);
      window.URL.revokeObjectURL(blobUrl);
    }, 1000);

  } catch (err) {
    console.error('Błąd pobierania arkusza Excel:', err);
    window.location.href = state.currentXlsxUrl;
  } finally {
    elements.downloadXlsxBtn.disabled = false;
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
