import PDFDocument from "pdfkit";

// ── COLORES ───────────────────────────────────────────────────────────────────
const NAVY  = "#0D1B2A";
const GOLD  = "#C9A84C";
const LGOLD = "#F5F0E8";
const GRAY  = "#888888";
const LGRAY = "#F2F2F2";
const LINE  = "#CCCCCC";
const BLACK = "#1A1A2E";
const WHITE = "#FFFFFF";

// ── HELPERS ───────────────────────────────────────────────────────────────────
function hline(doc, y, color = LINE, thickness = 0.5) {
  doc.save().moveTo(50, y).lineTo(562, y).lineWidth(thickness).strokeColor(color).stroke().restore();
}

function sectionTitle(doc, y, text) {
  doc.save().rect(50, y, 4, 18).fill(GOLD).restore();
  doc.save().font("Helvetica-Bold").fontSize(9).fillColor(NAVY)
     .text(text.toUpperCase(), 62, y + 3, { characterSpacing: 1 }).restore();
  return y + 28;
}

// Dibuja label + valor con línea inferior, retorna la altura usada
function field(doc, x, y, label, value, width) {
  const val = value && value.toString().trim() ? value : "—";
  doc.save().font("Helvetica").fontSize(7).fillColor(GRAY)
     .text(label.toUpperCase(), x, y, { characterSpacing: 0.8, width }).restore();
  doc.save().font("Helvetica").fontSize(9.5).fillColor(val === "—" ? "#AAAAAA" : BLACK)
     .text(val, x, y + 10, { width }).restore();
  doc.save().moveTo(x, y + 24).lineTo(x + width, y + 24)
     .lineWidth(0.5).strokeColor(LINE).stroke().restore();
  return y + 34;
}

// Fila de 2 columnas
function row2(doc, y, l1, v1, l2, v2) {
  field(doc, 50,  y, l1, v1, 240);
  field(doc, 320, y, l2, v2, 242);
  return y + 34;
}

// Fila de 3 columnas
function row3(doc, y, l1, v1, l2, v2, l3, v3) {
  field(doc, 50,  y, l1, v1, 148);
  field(doc, 215, y, l2, v2, 148);
  field(doc, 380, y, l3, v3, 182);
  return y + 34;
}

// Campo ancho completo
function rowFull(doc, y, label, value) {
  field(doc, 50, y, label, value, 512);
  return y + 34;
}

