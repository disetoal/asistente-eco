/* ================================
   Asistente Ecológico con IA
   - Carga modelo Teachable Machine (carpeta /modelo/)
   - Webcam o Cámara IP
   - Umbral regulable
   - Voz (TTS) y preguntas frecuentes
   - STT opcional (si el navegador lo soporta)
================================== */

let model;                // tmImage model
let webcam;               // tmImage.Webcam
let running = false;      // flag del loop
let useIP = false;        // fuente activa
let ipImg;                // <img> para cámara IP
let lastSpeak = 0;        // control para no hablar demasiado seguido
const SPEAK_COOLDOWN_MS = 2500;

const els = {
  webcamContainer: document.getElementById("webcam-container"),
  ipImage: document.getElementById("ip-image"),
  btnStart: document.getElementById("btn-start"),
  btnStop: document.getElementById("btn-stop"),
  speakToggle: document.getElementById("speak-toggle"),
  threshold: document.getElementById("threshold"),
  thVal: document.getElementById("th-val"),
  clasificacion: document.getElementById("clasificacion"),
  consejo: document.getElementById("consejo"),
  probs: document.getElementById("probs"),
  ipConfig: document.getElementById("ip-config"),
  ipUrl: document.getElementById("ip-url"),
  btnTestIP: document.getElementById("btn-test-ip"),
  ipStatus: document.getElementById("ip-status"),
  btnAsk: document.getElementById("btn-ask"),
  pregunta: document.getElementById("pregunta"),
  respuesta: document.getElementById("respuesta"),
  btnVoice: document.getElementById("btn-voice"),
  sttStatus: document.getElementById("stt-status"),
};

const RESPUES_TIP = {
  "plástico": "El plástico común (como bolsas) puede tardar ~500 años en degradarse. Reduce y recicla siempre.",
  "botella": "Una botella plástica (PET) puede tardar 300–500 años. Reutilízala o llévala a reciclaje.",
  "vidrio": "El vidrio puede tardar miles de años; lo ideal es reutilizarlo o reciclarlo indefinidamente.",
  "lata": "Las latas de aluminio pueden tardar 80–200 años. Son 100% reciclables.",
  "papel": "El papel tarda ~2–6 semanas. Si está limpio, puedes compostarlo.",
  "cartón": "El cartón tarda ~2 meses; se recicla fácil si está seco y limpio.",
  "cáscara": "Las cáscaras de frutas se degradan en semanas; van al compost.",
  "orgánico": "Los residuos orgánicos se transforman en abono por compostaje.",
  "inorgánico": "Los inorgánicos deben reciclarse o reutilizarse para evitar contaminación."
};

// ====== Utilidades de voz ======
function speak(text) {
  try {
    if (!els.speakToggle.checked) return;
    const now = Date.now();
    if (now - lastSpeak < SPEAK_COOLDOWN_MS) return;
    lastSpeak = now;
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = "es-ES"; // puedes probar "es-MX" o "es-419" según voces disponibles
    window.speechSynthesis.speak(msg);
  } catch (_) { /* noop */ }
}

let recognition = null;
if ("webkitSpeechRecognition" in window) {
  recognition = new webkitSpeechRecognition();
  recognition.lang = "es-ES";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onstart = () => els.sttStatus.textContent = "Escuchando…";
  recognition.onend = () => els.sttStatus.textContent = "";
  recognition.onerror = () => els.sttStatus.textContent = "⚠️ Error de STT";
  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    els.pregunta.value = text;
    responderPregunta();
  };
} else {
  els.sttStatus.textContent = "STT no soportado.";
}

// ====== Carga del modelo ======
async function loadModel() {
  // Coloca aquí tu carpeta con model.json / metadata.json / weights.bin
  const URL = "modelo/";
  model = await tmImage.load(URL + "model.json", URL + "metadata.json");
}

// ====== Manejo de fuentes (Webcam vs IP) ======
function setupSourceListeners() {
  const radios = document.querySelectorAll('input[name="source"]');
  radios.forEach(r => r.addEventListener("change", () => {
    useIP = (document.querySelector('input[name="source"]:checked').value === "ip");
    els.ipConfig.classList.toggle("hidden", !useIP);
    // Mostrar contenedor correspondiente
    if (useIP) {
      els.webcamContainer.classList.add("hidden");
      els.ipImage.classList.remove("hidden");
    } else {
      els.ipImage.classList.add("hidden");
      els.webcamContainer.classList.remove("hidden");
    }
  }));

  els.btnTestIP.addEventListener("click", async () => {
    const url = els.ipUrl.value.trim();
    if (!url) return;
    els.ipStatus.textContent = "Cargando...";
    await loadIPFrame(url, true);
  });
}

function updateThresholdLabel() {
  els.thVal.textContent = Number(els.threshold.value).toFixed(2);
}

// Carga una imagen desde la IP (snapshot) y la coloca en <img>
function loadIPFrame(baseUrl, showStatus = false) {
  return new Promise((resolve) => {
    const cacheBust = `cb=${Math.random().toString(36).slice(2)}`;
    const sep = baseUrl.includes("?") ? "&" : "?";
    const url = `${baseUrl}${sep}${cacheBust}`;

    ipImg = els.ipImage;
    ipImg.onload = () => {
      if (showStatus) els.ipStatus.textContent = "✅ IP conectada";
      resolve(true);
    };
    ipImg.onerror = () => {
      if (showStatus) els.ipStatus.textContent = "❌ No se pudo cargar la imagen";
      resolve(false);
    };
    ipImg.src = url;
  });
}

