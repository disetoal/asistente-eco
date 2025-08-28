// script.js - Versión Final con Secuencia de Video y Explicación de IA

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
const avatarCanvas = document.getElementById("avatar-canvas");
const avatarWaves = document.getElementById("avatar-waves");
const btnStart = document.getElementById("btn-start");
const btnVoice = document.getElementById("btn-voice");
const avatarCtx = avatarCanvas.getContext("2d");

// --- Variables Globales ---
const URL = "./modelo/";
let model, maxPredictions, videoElement, stream, recognition;
let synth = window.speechSynthesis, isAlwaysListening = false, isPredicting = false;
let lastTranscript = "", lastPredictionTime = 0, currentStablePrediction = "", lastSpokenPrediction = "";
let predictionCounter = 0;
const supportsSpeechRecognition = 'webkitSpeechRecognition' in window;
const supportsSpeechSynthesis = 'speechSynthesis' in window;

// --- Videos de la Secuencia ---
const videoSequence = [
    'video/video_parte1.mp4',
    'video/video_parte2.mp4'
];

const CLASSIFICATION_NAMES = {
    "Orgánico (cáscaras, frutas, restos de comida, pape": "Orgánico 🌱",
    "Inorganico": "Inorgánico ♻️",
    "No residuo / Persona / Fondo": ""
};

// --- Funciones de Lógica Principal ---
async function init() {
    drawAvatarCenter();
    try {
        model = await tmImage.load(URL + "model.json", URL + "metadata.json");
        if (supportsSpeechRecognition) initSpeechRecognition();
        speak("Hola. Estoy listo. Puedes activar la cámara, el micrófono o ver la historia de mi experimento.");
    } catch (error) { console.error("Error cargando modelo:", error); }
}

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
    speak("Comienza la historia de nuestro compost...");
    videoPlayer.src = videoSequence[0];
    videoPlayer.load(); // Cargar el nuevo video
    videoPlayer.play();
    videoPlayer.addEventListener('ended', handleVideoEnd);
}

async function handleVideoEnd() {
    const currentSrc = videoPlayer.currentSrc;
    if (currentSrc.includes(videoSequence[0].split('/').pop())) {
        videoSubtitle.innerText = "Parte 2: ¡La Magia en Acción!";
        speak("Y ahora, mira la magia en acción.");
        videoPlayer.src = videoSequence[1];
        videoPlayer.load();
        videoPlayer.play();
    } else if (currentSrc.includes(videoSequence[1].split('/').pop())) {
        videoSubtitle.innerText = "¡Y así es como lo hicimos! Ahora Eco nos explica el proceso...";
        videoPlayer.removeEventListener('ended', handleVideoEnd);
        const questionForAI = "explícame paso a paso y de forma sencilla como un niño, cómo se hace el té de compost casero a partir de residuos orgánicos.";
        const response = await askGemini(questionForAI);
        assistantText.innerText = response;
        speak(response);
    }
}

async function setupWebcam() {
    isPredicting = !isPredicting;
    if (isPredicting) {
        const constraints = { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' } };
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            videoElement = document.createElement('video');
            videoElement.playsInline = true; videoElement.autoplay = true; videoElement.srcObject = stream;
            videoWrap.innerHTML = ''; videoWrap.appendChild(videoElement);
            videoElement.addEventListener('loadedmetadata', () => {
                videoElement.play();
                btnStart.style.backgroundColor = 'var(--accent-purple)';
                window.requestAnimationFrame(loop);
            });
            assistantText.innerText = "Análisis en vivo activado.";
        } catch (e) { console.error("Error al iniciar cámara:", e); isPredicting = false; }
    } else {
        if (stream) stream.getTracks().forEach(track => track.stop());
        videoWrap.innerHTML = '<div id="video-placeholder">ECO</div>';
        btnStart.style.backgroundColor = '';
        classificationSubtitle.innerText = '';
    }
}

function loop() {
    if (!isPredicting) return;
    const now = performance.now();
    if (now - lastPredictionTime > 400) {
        lastPredictionTime = now;
        predictLive();
    }
    window.requestAnimationFrame(loop);
}

