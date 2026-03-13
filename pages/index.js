import React, { useState, useEffect, useRef } from "react";
import DxfParser from "dxf-parser";
import * as XLSX from "xlsx";
import styles from "./Home.module.css";

// --- COMPONENTE DEL VISOR BLINDADO ---
function DxfCanvas({ dxfRaw }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!dxfRaw || !dxfRaw.entities || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const entities = dxfRaw.entities;
    const blocks = dxfRaw.blocks || {}; 

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // 1. Cálculo de límites (Bounding Box) corregido para desplazamientos
    const growBounds = (v, offX = 0, offY = 0) => {
      if (v && typeof v.x === 'number' && typeof v.y === 'number') {
        const realX = v.x + offX;
        const realY = v.y + offY;
        minX = Math.min(minX, realX); minY = Math.min(minY, realY);
        maxX = Math.max(maxX, realX); maxY = Math.max(maxY, realY);
      }
    };

    const processEntityForBounds = (ent, offX = 0, offY = 0) => {
      if (!ent) return;
      if (ent.vertices) ent.vertices.forEach(v => growBounds(v, offX, offY));
      if (ent.start) { growBounds(ent.start, offX, offY); growBounds(ent.end, offX, offY); }
      if (ent.center) {
        growBounds({ x: ent.center.x - ent.radius, y: ent.center.y - ent.radius }, offX, offY);
        growBounds({ x: ent.center.x + ent.radius, y: ent.center.y + ent.radius }, offX, offY);
      }
      if (ent.type === 'INSERT' && blocks[ent.name] && blocks[ent.name].entities) {
        // Los bloques se desplazan según su posición de inserción
        const insX = ent.position ? ent.position.x : 0;
        const insY = ent.position ? ent.position.y : 0;
        blocks[ent.name].entities.forEach(sub => processEntityForBounds(sub, offX + insX, offY + insY));
      }
    };

    entities.forEach(ent => processEntityForBounds(ent));
    if (minX === Infinity) return;

    const width = maxX - minX;
    const height = maxY - minY;
    const padding = 100; // Más margen para ver bien los textos
    const scale = Math.min((canvas.width - padding) / (width || 1), (canvas.height - padding) / (height || 1));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const tX = (x) => (x - minX) * scale + padding / 2;
    const tY = (y) => canvas.height - ((y - minY) * scale + padding / 2);

    // 2. Función de dibujado con recursividad de posición real
    const drawEntity = (ent, offX = 0, offY = 0) => {
      if (!ent) return;
      ctx.beginPath();
      ctx.strokeStyle = "#2c3e50";
      ctx.lineWidth = 1;
      
      try {
        const x1 = ent.start ? ent.start.x + offX : 0;
        const y1 = ent.start ? ent.start.y + offY : 0;
        const x2 = ent.end ? ent.end.x + offX : 0;
        const y2 = ent.end ? ent.end.y + offY : 0;

        if (ent.type === 'LINE') {
          ctx.moveTo(tX(x1), tY(y1));
          ctx.lineTo(tX(x2), tY(y2));
          ctx.stroke();
        } 
        else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices) {
          ent.vertices.forEach((v, i) => {
            if (i === 0) ctx.moveTo(tX(v.x + offX), tY(v.y + offY));
            else ctx.lineTo(tX(v.x + offX), tY(v.y + offY));
          });
          ctx.stroke();
        } 
        else if (ent.type === 'CIRCLE' && ent.center) {
          ctx.arc(tX(ent.center.x + offX), tY(ent.center.y + offY), (ent.radius || 1) * scale, 0, 2 * Math.PI);
          ctx.stroke();
        }
        else if (ent.type === 'MTEXT' || ent.type === 'TEXT') {
          ctx.fillStyle = "#e67e22";
          const fSize = Math.max(8, (ent.height || 10) * scale);
          ctx.font = `bold ${fSize}px Arial`;
          const pX = (ent.position ? ent.position.x : (ent.start ? ent.start.x : 0)) + offX;
          const pY = (ent.position ? ent.position.y : (ent.start ? ent.start.y : 0)) + offY;
          // Limpiar el texto de códigos de formato de AutoCAD (ej: {\fArial|b0...})
          const cleanText = (ent.text || ent.string || "").replace(/\{.*?\}/g, "").replace(/\\P/g, " ").replace(/\^I/g, " ");
          ctx.fillText(cleanText, tX(pX), tY(pY));
        }
        else if (ent.type === 'INSERT' && blocks[ent.name] && blocks[ent.name].entities) {
          const insX = ent.position ? ent.position.x : 0;
          const insY = ent.position ? ent.position.y : 0;
          blocks[ent.name].entities.forEach(sub => drawEntity(sub, offX + insX, offY + insY));
        }
      } catch (e) { }
    };

    entities.forEach(ent => drawEntity(ent));
  }, [dxfRaw]);

  return <canvas ref={canvasRef} width={1500} height={800} style={{ width: '100%', height: 'auto', background: '#fff', borderRadius: '8px', border: '1px solid #ddd' }} />;
}

