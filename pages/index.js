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

  // 1. AUTO-ZOOM MEJORADO
  useEffect(() => {
    if (!dxfRaw || !dxfRaw.entities || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const bounds = (p) => {
      if (p && typeof p.x === 'number') {
        if (Math.abs(p.x) < 0.1 && Math.abs(p.y) < 0.1) return;
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
    };

    dxfRaw.entities.forEach(ent => {
      if (ent.vertices) ent.vertices.forEach(bounds);
      if (ent.start) { bounds(ent.start); bounds(ent.end); }
      if (ent.position) bounds(ent.position);
      if (ent.center) bounds(ent.center);
    });

    const width = maxX - minX;
    const height = maxY - minY;
    if (minX === Infinity) return;

    // Aumentamos el margen para que el dibujo se vea centrado al cargar
    const initialScale = Math.min((canvas.width - 300) / (width || 1), (canvas.height - 300) / (height || 1));
    setScale(initialScale);
    setOffset({
      x: (canvas.width / 2) - (minX + width / 2) * initialScale,
      y: (canvas.height / 2) + (minY + height / 2) * initialScale
    });
  }, [dxfRaw]);

  // 2. MOTOR DE RENDERIZADO CON TRANSFORMACIÓN DE COORDENADAS
  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const transformX = (x) => x * scale + offset.x;
    const transformY = (y) => canvas.height - (y * scale + (canvas.height - offset.y));

    const drawEntity = (ent, basePos = { x: 0, y: 0 }) => {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#1e272e";
      
      // Aplicar desplazamiento relativo del bloque
      const absX = (px) => transformX(px + basePos.x);
      const absY = (py) => transformY(py + basePos.y);

      // LÍNEAS
      if (ent.type === 'LINE' || ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
        ctx.beginPath();
        if (ent.type === 'LINE') {
          ctx.moveTo(absX(ent.start.x), absY(ent.start.y));
          ctx.lineTo(absX(ent.end.x), absY(ent.end.y));
        } else if (ent.vertices) {
          ent.vertices.forEach((v, i) => {
            if (i === 0) ctx.moveTo(absX(v.x), absY(v.y));
            else ctx.lineTo(absX(v.x), absY(v.y));
          });
        }
        ctx.stroke();
      }
      // ARCOS (Corrección final de ángulos)
      else if (ent.type === 'ARC' && ent.center) {
        ctx.beginPath();
        const startRad = (360 - ent.endAngle) * Math.PI / 180;
        const endRad = (360 - ent.startAngle) * Math.PI / 180;
        ctx.arc(absX(ent.center.x), absY(ent.center.y), ent.radius * scale, startRad, endRad, false);
        ctx.stroke();
      }
      // TEXTO (Posicionamiento correcto dentro de bloques)
      else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
        const txt = (ent.text || ent.string || ent.value || "").replace(/\{.*?\}/g, "").replace(/\\P/g, " ").trim();
        if (txt && txt !== "0") {
          const fontSize = Math.max(12, (ent.height || 5) * scale);
          ctx.fillStyle = "#e67e22";
          ctx.font = `bold ${fontSize}px Arial`;
          // Usar 'start' si existe, si no 'position'
          const p = ent.start || ent.position || { x: 0, y: 0 };
          ctx.fillText(txt, absX(p.x), absY(p.y));
        }
      }
      // INSERT (Recursividad para bloques)
      else if (ent.type === 'INSERT' && dxfRaw.blocks) {
        const block = dxfRaw.blocks[ent.name];
        if (block && block.entities) {
          block.entities.forEach(bEnt => drawEntity(bEnt, ent.position));
        }
      }
      // CÍRCULOS
      else if (ent.type === 'CIRCLE' && ent.center) {
        ctx.beginPath();
        ctx.strokeStyle = "#0984e3";
        ctx.arc(absX(ent.center.x), absY(ent.center.y), (ent.radius || 1) * scale, 0, 2 * Math.PI);
        ctx.stroke();
      }
    };

    dxfRaw.entities.forEach(ent => drawEntity(ent));
  }, [dxfRaw, scale, offset]);

  // Handlers de interacción
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
    <div style={{ border: '2px solid #333', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
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
        onMouseLeave={() => setIsDragging(false)}
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
