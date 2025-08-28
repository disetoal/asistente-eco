/* script.js
  - Cámara (getUserMedia) -> mostrar video
  - Capturar foto -> canvas y <img>
  - Avatar canvas con ondas animadas:
      * Reacciona al micrófono (analyser)
      * Reacciona durante TTS (sintetiza animación)
  - STT (SpeechRecognition) para escuchar preguntas
  - TTS (speechSynthesis) para responder
  - Soporte opcional: intenta cargar modelo Teachable Machine desde ./modelo/
*/

const videoWrap = document.getElementById('video-wrap');
const videoPlaceholder = document.getElementById('video-placeholder');

const btnStart = document.getElementById('btn-start');
const btnCapture = document.getElementById('btn-capture');
const photoCanvas = document.getElementById('photo-canvas');
const photoImg = document.getElementById('photo-img');
const photoInfo = document.getElementById('photo-info');

const resultClass = document.getElementById('result-class');
const resultProb = document.getElementById('result-prob');
const resultTip = document.getElementById('result-tip');
const probsPre = document.getElementById('probs');
const modelStatus = document.getElementById('model-status');

const avatarCanvas = document.getElementById('avatar');
const avatarCtx = avatarCanvas.getContext('2d');
const assistantText = document.getElementById('assistant-text');

const queryInput = document.getElementById('query');
const btnVoice = document.getElementById('btn-voice');
const btnSend = document.getElementById('btn-send');

const thresholdInput = document.getElementById('threshold');
const thValue = document.getElementById('th-value');

let videoStream = null;
let localVideoEl = null;

let audioCtx = null;
let analyser = null;
let micStream = null;

let analysing = false;
let stopMicAnim = null;

let model = null; // tmImage model if present

// Tips basicos
const TIPS = {
  "Orgánico (cáscaras, frutas, restos de comida, pape": "Orgánico ✅ — Puedes compostarlo y convertirlo en abono.",
  "Inorganico": "Inorgánico ♻️ — Reutilízalo o llévalo a reciclaje.",
  "No residuo / Persona / Fondo": "No residuo 🚫 — Coloca un residuo frente a la cámara para analizar."
};

