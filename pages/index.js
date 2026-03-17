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

  // 1. CALIBRACIÓN DE COORDENADAS (Límites extraídos de tu DXF)
  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const canvas = canvasRef.current;

    // Coordenadas detectadas en tu archivo 700176.dxf
    const minX = 1413.27;
    const maxX = 2047.99;
    const minY = 481.35;
    const maxY = 777.74;

    const width = maxX - minX;
    const height = maxY - minY;

    // Ajustamos la escala para que el arnés llene el 85% del canvas
    const initialScale = Math.min(
      (canvas.width * 0.85) / width,
      (canvas.height * 0.85) / height
    );

    setScale(initialScale);
    // Centramos el dibujo usando los límites reales
    setOffset({
      x: (canvas.width / 2) - (minX + width / 2) * initialScale,
      y: (canvas.height / 2) + (minY + height / 2) * initialScale
    });
  }, [dxfRaw]);

  // 2. RENDERIZADOR RECURSIVO (Dibuja entidades Y bloques)
  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dX = (x) => x * scale + offset.x;
    const dY = (y) => canvas.height - (y * scale + (canvas.height - offset.y));

    const drawEnt = (ent, basePos = { x: 0, y: 0 }) => {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#2c3e50";

      const x = (v) => dX(v.x + basePos.x);
      const y = (v) => dY(v.y + basePos.y);

      // LINEAS Y POLILINEAS
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
      // ARCOS
      else if (ent.type === 'ARC' && ent.center) {
        ctx.beginPath();
        const sA = (360 - ent.endAngle) * Math.PI / 180;
        const eA = (360 - ent.startAngle) * Math.PI / 180;
        ctx.arc(dX(ent.center.x + basePos.x), dY(ent.center.y + basePos.y), ent.radius * scale, sA, eA, false);
        ctx.stroke();
      }
      // TEXTO (Ubicación real)
      else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
        const txt = (ent.text || ent.string || "").replace(/\{.*?\}/g, "").replace(/\\P/g, " ").trim();
        if (txt && txt !== "0") {
          const fontSize = Math.max(10, (ent.height || 2.5) * scale);
          ctx.fillStyle = "#e67e22";
          ctx.font = `bold ${fontSize}px Arial`;
          const p = ent.start || ent.position || { x: 0, y: 0 };
          ctx.fillText(txt, x(p), y(p));
        }
      }
      // INSERT (¡Crucial para tu archivo!)
      else if (ent.type === 'INSERT' && dxfRaw.blocks && dxfRaw.blocks[ent.name]) {
        const block = dxfRaw.blocks[ent.name];
        if (block.entities) {
          block.entities.forEach(bEnt => drawEnt(bEnt, ent.position));
        }
      }
    };

    // Dibujamos las entidades principales
    if (dxfRaw.entities) dxfRaw.entities.forEach(ent => drawEnt(ent));

  }, [dxfRaw, scale, offset]);

  // 3. CONTROLES DE ZOOM Y PAN
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
    <div style={{ border: '1px solid #000', background: '#fff', borderRadius: '4px' }}>
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
        style={{ width: '100%', height: '700px', cursor: isDragging ? 'grabbing' : 'grab' }} 
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
