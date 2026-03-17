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

  // 1. AUTO-ZOOM INTELIGENTE: Calcula los límites reales del arnés
  useEffect(() => {
    if (!dxfRaw || !dxfRaw.entities || !canvasRef.current) return;
    const canvas = canvasRef.current;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // Recorremos las entidades para encontrar el cuadro delimitador (Bounding Box)
    dxfRaw.entities.forEach(ent => {
      const checkPoint = (p) => {
        if (p && typeof p.x === 'number') {
          // FILTRO CRÍTICO: Ignoramos puntos en el origen 0,0 
          // que AutoCAD suele dejar y que hacen que el dibujo se vea pequeño.
          if (Math.abs(p.x) < 1 && Math.abs(p.y) < 1) return;
          
          minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        }
      };

      if (ent.vertices) ent.vertices.forEach(checkPoint);
      if (ent.start) { checkPoint(ent.start); checkPoint(ent.end); }
      if (ent.center) checkPoint(ent.center);
      if (ent.position) checkPoint(ent.position);
    });

    // Si no se encontró geometría válida fuera del origen
    if (minX === Infinity) return;

    const drawingWidth = maxX - minX;
    const drawingHeight = maxY - minY;

    // Calculamos la escala para que el dibujo ocupe el 90% del canvas (padding de 50px)
    const padding = 60;
    const availableWidth = canvas.width - (padding * 2);
    const availableHeight = canvas.height - (padding * 2);

    const initialScale = Math.min(
      availableWidth / (drawingWidth || 1), 
      availableHeight / (drawingHeight || 1)
    );

    setScale(initialScale);

    // Centramos el dibujo en el canvas
    setOffset({
      x: (canvas.width / 2) - (minX + drawingWidth / 2) * initialScale,
      y: (canvas.height / 2) + (minY + drawingHeight / 2) * initialScale
    });
  }, [dxfRaw]);

  // 2. RENDERIZADO: Dibuja las entidades en el Canvas
  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    // Limpiamos el canvas antes de redibujar
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Funciones de conversión de coordenadas CAD -> Pantalla
    const dX = (x) => x * scale + offset.x;
    const dY = (y) => canvas.height - (y * scale + (canvas.height - offset.y));

    dxfRaw.entities.forEach(ent => {
      try {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#2c3e50"; // Color azul oscuro para cables

        // --- LÍNEAS Y POLILÍNEAS ---
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
          ctx.stroke();
        }
        // --- ARCOS Y CÍRCULOS (Conectores) ---
        else if ((ent.type === 'ARC' || ent.type === 'CIRCLE') && ent.center) {
          ctx.beginPath();
          const sA = ent.type === 'ARC' ? (360 - ent.endAngle) * Math.PI / 180 : 0;
          const eA = ent.type === 'ARC' ? (360 - ent.startAngle) * Math.PI / 180 : 2 * Math.PI;
          ctx.arc(dX(ent.center.x), dY(ent.center.y), (ent.radius || 0) * scale, sA, eA, false);
          ctx.stroke();
        }
        // --- TEXTO (Etiquetas de conectores) ---
        else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
          const p = ent.start || ent.position;
          if (p && (Math.abs(p.x) > 1 || Math.abs(p.y) > 1)) {
            const txt = (ent.text || ent.string || "").replace(/\{.*?\}/g, "").replace(/\\P/g, " ").trim();
            if (txt && txt !== "0") {
              const fontSize = Math.max(12, (ent.height || 3) * scale);
              ctx.fillStyle = "#d35400"; // Color naranja para resaltar texto
              ctx.font = `bold ${fontSize}px Arial`;
              ctx.fillText(txt, dX(p.x), dY(p.y));
            }
          }
        }
      } catch (err) {
        // Silenciamos errores de entidades individuales para no romper el visor
      }
    });
  }, [dxfRaw, scale, offset]);

  // Handlers de Mouse (Zoom y Pan)
  const handleWheel = (e) => {
    e.preventDefault();
    const factor = Math.pow(1.1, -e.deltaY / 400);
    const rect = canvasRef.current.getBoundingClientRect();
    const mX = e.clientX - rect.left; const mY = e.clientY - rect.top;
    setOffset(prev => ({ x: mX - (mX - prev.x) * factor, y: mY - (mY - prev.y) * factor }));
    setScale(s => s * factor);
  };

  return (
    <div style={{ border: '2px solid #222', borderRadius: '8px', background: '#fff' }}>
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
