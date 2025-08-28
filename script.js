// script.js - Versión Final con Pausa y sin Introducciones de Video

// --- CONFIGURACIÓN DE VOZ DE LOLO ---
const LOLO_VOICE_LINES = {
    "¡Hola! Soy Lolo. Estoy listo para la feria.": "audio/hola.mp3",
    "Orgánico 🌱": "audio/organico.mp3",
    "Inorgánico ♻️": "audio/inorganico.mp3",
    "Micrófono activado.": "audio/microfono_activado.mp3",
    "Micrófono desactivado.": "audio/microfono_desactivado.mp3",
    "Análisis en vivo activado.": "audio/camara_activada.mp3",
    "NARRACION_FINAL": "audio/explicacion_final.mp3"
};


// --- Referencias a los DOM Elements ---
const cameraContainer = document.getElementById("camera-container");
const experimentModule = document.getElementById("experiment-module");
const btnExperiment = document.getElementById("btn-experiment");
const videoPlayer = document.getElementById("explanation-video");
const videoSubtitle = document.getElementById("video-subtitle");
const videoWrap = document.getElementById("video-wrap");
const activationOverlay = document.getElementById("activation-overlay");
const assistantText = document.getElementById("assistant-text");
const classificationSubtitle = document.getElementById("classification-subtitle");
const loloAvatarImg = document.getElementById("lolo-avatar");
const avatarWaves = document.getElementById("avatar-waves");
const btnStart = document.getElementById("btn-start");
const btnVoice = document.getElementById("btn-voice");


// --- Variables Globales ---
const URL = "./modelo/";
let model, maxPredictions, videoElement, stream, recognition;
let synth = window.speechSynthesis, isAlwaysListening = false, isPredicting = false;
let lastTranscript = "", lastPredictionTime = 0, currentStablePrediction = "", lastSpokenPrediction = "";
let predictionCounter = 0;
const supportsSpeechRecognition = 'webkitSpeechRecognition' in window;
const supportsSpeechSynthesis = 'speechSynthesis' in window;
const videoSequence = [ 'video/video_parte1.mp4', 'video/video_parte2.mp4' ];
const CLASSIFICATION_NAMES = { "Orgánico (cáscaras, frutas, restos de comida, pape": "Orgánico 🌱", "Inorganico": "Inorgánico ♻️", "No residuo / Persona / Fondo": "" };

// --- Función de Carga Principal ---
async function init() {
    try {
        model = await tmImage.load(URL + "model.json", URL + "metadata.json");
        if (supportsSpeechRecognition) initSpeechRecognition();
        speak("¡Hola! Soy Lolo. Estoy listo para la feria.");
        assistantText.innerText = "¡Hola! Soy Lolo. Di 'Eco' para empezar...";
    } catch (error) { console.error("Error cargando modelo:", error); }
}

// --- Lógica para Manejar las Vistas y la Secuencia de Video ---
function toggleExperimentView() {
    const isExperimentVisible = !experimentModule.classList.contains('hidden');
    if (isExperimentVisible) {
        experimentModule.classList.add('hidden');
        cameraContainer.classList.remove('hidden');
        videoPlayer.pause();
        videoPlayer.removeEventListener('ended', handleVideoEnd);
    } else {
        experimentModule.classList.remove('hidden');
        cameraContainer.classList.add('hidden');
        if (isPredicting) { setupWebcam(); }
        startVideoSequence();
    }
}

function startVideoSequence() {
    videoSubtitle.innerText = "Parte 1: El Súper Poder de la Basura";
    // Ya no habla al inicio del video
    videoPlayer.src = videoSequence[0];
    videoPlayer.load();
    videoPlayer.play();
    videoPlayer.addEventListener('ended', handleVideoEnd);
}

// --- FUNCIÓN handleVideoEnd ACTUALIZADA ---
function handleVideoEnd() {
    const currentSrc = videoPlayer.currentSrc;
    if (currentSrc.includes(videoSequence[0].split('/').pop())) {
        videoSubtitle.innerText = "Parte 2: ¡La Magia en Acción!";
        // Ya no habla al cambiar de video
        videoPlayer.src = videoSequence[1];
        videoPlayer.load();
        videoPlayer.play();
    } else if (currentSrc.includes(videoSequence[1].split('/').pop())) {
        videoSubtitle.innerText = "Ahora, Lolo te cuenta el secreto de la Súper-Tierra...";
        videoPlayer.removeEventListener('ended', handleVideoEnd);
        
        // --- ¡AQUÍ ESTÁ LA PAUSA DE 5 SEGUNDOS! ---
        setTimeout(() => {
            const explanationText = `¡Claro! Te explico nuestro procedimiento. Primero, construimos una compostera casera...`; // Texto resumido para la pantalla
            assistantText.innerText = explanationText;
            speak("NARRACION_FINAL");
        }, 5000); // 5000 milisegundos = 5 segundos
    }
}


