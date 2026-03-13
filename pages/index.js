import React, { useState, useEffect, useRef } from "react";
import DxfParser from "dxf-parser";
import * as XLSX from "xlsx";
import styles from "./Home.module.css";

// --- COMPONENTE DEL VISOR (Dibuja el DXF en un Canvas) ---
function DxfCanvas({ entities }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!entities || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    // 1. Calcular límites (Bounding Box) para centrar y escalar
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    entities.forEach(e => {
      const points = [];
      if (e.vertices) points.push(...e.vertices);
      if (e.start) points.push(e.start);
      if (e.end) points.push(e.end);

      points.forEach(v => {
        minX = Math.min(minX, v.x); minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y);
      });
    });

    const width = maxX - minX;
    const height = maxY - minY;
    const padding = 40;
    
    // Evitar división por cero si el dibujo está vacío
    const scale = width > 0 && height > 0 
      ? Math.min((canvas.width - padding) / width, (canvas.height - padding) / height) 
      : 1;

    // 2. Dibujar en el Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#2c3e50";
    ctx.lineWidth = 1;

    entities.forEach(e => {
      ctx.beginPath();
      if (e.type === 'LINE' && e.start && e.end) {
        ctx.moveTo((e.start.x - minX) * scale + padding/2, canvas.height - ((e.start.y - minY) * scale + padding/2));
        ctx.lineTo((e.end.x - minX) * scale + padding/2, canvas.height - ((e.end.y - minY) * scale + padding/2));
      } else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices) {
        e.vertices.forEach((v, i) => {
          const px = (v.x - minX) * scale + padding/2;
          const py = canvas.height - ((v.y - minY) * scale + padding/2);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
      }
      ctx.stroke();
    });
  }, [entities]);

  return (
    <canvas 
      ref={canvasRef} 
      width={800} 
      height={400} 
      style={{ width: '100%', background: '#ffffff', borderRadius: '8px', border: '1px solid #ddd' }} 
    />
  );
}

