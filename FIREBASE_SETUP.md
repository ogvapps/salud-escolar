# Configuración de Firebase y Seguridad para Aplicaciones Educativas

## 📋 Resumen

Este documento describe las mejores prácticas de seguridad y configuración de Firebase para aplicaciones educativas basadas en el modelo implementado en `salud-escolar`.

---

## 🔐 1. Autenticación

### Autenticación Anónima

**¿Por qué usar autenticación anónima?**
- Permite acceso a Firestore sin exponer datos sensibles
- No requiere que los usuarios creen cuentas
- Cumple con las reglas de seguridad de Firebase

**Implementación:**

```javascript
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase-auth";

const auth = getAuth(firebaseApp);

// Autenticar usuario de forma anónima
await signInAnonymously(auth);

// Verificar estado de autenticación
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Usuario autenticado:", user.uid);
    // Cargar datos de Firestore
  } else {
    console.log("Usuario no autenticado");
  }
});
```

---

## 🗄️ 2. Estructura de Base de Datos (Firestore)

### Colección Recomendada

**Estructura:**
```
artifacts/
  └── {appId}/
      └── public/
          └── data/
              └── students/
                  ├── {studentId1}
                  ├── {studentId2}
                  └── ...
```

**Ventajas:**
- Aislamiento por aplicación usando `appId`
- Datos organizados y escalables
- Fácil de gestionar con reglas de seguridad

### Estructura de Documentos

```javascript
{
  name: "Nombre del Estudiante",
  stage: "Infantil" | "Primaria" | "ESO",
  course: "1º Infantil",
  info: "Información de salud completa",
  severity: "high" | "medium" | "low",
  createdAt: Timestamp
}
```

---

## 🛡️ 3. Reglas de Seguridad de Firestore

### Reglas Básicas (Firebase Console)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Regla para la colección de estudiantes
    match /artifacts/{appId}/public/data/students/{studentId} {
      // Solo usuarios autenticados pueden leer
      allow read: if request.auth != null;
      
      // Solo usuarios autenticados pueden escribir
      allow write: if request.auth != null;
    }
    
    // Denegar todo lo demás por defecto
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**IMPORTANTE:** Estas reglas DEBEN estar configuradas en Firebase Console > Firestore Database > Rules.

---

## 🔒 4. Capa Adicional de Seguridad: PIN de Acceso

### Implementación de PIN

Aunque Firebase proporciona autenticación, es recomendable añadir una capa adicional de PIN para aplicaciones escolares:

```javascript
// PIN de acceso (cambiar en producción)
const INITIAL_PIN = '1234';
const ADMIN_PIN = '2025';

// Verificar PIN antes de mostrar la aplicación
function handleInitialPinSubmit(e) {
  e.preventDefault();
  const pinInput = document.getElementById('initial-pin-input');
  
  if (pinInput.value === INITIAL_PIN) {
    // Iniciar Firebase después de PIN correcto
    initFirebase();
  } else {
    showError('PIN incorrecto');
  }
}
```

---

## 📱 5. Configuración PWA

### manifest.json

```json
{
  "name": "Nombre de la Aplicación",
  "short_name": "App",
  "description": "Descripción de la aplicación",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#6366f1",
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

### Meta Tags en HTML

```html
<head>
  <!-- PWA Manifest -->
  <link rel="manifest" href="manifest.json">
  <meta name="theme-color" content="#6366f1">
  
  <!-- iOS Support -->
  <link rel="apple-touch-icon" href="icon-192.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Nombre App">
</head>
```

**CRÍTICO:** Los íconos DEBEN ser PNG, no SVG. iOS y Android no soportan SVG para íconos de app.

---

## ✅ 6. Checklist de Implementación

### Configuración Inicial
- [ ] Crear proyecto en Firebase Console
- [ ] Habilitar **Authentication > Sign-in method > Anonymous**
- [ ] Crear base de datos Firestore
- [ ] Configurar reglas de seguridad en Firestore
- [ ] Copiar configuración de Firebase (apiKey, projectId, etc.)

### Código
- [ ] Importar Firebase SDK (v11.6.1 o superior)
- [ ] Implementar autenticación anónima
- [ ] Usar `onAuthStateChanged` para verificar usuario
- [ ] Implementar PIN de acceso inicial
- [ ] Estructura de colección: `artifacts/{appId}/public/data/students`

### PWA
- [ ] Crear `manifest.json`
- [ ] Añadir meta tags PWA en HTML
- [ ] Crear íconos PNG (192x192 y 512x512)
- [ ] Subir íconos al repositorio
- [ ] Probar en dispositivos iOS y Android

### Seguridad
- [ ] Verificar reglas de Firestore (request.auth != null)
- [ ] Cambiar PINs por defecto en producción
- [ ] No exponer credenciales sensibles en el código
- [ ] Usar variables de entorno para configuración

### Deployment
- [ ] Habilitar GitHub Pages (Settings > Pages)
- [ ] Configurar source: `/ (root)` o `/docs`
- [ ] Verificar que todos los archivos se despliegan
- [ ] Probar la URL de GitHub Pages

---

## 🚨 7. Errores Comunes y Soluciones

### Error: "Missing or insufficient permissions"

**Causa:** El usuario no está autenticado o las reglas de Firestore son muy restrictivas.

**Solución:**
```javascript
// Asegúrate de autenticar ANTES de acceder a Firestore
await signInAnonymously(auth);

// Luego accede a los datos
const snapshot = await getDocs(collection(db, 'artifacts/...'));
```

### Error: Íconos no aparecen en móvil

**Causa:** Usando SVG en lugar de PNG, o rutas incorrectas.

**Solución:**
- Usar **PNG** para todos los íconos
- Verificar rutas en `manifest.json` y HTML
- Limpiar caché del navegador/dispositivo
- Desinstalar y reinstalar la PWA

### Error: "Anonymous sign-in is disabled"

**Causa:** No has habilitado la autenticación anónima en Firebase Console.

**Solución:**
1. Ir a Firebase Console
2. Authentication > Sign-in method
3. Habilitar "Anonymous"

---

## 📚 8. Recursos Adicionales

- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [PWA Manifest Specification](https://web.dev/add-manifest/)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)

---

## 📞 Soporte

Para preguntas o problemas, contacta a:
- Email: ogonzalezv01@educarex.es
- Repository: https://github.com/ogvapps/salud-escolar

---

**Última actualización:** 13 de noviembre de 2025
**Versión:** 1.0
**Autor:** Orestes González Villanueva
