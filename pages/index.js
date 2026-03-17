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

  // 1. ZOOM Y LÍMITES
  useEffect(() => {
    if (!dxfRaw || !dxfRaw.entities || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const checkPoint = (p) => {
      if (p && typeof p.x === 'number' && typeof p.y === 'number') {
        if (Math.abs(p.x) < 0.1 && Math.abs(p.y) < 0.1) return;
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
    };

    dxfRaw.entities.forEach(ent => {
      if (ent.vertices) ent.vertices.forEach(checkPoint);
      if (ent.start) { checkPoint(ent.start); checkPoint(ent.end); }
      if (ent.position) checkPoint(ent.position);
      if (ent.center) checkPoint(ent.center);
    });

    const width = maxX - minX;
    const height = maxY - minY;
    if (minX === Infinity) return;

    const initialScale = Math.min((canvas.width - 200) / (width || 1), (canvas.height - 200) / (height || 1));
    setScale(initialScale);
    setOffset({
      x: (canvas.width / 2) - (minX + width / 2) * initialScale,
      y: (canvas.height / 2) + (minY + height / 2) * initialScale
    });
  }, [dxfRaw]);

  // 2. RENDERIZADO (Con fix de Arcos y Bloques)
  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dX = (x) => x * scale + offset.x;
    const dY = (y) => canvas.height - (y * scale + (canvas.height - offset.y));

    const drawEnt = (ent, basePos = { x: 0, y: 0 }) => {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#1e272e";
      const x = (p) => dX(p.x + basePos.x);
      const y = (p) => dY(p.y + basePos.y);

      // LINEAS
      if (ent.type === 'LINE' || ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
        ctx.beginPath();
        if (ent.type === 'LINE') {
          ctx.moveTo(x(ent.start), y(ent.start));
          ctx.lineTo(x(ent.end), y(ent.end));
        } else if (ent.vertices) {
          ent.vertices.forEach((v, i) => {
            if (i === 0) ctx.moveTo(x(v), y(v));
            else ctx.lineTo(x(v), y(v));
          });
        }
        ctx.stroke();
      }
      // ARCOS (Fix: Ángulos corregidos para sentido horario/antihorario)
      else if (ent.type === 'ARC' && ent.center) {
        ctx.beginPath();
        const sA = (360 - ent.endAngle) * Math.PI / 180;
        const eA = (360 - ent.startAngle) * Math.PI / 180;
        ctx.arc(dX(ent.center.x + basePos.x), dY(ent.center.y + basePos.y), ent.radius * scale, sA, eA, false);
        ctx.stroke();
      }
      // CIRCULOS
      else if (ent.type === 'CIRCLE' && ent.center) {
        ctx.beginPath();
        ctx.strokeStyle = "#0984e3";
        ctx.arc(dX(ent.center.x + basePos.x), dY(ent.center.y + basePos.y), (ent.radius || 1) * scale, 0, 2 * Math.PI);
        ctx.stroke();
      }
      // TEXTO (Fix: Prioridad de renderizado)
      else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
        const txt = (ent.text || ent.string || ent.value || "").replace(/\{.*?\}/g, "").replace(/\\P/g, " ").trim();
        if (txt && txt !== "0") {
          const fontSize = Math.max(14, (ent.height || 5) * scale); 
          ctx.fillStyle = "#e67e22";
          ctx.font = `bold ${fontSize}px Arial`;
          const p = ent.start || ent.position || { x: 0, y: 0 };
          ctx.fillText(txt, x(p), y(p));
        }
      }
      // INSERT (Protección contra el error 'entities of undefined')
      else if (ent.type === 'INSERT' && dxfRaw.blocks && dxfRaw.blocks[ent.name]) {
        const block = dxfRaw.blocks[ent.name];
        if (block.entities) {
          block.entities.forEach(bEnt => drawEnt(bEnt, ent.position));
        }
      }
    };

    dxfRaw.entities.forEach(ent => drawEnt(ent));
  }, [dxfRaw, scale, offset]);

  return (
    <div style={{ border: '2px solid #000', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
      <canvas 
        ref={canvasRef} width={2400} height={1200} 
        onWheel={(e) => {
          e.preventDefault();
          const factor = Math.pow(1.1, -e.deltaY / 500);
          setScale(s => s * factor);
        }}
        onMouseDown={(e) => { setIsDragging(true); setLastMousePos({ x: e.clientX, y: e.clientY }); }}
        onMouseMove={(e) => {
          if (!isDragging) return;
          setOffset(prev => ({ x: prev.x + (e.clientX - lastMousePos.x), y: prev.y + (e.clientY - lastMousePos.y) }));
          setLastMousePos({ x: e.clientX, y: e.clientY });
        }}
        onMouseUp={() => setIsDragging(false)}
        style={{ width: '100%', height: '700px', cursor: 'grab', background: '#fff' }} 
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
