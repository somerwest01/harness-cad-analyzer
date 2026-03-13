import { useState } from "react";
import DxfParser from "dxf-parser";
import * as XLSX from "xlsx";
import styles from "./Home.module.css";

export default function Home() {
  const [dxfData, setDxfData] = useState(null);
  const [asociadoData, setAsociadoData] = useState([]);
  const [partNumber, setPartNumber] = useState("");
  
  // Estados para controlar la visibilidad de los paneles
  const [isTableVisible, setIsTableVisible] = useState(true);
  const [isDxfPanelVisible, setIsDxfPanelVisible] = useState(true);

  // --- Lógica de Procesamiento de Excel ---
  const handleExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      let rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      const pNumber = rawData[3] ? rawData[3][0] : "Desconocido";
      setPartNumber(pNumber);

      const columnsToDelete = [2, 4, 7, 9, 12, 18, 19, 20];
      const filterColumns = (row) => row.filter((_, index) => !columnsToDelete.includes(index));

      const hRow1 = filterColumns(rawData[4] || []);
      const hRow2 = filterColumns(rawData[5] || []);
      const hRow3 = filterColumns(rawData[6] || []);
      const finalHeader = hRow1.map((_, i) => `${hRow1[i]} ${hRow2[i]} ${hRow3[i]}`.trim().replace(/\s+/g, ' '));

      let dataRows = rawData.slice(7);
      const emptyIdx = dataRows.findIndex(r => r.every(c => c === ""));
      if (emptyIdx !== -1) dataRows = dataRows.slice(0, emptyIdx);

      const formatted = dataRows.map((row) => {
        const filtered = filterColumns(row);
        const obj = { "Status": "⏳ Pendiente" };
        finalHeader.forEach((h, i) => { obj[h || `Col_${i}`] = filtered[i] || ""; });
        return obj;
      });

      setAsociadoData(formatted);
    };
    reader.readAsBinaryString(file);
  };

  // --- LÓGICA DE VALIDACIÓN DXF vs EXCEL ---
  const handleDxf = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const parser = new DxfParser();
    try {
      const dxf = parser.parseSync(text);
      
      // 1. Extraer todos los textos del DXF (limpios)
      const dxfTexts = dxf.entities
        .filter(ent => ent.type === "TEXT" || ent.type === "MTEXT")
        .map(ent => (ent.text || ent.string || "").trim().toUpperCase());

      // 2. Identificar la columna que contiene el nombre del conector
      // Normalmente es la segunda columna después de Status (índice 1 en las llaves)
      const keys = Object.keys(asociadoData[0] || {});
      const connectorKey = keys[2]; // Ajusta este índice si el nombre del conector está en otra columna

      // 3. Actualizar el estatus de la tabla
      const updatedData = asociadoData.map(row => {
        const connectorName = String(row[connectorKey]).trim().toUpperCase();
        
        // Si el nombre del conector existe en los textos del DXF
        const found = dxfTexts.some(t => t.includes(connectorName) && connectorName !== "");

        return {
          ...row,
          "Status": found ? "✅ Encontrado" : "❌ No en dibujo"
        };
      });

      setAsociadoData(updatedData);
      setDxfData({
        total: dxf.entities.length,
        textEntities: dxfTexts.length,
        layers: Object.keys(dxf.tables.layer.layers)
      });

    } catch (err) {
      alert("Error al procesar el DXF");
      console.error(err);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Harness CAD & Data Analyzer</h1>

      <div className={styles.cardsContainer}>
        <div className={styles.card}>
          <h3>📁 Dibujo DXF</h3>
          <input type="file" onChange={handleDxf} accept=".dxf" />
        </div>
        <div className={styles.card}>
          <h3>📊 Tabla Asociado (Excel)</h3>
          <input type="file" onChange={handleExcel} accept=".xlsx, .xls" />
        </div>
      </div>

      {/* PANEL 1: ASOCIADO */}
      {asociadoData.length > 0 && (
        <div className={styles.tableContainer}>
          <div className={styles.collapsibleHeader} onClick={() => setIsTableVisible(!isTableVisible)}>
            <span>📊 Tabla Asociado: <b>{partNumber}</b></span>
            <span>{isTableVisible ? "▲" : "▼"}</span>
          </div>
          {isTableVisible && (
            <div className={styles.scrollArea}>
              <table className={styles.table}>
                <thead>
                  <tr>{Object.keys(asociadoData[0]).map(k => <th key={k}>{k}</th>)}</tr>
                </thead>
                <tbody>
                  {asociadoData.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((val, j) => (
                        <td key={j} style={{ color: val.includes("✅") ? "green" : val.includes("❌") ? "red" : "inherit" }}>
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PANEL 2: DIBUJO (DXF) */}
      {dxfData && (
        <div className={styles.tableContainer} style={{ marginTop: '20px' }}>
          <div className={styles.collapsibleHeader} style={{ backgroundColor: '#2ecc71' }} onClick={() => setIsDxfPanelVisible(!isDxfPanelVisible)}>
            <span>📐 Análisis del Dibujo</span>
            <span>{isDxfPanelVisible ? "▲" : "▼"}</span>
          </div>
          {isDxfPanelVisible && (
            <div className={styles.scrollArea} style={{ padding: '20px' }}>
              <p><b>Entidades totales:</b> {dxfData.total}</p>
              <p><b>Textos detectados:</b> {dxfData.textEntities}</p>
              <p><b>Capas encontradas:</b> {dxfData.layers.join(", ")}</p>
              <div style={{ marginTop: '10px', padding: '10px', background: '#f8f9fa', borderRadius: '5px' }}>
                <small>La validación se realizó comparando los nombres de conectores del Excel contra todos los elementos de texto del dibujo.</small>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
