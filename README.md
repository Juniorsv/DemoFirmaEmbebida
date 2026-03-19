# DocuSign Embedded Signing Demo

Demo de firma electrónica embebida usando la API REST de DocuSign eSignature.

## Requisitos previos

- Node.js 18+
- Cuenta de developer en [DocuSign](https://developers.docusign.com)

## Configuración paso a paso

### 1. Configurar DocuSign

1. Ve a [admindemo.docusign.com/apps-and-keys](https://admindemo.docusign.com/apps-and-keys)
2. Crea una nueva app (o usa una existente)
3. Anota tu **Integration Key** (Client ID)
4. En la sección "Authentication", selecciona **Authorization Code Grant**
5. En "RSA Keypairs", haz clic en **Generate RSA** y **guarda la llave privada**
6. Anota tu **User ID** y **API Account ID** (en la parte superior de la página)

### 2. Configurar el proyecto

```bash
# Clonar/copiar el proyecto
cd docusign-demo

# Instalar dependencias
npm install

# Crear archivo de configuración
cp .env.example .env
```

### 3. Configurar credenciales

Edita `.env` con tus datos:

```env
DS_INTEGRATION_KEY=tu-integration-key
DS_USER_ID=tu-user-id
DS_ACCOUNT_ID=tu-account-id
DS_PRIVATE_KEY_PATH=./private.key
```

Guarda tu llave privada RSA en `private.key` en la raíz del proyecto.

### 4. Otorgar consentimiento (primera vez)

La primera vez necesitas otorgar consentimiento. Visita esta URL en tu navegador
(reemplaza `{INTEGRATION_KEY}` con tu Integration Key):

```
https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id={INTEGRATION_KEY}&redirect_uri=http://localhost:3000/callback
```

Acepta los permisos. Es un paso único.

### 5. Ejecutar

```bash
npm start
# o en modo desarrollo (auto-reload):
npm run dev
```

Abre `http://localhost:3000` en tu navegador.

## Rutas del API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET`  | `/` | Página principal (frontend) |
| `POST` | `/api/create-signing-session` | Crea envelope + genera signing URL |
| `GET`  | `/api/envelope/:id/status` | Consulta el estado de un envelope |
| `GET`  | `/callback` | Maneja redirect post-firma |

## Flujo técnico

```
Usuario → Frontend → POST /api/create-signing-session
                              ↓
                     Backend (JWT Auth → DocuSign API)
                              ↓
                     CreateEnvelope (doc + signer + clientUserId)
                              ↓
                     CreateRecipientView → signingUrl
                              ↓
                     Frontend carga signingUrl en iframe
                              ↓
                     Usuario firma dentro de la página
                              ↓
                     DocuSign redirige a /callback
                              ↓
                     postMessage → Frontend muestra resultado
```

## Archivos

```
docusign-demo/
├── server.js          # Backend Express (auth + rutas API)
├── public/
│   └── index.html     # Frontend (formulario + iframe + UI)
├── private.key        # Tu llave RSA privada (NO commitear)
├── .env               # Variables de entorno (NO commitear)
├── .env.example       # Plantilla de configuración
├── package.json
└── README.md
```
