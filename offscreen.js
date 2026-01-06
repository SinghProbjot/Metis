let recognition;
let isRecording = false;
let geminiApiKey = "";
let transcriptBuffer = "";
let silenceTimer = null;

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

    //  Configura Riconoscimento Vocale
    if ("webkitSpeechRecognition" in self) {
      recognition = new webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "it-IT"; // Lingua Italiana

      recognition.onresult = (event) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        // Invia trascrizione parziale alla UI
        if (final || interim) {
          chrome.runtime.sendMessage({
            type: "TRANSCRIPT_UPDATE",
            text: final ? final : interim,
            isFinal: !!final,
          });
        }

        // Se abbiamo una frase completa, accumulala e prova a chiedere all'AI
        if (final) {
          transcriptBuffer += " " + final;
          handleAIAnalysis(transcriptBuffer);
        }
      };

      recognition.onerror = (e) => console.error("Speech error:", e);
      recognition.onend = () => {
        // Riavvia se si ferma inaspettatamente mentre stiamo registrando
        if (isRecording) recognition.start();
      };

      recognition.start();
      isRecording = true;
      console.log("Registrazione avviata");
    } else {
      console.error(
        "Speech Recognition API non supportata in questo browser context."
      );
    }
  } catch (err) {
    console.error("Errore cattura audio:", err);
  }
}

// Logica di Debounce per chiamare l'AI
function handleAIAnalysis(text) {
  if (silenceTimer) clearTimeout(silenceTimer);

  // Aspetta 2.5 secondi di pausa prima di inviare a Gemini
  silenceTimer = setTimeout(() => {
    if (text.length > 20) {
      // Minimo caratteri per contesto
      callGeminiAPI(text);
      transcriptBuffer = ""; // Pulisci buffer parziale
    }
  }, 2500);
}

async function callGeminiAPI(textContext) {
  if (!geminiApiKey) return;

  const systemPrompt = `
    Sei un assistente per videoconferenze. Analizza il seguente testo parlato (trascrizione riunione).
    Se rilevi una domanda tecnica, fornisci la risposta.
    Se rilevi un punto critico, riassumilo.
    Se è solo conversazione generica, rispondi con "NO_ACTION".
    Rispondi in JSON: { "type": "info" | "alert", "content": "..." }
    Sii brevissimo (max 150 caratteri).
  `;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: `TESTO: "${textContext}"\n\n${systemPrompt}` }] },
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
      if (!cleanJson.includes("NO_ACTION")) {
        try {
          const parsed = JSON.parse(cleanJson);
          chrome.runtime.sendMessage({
            type: "AI_SUGGESTION",
            data: parsed,
          });
        } catch (e) {
          console.log("Errore parsing JSON", e);
        }
      }
    }
  } catch (error) {
    console.error("API Error", error);
  }
}
