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
      const hLock = allTexts.find(t => t.content === "LOCK");
      const hCav = allTexts.find(t => t.content === "CAVITIES");

      let finalRows = [];

      if (hItem) {
        const rowsMap = {};
        const rowTolerance = 10; // Margen para agrupar textos en la misma fila
        const colTolerance = 60; // Margen para alineación vertical de columna

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

        // Filtrar solo filas con número de item y ordenar
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
    <div style={{ padding: "40px", fontFamily: "Segoe UI, sans-serif", backgroundColor: "#f0f2f5", minHeight: "100vh" }}>
      <h1 style={{ color: "#1a73e8", textAlign: "center" }}>Harness CAD Analyzer</h1>
      
      <div style={{ background: "white", padding: "30px", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", marginBottom: "30px", maxWidth: "800px", margin: "0 auto 30px" }}>
        <label style={{ display: "block", marginBottom: "10px", fontWeight: "bold" }}>Seleccionar dibujo DXF:</label>
        <input type="file" onChange={handleFile} accept=".dxf" style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "4px" }} />
      </div>

      {asociadoTable.length > 0 && (
        <div style={{ background: "white", borderRadius: "12px", overflow: "hidden", boxShadow: "0 10px 15px rgba(0,0,0,0.1)", maxWidth: "1000px", margin: "0 auto" }}>
          <div style={{ padding: "20px", backgroundColor: "#1a73e8", color: "white" }}>
            <h2 style={{ margin: 0 }}>Listado de Componentes (Asociado)</h2>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f8f9fa", textAlign: "left" }}>
                <th style={{ padding: "15px", borderBottom: "2px solid #dee2e6" }}>ITEM #</th>
                <th style={{ padding: "15px", borderBottom: "2px solid #dee2e6" }}>CONNECTOR</th>
                <th style={{ padding: "15px", borderBottom: "2px solid #dee2e6" }}>OEM ITEM</th>
                <th style={{ padding: "15px", borderBottom: "2px solid #dee2e6" }}>LOCK</th>
                <th style={{ padding: "15px", borderBottom: "2px solid #dee2e6" }}>CAVITIES</th>
              </tr>
            </thead>
            <tbody>
              {asociadoTable.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee", transition: "background 0.2s" }}>
                  <td style={{ padding: "15px", fontWeight: "bold", color: "#1a73e8" }}>{row.item}</td>
                  <td style={{ padding: "15px" }}>{row.connector || "-"}</td>
                  <td style={{ padding: "15px" }}>{row.oemItem || "-"}</td>
                  <td style={{ padding: "15px" }}>{row.lock || "-"}</td>
                  <td style={{ padding: "15px" }}>{row.cavities || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
