import { useState } from "react";
import DxfParser from "dxf-parser";

export default function Home() {
  const [asociadoTable, setAsociadoTable] = useState([]);
  const [resultInfo, setResultInfo] = useState(null);

  const cleanText = (str) => {
    if (!str) return "";
    // Limpia códigos de formato de AutoCAD (ej: \P o {Arial...})
    return str.replace(/\\P/g, " ").replace(/\{[^}]+\}/g, "").replace(/\\[a-zA-Z0-9]/g, "").trim();
  };

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const parser = new DxfParser();

    try {
      const dxf = parser.parseSync(text);
      
      // Extraemos todos los textos con sus coordenadas
      const allTexts = dxf.entities
        .filter((e) => e.type === "TEXT" || e.type === "MTEXT")
        .map(t => ({
          content: cleanText(t.text || t.string),
          x: t.start?.x || 0,
          y: t.start?.y || 0,
        }));

      // Buscamos los encabezados EXACTOS que vimos en tu consola
      const hItem = allTexts.find(t => t.content === "ITEM #");
      const hConn = allTexts.find(t => t.content === "CONNECTOR");
      const hOem = allTexts.find(t => t.content === "CONNECTOR OEM ITEM");
      // Agregamos posibles nombres para Lock y Cavities
      const hLock = allTexts.find(t => t.content === "LOCK");
      const hCav = allTexts.find(t => t.content === "CAVITIES");

      let finalRows = [];

      if (hItem) {
        const rowsMap = {};
        const rowTolerance = 10; // Margen para textos en la misma fila
        const colTolerance = 60; // Margen para alineación vertical

        // Filtramos textos que están físicamente debajo del encabezado ITEM #
        const bodyTexts = allTexts.filter(t => t.y < hItem.y - 2);

        bodyTexts.forEach(t => {
          const rowKey = Math.round(t.y / rowTolerance) * rowTolerance;
          if (!rowsMap[rowKey]) rowsMap[rowKey] = {};

          // Asignar a columna según su posición X respecto al encabezado
          if (Math.abs(t.x - hItem.x) < colTolerance) rowsMap[rowKey].item = t.content;
          if (hConn && Math.abs(t.x - hConn.x) < colTolerance) rowsMap[rowKey].connector = t.content;
          if (hOem && Math.abs(t.x - hOem.x) < colTolerance) rowsMap[rowKey].oemItem = t.content;
          if (hLock && Math.abs(t.x - hLock.x) < colTolerance) rowsMap[rowKey].lock = t.content;
          if (hCav && Math.abs(t.x - hCav.x) < colTolerance) rowsMap[rowKey].cavities = t.content;
        });

        // Convertir el mapa a array y filtrar solo los que tienen número de item
        finalRows = Object.values(rowsMap)
          .filter(r => r.item && !isNaN(parseInt(r.item)))
          .sort((a, b) => parseInt(a.item) - parseInt(b.item));
      }

      setAsociadoTable(finalRows);
      setResultInfo({
        total: dxf.entities.length,
        texts: allTexts.length
      });

    } catch (err) {
      console.error(err);
      alert("Error al procesar el DXF");
    }
  }

  return (
    <div style={{ padding: "40px", fontFamily: "Segoe UI, Tahoma, sans-serif", backgroundColor: "#f8f9fa", minHeight: "100vh" }}>
      <h1 style={{ color: "#0d6efd" }}>Harness CAD Analyzer</h1>
      
      <div style={{ background: "white", padding: "20px", borderRadius: "10px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", marginBottom: "30px" }}>
        <p style={{ fontWeight: "bold" }}>Cargar archivo DXF:</p>
        <input type="file" onChange={handleFile} accept=".dxf" />
      </div>

      {asociadoTable.length > 0 ? (
        <div style={{ background: "white", borderRadius: "10px", overflow: "hidden", boxShadow: "0 4px 15px rgba(0,0,0,0.1)" }}>
          <div style={{ padding: "15px", backgroundColor: "#0d6efd", color: "white" }}>
            <h2 style={{ margin: 0 }}>Tabla Detectada: ASOCIADO</h2>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#e9ecef", textAlign: "left" }}>
                <th style={{ padding: "12px", borderBottom: "2px solid #dee2e6" }}>ITEM #</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #dee2e6" }}>CONNECTOR</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #dee2e6" }}>CONNECTOR OEM ITEM</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #dee2e6" }}>LOCK</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #dee2e6" }}>CAVITIES</th>
              </tr>
            </thead>
            <tbody>
              {asociadoTable.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #dee2e6" }}>
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
      ) : resultInfo && (
        <div style={{ color: "#dc3545", padding: "20px", background: "#f8d7da", borderRadius: "8px" }}>
          ⚠️ Se procesó el archivo pero no se pudo estructurar la tabla. Revisa que los encabezados sean correctos.
        </div>
      )}
    </div>
  );
}
