import React, { useState, useEffect, useRef } from "react";
import DxfParser from "dxf-parser";
import * as XLSX from "xlsx";
import styles from "./Home.module.css";

function StandardCanvas({ connectors, scale, offset }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dX = (x) => x * scale + offset.x;
    const dY = (y) => canvas.height - (y * scale + (canvas.height - offset.y));

    connectors.forEach(conn => {
      // Dibujamos un círculo estandarizado para cada conector detectado
      ctx.beginPath();
      ctx.arc(dX(conn.x), dY(conn.y), 15 * scale, 0, 2 * Math.PI);
      ctx.fillStyle = "#3498db"; // Azul profesional
      ctx.fill();
      ctx.strokeStyle = "#2c3e50";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Etiqueta limpia
      ctx.fillStyle = "#000";
      ctx.font = `bold ${Math.max(12, 5 * scale)}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText(conn.name, dX(conn.x), dY(conn.y) - (20 * scale));
    });
  }, [connectors, scale, offset]);

  return (
    <div style={{ border: '2px solid #3498db', borderRadius: '8px', overflow: 'hidden', background: '#f8f9fa' }}>
      <canvas ref={canvasRef} width={2400} height={1200} style={{ width: '100%', height: '500px' }} />
    </div>
  );
}

function DxfCanvas({ dxfRaw }) {
  const canvasRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const canvas = canvasRef.current;
    
    // Límites de tu arnés específico
    const minX = 1413.27;
    const maxX = 2047.99;
    const minY = 481.35;
    const maxY = 777.74;

    const dxfWidth = maxX - minX;
    const dxfHeight = maxY - minY;
    const padding = 40;
    const availableWidth = canvas.width - padding * 2;
    const availableHeight = canvas.height - padding * 2;

    const scaleX = availableWidth / dxfWidth;
    const scaleY = availableHeight / dxfHeight;
    const newScale = Math.min(scaleX, scaleY);

    setScale(newScale);
    setOffset({
      x: (canvas.width / 2) - (minX + dxfWidth / 2) * newScale,
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
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "#2c3e50";

        // 1. LINEAS
        if (ent.type === 'LINE' && ent.start && ent.end) {
          ctx.beginPath();
          ctx.moveTo(dX(ent.start.x), dY(ent.start.y));
          ctx.lineTo(dX(ent.end.x), dY(ent.end.y));
          ctx.stroke();
        } 
        // 2. POLILINEAS (Marcos y conectores)
        else if (ent.vertices && ent.vertices.length > 1) {
          ctx.beginPath();
          ent.vertices.forEach((v, i) => {
            if (i === 0) ctx.moveTo(dX(v.x), dY(v.y));
            else ctx.lineTo(dX(v.x), dY(v.y));
          });
          if (ent.shape) ctx.closePath();
          ctx.stroke();
        }
        // 3. CIRCULOS
        else if (ent.type === 'CIRCLE' && ent.center) {
          ctx.beginPath();
          ctx.arc(dX(ent.center.x), dY(ent.center.y), ent.radius * scale, 0, 2 * Math.PI);
          ctx.stroke();
        } 
        // 4. TEXTO (Etiquetas J1, J2, etc.)
        else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
          const p = ent.position || ent.startPoint || ent.insert;
          
          if (p) {
            let txt = (ent.text || ent.string || "").replace(/\{.*?\}/g, "").replace(/\\P/g, " ").replace(/\\[a-zA-Z].*?;/g, "").trim();
            
            if (txt && txt !== "0") {
              ctx.fillStyle = "#000000"; // Negro
              const fontSize = Math.max(10, (ent.height || 3.5) * scale); // Tamaño ajustado
              ctx.font = `normal ${fontSize}px Arial`;
              ctx.fillText(txt, dX(p.x), dY(p.y));
              // El punto rojo de debug ha sido eliminado aquí
            }
          }
        }
        // NOTA: Se ha eliminado el bloque de 'ARC' para simplificar el dibujo
      } catch (e) {}
    });
  }, [dxfRaw, scale, offset]);

  // Handlers de Mouse permanecen iguales...
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
        onMouseLeave={() => setIsDragging(false)}
        style={{ width: '100%', height: '750px', cursor: isDragging ? 'grabbing' : 'grab' }} 
      />
    </div>
  );
}
export default function Home() {
  const [dxfData, setDxfData] = useState(null);
  const [asociadoData, setAsociadoData] = useState([]);
  const [partNumber, setPartNumber] = useState("");
  const [isTableVisible, setIsTableVisible] = useState(true);
  const [isCanvasVisible, setIsCanvasVisible] = useState(true);
  const [detectedConnectors, setDetectedConnectors] = useState([]);

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

      const entities = dxf.entities;
      const texts = entities.filter(ent => ent.type === "TEXT" || ent.type === "MTEXT");
      const lines = entities.filter(ent => ent.type === "LINE" || ent.type === "LWPOLYLINE");

      // --- MOTOR DE DETECCIÓN DE CONECTORES ---
      const connectors = texts.map(t => {
        const name = (t.text || t.string || "").replace(/\{.*?\}/g, "").trim().toUpperCase();
        
        // Filtro: Solo textos que empiecen con J, P, AM, CAN, etc.
        if (/^[J|P|C|A|S|B]/.test(name) && name.length >= 2) {
          const p = t.position || t.startPoint || t.insert;
          
          // Buscamos líneas en un radio de 60 unidades del texto
          const cluster = lines.filter(l => {
            const lx = l.vertices ? l.vertices[0].x : l.start.x;
            const ly = l.vertices ? l.vertices[0].y : l.start.y;
            const dist = Math.sqrt(Math.pow(p.x - lx, 2) + Math.pow(p.y - ly, 2));
            return dist < 60; 
          });

          if (cluster.length > 0) {
            return { name, x: p.x, y: p.y, entities: cluster };
          }
        }
        return null;
      }).filter(Boolean);

      setDetectedConnectors(connectors);

      // (Mantenemos tu lógica anterior de la tabla de asociado)
      if (asociadoData.length > 0) {
        const keys = Object.keys(asociadoData[0]);
        const connKey = keys[2]; 
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
              {/* --- PASO 2: ESTRUCTURA DE TABLA CON COLUMNA RAMAL --- */}
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Ramal</th>
                    {Object.keys(asociadoData[0])
                      .filter(k => k !== "Ramal")
                      .map(k => <th key={k}>{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {asociadoData.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: "bold", color: "#2980b9" }}>
                        {row.Ramal}
                      </td>
                      {Object.keys(row)
                        .filter(k => k !== "Ramal")
                        .map((k, j) => {
                          const valStr = String(row[k]);
                          const isOk = valStr.includes("✅");
                          const isNok = valStr.includes("❌");
                          return (
                            <td key={j} style={{ 
                              color: isOk ? "green" : isNok ? "red" : "inherit", 
                              fontWeight: (isOk || isNok) ? "bold" : "normal" 
                            }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px' }}>
          
          {/* VISTA 1: ORIGINAL (REFERENCIA) */}
          <div className={styles.tableContainer}>
            <div className={styles.collapsibleHeader} style={{ backgroundColor: '#9b59b6' }}>
              <span>🖼️ Vista A: Dibujo Original de AutoCAD</span>
            </div>
            <div style={{ padding: '10px', background: '#eee' }}>
              <DxfCanvas dxfRaw={dxfData.raw} />
            </div>
          </div>

          {/* VISTA 2: NUEVO PLANO (ESTANDARIZADO) */}
          <div className={styles.tableContainer}>
            <div className={styles.collapsibleHeader} style={{ backgroundColor: '#3498db' }}>
              <span>⚡ Vista B: Plano Estandarizado (Generado)</span>
            </div>
            <div style={{ padding: '10px', background: '#ecf0f1' }}>
              <StandardCanvas 
                connectors={detectedConnectors} 
                scale={0.5} // Puedes ajustar escalas independientes
                offset={{ x: 100, y: 100 }} 
              />
            </div>
          </div>

        </div>
      )}
