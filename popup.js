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

  startBtn.addEventListener("click", async () => {
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
        statusMsg.textContent = "Assistente attivato!";
        statusMsg.style.color = "#22c55e";
      }
    );
  });
});
