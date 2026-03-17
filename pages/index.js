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

  // 1. CÁLCULO DE LÍMITES REALES (Basado en tu archivo 700176.dxf)
  useEffect(() => {
    if (!dxfRaw || !dxfRaw.entities || !canvasRef.current) return;
    const canvas = canvasRef.current;
    
    // Usamos los límites que vienen en el encabezado del archivo si existen
    let minX = 1413, minY = 481, maxX = 2047, maxY = 777;

    // Si prefieres cálculo dinámico por si subes otro archivo:
    let dMinX = Infinity, dMinY = Infinity, dMaxX = -Infinity, dMaxY = -Infinity;
    dxfRaw.entities.forEach(ent => {
      const pts = [];
      if (ent.vertices) pts.push(...ent.vertices);
      if (ent.start) pts.push(ent.start, ent.end);
      if (ent.position) pts.push(ent.position);
      pts.forEach(p => {
        if (p.x === 0 && p.y === 0) return; // Ignorar el origen basura
        dMinX = Math.min(dMinX, p.x); dMinY = Math.min(dMinY, p.y);
        dMaxX = Math.max(dMaxX, p.x); dMaxY = Math.max(dMaxY, p.y);
      });
    });

    if (dMinX !== Infinity) {
      minX = dMinX; minY = dMinY; maxX = dMaxX; maxY = dMaxY;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    
    // Ajuste de escala para que el arnés ocupe el centro
    const initialScale = Math.min((canvas.width - 100) / (width || 1), (canvas.height - 100) / (height || 1));
    setScale(initialScale);
    setOffset({
      x: (canvas.width / 2) - (minX + width / 2) * initialScale,
      y: (canvas.height / 2) + (minY + height / 2) * initialScale
    });
  }, [dxfRaw]);

  // 2. MOTOR DE RENDERIZADO RECURSIVO (Para procesar bloques e Insert)
  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dX = (x) => x * scale + offset.x;
    const dY = (y) => canvas.height - (y * scale + (canvas.height - offset.y));

    const drawEntity = (ent, basePos = { x: 0, y: 0 }) => {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#2c3e50";

      const getX = (p) => dX(p.x + basePos.x);
      const getY = (p) => dY(p.y + basePos.y);

      if (ent.type === 'LINE') {
        ctx.beginPath();
        ctx.moveTo(getX(ent.start), getY(ent.start));
        ctx.lineTo(getX(ent.end), getY(ent.end));
        ctx.stroke();
      } 
      else if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
        if (!ent.vertices) return;
        ctx.beginPath();
        ent.vertices.forEach((v, i) => {
          if (i === 0) ctx.moveTo(getX(v), getY(v));
          else ctx.lineTo(getX(v), getY(v));
        });
        ctx.stroke();
      }
      else if (ent.type === 'ARC') {
        ctx.beginPath();
        const sA = (360 - ent.endAngle) * Math.PI / 180;
        const eA = (360 - ent.startAngle) * Math.PI / 180;
        ctx.arc(dX(ent.center.x + basePos.x), dY(ent.center.y + basePos.y), ent.radius * scale, sA, eA, false);
        ctx.stroke();
      }
      else if (ent.type === 'CIRCLE') {
        ctx.beginPath();
        ctx.arc(dX(ent.center.x + basePos.x), dY(ent.center.y + basePos.y), ent.radius * scale, 0, 2 * Math.PI);
        ctx.stroke();
      }
      else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
        const txt = (ent.text || ent.string || "").replace(/\{.*?\}/g, "").replace(/\\P/g, " ").trim();
        if (txt && txt !== "0") {
          const fontSize = Math.max(10, (ent.height || 2) * scale);
          ctx.fillStyle = "#e67e22";
          ctx.font = `${fontSize}px Arial`;
          const p = ent.start || ent.position;
          ctx.fillText(txt, getX(p), getY(p));
        }
      }
      // MANEJO CRÍTICO DE INSERT (Para piezas que no están explotadas)
      else if (ent.type === 'INSERT' && dxfRaw.blocks && dxfRaw.blocks[ent.name]) {
        const block = dxfRaw.blocks[ent.name];
        block.entities.forEach(bEnt => drawEntity(bEnt, ent.position));
      }
    };

    dxfRaw.entities.forEach(ent => drawEntity(ent));
  }, [dxfRaw, scale, offset]);

  // 3. EVENTOS DE INTERACCIÓN
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
    <div style={{ border: '1px solid #ccc', background: '#fff', cursor: isDragging ? 'grabbing' : 'grab' }}>
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
        style={{ width: '100%', height: '700px' }} 
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
