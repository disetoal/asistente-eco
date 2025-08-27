/* Script completo para Asistente Eco Futurista
   - Espera carpeta ./modelo/ con model.json + metadata.json + weights.bin
   - Usa Teachable Machine Image (tmImage)
   - Webcam en vivo (tmImage.Webcam)
   - Captura foto -> predicción sobre el canvas
   - STT (SpeechRecognition) para preguntar por voz
   - TTS (speechSynthesis) para responder y animar avatar
   - Avatar: canvas con animación de ondas. Anima con micrófono o durante TTS.
*/

/* --------- ELEMENTOS UI --------- */
const webcamWrap = document.getElementById('webcam-wrap');
const webcamPlaceholder = document.getElementById('webcam-placeholder');
const btnCapture = document.getElementById('btn-capture');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const photoCanvas = document.getElementById('photo-canvas');
const photoInfo = document.getElementById('photo-info');
const thresholdInput = document.getElementById('threshold');
const thValueLabel = document.getElementById('th-value');

const avatarCanvas = document.getElementById('avatar-canvas');
const assistantText = document.getElementById('assistant-text');
const queryInput = document.getElementById('query-input');
const btnAsk = document.getElementById('btn-ask');
const btnVoice = document.getElementById('btn-voice');
const resultClass = document.getElementById('result-class');
const resultProb = document.getElementById('result-prob');
const resultTip = document.getElementById('result-tip');

/* --------- Variables globales --------- */
let model = null;
let webcam = null;
let running = false;
let avatarCtx = avatarCanvas.getContext('2d');
let photoCtx = photoCanvas.getContext('2d');

/* Ajustes */
const MODEL_PATH = 'modelo/'; // carpeta del modelo
const SPEAK_LANG = 'es-ES';

/* Predicciones frecuentes / tips */
const TIPS = {
  "Orgánico": "Orgánico ✅ — Puedes compostarlo y convertirlo en abono.",
  "Inorgánico": "Inorgánico ♻️ — Reutilízalo o llévalo a reciclaje.",
  "No residuo": "No es basura — coloca un residuo para analizar."
};

/* ------- AVATAR: animación de ondas (micro / TTS) ------- */
let avatarAnimRunning = false;
let micAnalyser = null;
let micAudioCtx = null;
let micSource = null;
let micStream = null;

