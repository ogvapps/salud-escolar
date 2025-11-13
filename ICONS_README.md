# Instrucciones para Agregar Íconos PWA

## Paso 1: Preparar los Íconos

Ya descargaste el ícono de Flaticon (carpeta médica amarilla con cruz roja).

Necesitas crear DOS archivos PNG:
- **icon-192.png** (192x192 píxeles)
- **icon-512.png** (512x512 píxeles)

## Paso 2: Redimensionar el Ícono

### Opción A: Usar el archivo de 512px descargado
1. Renombra el archivo descargado de Flaticon como `icon-512.png`
2. Usa una herramienta en línea como [iLoveIMG](https://www.iloveimg.com/resize-image) para crear la versión de 192px:
   - Sube el archivo de 512px
   - Cambia las dimensiones a 192x192 píxeles
   - Descarga y renombra como `icon-192.png`

### Opción B: Descargar ambos tamaños desde Flaticon
1. Ve a [Flaticon - Medical Record Icon](https://www.flaticon.com/free-icon/medical-record_10835803)
2. Descarga el PNG de 512px → renombra a `icon-512.png`
3. Descarga el PNG de 256px → redimensiona a 192px y renombra a `icon-192.png`

## Paso 3: Subir los Íconos al Repositorio

1. Ve a https://github.com/ogvapps/salud-escolar/upload/main
2. Arrastra los archivos `icon-192.png` y `icon-512.png`
3. Haz commit con el mensaje: "Add PWA icons (192px and 512px)"

## Paso 4: Verificar el manifest.json

El archivo `manifest.json` ya está configurado para usar estos íconos:

```json
"icons": [
  {
    "src": "icon-192.png",
    "sizes": "192x192",
    "type": "image/png"
  },
  {
    "src": "icon-512.png",
    "sizes": "512x512",
    "type": "image/png"
  }
]
```

## Paso 5: Probar la PWA

1. Ve a https://ogvapps.github.io/salud-escolar/
2. En Chrome Android, abre el menú y selecciona "Agregar a pantalla de inicio"
3. Verifica que el ícono se muestre correctamente

## Nota sobre Atribución

El ícono de Flaticon requiere atribución. Considera agregar en el footer:
```html
<!-- Icon by nangicon from Flaticon -->
```

---

**Estado Actual:**
- ✅ Firebase configurado
- ✅ firebase-config.js creado
- ✅ index.html actualizado
- ⏳ Íconos PWA pendientes (este paso)
- ⏳ Prueba en GitHub Pages