// --- APP PRINCIPAL ---
export default function Home() {
  const [dxfData, setDxfData] = useState(null);
  const [asociadoData, setAsociadoData] = useState([]);
  const [partNumber, setPartNumber] = useState("");
  const [isTableVisible, setIsTableVisible] = useState(true);
  const [isDxfPanelVisible, setIsDxfPanelVisible] = useState(true);
  const [isCanvasVisible, setIsCanvasVisible] = useState(true);

  const handleExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        let raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        
        setPartNumber(raw[3] ? raw[3][0] : "Desconocido");
        const colsDel = [2, 4, 7, 9, 12, 18, 19, 20];
        const filter = (r) => r.filter((_, i) => !colsDel.includes(i));
        
        const h1 = filter(raw[4] || []), h2 = filter(raw[5] || []), h3 = filter(raw[6] || []);
        const headers = h1.map((_, i) => `${h1[i]} ${h2[i]} ${h3[i]}`.trim().replace(/\s+/g, ' '));
        
        let rows = raw.slice(7);
        const endIdx = rows.findIndex(r => r.every(c => c === ""));
        if (endIdx !== -1) rows = rows.slice(0, endIdx);

        const formatted = rows.map(r => {
          const f = filter(r);
          const obj = { "Status": "⏳ Pendiente" };
          headers.forEach((h, i) => { obj[h || `Col_${i}`] = f[i] || ""; });
          return obj;
        });
        setAsociadoData(formatted);
      } catch (err) { alert("Error en Excel"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleDxf = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parser = new DxfParser();
      const dxf = parser.parseSync(text);
      
      const texts = dxf.entities
        .filter(ent => ent.type === "TEXT" || ent.type === "MTEXT")
        .map(ent => (ent.text || ent.string || "").trim().toUpperCase());

      if (asociadoData.length > 0) {
        const keys = Object.keys(asociadoData[0]);
        const connKey = keys[2]; 
        setAsociadoData(prev => prev.map(row => {
          const name = String(row[connKey]).trim().toUpperCase();
          const found = texts.some(t => t.includes(name) && name !== "");
          return { ...row, "Status": found ? "✅ Encontrado" : "❌ No en dibujo" };
        }));
      }

      setDxfData({
        total: dxf.entities.length,
        raw: dxf,
        textEntities: texts.length,
        layers: Object.keys(dxf.tables.layer.layers)
      });
    } catch (err) { 
      console.error(err);
      alert("Error al procesar el DXF. Intenta con otro archivo."); 
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Harness CAD & Data Analyzer</h1>
      <div className={styles.cardsContainer}>
        <div className={styles.card}>
          <h3>📁 Dibujo DXF</h3>
          <input type="file" onChange={handleDxf} accept=".dxf" />
          {dxfData && <p className={styles.statusOk}>✅ Cargado</p>}
        </div>
        <div className={styles.card}>
          <h3>📊 Excel</h3>
          <input type="file" onChange={handleExcel} accept=".xlsx, .xls" />
          {asociadoData.length > 0 && <p className={styles.statusOk}>✅ Cargado</p>}
        </div>
      </div>

      {asociadoData.length > 0 && (
        <div className={styles.tableContainer}>
          <div className={styles.collapsibleHeader} onClick={() => setIsTableVisible(!isTableVisible)}>
            <span>📊 Tabla: <b>{partNumber}</b></span>
            <span>{isTableVisible ? "▲" : "▼"}</span>
          </div>
          {isTableVisible && (
            <div className={styles.scrollArea}>
              <table className={styles.table}>
                <thead><tr>{Object.keys(asociadoData[0]).map(k => <th key={k}>{k}</th>)}</tr></thead>
                <tbody>
                  {asociadoData.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => (
                        <td key={j} style={{ color: String(v).includes("✅") ? "green" : String(v).includes("❌") ? "red" : "inherit" }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {dxfData && (
        <div className={styles.tableContainer}>
          <div className={styles.collapsibleHeader} style={{ backgroundColor: '#27ae60' }} onClick={() => setIsDxfPanelVisible(!isDxfPanelVisible)}>
            <span>📐 Análisis DXF</span>
            <span>{isDxfPanelVisible ? "▲" : "▼"}</span>
          </div>
          {isDxfPanelVisible && <div style={{ padding: '20px' }}>
            <p>Entidades detectadas: {dxfData.total}</p>
            <p>Capas: {dxfData.layers.length}</p>
          </div>}
        </div>
      )}

      {dxfData && dxfData.raw && (
        <div className={styles.tableContainer} style={{ marginBottom: '40px' }}>
          <div className={styles.collapsibleHeader} style={{ backgroundColor: '#9b59b6' }} onClick={() => setIsCanvasVisible(!isCanvasVisible)}>
            <span>🖼️ Vista Previa del Dibujo</span>
            <span>{isCanvasVisible ? "▲" : "▼"}</span>
          </div>
          {isCanvasVisible && <div style={{ padding: '20px', background: '#ecf0f1' }}>
            <DxfCanvas dxfRaw={dxfData.raw} />
          </div>}
        </div>
      )}
    </div>
  );
}
