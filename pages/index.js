import React, { useState, useEffect, useRef } from "react";
import DxfParser from "dxf-parser";
import * as XLSX from "xlsx";
import styles from "./Home.module.css";

// --- VISOR PARA DIBUJOS EXPLOTADOS ---
function DxfCanvas({ dxfRaw }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!dxfRaw || !dxfRaw.entities || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // 1. Cálculo de límites (Bounding Box) de alta precisión
    dxfRaw.entities.forEach(ent => {
      const points = [];
      if (ent.vertices) points.push(...ent.vertices);
      if (ent.start) { points.push(ent.start); points.push(ent.end); }
      if (ent.position) points.push(ent.position);
      if (ent.center) {
        const r = ent.radius || 0;
        points.push({ x: ent.center.x - r, y: ent.center.y - r });
        points.push({ x: ent.center.x + r, y: ent.center.y + r });
      }

      points.forEach(p => {
        // Ignorar basura en el origen 0,0 si el dibujo es grande
        if (Math.abs(p.x) < 0.001 && Math.abs(p.y) < 0.001 && dxfRaw.entities.length > 50) return;
        if (!isNaN(p.x) && !isNaN(p.y)) {
          minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        }
      });
    });

    if (minX === Infinity) return;

    const width = maxX - minX;
    const height = maxY - minY;
    const padding = 120; // Espacio extra para que no se corte el texto
    const scale = Math.min((canvas.width - padding) / (width || 1), (canvas.height - padding) / (height || 1));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const tX = (x) => (x - minX) * scale + padding / 2;
    const tY = (y) => canvas.height - ((y - minY) * scale + padding / 2);

    // 2. Dibujado de entidades explotadas
    dxfRaw.entities.forEach(ent => {
      ctx.beginPath();
      ctx.strokeStyle = "#2c3e50";
      ctx.lineWidth = 1;

      try {
        if (ent.type === 'LINE' && ent.start && ent.end) {
          ctx.moveTo(tX(ent.start.x), tY(ent.start.y));
          ctx.lineTo(tX(ent.end.x), tY(ent.end.y));
          ctx.stroke();
        } 
        else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices) {
          ent.vertices.forEach((v, i) => {
            if (i === 0) ctx.moveTo(tX(v.x), tY(v.y));
            else ctx.lineTo(tX(v.x), tY(v.y));
          });
          ctx.stroke();
        } 
        else if (ent.type === 'CIRCLE' && ent.center) {
          ctx.arc(tX(ent.center.x), tY(ent.center.y), (ent.radius || 1) * scale, 0, 2 * Math.PI);
          ctx.stroke();
        }
        else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
          ctx.fillStyle = "#e67e22";
          const fSize = Math.max(10, (ent.height || 12) * scale);
          ctx.font = `bold ${fSize}px Arial`;
          const p = ent.position || ent.start || { x: 0, y: 0 };
          const txt = (ent.text || ent.string || "").replace(/\{.*?\}/g, "").replace(/\\P/g, " ");
          ctx.fillText(txt, tX(p.x), tY(p.y));
        }
      } catch (err) {}
    });
  }, [dxfRaw]);

  return <canvas ref={canvasRef} width={1600} height={900} style={{ width: '100%', height: 'auto', background: '#fff', borderRadius: '8px' }} />;
}

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
        
        setPartNumber(raw[3] ? String(raw[3][0]) : "Desconocido");
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
      } catch (err) { alert("Error al leer Excel"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleDxf = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const dxf = new DxfParser().parseSync(text);
      const allTexts = dxf.entities
        .filter(ent => ent.type === "TEXT" || ent.type === "MTEXT")
        .map(ent => (ent.text || ent.string || "").trim().toUpperCase());

      if (asociadoData.length > 0) {
        const keys = Object.keys(asociadoData[0]);
        const connKey = keys[2]; 
        setAsociadoData(prev => prev.map(row => {
          const name = String(row[connKey]).trim().toUpperCase();
          const found = allTexts.some(t => t.includes(name) && name !== "");
          return { ...row, "Status": found ? "✅ Encontrado" : "❌ No en dibujo" };
        }));
      }

      setDxfData({ total: dxf.entities.length, raw: dxf, layers: Object.keys(dxf.tables.layer.layers) });
    } catch (err) { alert("Error al leer DXF"); }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Harness CAD & Data Analyzer</h1>
      
      <div className={styles.cardsContainer}>
        <div className={styles.card}>
          <h3>📁 Dibujo DXF (Explotado)</h3>
          <input type="file" onChange={handleDxf} accept=".dxf" />
        </div>
        <div className={styles.card}>
          <h3>📊 Excel Asociado</h3>
          <input type="file" onChange={handleExcel} accept=".xlsx, .xls" />
        </div>
      </div>

      {asociadoData.length > 0 && (
        <div className={styles.tableContainer}>
          <div className={styles.collapsibleHeader} onClick={() => setIsTableVisible(!isTableVisible)}>
            <span>📊 Tabla Asociado: <b>{partNumber}</b></span>
            <span>{isTableVisible ? "▲" : "▼"}</span>
          </div>
          {isTableVisible && (
            <div className={styles.scrollArea}>
              <table className={styles.table}>
                <thead><tr>{Object.keys(asociadoData[0]).map(k => <th key={k}>{k}</th>)}</tr></thead>
                <tbody>
                  {asociadoData.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => {
                        // FIX: Convertimos v a String para evitar el error .includes
                        const valStr = String(v);
                        const isOk = valStr.includes("✅");
                        const isNok = valStr.includes("❌");
                        return (
                          <td key={j} style={{ color: isOk ? "green" : isNok ? "red" : "inherit", fontWeight: (isOk || isNok) ? "bold" : "normal" }}>
                            {valStr}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {dxfData && dxfData.raw && (
        <div className={styles.tableContainer} style={{ marginBottom: '40px' }}>
          <div className={styles.collapsibleHeader} style={{ backgroundColor: '#9b59b6' }} onClick={() => setIsCanvasVisible(!isCanvasVisible)}>
            <span>🖼️ Vista Previa del Arnés</span>
            <span>{isCanvasVisible ? "▲" : "▼"}</span>
          </div>
          {isCanvasVisible && (
            <div style={{ padding: '20px', background: '#ecf0f1' }}>
              <DxfCanvas dxfRaw={dxfData.raw} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