// Cálculo de pago mensual
function calcMonthly(amount, term) {
  const a = parseFloat(amount), t = parseInt(term);
  if (!a || !t) return "—";
  const r = 0.18 / 12;
  const m = (a * r * Math.pow(1+r,t)) / (Math.pow(1+r,t) - 1);
  return "$" + m.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtMoney(v) {
  const n = parseFloat(v);
  if (!n) return "—";
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${parseInt(day)} de ${months[parseInt(m)-1]} de ${y}`;
}

// ── GENERADOR PRINCIPAL ───────────────────────────────────────────────────────
export function generateCreditPDF(data) {
  const {
    signerName, signerEmail, fechaNacimiento, lugarNacimiento,
    rfc, curp, estadoCivil, nacionalidad, telefono,
    domicilio, ciudad, estado, codigoPostal,
    empresa, puesto, antiguedad, ingresoMensual, otrosIngresos,
    creditAmount, creditTerm, destinoCredito
  } = data;

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: { Title: "Solicitud de Crédito Personal", Author: "Banco Demo" }
    });

    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const CW = 512; // content width

    // ── ENCABEZADO ────────────────────────────────────────────────────────────
    doc.font("Times-Roman").fontSize(22).fillColor(NAVY).text("Banco Demo", 50, 52);
    doc.font("Helvetica").fontSize(7.5).fillColor(GRAY)
       .text("SOLUCIONES FINANCIERAS PERSONALES · www.bancodemo.mx", 50, 78, { characterSpacing: 1 });
    doc.font("Times-Bold").fontSize(13).fillColor(NAVY)
       .text("Solicitud de Crédito Personal", 50, 54, { width: CW, align: "right" });
    doc.font("Helvetica").fontSize(8).fillColor(GRAY)
       .text("Documento para firma electrónica · DocuSign eSignature", 50, 71, { width: CW, align: "right" });

    doc.save().moveTo(50, 93).lineTo(562, 93).lineWidth(2.5).strokeColor(NAVY).stroke().restore();

    // ── FOLIO ─────────────────────────────────────────────────────────────────
    const folio = `CP-${new Date().getFullYear()}-${Math.floor(Math.random()*90000+10000)}`;
    doc.save().rect(50, 98, CW, 26).fill(NAVY).restore();
    doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE);
    doc.text("FOLIO DE SOLICITUD", 60, 106);
    doc.text(folio, 50, 106, { width: CW, align: "center" });
    doc.text("USO EXCLUSIVO BANCO DEMO", 50, 106, { width: CW - 10, align: "right" });

    let y = 138;

    // ── I. DATOS PERSONALES ───────────────────────────────────────────────────
    y = sectionTitle(doc, y, "I. Datos Personales del Solicitante");
    y = rowFull(doc, y, "Nombre completo", signerName);
    y = row2(doc, y, "Fecha de nacimiento", fmtDate(fechaNacimiento), "Lugar de nacimiento", lugarNacimiento);
    y = row3(doc, y, "RFC", rfc, "CURP", curp, "Estado civil", estadoCivil);
    y = row2(doc, y, "Nacionalidad", nacionalidad, "Correo electrónico", signerEmail);
    y = rowFull(doc, y, "Domicilio (calle, número, colonia)", domicilio);
    y = row3(doc, y, "Ciudad / Municipio", ciudad, "Estado", estado, "Código postal", codigoPostal);
    y = row2(doc, y, "Teléfono celular", telefono, "Correo electrónico (confirmación)", signerEmail);

    hline(doc, y - 4); y += 8;

    // ── II. DATOS LABORALES ───────────────────────────────────────────────────
    y = sectionTitle(doc, y, "II. Información Laboral y Financiera");
    y = rowFull(doc, y, "Empresa / Empleador", empresa);
    y = row2(doc, y, "Puesto / Cargo", puesto, "Antigüedad laboral", antiguedad);
    y = row2(doc, y, "Ingreso mensual neto", fmtMoney(ingresoMensual), "Otros ingresos mensuales", fmtMoney(otrosIngresos));

    hline(doc, y - 4); y += 8;

    // ── III. CONDICIONES DEL CRÉDITO ──────────────────────────────────────────
    y = sectionTitle(doc, y, "III. Condiciones del Crédito Solicitado");

    const tableData = [
      ["Concepto", "Detalle"],
      ["Monto solicitado", fmtMoney(creditAmount)],
      ["Plazo", `${creditTerm} meses`],
      ["Destino del crédito", destinoCredito || "—"],
      ["Tasa de interés anual (referencial)", "18.00 %"],
      ["Pago mensual estimado", calcMonthly(creditAmount, creditTerm)],
    ];

    const rH = 22, c1 = 270, c2 = CW - c1;

    // Header
    doc.save().rect(50, y, CW, rH).fill(NAVY).restore();
    doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE);
    doc.text(tableData[0][0], 58, y + 7);
    doc.text(tableData[0][1], 50 + c1 + 8, y + 7);
    y += rH;

    // Borde dorado
    doc.save().moveTo(50, y).lineTo(562, y).lineWidth(1.5).strokeColor(GOLD).stroke().restore();

    tableData.slice(1).forEach((row, i) => {
      doc.save().rect(50, y, CW, rH).fill(i % 2 === 0 ? WHITE : LGOLD).restore();
      doc.font("Helvetica").fontSize(9).fillColor(BLACK).text(row[0], 58, y + 7);
      doc.font("Helvetica-Bold").fillColor(NAVY).text(row[1], 50 + c1 + 8, y + 7);
      doc.save().moveTo(50, y+rH).lineTo(562, y+rH).lineWidth(0.3).strokeColor(LINE).stroke().restore();
      doc.save().moveTo(50+c1, y).lineTo(50+c1, y+rH).lineWidth(0.3).strokeColor(LINE).stroke().restore();
      y += rH;
    });
    y += 10;
    hline(doc, y - 4); y += 8;

    // ── IV. TÉRMINOS Y CONDICIONES ────────────────────────────────────────────
    y = sectionTitle(doc, y, "IV. Términos y Condiciones");

    const terms = [
      ["1. Veracidad de la información. ", "El solicitante declara bajo protesta de decir verdad que todos los datos son verídicos y comprobables."],
      ["2. Autorización al Buró de Crédito. ", "Al firmar, el solicitante autoriza a Banco Demo S.A. de C.V. a consultar su historial crediticio."],
      ["3. Resolución de la solicitud. ", "La presentación no garantiza la aprobación. Banco Demo comunicará la resolución en 5 días hábiles."],
      ["4. Protección de datos. ", "Los datos serán tratados conforme al Aviso de Privacidad de Banco Demo, en cumplimiento con la LFPDPPP."],
      ["5. Comisiones y cargos. ", "El crédito estará sujeto a comisiones de apertura y seguros informados previo a la formalización."],
    ];

    const termH = terms.length * 17 + 12;
    doc.save().rect(50, y, CW, termH).fill(LGRAY).restore();
    terms.forEach((t, i) => {
      doc.font("Helvetica-Bold").fontSize(8).fillColor(BLACK)
         .text(t[0], 60, y + 8 + i * 17, { continued: true });
      doc.font("Helvetica").fillColor("#555555").text(t[1]);
    });
    y += termH + 10;

    // ── DECLARACIÓN ───────────────────────────────────────────────────────────
    const declText = `Declaración del solicitante: Declaro bajo protesta de decir verdad que la información contenida en esta solicitud es correcta y completa, que he leído y acepto íntegramente los Términos y Condiciones, y que autorizo a Banco Demo a consultar mi historial crediticio y contactarme para la gestión de esta solicitud.`;
    const declH = 52;
    doc.save().rect(50, y, CW, declH).fill(LGOLD).restore();
    doc.save().rect(50, y, 4, declH).fill(GOLD).restore();
    doc.font("Helvetica").fontSize(8.5).fillColor("#444444")
       .text(declText, 64, y + 8, { width: CW - 24, lineGap: 2 });
    y += declH + 14;

    hline(doc, y); y += 14;

    // ── V. FIRMA ──────────────────────────────────────────────────────────────
    y = sectionTitle(doc, y, "V. Firma del Solicitante");
    y += 12;

    const sigW = (CW - 30) / 2;
    // Línea firma
    doc.save().moveTo(50, y + 55).lineTo(50 + sigW, y + 55)
       .lineWidth(1).strokeColor(NAVY).stroke().restore();
    doc.font("Helvetica").fontSize(7.5).fillColor(GRAY)
       .text("FIRMA DEL SOLICITANTE", 50, y + 60, { width: sigW, align: "center", characterSpacing: 1 });

    // Línea fecha
    doc.save().moveTo(50 + sigW + 30, y + 55).lineTo(50 + sigW * 2 + 30, y + 55)
       .lineWidth(1).strokeColor(NAVY).stroke().restore();
    doc.font("Helvetica").fontSize(7.5).fillColor(GRAY)
       .text("FECHA DE FIRMA", 50 + sigW + 30, y + 60, { width: sigW, align: "center", characterSpacing: 1 });

    y += 80;

    // ── FOOTER ────────────────────────────────────────────────────────────────
    hline(doc, y, LINE, 0.5);
    doc.font("Helvetica").fontSize(7.5).fillColor(GRAY)
       .text(`Banco Demo S.A. de C.V. · SOFOM E.R. · Documento para uso demostrativo · Firmado electrónicamente con DocuSign eSignature · Folio: ${folio}`,
         50, y + 8, { width: CW, align: "center" });

    doc.end();
  });
}
