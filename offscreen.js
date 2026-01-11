let isRecording = false;
let geminiApiKey = "";
let mediaRecorder = null;

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === "INIT_RECORDING" && msg.target === "offscreen") {
    startRecording(msg.data, msg.apiKey);
  }
});

async function startRecording(streamId, apiKey) {
  if (isRecording) return;
  geminiApiKey = apiKey;

  try {
    //  Ottieni l'audio della scheda usando l'ID
    const media = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    //  IMPORTANTE: Ricollegare l'audio all'uscita (altrimenti l'utente non sente nulla!)
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(media);
    source.connect(audioContext.destination);

    //  NUOVO APPROCCIO: Cattura Audio Tab -> Gemini Audio
    //  Usiamo MediaRecorder per catturare l'audio pulito della scheda
    mediaRecorder = new MediaRecorder(media, { mimeType: "audio/webm" });

    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        // Converti il blob audio in base64 per Gemini
        const base64Audio = await blobToBase64(event.data);
        processAudioWithGemini(base64Audio);
      }
    };

    // Invia un chunk di audio ogni 4 secondi
    mediaRecorder.start(4000);
    isRecording = true;
    console.log("Registrazione Tab Audio avviata (Gemini Audio)");

  } catch (err) {
    console.error("Errore cattura audio:", err);
  }
}

// Helper per convertire Blob in Base64
function blobToBase64(blob) {
  return new Promise((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

async function processAudioWithGemini(base64Audio) {
  if (!geminiApiKey) return;

  const systemPrompt = `
    Sei Mètis, un assistente per meeting.
    1. TRASCRIVI fedelmente l'audio fornito in italiano.
    2. ANALIZZA il contenuto: se c'è una domanda tecnica o un punto chiave, estrai un suggerimento breve.
    
    Rispondi ESCLUSIVAMENTE in questo formato JSON:
    {
      "transcript": "testo trascritto...",
      "suggestion": { 
        "hasSuggestion": true/false, 
        "content": "suggerimento o riassunto (max 150 chars)" 
      }
    }
  `;

  try {
    // Usiamo Gemini 1.5 Flash che è ottimizzato per l'audio multimodale
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt },
                {
                  inline_data: {
                    mime_type: "audio/webm",
                    data: base64Audio,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (aiText) {
      const cleanJson = aiText
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      try {
        const parsed = JSON.parse(cleanJson);

        // 1. Invia Trascrizione alla UI
        if (parsed.transcript) {
          chrome.runtime.sendMessage({
            type: "TRANSCRIPT_UPDATE",
            text: parsed.transcript,
            isFinal: true,
          });
        }

        // 2. Invia Suggerimento se presente
        if (parsed.suggestion && parsed.suggestion.hasSuggestion) {
          chrome.runtime.sendMessage({
            type: "AI_SUGGESTION",
            data: parsed.suggestion,
          });
        }
      } catch (e) {
        console.log("Errore parsing JSON", e);
      }
    }
  } catch (error) {
    console.error("API Error", error);
  }
}
