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

  // 1. Auto-Zoom inicial corregido
  useEffect(() => {
    if (!dxfRaw || !dxfRaw.entities || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    dxfRaw.entities.forEach(ent => {
      const pts = [];
      if (ent.vertices) pts.push(...ent.vertices);
      if (ent.start) pts.push(ent.start, ent.end);
      if (ent.position) pts.push(ent.position);
      if (ent.center) {
        const r = ent.radius || 0;
        pts.push({ x: ent.center.x - r, y: ent.center.y - r }, { x: ent.center.x + r, y: ent.center.y + r });
      }
      pts.forEach(p => {
        if (!isNaN(p.x) && !isNaN(p.y)) {
          minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        }
      });
    });

    if (minX === Infinity) return;

    const width = maxX - minX;
    const height = maxY - minY;
    const padding = 100;
    const initialScale = Math.min((canvas.width - padding) / (width || 1), (canvas.height - padding) / (height || 1));
    
    setScale(initialScale);
    // Centrar el dibujo en el canvas
    setOffset({
      x: (canvas.width / 2) - (minX + width / 2) * initialScale,
      y: (canvas.height / 2) + (minY + height / 2) * initialScale
    });
  }, [dxfRaw]);

  // 2. Renderizado de alto rendimiento
  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sistema de coordenadas unificado: Invertimos el eje Y de AutoCAD para el Canvas
    const toCanvasX = (x) => x * scale + offset.x;
    const toCanvasY = (y) => canvas.height - (y * scale + (canvas.height - offset.y));

    dxfRaw.entities.forEach(ent => {
      ctx.beginPath();
      ctx.strokeStyle = "#1a252f"; 
      ctx.lineWidth = 1;

      if (ent.type === 'LINE' && ent.start && ent.end) {
        ctx.moveTo(toCanvasX(ent.start.x), toCanvasY(ent.start.y));
        ctx.lineTo(toCanvasX(ent.end.x), toCanvasY(ent.end.y));
        ctx.stroke();
      } 
      else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices) {
        ent.vertices.forEach((v, i) => {
          if (i === 0) ctx.moveTo(toCanvasX(v.x), toCanvasY(v.y));
          else ctx.lineTo(toCanvasX(v.x), toCanvasY(v.y));
        });
        ctx.stroke();
      } 
      else if (ent.type === 'CIRCLE' && ent.center) {
        ctx.arc(toCanvasX(ent.center.x), toCanvasY(ent.center.y), (ent.radius || 1) * scale, 0, 2 * Math.PI);
        ctx.stroke();
      } 
      else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
        ctx.fillStyle = "#d35400"; // Naranja para etiquetas
        // El tamaño del texto ahora escala perfectamente con el zoom
        const fontSize = Math.max(1, (ent.height || 10) * scale);
        ctx.font = `bold ${fontSize}px sans-serif`;
        
        // AutoCAD usa 'position' para MTEXT y 'start' para TEXT
        const p = ent.position || ent.start || { x: 0, y: 0 };
        const cleanTxt = (ent.text || ent.string || "").replace(/\{.*?\}/g, "").replace(/\\P/g, " ");
        
        ctx.fillText(cleanTxt, toCanvasX(p.x), toCanvasY(p.y));
      }
    });
  }, [dxfRaw, scale, offset]);

  // 3. Handlers de Cámara (Mouse)
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 200);
    const newScale = scale * factor;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Zoom hacia el puntero del mouse
    setOffset(prev => ({
      x: mouseX - (mouseX - prev.x) * factor,
      y: mouseY - (mouseY - prev.y) * factor
    }));
    setScale(newScale);
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid #ccc', borderRadius: '8px' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,0.9)', padding: '8px', borderRadius: '4px', fontSize: '12px', zIndex: 10, border: '1px solid #ddd' }}>
        🔍 <b>Rueda:</b> Zoom | 🖱️ <b>Arrastrar:</b> Pan
      </div>
      <canvas 
        ref={canvasRef} 
        width={1800} 
        height={900} 
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        style={{ width: '100%', height: 'auto', background: '#fff', cursor: isDragging ? 'grabbing' : 'grab' }} 
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
