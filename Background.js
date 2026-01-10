// Gestione dell'apertura del documento offscreen
let creating;

async function setupOffscreenDocument(path) {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(path)],
  });

  if (existingContexts.length > 0) {
    return;
  }

  // Crea il documento se non esiste
  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: ["USER_MEDIA"],
      justification: "Registrazione audio meeting per trascrizione AI",
    });
    await creating;
    creating = null;
  }
}

// Chiude il documento offscreen e pulisce lo stato
async function closeOffscreenDocument() {
  if (creating) {
    await creating;
    creating = null;
  }
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existingContexts.length > 0) {
    await chrome.offscreen.closeDocument();
  }
}

// Ascolta i messaggi dal popup o dall'offscreen
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Richiesta stato corrente
  if (message.type === "GET_STATUS") {
    chrome.storage.local.get(["recordingTabId"], (result) => {
      sendResponse({ isRecording: !!result.recordingTabId });
    });
    return true; // Risposta asincrona
  }

  // Comando di STOP
  if (message.type === "STOP_CAPTURE") {
    chrome.storage.local.get(["recordingTabId"], async (result) => {
      const recordingTabId = result.recordingTabId;
      if (recordingTabId) {
        try {
          await chrome.tabs.sendMessage(recordingTabId, { type: "STOP_UI" });
        } catch (e) {
          console.log("Tab non raggiungibile", e);
        }
        chrome.storage.local.remove("recordingTabId");
      }
      await closeOffscreenDocument();
      sendResponse({ success: true });
    });
    return true;
  }

  // Comando di AVVIO dalla popup
  if (message.type === "START_CAPTURE") {
    // Se arriva dal popup usa message.tabId, se arriva dal content script usa sender.tab.id
    const tabId = message.tabId || sender.tab.id;
    chrome.storage.local.set({ recordingTabId: tabId });

    (async () => {
      // Inietta l'interfaccia UI nella pagina del meeting
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"],
      });

      // Inietta lo stile CSS
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ["styles.css"],
      });

      // Prepara l'ambiente offscreen
      await setupOffscreenDocument("offscreen.html");

      // Ottieni lo stream ID della scheda corrente
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tabId,
      });

      // Manda l'ID e la chiave API al documento offscreen per iniziare
      chrome.runtime.sendMessage({
        type: "INIT_RECORDING",
        target: "offscreen",
        data: streamId,
        apiKey: message.apiKey,
      });

      sendResponse({ success: true });
    })();
    return true;
  }

  //  Messaggi dall'AI (Offscreen) da mandare all'interfaccia utente (Content Script)
  if (
    message.type === "AI_SUGGESTION" ||
    message.type === "TRANSCRIPT_UPDATE"
  ) {
    // Trova la tab attiva e invia il messaggio al content script
    (async () => {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, message);
      }
    })();
  }
});
