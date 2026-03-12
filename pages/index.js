import { useState } from "react";
import DxfParser from "dxf-parser";

export default function Home() {
  const [result, setResult] = useState(null);
  const [asociadoTable, setAsociadoTable] = useState([]);

  // Función para limpiar basura de formato en MTEXT (ej: \P, \fArial|b0...)
  const cleanText = (str) => {
    if (!str) return "";
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
          layer: t.layer
        }));

      // 1. Identificar coordenadas X de las columnas de la tabla "Asociado"
      const headers = {
        itemNum: allTexts.find(t => t.content.includes("Item #")),
        connector: allTexts.find(t => t.content.includes("Connector") && !t.content.includes("OEM")),
        oemItem: allTexts.find(t => t.content.includes("Connector OEM Item")),
      };

      let tableRows = [];

      if (headers.itemNum) {
        const rowTolerance = 2; // Tolerancia para considerar que están en la misma fila
        const colTolerance = 10; // Tolerancia para alineación de columna

        // 2. Filtrar textos que están debajo del encabezado "Item #"
        const bodyTexts = allTexts.filter(t => t.y < headers.itemNum.y - 1);

        // 3. Agrupar por filas usando la coordenada Y
        const rowsMap = {};
        bodyTexts.forEach(t => {
          // Agrupamos filas redondeando Y para absorber pequeñas variaciones
          const rowKey = Math.round(t.y / rowTolerance) * rowTolerance;
          if (!rowsMap[rowKey]) rowsMap[rowKey] = {};

          // Asignar a columna según cercanía en X
          if (Math.abs(t.x - headers.itemNum.x) < colTolerance) rowsMap[rowKey].item = t.content;
          if (headers.connector && Math.abs(t.x - headers.connector.x) < colTolerance) rowsMap[rowKey].connector = t.content;
          if (headers.oemItem && Math.abs(t.x - headers.oemItem.x) < colTolerance) rowsMap[rowKey].oemItem = t.content;
        });

        // Convertir el mapa a un array y limpiar filas vacías
        tableRows = Object.values(rowsMap)
          .filter(row => row.item) // Solo filas que tengan un número de Item
          .sort((a, b) => parseInt(a.item) - parseInt(b.item));
      }

      setAsociadoTable(tableRows);
      setResult({
        totalEntities: dxf.entities.length,
        textCount: allTexts.length,
      });

    } catch (err) {
      console.error(err);
      alert("Error parsing DXF");
    }
  }

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif", backgroundColor: "#f4f4f9", minHeight: "100vh" }}>
      <h1>Harness CAD Analyzer</h1>
      
      <div style={{ marginBottom: "20px", padding: "20px", background: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
        <p>Selecciona el archivo DXF del arnés:</p>
        <input type="file" onChange={handleFile} accept=".dxf" />
      </div>

      {asociadoTable.length > 0 && (
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
          <h2>Tabla "Asociado" Detectada</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
                <th style={{ padding: "10px" }}>Item #</th>
                <th style={{ padding: "10px" }}>Connector</th>
                <th style={{ padding: "10px" }}>OEM Item</th>
              </tr>
            </thead>
            <tbody>
              {asociadoTable.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "10px" }}>{row.item}</td>
                  <td style={{ padding: "10px" }}>{row.connector || "-"}</td>
                  <td style={{ padding: "10px" }}>{row.oemItem || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <p style={{ marginTop: "20px", color: "#666" }}>
          Entidades totales procesadas: {result.totalEntities}
        </p>
      )}
    </div>
  );
}
