import React, { useState, useEffect, useRef } from "react";
import DxfParser from "dxf-parser";
import * as XLSX from "xlsx";
import styles from "./Home.module.css";

// --- VISOR PARA DIBUJOS EXPLOTADOS ---
function DxfCanvas({ dxfRaw }) {
  const canvasRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

useEffect(() => {
  if (!dxfRaw || !canvasRef.current) return;
  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");

  // 1. Límites exactos del dibujo (según tu archivo 700176.dxf)
  const minX = 1413.27;
  const maxX = 2047.99;
  const minY = 481.35;
  const maxY = 777.74;

  const dxfWidth = maxX - minX;
  const dxfHeight = maxY - minY;

  // 2. Definir un margen (p.ej. 10% del espacio)
  const padding = 40;
  const availableWidth = canvas.width - padding * 2;
  const availableHeight = canvas.height - padding * 2;

  // 3. Calcular escala para que quepa en ancho O alto (lo que sea más restrictivo)
  const scaleX = availableWidth / dxfWidth;
  const scaleY = availableHeight / dxfHeight;
  const newScale = Math.min(scaleX, scaleY);

  setScale(newScale);

  // 4. Centrar el dibujo
  // El centro del DXF es (minX + dxfWidth / 2)
  // Queremos que ese punto coincida con el centro del canvas (canvas.width / 2)
  setOffset({
    x: (canvas.width / 2) - (minX + dxfWidth / 2) * newScale,
    // En Canvas, Y crece hacia abajo, en DXF hacia arriba. 
    // Usamos el centro y sumamos porque el dibujo está invertido
    y: (canvas.height / 2) + (minY + dxfHeight / 2) * newScale 
  });

}, [dxfRaw]);

  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dX = (x) => x * scale + offset.x;
    const dY = (y) => canvas.height - (y * scale + (canvas.height - offset.y));

    dxfRaw.entities.forEach(ent => {
      try {
        // Estilo para el marco y líneas
        ctx.lineWidth = ent.type === 'LWPOLYLINE' ? 2 : 1.2; 
        ctx.strokeStyle = "#2c3e50";

        if (ent.type === 'LINE' && ent.start && ent.end) {
          ctx.beginPath();
          ctx.moveTo(dX(ent.start.x), dY(ent.start.y));
          ctx.lineTo(dX(ent.end.x), dY(ent.end.y));
          ctx.stroke();
        } 
        else if (ent.vertices && ent.vertices.length > 1) {
          ctx.beginPath();
          ent.vertices.forEach((v, i) => {
            if (i === 0) ctx.moveTo(dX(v.x), dY(v.y));
            else ctx.lineTo(dX(v.x), dY(v.y));
          });
          if (ent.shape) ctx.closePath(); // Cierra el rectángulo del marco
          ctx.stroke();
        }
        else if ((ent.type === 'ARC' || ent.type === 'CIRCLE') && ent.center) {
          ctx.beginPath();
          const sA = ent.type === 'ARC' ? (360 - ent.endAngle) * Math.PI / 180 : 0;
          const eA = ent.type === 'ARC' ? (360 - ent.startAngle) * Math.PI / 180 : 2 * Math.PI;
          ctx.arc(dX(ent.center.x), dY(ent.center.y), ent.radius * scale, sA, eA, false);
          ctx.stroke();
        }
        else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
          const p = ent.start || ent.position;
          if (p && Math.abs(p.x) > 1) {
            const txt = (ent.text || ent.string || "").replace(/\{.*?\}/g, "").replace(/\\P/g, " ").trim();
            if (txt && txt !== "0") {
              ctx.fillStyle = "#e67e22";
              ctx.font = `bold ${Math.max(10, (ent.height || 2.5) * scale)}px Arial`;
              ctx.fillText(txt, dX(p.x), dY(p.y));
            }
          }
        }
      } catch (e) {}
    });
  }, [dxfRaw, scale, offset]);

  // Handlers de Mouse (Zoom y Pan)
const handleWheel = (e) => {
    e.preventDefault();
    const factor = Math.pow(1.1, -e.deltaY / 400);
    const rect = canvasRef.current.getBoundingClientRect();
    const mX = e.clientX - rect.left;
    const mY = e.clientY - rect.top;
    setOffset(prev => ({ x: mX - (mX - prev.x) * factor, y: mY - (mY - prev.y) * factor }));
    setScale(s => s * factor);
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setOffset(prev => ({ x: prev.x + (e.clientX - lastMousePos.x), y: prev.y + (e.clientY - lastMousePos.y) }));
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };
  

return (
    <div style={{ border: '1px solid #333', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
      <canvas 
        ref={canvasRef} width={2400} height={1200} 
        onWheel={handleWheel}
        onMouseDown={(e) => { setIsDragging(true); setLastMousePos({ x: e.clientX, y: e.clientY }); }}
        onMouseMove={(e) => {
          if (!isDragging) return;
          setOffset(prev => ({ x: prev.x + (e.clientX - lastMousePos.x), y: prev.y + (e.clientY - lastMousePos.y) }));
          setLastMousePos({ x: e.clientX, y: e.clientY });
        }}
        onMouseUp={() => setIsDragging(false)}
        style={{ width: '100%', height: '750px', cursor: 'grab' }} 
      />
    </div>
  );
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
