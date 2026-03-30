import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import docusign from "docusign-esign";
import { generateCreditPDF } from "./pdfGenerator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const IDV_WORKFLOW_ID = process.env.DS_IDV_WORKFLOW_ID || "c44d8dc1-ff21-47e5-94bc-e7791bfcd2e0";

// ── 1. AUTENTICACIÓN JWT ──────────────────────────────────────────────────────
async function getAccessToken() {
  const apiClient = new docusign.ApiClient();
  apiClient.setOAuthBasePath(process.env.DS_AUTH_SERVER);
  const privateKey =
    process.env.DS_PRIVATE_KEY ||
    fs.readFileSync(path.resolve(process.env.DS_PRIVATE_KEY_PATH), "utf8");
  const results = await apiClient.requestJWTUserToken(
    process.env.DS_INTEGRATION_KEY,
    process.env.DS_USER_ID,
    ["signature", "impersonation"],
    privateKey,
    3600
  );
  return results.body.access_token;
}

// ── 2. CREAR ENVELOPE ─────────────────────────────────────────────────────────
app.post("/api/create-signing-session", async function (req, res) {
  try {
    const { signerName, signerEmail, verificationMethod } = req.body;

    if (!signerName || !signerEmail || !req.body.creditAmount || !req.body.creditTerm) {
      return res.status(400).json({ error: "Faltan campos requeridos." });
    }

    console.log(`Generando PDF | ${signerName} | Verificación: ${verificationMethod}`);
    const pdfBuffer = await generateCreditPDF(req.body);
    const docBase64 = pdfBuffer.toString("base64");

    const accessToken = await getAccessToken();
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath(process.env.DS_BASE_URL);
    apiClient.addDefaultHeader("Authorization", "Bearer " + accessToken);

    const envelopesApi = new docusign.EnvelopesApi(apiClient);
    const clientUserId = "1001";

    // ── Signer base ───────────────────────────────────────────────────────────
    const signer = {
      email: signerEmail,
      name: signerName,
      recipientId: "1",
      routingOrder: "1",
      clientUserId,
      tabs: {
        signHereTabs: [{
          documentId: "1", pageNumber: "1",
          xPosition: "60", yPosition: "640",
          tabLabel: "FirmaDelSolicitante",
        }],
        dateSignedTabs: [{
          documentId: "1", pageNumber: "1",
          xPosition: "340", yPosition: "640",
          tabLabel: "FechaDeFirma",
        }],
      },
    };

    let authenticationMethod = "none";

    // ── OTP: código de acceso por correo ──────────────────────────────────────
    if (verificationMethod === "otp") {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      signer.accessCode = otpCode;
      signer.emailNotification = {
        emailSubject: `Tu código de acceso es: ${otpCode} — Banco Demo`,
        emailBody: `Hola ${signerName},\n\nTu código de acceso para firmar tu Solicitud de Crédito Personal es:\n\n★ ${otpCode} ★\n\nIngresa este código cuando DocuSign te lo solicite.\n\nBanco Demo`,
        supportedLanguage: "es",
      };
      authenticationMethod = "email";
      console.log(`OTP generado: ${otpCode}`);
    }

    // ── IDV: verificación de identidad con DocuSign ID Verification ───────────
    if (verificationMethod === "idv") {
      signer.identityVerification = {
        workflowId: IDV_WORKFLOW_ID,
        inputOptions: [{
          name: "phone_number_list",
          valueType: "PhoneNumberList",
          phoneNumberList: [],
        }],
      };
      authenticationMethod = "none";
      console.log(`IDV configurado con workflow: ${IDV_WORKFLOW_ID}`);
    }

    const envelopeDefinition = {
      emailSubject: "Firma requerida: Solicitud de Crédito Personal — Banco Demo",
      documents: [{
        documentBase64: docBase64,
        name: "Solicitud de Crédito Personal",
        fileExtension: "pdf",
        documentId: "1",
      }],
      recipients: { signers: [signer] },
      status: "sent",
    };

    const envelopeResult = await envelopesApi.createEnvelope(
      process.env.DS_ACCOUNT_ID, { envelopeDefinition }
    );

    const envelopeId = envelopeResult.envelopeId;
    console.log("Envelope creado:", envelopeId);

    const viewRequest = {
      returnUrl: process.env.DS_RETURN_URL || `http://localhost:${PORT}/callback`,
      authenticationMethod,
      email: signerEmail,
      userName: signerName,
      clientUserId,
      frameAncestors: [process.env.DS_BASE_FRONTEND_URL || `http://localhost:${PORT}`],
      messageOrigins: [process.env.DS_BASE_FRONTEND_URL || `http://localhost:${PORT}`],
    };

    const recipientView = await envelopesApi.createRecipientView(
      process.env.DS_ACCOUNT_ID, envelopeId, { recipientViewRequest: viewRequest }
    );

    console.log("Signing URL generada OK");
    res.json({
      success: true,
      envelopeId,
      signingUrl: recipientView.url,
      ...(verificationMethod === "otp" && { otpCode: signer.accessCode }),
    });

  } catch (error) {
    console.error("Error:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Body:", JSON.stringify(error.response.body, null, 2));
    }
    if (error.response?.body?.errorCode === "consent_required") {
      const consentUrl =
        "https://" + process.env.DS_AUTH_SERVER + "/oauth/auth?" +
        "response_type=code&scope=signature%20impersonation&" +
        "client_id=" + process.env.DS_INTEGRATION_KEY +
        "&redirect_uri=" + encodeURIComponent(
          process.env.DS_RETURN_URL || `http://localhost:${PORT}/callback`
        );
      return res.status(403).json({ error: "consent_required", consentUrl });
    }
    res.status(500).json({ error: error.message || "Error al crear la sesión de firma" });
  }
});

// ── 3. CALLBACK ───────────────────────────────────────────────────────────────
app.get("/callback", function (req, res) {
  const event = req.query.event || "unknown";
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
    <script>window.parent.postMessage({ type: "docusign-event", event: "${event}" }, "*");</script>
    <p>Procesando: <strong>${event}</strong></p>
  </body></html>`);
});

// ── 4. ESTADO ─────────────────────────────────────────────────────────────────
app.get("/api/envelope/:envelopeId/status", async function (req, res) {
  try {
    const accessToken = await getAccessToken();
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath(process.env.DS_BASE_URL);
    apiClient.addDefaultHeader("Authorization", "Bearer " + accessToken);
    const envelopesApi = new docusign.EnvelopesApi(apiClient);
    const envelope = await envelopesApi.getEnvelope(process.env.DS_ACCOUNT_ID, req.params.envelopeId);
    res.json({ envelopeId: envelope.envelopeId, status: envelope.status, statusDateTime: envelope.statusChangedDateTime });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── INICIAR ───────────────────────────────────────────────────────────────────
app.listen(PORT, function () {
  console.log(`\n==============================================`);
  console.log(`  DocuSign Embedded Signing Demo`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`==============================================\n`);
});
