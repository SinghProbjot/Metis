// Evita iniezioni multiple
if (!document.getElementById("ai-assistant-overlay")) {
  createOverlay();
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
});