// --- Lógica de la Cámara y Predicción en Vivo ---
async function setupWebcam() { isPredicting = !isPredicting; if (isPredicting) { const constraints = { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' } }; try { stream = await navigator.mediaDevices.getUserMedia(constraints); videoElement = document.createElement('video'); videoElement.playsInline = true; videoElement.autoplay = true; videoElement.srcObject = stream; videoWrap.innerHTML = ''; videoWrap.appendChild(videoElement); videoElement.addEventListener('loadedmetadata', () => { videoElement.play(); btnStart.style.backgroundColor = 'var(--accent-purple)'; window.requestAnimationFrame(loop); }); assistantText.innerText = "Análisis en vivo activado."; speak("Análisis en vivo activado."); } catch (e) { console.error("Error al iniciar cámara:", e); isPredicting = false; } } else { if (stream) stream.getTracks().forEach(track => track.stop()); videoWrap.innerHTML = '<div id="video-placeholder">ECO</div>'; btnStart.style.backgroundColor = ''; classificationSubtitle.innerText = ''; } }
function loop() { if (!isPredicting) return; const now = performance.now(); if (now - lastPredictionTime > 400) { lastPredictionTime = now; predictLive(); } window.requestAnimationFrame(loop); }
async function predictLive() { if (!model || !videoElement) return; const prediction = await model.predict(videoElement); const bestPrediction = prediction.sort((a, b) => b.probability - a.probability)[0]; classificationSubtitle.innerText = CLASSIFICATION_NAMES[bestPrediction.className] || ""; if (bestPrediction.className === currentStablePrediction) { predictionCounter++; } else { currentStablePrediction = bestPrediction.className; predictionCounter = 1; lastSpokenPrediction = ""; } if (predictionCounter >= 3 && currentStablePrediction !== lastSpokenPrediction) { lastSpokenPrediction = currentStablePrediction; if (currentStablePrediction !== "No residuo / Persona / Fondo") { speak(CLASSIFICATION_NAMES[currentStablePrediction]); } } }


// --- Función Speak Híbrida ---
function speak(text) {
    if (!text) return;
    if (synth.speaking) synth.cancel();

    const audioFile = LOLO_VOICE_LINES[text];
    if (audioFile) {
        const audio = new Audio(audioFile);
        audio.play();
        avatarWaves.classList.add("speaking");
        audio.onended = () => avatarWaves.classList.remove("speaking");
    } else {
        if (!supportsSpeechSynthesis) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "es-ES";
        utterance.rate = 1.1;
        utterance.onstart = () => avatarWaves.classList.add("speaking");
        utterance.onend = () => avatarWaves.classList.remove("speaking");
        synth.speak(utterance);
    }
}

// --- Funciones de Voz y Gemini ---
function initSpeechRecognition() { recognition = new webkitSpeechRecognition(); recognition.continuous = true; recognition.lang = 'es-ES'; recognition.interimResults = true; recognition.onresult = (event) => { let finalTranscript = ''; for (let i = event.resultIndex; i < event.results.length; ++i) { if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript; } const
transcript = finalTranscript.toLowerCase().trim(); if (transcript && transcript !== lastTranscript && transcript.startsWith('eco')) { lastTranscript = transcript; activationOverlay.classList.add('eco-activated'); const question = transcript.replace('eco', '').trim(); if (question) processQuery(question); } }; recognition.onerror = (event) => console.error("Error de voz:", event.error); recognition.onend = () => { if (isAlwaysListening) recognition.start(); }; }
async function askGemini(query) { const API_KEY = "PEGA_TU_API_KEY_DE_GOOGLE_AI_STUDIO_AQUÍ"; const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`; assistantText.innerText = "Pensando..."; avatarWaves.classList.add("listening"); try { const system_instruction = "Eres 'Lolo la Lombriz', la mascota del Asistente Eco en Bolivia. Responde de forma muy breve y amigable, como un subtítulo. Nunca menciones que eres una IA."; const body = { contents: [{ parts: [{ text: query }] }], system_instruction: { parts: [{ text: system_instruction }] } }; const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(`Error de la API`); const data = await response.json(); return data.candidates[0].content.parts[0].text; } catch (error) { console.error("Error con Gemini:", error); return "Error de conexión. ¡Ups! Parece que mi cerebro de lombriz está un poco lento ahora."; } finally { avatarWaves.classList.remove("listening"); } }
async function processQuery(query) { query =     query.toLowerCase().trim(); if (query.includes("ver video") || query.includes("modo experimento") || query.includes("ver proyecto")) { toggleExperimentView(); return; } if (query.includes("modo cámara") || query.includes("análisis en vivo")) { if (!cameraContainer.classList.contains('hidden')) return; if (!experimentModule.classList.contains('hidden')) toggleExperimentView(); if (!isPredicting) setupWebcam(); return; } const response = await askGemini(query); assistantText.innerText = response; speak(response); }

// --- Event Listeners ---
btnStart.addEventListener("click", setupWebcam);
btnVoice.addEventListener("click", () => { isAlwaysListening = !isAlwaysListening; if (isAlwaysListening) { btnVoice.classList.add("listening-active"); recognition.start(); speak("Micrófono activado."); } else { btnVoice.classList.remove("listening-active"); recognition.stop(); speak("Micrófono desactivado."); } });
activationOverlay.addEventListener('animationend', () => { activationOverlay.classList.remove('eco-activated'); });
btnExperiment.addEventListener("click", toggleExperimentView);

window.onload = init;