// --- COMPONENTE PRINCIPAL ---
export default function Home() {
  const [dxfData, setDxfData] = useState(null);
  const [asociadoData, setAsociadoData] = useState([]);
  const [partNumber, setPartNumber] = useState("");
  
  // Estados de visibilidad
  const [isTableVisible, setIsTableVisible] = useState(true);
  const [isDxfPanelVisible, setIsDxfPanelVisible] = useState(true);
  const [isCanvasVisible, setIsCanvasVisible] = useState(true);

  // --- Manejador de Excel ---
  const handleExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        let rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        // Extraer número de parte (A4)
        const pNumber = rawData[3] ? rawData[3][0] : "Desconocido";
        setPartNumber(pNumber);

        // Filtro de columnas (Eliminar C, E, H, J, M, S, T, U)
        const columnsToDelete = [2, 4, 7, 9, 12, 18, 19, 20];
        const filterColumns = (row) => row.filter((_, index) => !columnsToDelete.includes(index));

        // Encabezados combinados (Filas 5, 6, 7)
        const hRow1 = filterColumns(rawData[4] || []);
        const hRow2 = filterColumns(rawData[5] || []);
        const hRow3 = filterColumns(rawData[6] || []);
        const finalHeader = hRow1.map((_, i) => `${hRow1[i]} ${hRow2[i]} ${hRow3[i]}`.trim().replace(/\s+/g, ' '));

        // Datos (Fila 8 en adelante) y corte por fila vacía
        let dataRows = rawData.slice(7);
        const emptyIdx = dataRows.findIndex(r => r.every(c => c === ""));
        if (emptyIdx !== -1) dataRows = dataRows.slice(0, emptyIdx);

        const formatted = dataRows.map((row) => {
          const filtered = filterColumns(row);
          const obj = { "Status": "⏳ Pendiente" };
          finalHeader.forEach((h, i) => { 
            const colName = h || `Col_${i}`;
            obj[colName] = filtered[i] || ""; 
          });
          return obj;
        });

        setAsociadoData(formatted);
      } catch (err) {
        alert("Error al procesar el Excel. Verifica el formato.");
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- Manejador de DXF y Validación ---
  const handleDxf = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const parser = new DxfParser();
    try {
      const dxf = parser.parseSync(text);
      
      const dxfTexts = dxf.entities
        .filter(ent => ent.type === "TEXT" || ent.type === "MTEXT")
        .map(ent => (ent.text || ent.string || "").trim().toUpperCase());

      // Si ya hay datos de Excel, validamos
      if (asociadoData.length > 0) {
        const keys = Object.keys(asociadoData[0]);
        const connectorKey = keys[2]; // Asumimos que la 3ra columna es el nombre del conector

        const updatedData = asociadoData.map(row => {
          const connectorName = String(row[connectorKey]).trim().toUpperCase();
          const found = dxfTexts.some(t => t.includes(connectorName) && connectorName !== "");
          return {
            ...row,
            "Status": found ? "✅ Encontrado" : "❌ No en dibujo"
          };
        });
        setAsociadoData(updatedData);
      }

      setDxfData({
        total: dxf.entities.length,
        entities: dxf.entities,
        textEntities: dxfTexts.length,
        layers: Object.keys(dxf.tables.layer.layers)
      });

    } catch (err) {
      alert("Error al leer el archivo DXF.");
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Harness CAD & Data Analyzer</h1>

      <div className={styles.cardsContainer}>
        <div className={styles.card}>
          <h3>📁 Dibujo DXF</h3>
          <input type="file" onChange={handleDxf} accept=".dxf" />
          {dxfData && <p className={styles.statusOk}>✅ Dibujo cargado</p>}
        </div>
        <div className={styles.card}>
          <h3>📊 Tabla Asociado (Excel)</h3>
          <input type="file" onChange={handleExcel} accept=".xlsx, .xls" />
          {asociadoData.length > 0 && <p className={styles.statusOk}>✅ Excel cargado</p>}
        </div>
      </div>

      {/* PANEL 1: TABLA ASOCIADO */}
      {asociadoData.length > 0 && (
        <div className={styles.tableContainer}>
          <div className={styles.collapsibleHeader} onClick={() => setIsTableVisible(!isTableVisible)}>
            <span>📊 Tabla Asociado: <b>{partNumber}</b></span>
            <span>{isTableVisible ? "▲ Contraer" : "▼ Expandir"}</span>
          </div>
          {isTableVisible && (
            <div className={styles.scrollArea}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {Object.keys(asociadoData[0]).map(k => <th key={k}>{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {asociadoData.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((val, j) => {
                        let cellStyle = {};
                        if (String(val).includes("✅")) cellStyle = { color: "#27ae60", fontWeight: "bold" };
                        if (String(val).includes("❌")) cellStyle = { color: "#e74c3c", fontWeight: "bold" };
                        return <td key={j} style={cellStyle}>{val}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PANEL 2: ANÁLISIS DXF */}
      {dxfData && (
        <div className={styles.tableContainer} style={{ marginTop: '20px' }}>
          <div className={styles.collapsibleHeader} style={{ backgroundColor: '#27ae60' }} onClick={() => setIsDxfPanelVisible(!isDxfPanelVisible)}>
            <span>📐 Análisis del Dibujo</span>
            <span>{isDxfPanelVisible ? "▲" : "▼"}</span>
          </div>
          {isDxfPanelVisible && (
            <div className={styles.scrollArea} style={{ padding: '20px' }}>
              <p><b>Entidades totales:</b> {dxfData.total}</p>
              <p><b>Textos detectados:</b> {dxfData.textEntities}</p>
              <p><b>Capas encontradas:</b> {dxfData.layers.length}</p>
            </div>
          )}
        </div>
      )}

      {/* PANEL 3: VISTA PREVIA GRÁFICA */}
      {dxfData && dxfData.entities && (
        <div className={styles.tableContainer} style={{ marginTop: '20px', marginBottom: '40px' }}>
          <div className={styles.collapsibleHeader} style={{ backgroundColor: '#9b59b6' }} onClick={() => setIsCanvasVisible(!isCanvasVisible)}>
            <span>🖼️ Vista Previa del Arnés</span>
            <span>{isCanvasVisible ? "▲" : "▼"}</span>
          </div>
          {isCanvasVisible && (
            <div style={{ padding: '20px', textAlign: 'center', background: '#ecf0f1' }}>
              <DxfCanvas entities={dxfData.entities} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