// ====== Bucle de detección ======
async function startDetection() {
  if (!model) {
    els.clasificacion.textContent = "Cargando modelo…";
    await loadModel();
  }

  // Configurar webcam si es fuente
  if (!useIP) {
    if (!webcam) {
      const flip = true;
      webcam = new tmImage.Webcam(360, 360, flip);
      await webcam.setup();     // pedirá permiso
    }
    await webcam.play();
    if (!els.webcamContainer.contains(webcam.canvas)) {
      els.webcamContainer.appendChild(webcam.canvas);
    }
  }

  running = true;
  els.btnStart.disabled = true;
  els.btnStop.disabled = false;

  loop();
}

async function stopDetection() {
  running = false;
  els.btnStart.disabled = false;
  els.btnStop.disabled = true;
  if (webcam) await webcam.pause();
}

async function loop() {
  if (!running) return;

  // Actualizar fuente
  let inputEl = null;
  if (useIP) {
    const ok = await loadIPFrame(els.ipUrl.value.trim() || "");
    if (ok) inputEl = els.ipImage;
  } else {
    if (webcam) {
      await webcam.update();
      inputEl = webcam.canvas; // el canvas de tmImage.Webcam es válido para predict
    }
  }

  if (inputEl) {
    try {
      await predict(inputEl);
    } catch (e) {
      console.warn("Error en predict:", e);
    }
  }

  // Control de ritmo
  requestAnimationFrame(loop);
}

// ====== Predicción y UI ======
function consejoPorClase(clase) {
  if (clase === "Orgánico") {
    return "Orgánico ✅ — Puedes compostarlo para obtener abono natural.";
  }
  if (clase === "Inorgánico") {
    return "Inorgánico ♻️ — Reutiliza o recicla en un punto adecuado.";
  }
  // Tercera clase sugerida en el modelo
  return "No residuo 🚫 — Coloca un residuo frente a la cámara para analizar.";
}

async function predict(el) {
  const preds = await model.predict(el);
  if (!preds || !preds.length) return;

  // Ordenar por probabilidad
  preds.sort((a, b) => b.probability - a.probability);
  const best = preds[0];
  const threshold = parseFloat(els.threshold.value);

  // Mostrar probabilidades para depurar
  els.probs.textContent = preds
    .map(p => `${p.className.padEnd(12, " ")} ${(p.probability * 100).toFixed(1)}%`)
    .join("\n");

  if (best.probability < threshold) {
    els.clasificacion.textContent = "No detecto residuo válido (confianza baja).";
    els.consejo.textContent = "Acerque el objeto y mantenga buena iluminación.";
    return;
  }

  const clase = best.className;
  const textoConsejo = consejoPorClase(clase);

  els.clasificacion.textContent = `${clase} (${(best.probability * 100).toFixed(1)}%)`;
  els.consejo.textContent = textoConsejo;

  if (els.speakToggle.checked) {
    speak(`Esto es ${clase}. ${textoConsejo}`);
  }
}

// ====== Preguntas y Respuestas ======
function responderPregunta() {
  const q = (els.pregunta.value || "").toLowerCase();

  let respuesta = "No tengo esa información todavía. Pregunta por plástico, vidrio, papel, cartón, latas, orgánico, etc.";
  for (const clave in RESPUES_TIP) {
    if (q.includes(clave)) {
      respuesta = RESPUES_TIP[clave];
      break;
    }
  }

  // Algunos atajos típicos
  if (q.includes("botella de plástico") || q.includes("botella plástica")) {
    respuesta = "Una botella plástica (PET) puede tardar 300–500 años en degradarse. Lo mejor es reutilizarla y reciclarla.";
  }
  if (q.includes("bolsa plástica") || q.includes("bolsa de plástico")) {
    respuesta = "Una bolsa plástica puede tardar ~500 años. Usa bolsas reutilizables de tela.";
  }
  if (q.includes("compostar") || q.includes("compostaje") || q.includes("compost")) {
    respuesta = "Para compostaje casero: mezcla restos de frutas/verduras (húmedos) con hojas secas/cartón (secos), airea semanalmente y mantén la humedad como una esponja. En 2–3 meses obtendrás abono.";
  }

  els.respuesta.textContent = respuesta;
  speak(respuesta);
}

// ====== Listeners UI ======
function setupUI() {
  setupSourceListeners();
  updateThresholdLabel();
  els.threshold.addEventListener("input", updateThresholdLabel);

  els.btnStart.addEventListener("click", startDetection);
  els.btnStop.addEventListener("click", stopDetection);
  els.btnAsk.addEventListener("click", responderPregunta);
  els.pregunta.addEventListener("keydown", (e) => { if (e.key === "Enter") responderPregunta(); });

  els.btnVoice.addEventListener("click", () => {
    if (!recognition) {
      els.sttStatus.textContent = "STT no soportado en este dispositivo.";
      return;
    }
    try { recognition.start(); } catch(_) { /* puede lanzar si ya está activo */ }
  });
}

// ====== Inicio ======
setupUI();
// El modelo se carga en startDetection() para mostrar estado en UI antes
