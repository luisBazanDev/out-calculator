# Vaquita

App estática para repartir gastos de una salida entre amigos. Permite guardar gastos con reparto igual o personalizado, registrar pagos ya realizados, calcular quién debe pagar a quién y descargar un resumen de transacciones en PDF. Las salidas se guardan en `localStorage` en el navegador y se pueden compartir como una copia incluida en un enlace.

Los enlaces compartidos contienen los datos comprimidos y codificados en Base64 URL-safe dentro del fragmento `#share-content`. También se pueden descargar e importar salidas como archivos JSON; si una salida no cabe en un enlace, al compartirla se descarga el archivo automáticamente. Los enlaces anteriores sin comprimir siguen siendo compatibles. No hay sincronización: cada enlace o archivo es una instantánea, y cualquiera que lo reciba podrá ver su contenido. Al abrir un enlace, la app muestra una vista previa de solo lectura; guardarla crea una salida nueva y no reemplaza las salidas locales.

## Desarrollo

Requiere Node.js 22 o posterior.

```sh
npm ci
npm run dev
```

Comprobaciones antes de publicar:

```sh
npm test
npm run check
npm run build
```

## GitHub Pages

El workflow `.github/workflows/deploy.yml` construye y publica el sitio cuando se actualiza `main` o `master`. Astro obtiene el nombre del repositorio desde `GITHUB_REPOSITORY` y configura automáticamente la ruta base para páginas de proyecto.

En el repositorio de GitHub, configura **Settings → Pages → Build and deployment → Source → GitHub Actions**. Después de subir el proyecto, el workflow publicará el sitio.
