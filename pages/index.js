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

    // Límites específicos de tu archivo 700176.dxf
    const minX = 1413.27, maxX = 2047.99;
    const minY = 481.35, maxY = 777.74;

    const width = maxX - minX;
    const height = maxY - minY;

    const initialScale = Math.min((canvas.width * 0.8) / width, (canvas.height * 0.8) / height);

    setScale(initialScale);
    setOffset({
      x: (canvas.width / 2) - (minX + width / 2) * initialScale,
      y: (canvas.height / 2) + (minY + height / 2) * initialScale
    });
  }, [dxfRaw]);

  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    const dX = (x) => x * scale + offset.x;
    const dY = (y) => canvasRef.current.height - (y * scale + (canvasRef.current.height - offset.y));

    const drawEnt = (ent, basePos = { x: 0, y: 0 }) => {
      // --- PROTECCIÓN CRÍTICA: Validar que la entidad existe ---
      if (!ent) return;

      const getX = (p) => p ? dX(p.x + (basePos.x || 0)) : 0;
      const getY = (p) => p ? dY(p.y + (basePos.y || 0)) : 0;

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#2c3e50";

      // LÍNEAS (Con validación de start y end)
      if (ent.type === 'LINE' && ent.start && ent.end) {
        ctx.beginPath();
        ctx.moveTo(getX(ent.start), getY(ent.start));
        ctx.lineTo(getX(ent.end), getY(ent.end));
        ctx.stroke();
      } 
      // POLILÍNEAS
      else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices) {
        ctx.beginPath();
        ent.vertices.forEach((v, i) => {
          if (v) {
            if (i === 0) ctx.moveTo(getX(v), getY(v));
            else ctx.lineTo(getX(v), getY(v));
          }
        });
        ctx.stroke();
      }
      // ARCOS
      else if (ent.type === 'ARC' && ent.center) {
        ctx.beginPath();
        const sA = (360 - ent.endAngle) * Math.PI / 180;
        const eA = (360 - ent.startAngle) * Math.PI / 180;
        ctx.arc(dX(ent.center.x + (basePos.x || 0)), dY(ent.center.y + (basePos.y || 0)), (ent.radius || 0) * scale, sA, eA, false);
        ctx.stroke();
      }
      // TEXTO
      else if ((ent.type === 'TEXT' || ent.type === 'MTEXT')) {
        const txt = (ent.text || ent.string || "").replace(/\{.*?\}/g, "").replace(/\\P/g, " ").trim();
        const p = ent.start || ent.position;
        if (txt && txt !== "0" && p) {
          const fontSize = Math.max(10, (ent.height || 2) * scale);
          ctx.fillStyle = "#d35400";
          ctx.font = `bold ${fontSize}px Arial`;
          ctx.fillText(txt, getX(p), getY(p));
        }
      }
      // INSERT (Recursión segura)
      else if (ent.type === 'INSERT' && dxfRaw.blocks && ent.name) {
        const block = dxfRaw.blocks[ent.name];
        if (block && block.entities) {
          block.entities.forEach(bEnt => drawEnt(bEnt, ent.position || {x:0, y:0}));
        }
      }
    };

    if (dxfRaw.entities) {
      dxfRaw.entities.forEach(ent => drawEnt(ent));
    }
  }, [dxfRaw, scale, offset]);

  // Handlers de zoom y pan...
  const handleWheel = (e) => {
    e.preventDefault();
    const factor = Math.pow(1.1, -e.deltaY / 400);
    const rect = canvasRef.current.getBoundingClientRect();
    const mX = e.clientX - rect.left;
    const mY = e.clientY - rect.top;
    setOffset(prev => ({ x: mX - (mX - prev.x) * factor, y: mY - (mY - prev.y) * factor }));
    setScale(s => s * factor);
  };

  return (
    <div style={{ border: '2px solid #333', background: '#fff' }}>
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
        style={{ width: '100%', height: '700px', cursor: 'grab' }} 
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
