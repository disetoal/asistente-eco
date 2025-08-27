# ♻️ Asistente Eco con IA

Este proyecto es un **asistente inteligente para la separación de residuos**.  
Funciona en cualquier navegador (incluso en TV Box con Android) y utiliza **TensorFlow.js** para reconocer objetos con la cámara y clasificarlos en:

- 🥬 **Orgánico**  
- 🥤 **Inorgánico**  
- 🚫 **No residuo**

Además, responde preguntas por voz con reconocimiento y síntesis de texto.

---

## 🚀 Demo
👉 [Ver demo en GitHub Pages](https://tuusuario.github.io/asistente-eco/)

---

## 📂 Estructura del proyecto

asistente-eco/
│── index.html # Página principal
│── script.js # Lógica de la cámara y la IA
│── style.css # Estilos
│── modelo/ # Carpeta con el modelo exportado de Teachable Machine
│ ├── model.json
│ ├── metadata.json
│ └── weights.bin
│── README.md # Este archivo

yaml
Copiar código

---

## 🔧 Instalación y uso

1. Entrena tu modelo en [Teachable Machine](https://teachablemachine.withgoogle.com/):
   - Clase 1: **Orgánico**
   - Clase 2: **Inorgánico**
   - Clase 3: **No residuo**
2. Exporta el modelo en formato **TensorFlow.js** y coloca los archivos dentro de la carpeta `/modelo/`.
3. Sube el repositorio a GitHub y activa **GitHub Pages**.
4. Abre la URL en tu navegador o TV Box:  
   👉 `https://tuusuario.github.io/asistente-eco/`

---

## 🎤 Funcionalidades

- 📷 Clasificación en vivo con la cámara.  
- 🔊 Respuestas habladas (síntesis de voz).  
- 🎙️ Reconocimiento de voz para hacer preguntas.  
- 🌍 100% web, no necesita instalación.  

---

## 👨‍💻 Tecnologías usadas

- HTML, CSS, JavaScript  
- [TensorFlow.js](https://www.tensorflow.org/js)  
- Teachable Machine (Google)  
- Web Speech API  

---

## 🧑‍🏫 Autores

Proyecto desarrollado por **Diego [Tu Apellido]** para la feria de ciencias 2025