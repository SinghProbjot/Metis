// Evita iniezioni multiple
if (!document.getElementById("ai-assistant-overlay")) {
  // Se siamo stati iniettati manualmente dal background (click su popup), crea subito l'overlay
  // Altrimenti (caricamento automatico da manifest), mostra il prompt di avvio
  if (window.hasRunManualStart) {
    createOverlay();
  } else {
    checkAndShowStartPrompt();
  }
}

// Flag per evitare reinizializzazioni
window.hasRunManualStart = true;

function checkAndShowStartPrompt() {
  // Controlla se abbiamo una API Key salvata
  chrome.storage.local.get(["geminiApiKey"], (result) => {
    if (result.geminiApiKey && !document.getElementById("metis-start-prompt")) {
      createStartPrompt(result.geminiApiKey);
    }
  });
}

function createStartPrompt(apiKey) {
  const prompt = document.createElement("div");
  prompt.id = "metis-start-prompt";
  prompt.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px;">
      <span>🧠 <b>Mètis</b> rilevato</span>
      <button id="metis-btn-yes">Avvia</button>
      <button id="metis-btn-no">×</button>
    </div>
  `;

  // Stile inline per isolamento rapido
  Object.assign(prompt.style, {
    position: "fixed",
    bottom: "20px",
    left: "20px",
    backgroundColor: "#1e293b",
    color: "white",
    padding: "12px 20px",
    borderRadius: "50px",
    boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
    zIndex: "999999",
    fontFamily: "sans-serif",
    fontSize: "14px",
    border: "1px solid #334155",
    animation: "slideIn 0.5s ease-out",
  });

  const btnStyle =
    "background:#3b82f6; border:none; color:white; padding:5px 12px; border-radius:20px; cursor:pointer; font-weight:bold;";

  document.body.appendChild(prompt);

  const btnYes = document.getElementById("metis-btn-yes");
  const btnNo = document.getElementById("metis-btn-no");

  btnYes.style.cssText = btnStyle;
  btnNo.style.cssText =
    "background:transparent; border:none; color:#94a3b8; font-size:18px; cursor:pointer; margin-left:5px;";

  btnYes.addEventListener("click", () => {
    prompt.remove();
    createOverlay(); // Crea l'interfaccia principale
    // Invia messaggio al background per avviare lo stream
    chrome.runtime.sendMessage({
      type: "START_CAPTURE",
      apiKey: apiKey,
    });
  });

  btnNo.addEventListener("click", () => {
    prompt.remove();
  });
}

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "ai-assistant-overlay";
  overlay.innerHTML = `
    <div class="ai-header">
      <span>Mètis AI</span>
      <button id="ai-close-btn">×</button>
    </div>
    <div id="ai-transcript" class="ai-content">In attesa di audio...</div>
    <div id="ai-suggestion-box" class="ai-suggestion hidden">
      <div class="ai-bulb">💡</div>
      <div id="ai-suggestion-text"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("ai-close-btn").addEventListener("click", () => {
    overlay.style.display = "none";
  });

  // Rendi il box trascinabile (Drag & Drop basilare)
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  const header = overlay.querySelector(".ai-header");
  header.addEventListener("mousedown", dragStart);
  document.addEventListener("mouseup", dragEnd);
  document.addEventListener("mousemove", drag);

  function dragStart(e) {
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    if (e.target === header || e.target.parentNode === header) {
      isDragging = true;
    }
  }

  function dragEnd(e) {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      xOffset = currentX;
      yOffset = currentY;
      setTranslate(currentX, currentY, overlay);
    }
  }

  function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
  }
}

// Ascolta messaggi dal background
chrome.runtime.onMessage.addListener((request) => {
  const transcriptEl = document.getElementById("ai-transcript");
  const suggestionBox = document.getElementById("ai-suggestion-box");
  const suggestionText = document.getElementById("ai-suggestion-text");

  if (request.type === "TRANSCRIPT_UPDATE") {
    if (request.isFinal) {
      transcriptEl.innerHTML = `<span style="color: #fff">${request.text}</span>`;
    } else {
      transcriptEl.innerHTML = `<span style="color: #94a3b8">${request.text}</span>`;
    }
  }

  if (request.type === "AI_SUGGESTION") {
    suggestionBox.classList.remove("hidden");
    suggestionText.innerText = request.data.content;

    // Nascondi suggerimento dopo 10 secondi
    setTimeout(() => {
      suggestionBox.classList.add("hidden");
    }, 15000);
  }

  if (request.type === "STOP_UI") {
    const overlay = document.getElementById("ai-assistant-overlay");
    if (overlay) {
      overlay.remove();
    }
    // Rimuovi anche il prompt se presente
    const prompt = document.getElementById("metis-start-prompt");
    if (prompt) {
      prompt.remove();
    }
  }
});
