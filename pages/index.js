import { useState } from "react";
import DxfParser from "dxf-parser";
import * as XLSX from "xlsx";
import styles from "./Home.module.css"; // Importamos los estilos

export default function Home() {
  const [dxfInfo, setDxfInfo] = useState(null);
  const [asociadoData, setAsociadoData] = useState([]);
  const [partNumber, setPartNumber] = useState("");

  // --- Procesador de Excel ---
const handleExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // 1. Convertimos a una matriz de filas (Array of Arrays) para manipular índices
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      // 2. Extraer Número de Parte (Celda A4 -> Fila 3 en índice 0)
      const pNumber = rawData[3] ? rawData[3][0] : "Desconocido";
      setPartNumber(pNumber);

      // 3. Definir Encabezado (Unir filas 5, 6 y 7 -> Índices 4, 5, 6)
      // Como están combinadas, buscamos los textos en esas tres filas
      const headerRow = rawData[4].map((_, colIndex) => {
        const val5 = rawData[4][colIndex] || "";
        const val6 = rawData[5][colIndex] || "";
        const val7 = rawData[6][colIndex] || "";
        return `${val5} ${val6} ${val7}`.trim();
      });

      // 4. Extraer Datos (A partir de fila 8 -> Índice 7)
      let dataRows = rawData.slice(7);

      // 5. Limpieza: Borrar a partir de la primera fila vacía
      const firstEmptyRowIndex = dataRows.findIndex(row => 
        row.every(cell => cell === null || cell === "")
      );

      if (firstEmptyRowIndex !== -1) {
        dataRows = dataRows.slice(0, firstEmptyRowIndex);
      }

      // 6. Formatear para la tabla (Array de objetos usando el nuevo encabezado)
      const formattedData = dataRows.map((row) => {
        const obj = {};
        headerRow.forEach((header, index) => {
          if (header) obj[header] = row[index] || "";
        });
        return obj;
      });

      setAsociadoData(formattedData);
    };
    reader.readAsBinaryString(file);
  };

  // --- Procesador de DXF ---
  const handleDxf = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const parser = new DxfParser();
    try {
      const dxf = parser.parseSync(text);
      setDxfInfo({
        total: dxf.entities.length,
        layers: Object.keys(dxf.tables.layer.layers).length
      });
    } catch (err) {
      alert("Error al leer el DXF");
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Harness CAD & Data Analyzer</h1>

      <div className={styles.cardsContainer}>
        {/* Card DXF */}
        <div className={styles.card}>
          <h3>📁 Dibujo DXF</h3>
          <input type="file" onChange={handleDxf} accept=".dxf" />
          {dxfInfo && <p className={styles.statusOk}>✅ {dxfInfo.total} entidades</p>}
        </div>

        {/* Card Excel */}
        <div className={styles.card}>
          <h3>📊 Tabla Asociado (Excel)</h3>
          <input type="file" onChange={handleExcel} accept=".xlsx, .xls" />
          {asociadoData.length > 0 && <p className={styles.statusOk}>✅ {asociadoData.length} filas</p>}
        </div>
      </div>

      {/* Vista previa de la tabla */}
      {asociadoData.length > 0 && (
        <div className={styles.tableContainer}>
          <h2 style={{ color: "#3498db" }}>Vista Previa: Tabla Asociado</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                {Object.keys(asociadoData[0]).map((key) => (
                  <th key={key}>{key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {asociadoData.slice(0, 10).map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((val, j) => (
                    <td key={j}>{val}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {asociadoData.length > 10 && (
            <p style={{ textAlign: "center", color: "#666", marginTop: "10px" }}>
              Mostrando las primeras 10 filas de {asociadoData.length}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
