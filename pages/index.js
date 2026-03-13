import { useState } from "react";
import DxfParser from "dxf-parser";
import * as XLSX from "xlsx"; // Importamos el lector de Excel

export default function Home() {
  const [dxfInfo, setDxfInfo] = useState(null);
  const [asociadoData, setAsociadoData] = useState([]);
  const [fileName, setFileName] = useState({ dxf: "", excel: "" });

  // --- LÓGICA PARA EL EXCEL ---
  const handleExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(prev => ({ ...prev, excel: file.name }));

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0]; // Tomamos la primera hoja
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws); // Convertimos a JSON
      setAsociadoData(data);
    };
    reader.readAsBinaryString(file);
  };

  // --- LÓGICA PARA EL DXF (Simplificada para conteo) ---
  const handleDxf = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(prev => ({ ...prev, dxf: file.name }));

    const text = await file.text();
    const parser = new DxfParser();
    try {
      const dxf = parser.parseSync(text);
      setDxfInfo({
        total: dxf.entities.length,
        layers: Object.keys(dxf.tables.layer.layers).length
      });
    } catch (err) {
      alert("Error al leer el DXF");
    }
  };

  return (
    <div style={{ padding: "30px", fontFamily: "Segoe UI, sans-serif", backgroundColor: "#f4f7f9", minHeight: "100vh" }}>
      <h1 style={{ color: "#2c3e50", textAlign: "center" }}>Harness CAD & Data Analyzer</h1>

      <div style={{ display: "flex", gap: "20px", justifyContent: "center", marginBottom: "30px" }}>
        {/* Card DXF */}
        <div style={cardStyle}>
          <h3>📁 Dibujo DXF</h3>
          <input type="file" onChange={handleDxf} accept=".dxf" />
          {dxfInfo && <p>✅ {dxfInfo.total} entidades detectadas</p>}
        </div>

        {/* Card Excel */}
        <div style={cardStyle}>
          <h3>📊 Tabla Asociado (Excel)</h3>
          <input type="file" onChange={handleExcel} accept=".xlsx, .xls, .csv" />
          {asociadoData.length > 0 && <p>✅ {asociadoData.length} filas cargadas</p>}
        </div>
      </div>

      {/* Vista previa de la tabla */}
      {asociadoData.length > 0 && (
        <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          <h2 style={{ color: "#3498db" }}>Vista Previa: Tabla Asociado</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ backgroundColor: "#3498db", color: "white" }}>
                  {Object.keys(asociadoData[0]).map((key) => (
                    <th key={key} style={thStyle}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {asociadoData.slice(0, 10).map((row, i) => ( // Mostramos las primeras 10 filas
                  <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                    {Object.values(row).map((val, j) => (
                      <td key={j} style={tdStyle}>{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {asociadoData.length > 10 && <p style={{ textAlign: "center", color: "#666" }}>... Mostrando solo las primeras 10 filas ...</p>}
        </div>
      )}
    </div>
  );
}

// Estilos rápidos
const cardStyle = {
  background: "white",
  padding: "20px",
  borderRadius: "12px",
  boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
  width: "350px"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: "10px"
};

const thStyle = { padding: "12px", textAlign: "left", textTransform: "uppercase", fontSize: "13px" };
const tdStyle = { padding: "12px", fontSize: "14px" };
