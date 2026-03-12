import { useState } from "react";
import DxfParser from "dxf-parser";

export default function Home() {
  const [result, setResult] = useState(null);
  const [asociadoTable, setAsociadoTable] = useState([]);
  const [debugTexts, setDebugTexts] = useState([]);

  const cleanText = (str) => {
    if (!str) return "";
    // Limpia formatos de MTEXT y espacios extra
    return str.replace(/\\P/g, " ").replace(/\{[^}]+\}/g, "").replace(/\\[a-zA-Z0-9]/g, "").trim();
  };

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const parser = new DxfParser();

    try {
      const dxf = parser.parseSync(text);
      
      // Extraemos y limpiamos todos los textos
      const allTexts = dxf.entities
        .filter((e) => e.type === "TEXT" || e.type === "MTEXT")
        .map(t => ({
          content: cleanText(t.text || t.string),
          x: t.start?.x || 0,
          y: t.start?.y || 0,
        }));

      console.log("Textos detectados en el DXF:", allTexts);
      setDebugTexts(allTexts.slice(0, 10)); // Guardamos los primeros 10 para ver en pantalla

      // 1. Buscamos encabezados con búsqueda flexible (case-insensitive)
      const findHeader = (term) => 
        allTexts.find(t => t.content.toLowerCase().includes(term.toLowerCase()));

      const hItem = findHeader("Item #") || findHeader("Item");
      const hConn = findHeader("Connector") || findHeader("Conn");
      const hOem = findHeader("OEM");

      let tableRows = [];

      if (hItem) {
        const rowTolerance = 5; // Aumentamos un poco la tolerancia de alineación
        const colTolerance = 50; // Tolerancia de ancho de columna

        // Filtrar lo que está debajo del encabezado
        const bodyTexts = allTexts.filter(t => t.y < hItem.y - 1);

        const rowsMap = {};
        bodyTexts.forEach(t => {
          const rowKey = Math.round(t.y / rowTolerance) * rowTolerance;
          if (!rowsMap[rowKey]) rowsMap[rowKey] = {};

          if (Math.abs(t.x - hItem.x) < colTolerance) rowsMap[rowKey].item = t.content;
          if (hConn && Math.abs(t.x - hConn.x) < colTolerance) rowsMap[rowKey].connector = t.content;
          if (hOem && Math.abs(t.x - hOem.x) < colTolerance) rowsMap[rowKey].oemItem = t.content;
        });

        tableRows = Object.values(rowsMap)
          .filter(row => row.item && !isNaN(parseInt(row.item))) // Solo filas donde el Item sea un número
          .sort((a, b) => parseInt(a.item) - parseInt(b.item));
      }

      setAsociadoTable(tableRows);
      setResult({ totalEntities: dxf.entities.length });

    } catch (err) {
      console.error("Error al procesar:", err);
      alert("Error al procesar el DXF. Revisa la consola (F12)");
    }
  }

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif", backgroundColor: "#f4f4f9", minHeight: "100vh" }}>
      <h1>Harness CAD Analyzer 🔍</h1>
      
      <div style={{ marginBottom: "20px", padding: "20px", background: "white", borderRadius: "8px" }}>
        <input type="file" onChange={handleFile} accept=".dxf" />
      </div>

      {asociadoTable.length === 0 && result && (
        <div style={{ color: "red", marginBottom: "20px" }}>
          ⚠️ No se detectó la tabla. Verifica que el archivo tenga un texto llamado "Item #" o "Connector".
          <p>Primeros textos encontrados:</p>
          <ul>{debugTexts.map((t, i) => <li key={i}>"{t.content}" en X:{t.x.toFixed(1)}</li>)}</ul>
        </div>
      )}

      {asociadoTable.length > 0 && (
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
          <h2>Tabla "Asociado"</h2>
          <table border="1" cellPadding="10" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ backgroundColor: "#eee" }}>
              <tr>
                <th>Item #</th>
                <th>Connector</th>
                <th>OEM Item</th>
              </tr>
            </thead>
            <tbody>
              {asociadoTable.map((row, i) => (
                <tr key={i}>
                  <td>{row.item}</td>
                  <td>{row.connector || "-"}</td>
                  <td>{row.oemItem || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
