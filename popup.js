document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const startBtn = document.getElementById("startBtn");
  const statusMsg = document.getElementById("statusMsg");

  // Carica API Key salvata
  chrome.storage.local.get(["geminiApiKey"], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
  });

  // Controlla se c'è già una registrazione in corso
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (response && response.isRecording) {
      setRecordingState(true);
    }
  });

  function setRecordingState(isRecording) {
    if (isRecording) {
      startBtn.textContent = "Ferma Ascolto";
      startBtn.style.backgroundColor = "#ef4444"; // Rosso per stop
      apiKeyInput.disabled = true;
      statusMsg.textContent = "Ascolto in corso...";
      statusMsg.style.color = "#22c55e";
    } else {
      startBtn.textContent = "Avvia Ascolto";
      startBtn.style.backgroundColor = ""; // Reset colore
      apiKeyInput.disabled = false;
      statusMsg.textContent = "";
    }
  }

  startBtn.addEventListener("click", async () => {
    // Se stiamo registrando, ferma tutto
    if (startBtn.textContent.includes("Ferma")) {
      chrome.runtime.sendMessage({ type: "STOP_CAPTURE" }, () => {
        setRecordingState(false);
        statusMsg.textContent = "Ascolto terminato.";
        statusMsg.style.color = "#64748b";
      });
      return;
    }

    // Altrimenti avvia
    const key = apiKeyInput.value.trim();
    if (!key) {
      statusMsg.textContent = "Errore: Inserisci API Key";
      statusMsg.style.color = "#ef4444";
      return;
    }

    // Salva API Key
    chrome.storage.local.set({ geminiApiKey: key });

    // Ottieni tab corrente
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab) {
      statusMsg.textContent = "Errore: Nessuna scheda attiva";
      return;
    }

    // Invia messaggio al background per iniziare
    chrome.runtime.sendMessage(
      {
        type: "START_CAPTURE",
        tabId: tab.id,
        apiKey: key,
      },
      () => {
        setRecordingState(true);
      }
    );
  });
});
