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

  // Funciones de utilidad para convertir coordenadas DXF a coordenadas de Canvas (Píxeles)
  // Usamos estas funciones para que todas las entidades sigan la misma lógica de movimiento
  const dX = (x) => x * scale + offset.x;
  const dY = (y) => -y * scale + offset.y; // Invertimos Y para que el dibujo no salga de cabeza

  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const canvas = canvasRef.current;

    // 1. Límites exactos del dibujo (según tu archivo 700176.dxf)
    const minX = 1413.27;
    const maxX = 2047.99;
    const minY = 481.35;
    const maxY = 777.74;

    const dxfWidth = maxX - minX;
    const dxfHeight = maxY - minY;

    // 2. Definir un margen (padding)
    const padding = 40;
    const availableWidth = canvas.width - padding * 2;
    const availableHeight = canvas.height - padding * 2;

    // 3. Calcular escala inicial para ajustar al visor (Zoom Extents)
    const scaleX = availableWidth / dxfWidth;
    const scaleY = availableHeight / dxfHeight;
    const initialScale = Math.min(scaleX, scaleY);

    setScale(initialScale);

    // 4. Centrar el dibujo inicialmente
    setOffset({
      x: (canvas.width / 2) - (minX + dxfWidth / 2) * initialScale,
      y: (canvas.height / 2) + (minY + dxfHeight / 2) * initialScale 
    });
  }, [dxfRaw]);

  useEffect(() => {
    if (!dxfRaw || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    dxfRaw.entities.forEach((ent) => {
      ctx.beginPath();
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;

      if (ent.type === "LINE") {
        ctx.moveTo(dX(ent.vertices[0].x), dY(ent.vertices[0].y));
        ctx.lineTo(dX(ent.vertices[1].x), dY(ent.vertices[1].y));
        ctx.stroke();
      } 
      else if (ent.type === "CIRCLE" && ent.center) {
        // Círculos: Usamos dX/dY para el centro y escalamos el radio
        ctx.arc(dX(ent.center.x), dY(ent.center.y), ent.radius * scale, 0, 2 * Math.PI);
        ctx.stroke();
      } 
      else if (ent.type === "ARC" && ent.center) {
        // Arcos: Ajustamos ángulos para la inversión del eje Y
        const startRad = (360 - ent.endAngle) * Math.PI / 180;
        const endRad = (360 - ent.startAngle) * Math.PI / 180;

        ctx.arc(
          dX(ent.center.x), 
          dY(ent.center.y), 
          ent.radius * scale, 
          startRad, 
          endRad, 
          false // Sentido horario compensado por dY
        );
        ctx.stroke();
      }
      else if (ent.type === "LWPOLYLINE") {
        ent.vertices.forEach((v, i) => {
          if (i === 0) ctx.moveTo(dX(v.x), dY(v.y));
          else ctx.lineTo(dX(v.x), dY(v.y));
        });
        if (ent.shape) ctx.closePath();
        ctx.stroke();
      }
      else if (ent.type === "TEXT" || ent.type === "MTEXT") {
        const posX = ent.columnUintHeight ? ent.insert.x : (ent.position ? ent.position.x : 0);
        const posY = ent.columnUintHeight ? ent.insert.y : (ent.position ? ent.position.y : 0);
        
        ctx.font = `${(ent.height || 10) * scale}px Arial`;
        ctx.fillStyle = "black";
        ctx.fillText(ent.text || "", dX(posX), dY(posY));
      }
    });
  }, [dxfRaw, scale, offset]);

  // --- MANEJO DE EVENTOS (ZOOM Y ARRASTRE) ---

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const direction = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Coordenadas del mundo antes del zoom
    const worldX = (mouseX - offset.x) / scale;
    const worldY = (mouseY - offset.y) / scale;

    const newScale = scale * direction;
    setScale(newScale);

    // Actualizar offset para que el zoom se haga hacia el puntero del mouse
    setOffset({
      x: mouseX - worldX * newScale,
      y: mouseY - worldY * newScale,
    });
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <canvas
      ref={canvasRef}
      width={1000}
      height={600}
      style={{ 
        border: "1px solid #ccc", 
        cursor: isDragging ? "grabbing" : "grab", 
        display: "block", 
        margin: "0 auto", 
        background: "white" 
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}

export default function Home() {
  const [dxfData, setDxfData] = useState(null);
  const [isCanvasVisible, setIsCanvasVisible] = useState(true);

  const handleDxfUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const parser = new DxfParser();
      try {
        const payload = parser.parseSync(event.target.result);
        setDxfData({ raw: payload });
      } catch (err) {
        alert("Error al parsear el DXF");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className={styles.container}>
      <input type="file" accept=".dxf" onChange={handleDxfUpload} />
      
      {dxfData && dxfData.raw && (
        <div className={styles.tableContainer}>
          <div className={styles.collapsibleHeader} onClick={() => setIsCanvasVisible(!isCanvasVisible)}>
            <span>🖼️ Vista Previa del Arnés</span>
            <span>{isCanvasVisible ? "▲" : "▼"}</span>
          </div>
          {isCanvasVisible && (
            <div style={{ padding: "20px", background: "#ecf0f1" }}>
              <DxfCanvas dxfRaw={dxfData.raw} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
