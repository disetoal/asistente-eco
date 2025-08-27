// ⚡ Inicializa la cámara
const video = document.getElementById("webcam");
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => video.srcObject = stream);

// 📸 Capturar foto
function capturarFoto() {
  const canvas = document.getElementById("foto");
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // ⚡ Por ahora: clasificación sencilla con palabras clave
  // (luego se puede reemplazar con un modelo de IA real)
  const objetosDePrueba = ["cáscara de plátano", "botella plástica", "papel", "vidrio"];
  const elegido = objetosDePrueba[Math.floor(Math.random() * objetosDePrueba.length)];
  
  clasificarObjeto(elegido);
}

// 🧠 Clasificación (versión demo)
function clasificarObjeto(objeto) {
  let clasificacion = "";
  let consejo = "";

  if (objeto.includes("cáscara") || objeto.includes("papel")) {
    clasificacion = "Orgánico ✅";
    consejo = "Puedes compostarlo y aprovecharlo como abono.";
  } else {
    clasificacion = "Inorgánico ♻️";
    consejo = "Llévalo a un punto de reciclaje para reducir la contaminación.";
  }

  document.getElementById("clasificacion").innerText = `${objeto} → ${clasificacion}`;
  document.getElementById("consejo").innerText = consejo;

  hablar(`${objeto}. Esto es ${clasificacion}. Consejo: ${consejo}`);
}

// 📚 Base de preguntas frecuentes
const respuestas = {
  "plástico": "El plástico puede tardar hasta 500 años en degradarse. Lo mejor es reciclarlo.",
  "botella": "Una botella plástica puede tardar más de 300 años. Usa botellas reutilizables.",
  "vidrio": "El vidrio puede tardar hasta 4000 años. Lo ideal es reutilizarlo.",
  "papel": "El papel tarda entre 2 y 6 semanas en degradarse. Puedes compostarlo."
};

// 🤖 Responder preguntas
function responderPregunta() {
  const pregunta = document.getElementById("pregunta").value.toLowerCase();
  let respuesta = "No tengo esa información todavía.";

  for (let clave in respuestas) {
    if (pregunta.includes(clave)) {
      respuesta = respuestas[clave];
    }
  }

  document.getElementById("clasificacion").innerText = "Pregunta: " + pregunta;
  document.getElementById("consejo").innerText = respuesta;
  hablar(respuesta);
}

// 🗣️ Síntesis de voz
function hablar(texto) {
  const msg = new SpeechSynthesisUtterance(texto);
  msg.lang = "es-ES";
  window.speechSynthesis.speak(msg);
}
