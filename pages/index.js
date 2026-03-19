import React, { useState, useEffect, useRef } from "react";
import DxfParser from "dxf-parser";
import * as XLSX from "xlsx";
import styles from "./Home.module.css";

// --- VISOR A: DIBUJO ORIGINAL ---
function DxfCanvas({ dxfRaw }) {
  const canvasRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const minX = 1413.27, maxX = 2047.99, minY = 481.35, maxY = 777.74;
    const dxfWidth = maxX - minX;
    const dxfHeight = maxY - minY;
    const padding = 40;
    const newScale = Math.min((canvas.width - padding * 2) / dxfWidth, (canvas.height - padding * 2) / dxfHeight);

    setScale(newScale || 1);
    setOffset({
      x: (canvas.width / 2) - (minX + dxfWidth / 2) * (newScale || 1),
      y: (canvas.height / 2) + (minY + dxfHeight / 2) * (newScale || 1) 
    });
  }, [dxfRaw]);

  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    const dX = (x) => (x || 0) * scale + offset.x;
    const dY = (y) => canvasRef.current.height - ((y || 0) * scale + (canvasRef.current.height - offset.y));

    dxfRaw.entities.forEach(ent => {
      try {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "#2c3e50";

        if (ent.type === 'LINE' && ent.start && ent.end) {
          ctx.beginPath();
          ctx.moveTo(dX(ent.start.x), dY(ent.start.y));
          ctx.lineTo(dX(ent.end.x), dY(ent.end.y));
          ctx.stroke();
        } 
        else if ((ent.type === 'LWPOLYLINE' || ent.vertices) && ent.vertices?.length > 0) {
          ctx.beginPath();
          ent.vertices.forEach((v, i) => {
            if (v) i === 0 ? ctx.moveTo(dX(v.x), dY(v.y)) : ctx.lineTo(dX(v.x), dY(v.y));
          });
          if (ent.shape || ent.closed) ctx.closePath();
          ctx.stroke();
        } 
        else if (ent.type === 'CIRCLE' && ent.center) {
          ctx.beginPath();
          ctx.arc(dX(ent.center.x), dY(ent.center.y), (ent.radius || 1) * scale, 0, 2 * Math.PI);
          ctx.stroke();
        } 
        else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
          const p = ent.position || ent.startPoint || ent.insert;
          if (p) {
            let txt = (ent.text || ent.string || "").replace(/\{.*?\}/g, "").replace(/\\[a-zA-Z].*?;/g, "").trim();
            if (txt && txt !== "0") {
              ctx.fillStyle = "#000";
              ctx.font = `${Math.max(10, (ent.height || 3.5) * scale)}px Arial`;
              ctx.fillText(txt, dX(p.x), dY(p.y));
            }
          }
        }
      } catch (e) {}
    });
  }, [dxfRaw, scale, offset]);

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = Math.pow(1.1, -e.deltaY / 400);
    const rect = canvasRef.current.getBoundingClientRect();
    const mX = e.clientX - rect.left, mY = e.clientY - rect.top;
    setOffset(prev => ({ x: mX - (mX - prev.x) * factor, y: mY - (mY - prev.y) * factor }));
    setScale(s => s * factor);
  };

  return (
    <div style={{ border: '1px solid #ccc', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
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
        style={{ width: '100%', height: '500px', cursor: isDragging ? 'grabbing' : 'grab' }} 
      />
    </div>
  );
}

// --- VISOR B: PLANO ESTANDARIZADO (CON ZOOM Y PAN) ---
function StandardCanvas({ connectors }) {
  const canvasRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  // Encuadre inicial automático
  useEffect(() => {
    if (!connectors || connectors.length === 0 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const minX = 1413.27, maxX = 2047.99, minY = 481.35, maxY = 777.74;
    const dxfWidth = maxX - minX;
    const dxfHeight = maxY - minY;
    const padding = 60;
    const newScale = Math.min((canvas.width - padding * 2) / dxfWidth, (canvas.height - padding * 2) / dxfHeight);

    setScale(newScale || 1);
    setOffset({
      x: (canvas.width / 2) - (minX + dxfWidth / 2) * (newScale || 1),
      y: (canvas.height / 2) + (minY + dxfHeight / 2) * (newScale || 1) 
    });
  }, [connectors]);

  useEffect(() => {
    if (!canvasRef.current || !connectors) return;
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    const dX = (x) => (x || 0) * scale + offset.x;
    const dY = (y) => canvasRef.current.height - ((y || 0) * scale + (canvasRef.current.height - offset.y));

    connectors.forEach(conn => {
      try {
        // Dibujar geometría original en gris suave
        ctx.strokeStyle = "#d1d5db";
        ctx.lineWidth = 1;
        conn.entities?.forEach(ent => {
          if (ent.type === 'LINE' && ent.start && ent.end) {
            ctx.beginPath();
            ctx.moveTo(dX(ent.start.x), dY(ent.start.y));
            ctx.lineTo(dX(ent.end.x), dY(ent.end.y));
            ctx.stroke();
          } else if (ent.vertices?.length > 0) {
            ctx.beginPath();
            ent.vertices.forEach((v, i) => {
              if (v) i === 0 ? ctx.moveTo(dX(v.x), dY(v.y)) : ctx.lineTo(dX(v.x), dY(v.y));
            });
            ctx.stroke();
          }
        });

        // Dibujar Burbuja Azul (Normalizada)
        ctx.beginPath();
        ctx.arc(dX(conn.x), dY(conn.y), 15 * scale, 0, 2 * Math.PI);
        ctx.fillStyle = "#3498db";
        ctx.fill();
        ctx.strokeStyle = "#2c3e50";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Texto Estandarizado
        ctx.fillStyle = "#000";
        ctx.font = `bold ${Math.max(12, 6 * scale)}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText(conn.name || "?", dX(conn.x), dY(conn.y) - (25 * scale));
      } catch (e) {}
    });
  }, [connectors, scale, offset]);

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = Math.pow(1.1, -e.deltaY / 400);
    const rect = canvasRef.current.getBoundingClientRect();
    const mX = e.clientX - rect.left, mY = e.clientY - rect.top;
    setOffset(prev => ({ x: mX - (mX - prev.x) * factor, y: mY - (mY - prev.y) * factor }));
    setScale(s => s * factor);
  };

  return (
    <div style={{ border: '2px solid #3498db', borderRadius: '8px', overflow: 'hidden', background: '#f8f9fa' }}>
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
        style={{ width: '100%', height: '500px', cursor: isDragging ? 'grabbing' : 'grab' }} 
      />
    </div>
  );
}

export default function Home() {
  const [dxfData, setDxfData] = useState(null);
  const [asociadoData, setAsociadoData] = useState([]);
  const [detectedConnectors, setDetectedConnectors] = useState([]);
  const [partNumber, setPartNumber] = useState("");
  const [isTableVisible, setIsTableVisible] = useState(true);

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
        const headers = h1.map((_, i) => `${h1[i]} ${h2[i]} ${h3[i]}`.trim());
        let rows = raw.slice(7).filter(r => r && !r.every(c => c === ""));
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
      const texts = dxf.entities.filter(ent => ent.type === "TEXT" || ent.type === "MTEXT");
      const lines = dxf.entities.filter(ent => ent.type === "LINE" || ent.type === "LWPOLYLINE");

      const connectors = texts.map(t => {
        const name = (t.text || t.string || "").replace(/\{.*?\}/g, "").trim().toUpperCase();
        if (/^[J|P|C|A|S|B]/.test(name) && name.length >= 2) {
          const p = t.position || t.startPoint || t.insert;
          if (!p) return null;
          const cluster = lines.filter(l => {
            const lx = l.vertices?.[0]?.x ?? l.start?.x;
            const ly = l.vertices?.[0]?.y ?? l.start?.y;
            if (lx === undefined) return false;
            return Math.sqrt(Math.pow(p.x - lx, 2) + Math.pow(p.y - ly, 2)) < 80;
          });
          if (cluster.length > 0) return { name, x: p.x, y: p.y, entities: cluster };
        }
        return null;
      }).filter(Boolean);

      setDetectedConnectors(connectors);
      if (asociadoData.length > 0) {
        const connKey = Object.keys(asociadoData[0])[2]; 
        setAsociadoData(prev => prev.map(row => {
          const name = String(row[connKey]).trim().toUpperCase();
          const found = connectors.some(c => c.name.includes(name));
          return { ...row, "Status": found ? "✅ Encontrado" : "❌ No detectado" };
        }));
      }
      setDxfData({ raw: dxf });
    } catch (err) { alert("Error al procesar DXF"); }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Harness CAD & Data Analyzer</h1>
      <div className={styles.cardsContainer}>
        <div className={styles.card}><h3>📁 DXF</h3><input type="file" onChange={handleDxf} accept=".dxf" /></div>
        <div className={styles.card}><h3>📊 Excel</h3><input type="file" onChange={handleExcel} accept=".xlsx, .xls" /></div>
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
                        <td key={j} style={{ color: String(v).includes("✅") ? "green" : String(v).includes("❌") ? "red" : "inherit" }}>
                          {String(v)}
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

      {dxfData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', marginTop: '20px' }}>
          <div className={styles.tableContainer}>
            <div className={styles.collapsibleHeader} style={{ backgroundColor: '#9b59b6' }}><span>🖼️ Vista A: Original</span></div>
            <DxfCanvas dxfRaw={dxfData.raw} />
          </div>
          <div className={styles.tableContainer}>
            <div className={styles.collapsibleHeader} style={{ backgroundColor: '#3498db' }}><span>⚡ Vista B: Estandarizada</span></div>
            <StandardCanvas connectors={detectedConnectors} />
          </div>
        </div>
      )}
    </div>
  );
}