// ---- Avatar draw ----
function drawAvatar(level = 0) {
  const ctx = avatarCtx;
  const w = avatarCanvas.width;
  const h = avatarCanvas.height;
  ctx.clearRect(0,0,w,h);

  // Fondo radial
  const g = ctx.createRadialGradient(w*0.35,h*0.3,10,w*0.5,h*0.5,Math.max(w,h));
  g.addColorStop(0,'rgba(0,234,255,0.07)');
  g.addColorStop(1,'rgba(0,0,0,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);

  // Ondas
  const waves = 5;
  for (let i = waves-1; i >= 0; i--) {
    const radius = 40 + i*18 + level*25;
    const alpha = 0.12 * (1 - i/waves) * (0.6 + level);
    ctx.beginPath();
    ctx.arc(w/2, h/2, radius, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(0,234,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 6 - i;
    ctx.stroke();
  }

  // Centro
  ctx.beginPath();
  ctx.arc(w/2,h/2,36,0,Math.PI*2);
  ctx.fillStyle = '#00141a';
  ctx.fill();

  // Ojo activo
  const eye = 16 + level*8;
  ctx.beginPath();
  ctx.arc(w/2,h/2,eye,0,Math.PI*2);
  ctx.fillStyle = `rgba(0,234,255,${0.9})`;
  ctx.fill();
}

// ---- Mic analyser (visual) ----
async function initMic() {
  if (analyser) return;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
  } catch (e) {
    console.warn('Mic no disponible:', e);
    analyser = null;
  }
}

function startMicAnimation() {
  if (!analyser) return;
  let arr = new Uint8Array(analyser.frequencyBinCount);
  let running = true;
  const loop = () => {
    if (!running) return;
    analyser.getByteFrequencyData(arr);
    let sum = 0;
    for (let i=0;i<arr.length;i++) sum += arr[i];
    const avg = sum / arr.length / 255; // 0..1
    drawAvatar(Math.min(1, avg*1.6));
    requestAnimationFrame(loop);
  };
  loop();
  return () => { running = false; drawAvatar(0); };
}

// ---- TTS animation (simulate while speaking) ----
function animateTTSDuringSpeech() {
  let running = true;
  const tick = () => {
    if (!running) return;
    // wave from sine
    const lvl = 0.3 + Math.abs(Math.sin(Date.now()/180))*0.8;
    drawAvatar(lvl);
    // stop when not speaking
    if (!window.speechSynthesis.speaking) {
      running = false;
      drawAvatar(0);
      return;
    }
    requestAnimationFrame(tick);
  };
  tick();
}

// ---- Speech Synthesis ----
function speak(text) {
  if (!text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  // pick preferred voice if available
  const voices = speechSynthesis.getVoices();
  if (voices && voices.length) {
    const prefer = voices.find(v => /es(-|_)?(ES|MX|419)?/i.test(v.lang)) || voices[0];
    if (prefer) u.voice = prefer;
  }
  u.onstart = () => animateTTSDuringSpeech();
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---- STT (SpeechRecognition) ----
let recognition = null;
if (window.SpeechRecognition || window.webkitSpeechRecognition) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new Rec();
  recognition.lang = 'es-ES';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = async () => {
    assistantText.innerText = 'Escuchando…';
    await initMic();
    if (analyser) stopMicAnim = startMicAnimation();
  };

  recognition.onresult = (ev) => {
    const t = ev.results[0][0].transcript;
    queryInput.value = t;
    assistantText.innerText = `Tú: ${t}`;
    handleQuestion(t);
  };

  recognition.onend = () => {
    assistantText.innerText = 'Listo.';
    if (stopMicAnim) { stopMicAnim(); stopMicAnim = null; }
  };

  recognition.onerror = (e) => {
    console.warn('STT error', e);
    assistantText.innerText = 'Error de reconocimiento';
    if (stopMicAnim) { stopMicAnim(); stopMicAnim = null; }
  };
} else {
  btnVoice.disabled = true;
  btnVoice.title = 'STT no soportado en este navegador';
}

// ---- Camera ----
async function startCamera() {
  try {
    videoPlaceholder.style.display = 'none';
    // crear element video si no existe
    if (!localVideoEl) {
      localVideoEl = document.createElement('video');
      localVideoEl.autoplay = true;
      localVideoEl.playsInline = true;
      localVideoEl.width = 420;
      localVideoEl.height = 300;
      localVideoEl.style.objectFit = 'cover';
      videoWrap.innerHTML = '';
      videoWrap.appendChild(localVideoEl);
    }
    videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    localVideoEl.srcObject = videoStream;
    assistantText.innerText = 'Cámara activa. Pulsa Capturar para analizar.';
    btnStart.disabled = true;
  } catch (e) {
    console.error('Error cámara', e);
    assistantText.innerText = 'Error al abrir cámara. Revisa permisos.';
  }
}

function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
  if (localVideoEl) {
    localVideoEl.remove();
    localVideoEl = null;
    videoWrap.innerHTML = '';
    videoWrap.appendChild(videoPlaceholder);
    videoPlaceholder.style.display = '';
  }
  btnStart.disabled = false;
}

// ---- Capture photo & (optional) predict ----
btnStart.addEventListener('click', () => startCamera());
btnCapture.addEventListener('click', async () => {
  if (!localVideoEl) { assistantText.innerText = 'Primero inicia la cámara.'; return; }
  // dibujar en canvas
  const cw = localVideoEl.videoWidth || 640;
  const ch = localVideoEl.videoHeight || 480;
  photoCanvas.width = cw; photoCanvas.height = ch;
  const ctx = photoCanvas.getContext('2d');
  ctx.drawImage(localVideoEl, 0, 0, cw, ch);
  const dataUrl = photoCanvas.toDataURL('image/png');
  photoImg.src = dataUrl;
  photoInfo.innerText = 'Foto capturada';

  // si hay modelo, predecir sobre canvas (tmImage accepts <canvas>)
  if (model) {
    try {
      const preds = await model.predict(photoCanvas);
      preds.sort((a,b)=>b.probability-a.probability);
      const best = preds[0];
      const threshold = parseFloat(thresholdInput.value);
      // show probs
      probsPre.innerText = preds.map(p => `${p.className.padEnd(12)} ${(p.probability*100).toFixed(1)}%`).join('\n');
      if (best.probability < threshold) {
        resultClass.innerText = 'No detectado';
        resultProb.innerText = (best.probability*100).toFixed(1) + '%';
        resultTip.innerText = 'Confianza baja. Acerca el objeto y vuelve a capturar.';
        assistantText.innerText = 'Confianza baja en la predicción.';
        speak('No detecto el residuo con suficiente confianza. Intenta otra vez.');
      } else {
        resultClass.innerText = best.className;
        resultProb.innerText = (best.probability*100).toFixed(1) + '%';
        resultTip.innerText = TIPS[best.className] || '';
        assistantText.innerText = `${best.className} — ${(best.probability*100).toFixed(1)}%`;
        speak(`Esto es ${best.className}. ${TIPS[best.className] || ''}`);
      }
    } catch (e) {
      console.warn('Error predict', e);
      assistantText.innerText = 'Error al predecir.';
    }
  } else {
    // Sin modelo: simple demo (aleatorio) — puedes quitar si no quieres
    const demo = Math.random() > 0.5 ? 'Orgánico' : 'Inorgánico';
    resultClass.innerText = demo;
    resultProb.innerText = '—';
    resultTip.innerText = TIPS[demo];
    assistantText.innerText = `Demo: ${demo}`;
    speak(`Demo: Esto parece ${demo}. ${TIPS[demo]}`);
  }
});

// ---- Questions handling ----
btnVoice.addEventListener('click', () => {
  if (!recognition) { assistantText.innerText = 'STT no disponible.'; return; }
  try {
    recognition.start();
  } catch (e) {
    // a veces hay que reiniciar
    try { recognition.stop(); recognition.start(); } catch(_) {}
  }
});

btnSend.addEventListener('click', () => {
  const q = queryInput.value.trim();
  if (!q) { assistantText.innerText = 'Escribe o dictar una pregunta.'; return; }
  handleQuestion(q);
});

function handleQuestion(q) {
  const t = q.toLowerCase();
  let resp = 'Lo siento, aún no lo sé. Pregunta por plástico, vidrio, papel, compostaje, etc.';
  if (t.includes('plástico') || t.includes('bolsa')) {
    resp = 'El plástico puede tardar entre 300 y 500 años en degradarse. Evita su uso y recíclalo.';
  } else if (t.includes('botella')) {
    resp = 'Una botella plástica puede tardar 300–500 años. Reutilízala o recíclala.';
  } else if (t.includes('vidrio')) {
    resp = 'El vidrio tarda muchísimos años; mejor reutilizar y reciclar.';
  } else if (t.includes('papel')) {
    resp = 'El papel tarda entre 2 y 6 semanas en degradarse y puede compostarse si está limpio.';
  } else if (t.includes('compost') || t.includes('compostar')) {
    resp = 'Para compostar, mezcla restos húmedos con materiales secos, airea y controla la humedad; en 2–3 meses tendrás abono.';
  }
  assistantText.innerText = resp;
  speak(resp);
}

// ---- Threshold label ----
thresholdInput.addEventListener('input', ()=> thValue.innerText = parseFloat(thresholdInput.value).toFixed(2));

// ---- Optional: cargar modelo Teachable Machine si existe en /modelo/ ----
async function tryLoadModel() {
  // intenta fetch model.json para saber si existe
  try {
    const res = await fetch('modelo/model.json', {method:'HEAD'});
    if (!res.ok) throw new Error('no model');
  } catch (e) {
    modelStatus.innerText = 'Modelo: no presente (opcional)';
    return;
  }
  modelStatus.innerText = 'Cargando modelo...';
  try {
    model = await tmImage.load('modelo/model.json','modelo/metadata.json');
    modelStatus.innerText = 'Modelo cargado ✅';
  } catch (e) {
    console.warn('Error cargando modelo:', e);
    modelStatus.innerText = 'Error cargando modelo';
  }
}

// ---- On load ----
drawAvatar(0);
tryLoadModel();

// cleanup on unload
window.addEventListener('beforeunload', () => {
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  if (videoStream) videoStream.getTracks().forEach(t=>t.stop());
});
