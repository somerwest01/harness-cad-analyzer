import { useState } from "react";
import DxfParser from "dxf-parser";

export default function Home() {
  const [asociadoTable, setAsociadoTable] = useState([]);
  const [error, setError] = useState(null);

  const cleanText = (str) => {
    if (!str) return "";
    return str.replace(/\\P/g, " ").replace(/\{[^}]+\}/g, "").replace(/\\[a-zA-Z0-9]/g, "").trim();
  };

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    setError(null);
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

      // Buscamos los encabezados exactos que vimos en tus capturas
      const hItem = allTexts.find(t => t.content === "ITEM #");
      const hConn = allTexts.find(t => t.content === "CONNECTOR");
      const hOem = allTexts.find(t => t.content === "CONNECTOR OEM ITEM");

      if (!hItem) {
        setError("No se encontró el encabezado 'ITEM #'. Revisa que el archivo sea el correcto.");
        return;
      }

      const rowsMap = {};
      const rowTolerance = 12; // Un poco más de margen para las filas
      const colTolerance = 60; 

      // Filtrar textos debajo del encabezado
      const bodyTexts = allTexts.filter(t => t.y < hItem.y - 2);

      bodyTexts.forEach(t => {
        const rowKey = Math.round(t.y / rowTolerance) * rowTolerance;
        if (!rowsMap[rowKey]) rowsMap[rowKey] = {};

        if (Math.abs(t.x - hItem.x) < colTolerance) rowsMap[rowKey].item = t.content;
        if (hConn && Math.abs(t.x - hConn.x) < colTolerance) rowsMap[rowKey].connector = t.content;
        if (hOem && Math.abs(t.x - hOem.x) < colTolerance) rowsMap[rowKey].oemItem = t.content;
      });

      const finalRows = Object.values(rowsMap)
        .filter(r => r.item && !isNaN(parseInt(r.item)))
        .sort((a, b) => parseInt(a.item) - parseInt(b.item));

      setAsociadoTable(finalRows);
      if (finalRows.length === 0) setError("Se encontró el encabezado pero no hay datos numéricos debajo.");

    } catch (err) {
      console.error(err);
      setError("Error crítico al leer el archivo DXF.");
    }
  }

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif", backgroundColor: "#f4f7f6", minHeight: "100vh" }}>
      <h1 style={{ color: "#2c3e50" }}>Harness CAD Analyzer</h1>
      
      <div style={{ background: "white", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", marginBottom: "20px" }}>
        <p>Sube tu archivo DXF para extraer la tabla <b>Asociado</b>:</p>
        <input type="file" onChange={handleFile} accept=".dxf" />
        {error && <p style={{ color: "red", marginTop: "10px" }}>{error}</p>}
      </div>

      {asociadoTable.length > 0 && (
        <div style={{ background: "white", borderRadius: "8px", overflow: "hidden", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#3498db", color: "white", textAlign: "left" }}>
                <th style={{ padding: "12px" }}>ITEM #</th>
                <th style={{ padding: "12px" }}>CONNECTOR</th>
                <th style={{ padding: "12px" }}>CONNECTOR OEM ITEM</th>
              </tr>
            </thead>
            <tbody>
              {asociadoTable.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee", backgroundColor: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                  <td style={{ padding: "12px", fontWeight: "bold" }}>{row.item}</td>
                  <td style={{ padding: "12px" }}>{row.connector || "-"}</td>
                  <td style={{ padding: "12px" }}>{row.oemItem || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
