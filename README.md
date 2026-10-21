# Vaquita

App estática para repartir gastos de una salida entre amigos. Permite guardar gastos con reparto igual o personalizado, registrar pagos ya realizados y calcular quién debe pagar a quién. Las salidas se guardan en `localStorage` en el navegador y se pueden compartir como una copia incluida en un enlace.

Los enlaces compartidos contienen los datos codificados en Base64 URL-safe dentro del fragmento `#share-content`. No hay sincronización: cada enlace es una instantánea, y cualquiera que lo reciba podrá ver su contenido. Al abrirlo, la app muestra una vista previa de solo lectura; guardarla crea una salida nueva y no reemplaza las salidas locales.

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
