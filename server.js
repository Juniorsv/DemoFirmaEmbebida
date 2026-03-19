import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import docusign from "docusign-esign";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// 1. AUTENTICACION JWT CON DOCUSIGN
async function getAccessToken() {
  try {
    const apiClient = new docusign.ApiClient();
    apiClient.setOAuthBasePath(process.env.DS_AUTH_SERVER);

    console.log("--- Debug Auth ---");
    console.log("Auth Server:", process.env.DS_AUTH_SERVER);
    console.log("Integration Key:", process.env.DS_INTEGRATION_KEY);
    console.log("User ID:", process.env.DS_USER_ID);
    console.log("Private Key Path:", process.env.DS_PRIVATE_KEY_PATH);

  const privateKey = process.env.DS_PRIVATE_KEY || 
  fs.readFileSync(path.resolve(process.env.DS_PRIVATE_KEY_PATH), "utf8");
console.log("Private Key loaded:", privateKey.substring(0, 40) + "...");

const results = await apiClient.requestJWTUserToken(
  process.env.DS_INTEGRATION_KEY,
  process.env.DS_USER_ID,
  ["signature", "impersonation"],  
  privateKey,
  3600
);
    console.log("Token obtenido OK");
    return results.body.access_token;
 } catch (err) {
  console.error("=== AUTH ERROR ===");
  console.error("Message:", err.message);
  console.error("Full error:", JSON.stringify(err, null, 2));
  if (err.response) {
    console.error("Status:", err.response.status);
    console.error("Text:", err.response.text);
    console.error("Body:", JSON.stringify(err.response.body, null, 2));
  }
  throw err;
}
}

// 2. CREAR ENVELOPE + GENERAR SIGNING URL
app.post("/api/create-signing-session", async function (req, res) {
  try {
    const signerName = req.body.signerName;
    const signerEmail = req.body.signerEmail;

    if (!signerName || !signerEmail) {
      return res.status(400).json({
        error: "Se requiere signerName y signerEmail",
      });
    }

    const accessToken = await getAccessToken();

    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath(process.env.DS_BASE_URL);
    apiClient.addDefaultHeader("Authorization", "Bearer " + accessToken);

    const envelopesApi = new docusign.EnvelopesApi(apiClient);
    const accountId = process.env.DS_ACCOUNT_ID;

    const htmlDoc =
      '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto;">' +
      '<h1 style="color: #333; border-bottom: 2px solid #6C5CE7; padding-bottom: 10px;">Acuerdo de Demostracion</h1>' +
      '<p style="color: #555; line-height: 1.6;">Este documento es una demostracion de firma electronica embebida utilizando la API de DocuSign.</p>' +
      '<p style="color: #555; line-height: 1.6;">Yo, <strong>' + signerName + '</strong>, confirmo que he revisado este documento de demostracion y acepto los terminos de esta prueba.</p>' +
      '<p style="color: #555; line-height: 1.6;">Fecha: ' + new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" }) + '</p>' +
      '<br/><br/><p style="color: #999; font-size: 12px;">Documento generado automaticamente para propositos de demostracion.</p>' +
      '</body></html>';

    const docBase64 = Buffer.from(htmlDoc).toString("base64");
    const clientUserId = "1001";

    const envelopeDefinition = {
      emailSubject: "Por favor firma este documento de demostracion",
      documents: [
        {
          documentBase64: docBase64,
          name: "Acuerdo de Demostracion",
          fileExtension: "html",
          documentId: "1",
        },
      ],
      recipients: {
        signers: [
          {
            email: signerEmail,
            name: signerName,
            recipientId: "1",
            routingOrder: "1",
            clientUserId: clientUserId,
            tabs: {
              signHereTabs: [
                {
                  documentId: "1",
                  pageNumber: "1",
                  xPosition: "150",
                  yPosition: "400",
                },
              ],
              dateSignedTabs: [
                {
                  documentId: "1",
                  pageNumber: "1",
                  xPosition: "150",
                  yPosition: "470",
                },
              ],
            },
          },
        ],
      },
      status: "sent",
    };

    const envelopeResult = await envelopesApi.createEnvelope(accountId, {
      envelopeDefinition: envelopeDefinition,
    });

    const envelopeId = envelopeResult.envelopeId;
    console.log("Envelope creado: " + envelopeId);

 const viewRequest = {
  returnUrl: process.env.DS_RETURN_URL || `http://localhost:${PORT}/callback`,
  authenticationMethod: "none",
  email: signerEmail,
  userName: signerName,
  clientUserId: clientUserId,
  frameAncestors: [process.env.DS_BASE_FRONTEND_URL || `http://localhost:${PORT}`],
  messageOrigins: [process.env.DS_BASE_FRONTEND_URL || `http://localhost:${PORT}`],
};

    const recipientView = await envelopesApi.createRecipientView(
      accountId,
      envelopeId,
      { recipientViewRequest: viewRequest }
    );

    console.log("Signing URL generada");

    res.json({
      success: true,
      envelopeId: envelopeId,
      signingUrl: recipientView.url,
    });
  } catch (error) {
    console.error("Error:", error.message || error);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Body:", JSON.stringify(error.response.body, null, 2));
    }

    if (error.response && error.response.body && error.response.body.errorCode === "consent_required") {
      const consentUrl =
        "https://" + process.env.DS_AUTH_SERVER + "/oauth/auth?" +
        "response_type=code&" +
        "scope=signature%20impersonation&" +
        "client_id=" + process.env.DS_INTEGRATION_KEY + "&" +
        "redirect_uri=http://localhost:" + PORT + "/callback";

      return res.status(403).json({
        error: "consent_required",
        message: "Se necesita otorgar consentimiento. Visita esta URL:",
        consentUrl: consentUrl,
      });
    }

    res.status(500).json({
      error: error.message || "Error al crear la sesion de firma",
    });
  }
});

// 3. CALLBACK
app.get("/callback", function (req, res) {
  const event = req.query.event;
  res.send(
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
    '<script>window.parent.postMessage({ type: "docusign-event", event: "' + (event || "unknown") + '" }, "*");</script>' +
    '<p>Procesando resultado: <strong>' + (event || "") + '</strong></p>' +
    '</body></html>'
  );
});

// 4. CONSULTAR ESTADO
app.get("/api/envelope/:envelopeId/status", async function (req, res) {
  try {
    const accessToken = await getAccessToken();
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath(process.env.DS_BASE_URL);
    apiClient.addDefaultHeader("Authorization", "Bearer " + accessToken);

    const envelopesApi = new docusign.EnvelopesApi(apiClient);
    const envelope = await envelopesApi.getEnvelope(
      process.env.DS_ACCOUNT_ID,
      req.params.envelopeId
    );

    res.json({
      envelopeId: envelope.envelopeId,
      status: envelope.status,
      statusDateTime: envelope.statusChangedDateTime,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// INICIAR SERVIDOR
app.listen(PORT, function () {
  console.log("");
  console.log("==============================================");
  console.log("  DocuSign Embedded Signing Demo");
  console.log("  http://localhost:" + PORT);
  console.log("==============================================");
  console.log("");
});