async function predictLive() {
    if (!model || !videoElement) return;
    const prediction = await model.predict(videoElement);
    const bestPrediction = prediction.sort((a, b) => b.probability - a.probability)[0];
    classificationSubtitle.innerText = CLASSIFICATION_NAMES[bestPrediction.className] || "";
    if (bestPrediction.className === currentStablePrediction) {
        predictionCounter++;
    } else {
        currentStablePrediction = bestPrediction.className;
        predictionCounter = 1;
        lastSpokenPrediction = "";
    }
    if (predictionCounter >= 3 && currentStablePrediction !== lastSpokenPrediction) {
        lastSpokenPrediction = currentStablePrediction;
        if (currentStablePrediction !== "No residuo / Persona / Fondo") {
            speak(CLASSIFICATION_NAMES[currentStablePrediction]);
        }
    }
}

function drawAvatarCenter() { avatarCtx.clearRect(0, 0, avatarCanvas.width, avatarCanvas.height); avatarCtx.beginPath(); avatarCtx.arc(avatarCanvas.width / 2, avatarCanvas.height / 2, avatarCanvas.width / 2 * 0.8, 0, 2 * Math.PI); avatarCtx.fillStyle = "var(--accent-cyan)"; avatarCtx.shadowColor = "var(--accent-cyan)"; avatarCtx.shadowBlur = 10; avatarCtx.fill(); }

function speak(text) { if (!supportsSpeechSynthesis || !text) return; if (synth.speaking) synth.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "es-ES"; utterance.rate = 1.1; utterance.onstart = () => avatarWaves.classList.add("speaking"); utterance.onend = () => avatarWaves.classList.remove("speaking"); synth.speak(utterance); }

function initSpeechRecognition() {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'es-ES';
    recognition.interimResults = true;
    recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) { if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript; }
        const transcript = finalTranscript.toLowerCase().trim();
        if (transcript && transcript !== lastTranscript && transcript.startsWith('eco')) {
            lastTranscript = transcript;
            activationOverlay.classList.add('eco-activated');
            const question = transcript.replace('eco', '').trim();
            if (question) processQuery(question);
        }
    };
    recognition.onerror = (event) => console.error("Error de voz:", event.error);
    recognition.onend = () => { if (isAlwaysListening) recognition.start(); };
}

async function askGemini(query) {
    const API_KEY = "PEGA_TU_API_KEY_DE_GOOGLE_AI_STUDIO_AQUÍ";
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    assistantText.innerText = "Pensando...";
    avatarWaves.classList.add("listening");
    try {
        const system_instruction = "Eres 'Asistente Eco', un experto en reciclaje en Bolivia. Responde de forma muy breve y amigable, como un subtítulo. Nunca menciones que eres una IA.";
        const body = { contents: [{ parts: [{ text: query }] }], system_instruction: { parts: [{ text: system_instruction }] } };
        const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`Error de la API`);
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error("Error con Gemini:", error);
        return "Error de conexión.";
    } finally {
        avatarWaves.classList.remove("listening");
    }
}

async function processQuery(query) {
    query = query.toLowerCase().trim();
    if (query.includes("ver video") || query.includes("modo experimento") || query.includes("ver proyecto")) {
        toggleExperimentView();
        return;
    }
    if (query.includes("modo cámara") || query.includes("análisis en vivo")) {
        if (!cameraContainer.classList.contains('hidden')) return;
        if (!experimentModule.classList.contains('hidden')) toggleExperimentView();
        if (!isPredicting) setupWebcam();
        return;
    }
    const response = await askGemini(query);
    assistantText.innerText = response;
    speak(response);
}

btnStart.addEventListener("click", setupWebcam);
btnVoice.addEventListener("click", () => {
    isAlwaysListening = !isAlwaysListening;
    if (isAlwaysListening) { btnVoice.classList.add("listening-active"); recognition.start(); speak("Micrófono activado."); }
    else { btnVoice.classList.remove("listening-active"); recognition.stop(); speak("Micrófono desactivado."); }
});
activationOverlay.addEventListener('animationend', () => { activationOverlay.classList.remove('eco-activated'); });
btnExperiment.addEventListener("click", toggleExperimentView);

window.onload = init;