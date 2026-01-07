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

// Ascolta i messaggi dal popup o dall'offscreen
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // Comando di AVVIO dalla popup
  if (message.type === "START_CAPTURE") {
    const tabId = message.tabId;

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
  }

  //  Messaggi dall'AI (Offscreen) da mandare all'interfaccia utente (Content Script)
  if (
    message.type === "AI_SUGGESTION" ||
    message.type === "TRANSCRIPT_UPDATE"
  ) {
    // Trova la tab attiva e invia il messaggio al content script
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, message);
    }
  }
});
