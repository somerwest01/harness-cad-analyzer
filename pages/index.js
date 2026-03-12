import { useState } from "react";
import DxfParser from "dxf-parser";

export default function Home() {
  const [asociadoTable, setAsociadoTable] = useState([]);
  const [debugInfo, setDebugInfo] = useState("");

  const cleanText = (str) => {
    if (!str) return "";
    // Limpieza profunda de caracteres de control de AutoCAD y espacios
    return str.replace(/\\P/g, " ").replace(/\{[^}]+\}/g, "").replace(/\\[a-zA-Z0-9]/g, "").trim();
  };

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const parser = new DxfParser();

    try {
      const dxf = parser.parseSync(text);
      const allTexts = dxf.entities
        .filter((e) => e.type === "TEXT" || e.type === "MTEXT")
        .map(t => ({
          content: cleanText(t.text || t.string),
          x: t.start?.x || 0,
          y: t.start?.y || 0,
        }));

      // Búsqueda de encabezados sin comillas y en mayúsculas (según tu captura)
      const hItem = allTexts.find(t => t.content === "Item #");
      const hConn = allTexts.find(t => t.content === "Conenector");
      const hOem = allTexts.find(t => t.content === "CONNECTOR OEM ITEM");
      const hLock = allTexts.find(t => t.content === "LOCK") || allTexts.find(t => t.content === "CANDADO");
      const hCav = allTexts.find(t => t.content === "CAVITIES") || allTexts.find(t => t.content === "CAVIDADES");

      if (!hItem) {
        setDebugInfo("No se encontró el encabezado ITEM # exactamente. Revisa la consola.");
        return;
      }

      const rowsMap = {};
      const rowTolerance = 10; // Margen vertical para agrupar celdas en una fila
      const colTolerance = 50; // Margen horizontal para alinear con el encabezado

      // Filtrar textos por debajo del encabezado
      const bodyTexts = allTexts.filter(t => t.y < hItem.y - 2);

      bodyTexts.forEach(t => {
        const rowKey = Math.round(t.y / rowTolerance) * rowTolerance;
        if (!rowsMap[rowKey]) rowsMap[rowKey] = {};

        // Alineación por columna X
        if (Math.abs(t.x - hItem.x) < colTolerance) rowsMap[rowKey].item = t.content;
        if (hConn && Math.abs(t.x - hConn.x) < colTolerance) rowsMap[rowKey].connector = t.content;
        if (hOem && Math.abs(t.x - hOem.x) < colTolerance) rowsMap[rowKey].oemItem = t.content;
        if (hLock && Math.abs(t.x - hLock.x) < colTolerance) rowsMap[rowKey].lock = t.content;
        if (hCav && Math.abs(t.x - hCav.x) < colTolerance) rowsMap[rowKey].cavities = t.content;
      });

      const finalRows = Object.values(rowsMap)
        .filter(r => r.item && !isNaN(parseInt(r.item)))
        .sort((a, b) => parseInt(a.item) - parseInt(b.item));

      setAsociadoTable(finalRows);
      setDebugInfo(finalRows.length > 0 ? "" : "Encabezados encontrados, pero no se detectaron datos numéricos debajo.");

    } catch (err) {
      console.error(err);
      alert("Error al procesar el archivo.");
    }
  }

  return (
    <div style={{ padding: "30px", fontFamily: "Arial, sans-serif", backgroundColor: "#f4f7f6", minHeight: "100vh" }}>
      <h1 style={{ color: "#2c3e50" }}>Análisis de Tabla: Asociado</h1>
      
      <div style={{ background: "white", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 10px rgba(0,0,0,0.1)", marginBottom: "20px" }}>
        <input type="file" onChange={handleFile} accept=".dxf" />
        {debugInfo && <p style={{ color: "#e74c3c", marginTop: "10px" }}>{debugInfo}</p>}
      </div>

      {asociadoTable.length > 0 && (
        <div style={{ background: "white", borderRadius: "8px", overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#2980b9", color: "white", textAlign: "left" }}>
                <th style={{ padding: "12px" }}>ITEM #</th>
                <th style={{ padding: "12px" }}>CONNECTOR</th>
                <th style={{ padding: "12px" }}>CONNECTOR OEM ITEM</th>
                <th style={{ padding: "12px" }}>LOCK</th>
                <th style={{ padding: "12px" }}>CAVITIES</th>
              </tr>
            </thead>
            <tbody>
              {asociadoTable.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee", backgroundColor: i % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                  <td style={{ padding: "12px", fontWeight: "bold" }}>{row.item}</td>
                  <td style={{ padding: "12px" }}>{row.connector || "-"}</td>
                  <td style={{ padding: "12px" }}>{row.oemItem || "-"}</td>
                  <td style={{ padding: "12px" }}>{row.lock || "-"}</td>
                  <td style={{ padding: "12px" }}>{row.cavities || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