/* Dibuja fondo + círculo central y posibles ondas */
function drawAvatar(waveLevel = 0) {
  const ctx = avatarCtx;
  const w = avatarCanvas.width;
  const h = avatarCanvas.height;
  ctx.clearRect(0,0,w,h);

  // fondo radial neon
  const g = ctx.createRadialGradient(w*0.3,h*0.25,10,w*0.5,h*0.5,Math.max(w,h));
  g.addColorStop(0, 'rgba(0,255,180,0.08)');
  g.addColorStop(1, 'rgba(0,0,0,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);

  // ondas (dependen de waveLevel 0..1)
  const waves = 4;
  for(let i=0;i<waves;i++){
    const alpha = 0.12 * (1 - i/waves) * (0.6 + waveLevel);
    ctx.beginPath();
    ctx.arc(w/2, h/2, 60 + i*18 + waveLevel*20, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(0,255,180,${alpha.toFixed(2)})`;
    ctx.lineWidth = 6 - i;
    ctx.stroke();
  }

  // circulo central
  ctx.beginPath();
  ctx.arc(w/2, h/2, 36, 0, Math.PI*2);
  ctx.fillStyle = '#001318';
  ctx.fill();

  // "ojo" interno que cambia según wave
  const eyeSize = 18 + waveLevel*10;
  ctx.beginPath();
  ctx.arc(w/2, h/2, eyeSize, 0, Math.PI*2);
  ctx.fillStyle = `rgba(0,255,180,${0.9})`;
  ctx.fill();
}

/* Simula animación durante TTS (mientras speechSynthesis.speaking) */
function animateDuringTTS() {
  if (avatarAnimRunning) return;
  avatarAnimRunning = true;
  const tick = () => {
    const speaking = window.speechSynthesis.speaking;
    if (!speaking) {
      avatarAnimRunning = false;
      drawAvatar(0);
      return;
    }
    // pulse wave between 0.2 and 1
    const wave = 0.2 + Math.abs(Math.sin(Date.now()/220)) * 0.8;
    drawAvatar(wave);
    requestAnimationFrame(tick);
  };
  tick();
}

/* ------- INICIALIZAR MICRO (getUserMedia) para visualizar input micro ------- */
async function initMicAnalyser() {
  if (micAnalyser) return;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    micSource = micAudioCtx.createMediaStreamSource(micStream);
    micAnalyser = micAudioCtx.createAnalyser();
    micAnalyser.fftSize = 256;
    micSource.connect(micAnalyser);
  } catch (e) {
    console.warn('No se pudo inicializar micrófono:', e);
    micAnalyser = null;
  }
}

/* Animación con datos del micrófono */
function animateMic() {
  if (!micAnalyser) return;
  let arr = new Uint8Array(micAnalyser.frequencyBinCount);
  let running = true;

  const loop = () => {
    if (!running) return;
    micAnalyser.getByteFrequencyData(arr);
    // calcular nivel promedio
    let sum = 0;
    for (let i=0;i<arr.length;i++) sum += arr[i];
    const avg = sum / arr.length / 255; // 0..1
    drawAvatar(Math.min(1, avg * 2)); // amplifica
    requestAnimationFrame(loop);
  };
  loop();

  // devolver función para parar
  return () => { running = false; drawAvatar(0); };
}

/* ------- CARGAR MODELO Teachable Machine -------- */
async function loadModel() {
  assistantText.innerText = 'Cargando modelo...';
  try {
    model = await tmImage.load(MODEL_PATH + 'model.json', MODEL_PATH + 'metadata.json');
    assistantText.innerText = 'Modelo cargado ✅ — pulsa Capturar para analizar.';
    console.log('Modelo cargado');
  } catch (e) {
    assistantText.innerText = 'No se pudo cargar el modelo. Revisa /modelo/';
    console.error(e);
  }
}

/* ------- INICIAR / DETENER WEBCAM (tmImage.Webcam) ------ */
async function startWebcam() {
  if (!model) await loadModel();
  if (!webcam) {
    webcam = new tmImage.Webcam(640, 480, true);
    await webcam.setup(); // pedirá permisos
    await webcam.play();
    // insertar canvas dentro de webcamWrap
    // elimina placeholder
    webcamPlaceholder.style.display = 'none';
    webcamWrap.innerHTML = ''; // limpiar
    webcamWrap.appendChild(webcam.canvas);
  }
  btnStart.disabled = true;
  btnStop.disabled = false;
  running = true;
  loopPredictLive(); // si quieres detectar en vivo (opcional)
}

/* detener */
async function stopWebcam() {
  running = false;
  btnStart.disabled = false;
  btnStop.disabled = true;
  if (webcam) {
    await webcam.stop();
    // dejar placeholder
    webcamWrap.innerHTML = '';
    webcamWrap.appendChild(webcamPlaceholder);
    webcam = null;
  }
}

/* ------- BUCLE opcional (en vivo) si quieres mostrar detección continua ------- */
let liveLoopEnabled = false;
async function loopPredictLive() {
  // Nota: aquí no forzamos hablar cada frame, solo actualizamos texto
  liveLoopEnabled = true;
  const loop = async () => {
    if (!running || !webcam || !liveLoopEnabled) return;
    try {
      // predicción desde el canvas de webcam
      const preds = await model.predict(webcam.canvas);
      preds.sort((a,b) => b.probability - a.probability);
      const best = preds[0];
      const threshold = parseFloat(thresholdInput.value);
      if (best.probability >= threshold) {
        // actualizar UI (pero no hablar siempre)
        resultClass.innerText = best.className;
        resultProb.innerText = (best.probability*100).toFixed(1) + '%';
        resultTip.innerText = TIPS[best.className] || '';
      } else {
        resultClass.innerText = '—';
        resultProb.innerText = '—';
        resultTip.innerText = 'Confianza baja, acerque el objeto y toma foto.';
      }
    } catch (e) {
      console.warn('Error predict en vivo:', e);
    }
    requestAnimationFrame(loop);
  };
  loop();
}

/* ------- CAPTURAR FOTO y PREDICCIÓN sobre la foto ------- */
btnCapture.addEventListener('click', async () => {
  if (!webcam) {
    assistantText.innerText = 'Primero pulsa Iniciar para activar la cámara.';
    return;
  }
  // dibujar frame actual en photo canvas
  photoCanvas.width = webcam.canvas.width;
  photoCanvas.height = webcam.canvas.height;
  photoCtx.drawImage(webcam.canvas, 0, 0);
  photoInfo.innerText = 'Foto capturada — analizando...';
  assistantText.innerText = 'Analizando foto...';

  // predecir sobre el canvas
  try {
    const preds = await model.predict(photoCanvas);
    preds.sort((a,b) => b.probability - a.probability);
    const best = preds[0];
    const threshold = parseFloat(thresholdInput.value);

    if (best.probability < threshold) {
      resultClass.innerText = 'No detectado';
      resultProb.innerText = (best.probability*100).toFixed(1) + '%';
      resultTip.innerText = 'Confianza baja — intenta otra toma con mejor iluminación.';
      assistantText.innerText = 'No detecté bien el residuo. Intenta otra foto.';
      speakText('No detecto un residuo con suficiente confianza. Intenta acercarlo y volver a capturar.');
      return;
    }

    // éxito
    resultClass.innerText = best.className;
    resultProb.innerText = (best.probability*100).toFixed(1) + '%';
    resultTip.innerText = TIPS[best.className] || '';
    assistantText.innerText = `${best.className} — ${(best.probability*100).toFixed(1)}%`;
    const say = `Esto es ${best.className}. ${TIPS[best.className] || ''}`;
    speakText(say);

  } catch (e) {
    console.error('Error predicción foto:', e);
    assistantText.innerText = 'Error al predecir. Revisa la consola.';
  }
});

/* ------- TTS (speechSynthesis) y animación mientras habla ------- */
function speakText(text) {
  if (!text) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = SPEAK_LANG;
  // seleccionar una voz preferida si existe
  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length) {
    // intenta elegir una voz española/latam
    const prefer = voices.find(v => /es(-|_)?(ES|MX|419)?/i.test(v.lang)) || voices[0];
    if (prefer) utter.voice = prefer;
  }
  // iniciar animación avatar cuando empiece y parar cuando termine
  utter.onstart = () => { animateDuringTTS(); };
  utter.onend = () => { /* animateDuringTTS() parará sola al dejar de hablar */ };
  window.speechSynthesis.cancel(); // asegurar que no haya colas antiguas
  window.speechSynthesis.speak(utter);
}

/* ------- STT: reconocimiento de voz para preguntas ------- */
let recognition = null;
if (window.SpeechRecognition || window.webkitSpeechRecognition) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new Rec();
  recognition.lang = SPEAK_LANG;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    assistantText.innerText = 'Escuchando...';
    // iniciar mic visualización
    initMicAnalyser().then(() => { stopMicAnim = animateMic(); });
  };
  recognition.onresult = (ev) => {
    const text = ev.results[0][0].transcript;
    queryInput.value = text;
    assistantText.innerText = `Tú: "${text}"`;
    handleQuestion(text);
  };
  recognition.onend = () => {
    assistantText.innerText = 'Listo.';
    if (stopMicAnim) { stopMicAnim(); stopMicAnim = null; }
  };
  recognition.onerror = (e) => {
    console.warn('STT error:', e);
    assistantText.innerText = 'Error de reconocimiento.';
    if (stopMicAnim) { stopMicAnim(); stopMicAnim = null; }
  };
} else {
  // STT no soportado
  btnVoice.disabled = true;
  btnVoice.title = 'Reconocimiento de voz no soportado';
}

/* variable para parar anim mic */
let stopMicAnim = null;

/* btnVoice (activar STT) */
btnVoice.addEventListener('click', async () => {
  if (!recognition) {
    assistantText.innerText = 'Reconocimiento de voz no disponible en este navegador.';
    return;
  }
  try {
    recognition.start();
  } catch (e) {
    console.warn('Error al iniciar STT:', e);
    recognition.stop();
    recognition.start();
  }
});

/* btnAsk (pregunta manual) */
btnAsk.addEventListener('click', () => {
  const q = queryInput.value.trim();
  if (!q) { assistantText.innerText = 'Escribe o dicta una pregunta.'; return; }
  handleQuestion(q);
});

/* Lógica simple para preguntas - puedes conectar a un endpoint /ask si quieres */
function handleQuestion(q) {
  const text = q.toLowerCase();
  let resp = 'No tengo esa información todavía. Pregunta por plástico, vidrio, papel, compostaje, etc.';
  if (text.includes('plástico') || text.includes('bolsa')) {
    resp = 'El plástico puede tardar hasta 300 a 500 años en degradarse. Mejor reciclar o evitar su uso.';
  } else if (text.includes('botella')) {
    resp = 'Una botella plástica puede durar 300 a 500 años. Reutilízala o recíclala.';
  } else if (text.includes('vidrio')) {
    resp = 'El vidrio puede durar miles de años. Lo mejor es reutilizarlo o reciclarlo.';
  } else if (text.includes('papel')) {
    resp = 'El papel tarda entre 2 y 6 semanas en degradarse si está en condiciones naturales.';
  } else if (text.includes('compost') || text.includes('compostar')) {
    resp = 'Para compostar: mezcla materiales húmedos (restos de comida) con secos (hojas, cartón), airea y controla humedad. En 2–3 meses obtendrás abono.';
  }
  assistantText.innerText = resp;
  speakText(resp);
}

/* ------- UI: inicio / parada y threshold ------- */
btnStart.addEventListener('click', async () => {
  await startWebcam();
  // iniciar mic analyer opcional (para anim mic cuando se use STT)
  await initMicAnalyser();
});
btnStop.addEventListener('click', async () => {
  await stopWebcam();
});
thresholdInput.addEventListener('input', () => {
  thValueLabel.innerText = parseFloat(thresholdInput.value).toFixed(2);
});

/* ------- INIT: dibujar avatar por defecto y cargar modelo parcialmente ------- */
drawAvatar(0);
loadModel();

/* ------- Ayuda: detectar voces disponibles para TTS (async) ------- */
window.speechSynthesis.onvoiceschanged = () => {
  // opcional: puedes listar voces si quieres depurar
  // console.log('voices', window.speechSynthesis.getVoices());
};

/* ------- Nota: limpieza cuando pestaña se cierra ------- */
window.addEventListener('beforeunload', () => {
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
  }
  if (webcam) {
    webcam.stop();
  }
});
