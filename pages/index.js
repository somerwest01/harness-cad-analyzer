import { useState } from "react";
import DxfParser from "dxf-parser";
import * as XLSX from "xlsx";
import styles from "./Home.module.css"; 

export default function Home() {
  const [dxfInfo, setDxfInfo] = useState(null);
  const [asociadoData, setAsociadoData] = useState([]);
  const [partNumber, setPartNumber] = useState("");
  const [isTableVisible, setIsTableVisible] = useState(true);

  // --- Procesador de Excel con Limpieza ---
  const handleExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // 1. Obtener matriz cruda (Array of Arrays)
      let rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      // 2. Extraer Número de Parte (Celda A4 -> índice 3)
      const pNumber = rawData[3] ? rawData[3][0] : "Desconocido";
      setPartNumber(pNumber);

      // --- FILTRO DE COLUMNAS (Eliminar C, E, H, J, M, S, T, U) ---
      const columnsToDelete = [2, 4, 7, 9, 12, 18, 19, 20];
      const filterColumns = (row) => row.filter((_, index) => !columnsToDelete.includes(index));

      // 3. Procesar Encabezado (Filas 5, 6, 7 -> índices 4, 5, 6)
      const hRow1 = filterColumns(rawData[4] || []);
      const hRow2 = filterColumns(rawData[5] || []);
      const hRow3 = filterColumns(rawData[6] || []);

      const finalHeader = hRow1.map((_, colIndex) => {
        const val1 = hRow1[colIndex] || "";
        const val2 = hRow2[colIndex] || "";
        const val3 = hRow3[colIndex] || "";
        return `${val1} ${val2} ${val3}`.trim().replace(/\s+/g, ' '); 
      });

      // 4. Procesar Datos (A partir de fila 8 -> índice 7)
      let dataRows = rawData.slice(7);

      // Encontrar fila vacía para el corte
      const firstEmptyRowIndex = dataRows.findIndex(row => 
        row.every(cell => cell === null || cell === "")
      );
      if (firstEmptyRowIndex !== -1) {
        dataRows = dataRows.slice(0, firstEmptyRowIndex);
      }

      // 5. Formatear datos finales
      const formattedData = dataRows.map((row) => {
        const filteredRow = filterColumns(row);
        const obj = {};
        obj["Status"] = "⏳ Pendiente";
        
        finalHeader.forEach((header, index) => {
          const colName = header || `Columna_${index}`;
          obj[colName] = filteredRow[index] || "";
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
        {/* Panel para DXF */}
        <div className={styles.card}>
          <h3>📁 Dibujo DXF</h3>
          <input type="file" onChange={handleDxf} accept=".dxf" />
          {dxfInfo && <p className={styles.statusOk}>✅ {dxfInfo.total} entidades detectadas</p>}
        </div>

        {/* Panel para Excel */}
        <div className={styles.card}>
          <h3>📊 Tabla Asociado (Excel)</h3>
          <input type="file" onChange={handleExcel} accept=".xlsx, .xls" />
          {asociadoData.length > 0 && <p className={styles.statusOk}>✅ Datos cargados</p>}
        </div>
      </div>

      {/* Vista previa de la tabla */}
      {asociadoData.length > 0 && (
        <div className={styles.tableContainer}>
          <div 
            className={styles.collapsibleHeader} 
            onClick={() => setIsTableVisible(!isTableVisible)}
          >
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
              Vista Previa: <span style={{ color: "#fff", fontWeight: "bold", textDecoration: 'underline' }}>{partNumber}</span>
            </h2>
            <span>{isTableVisible ? "▲ Contraer" : "▼ Expandir"}</span>
          </div>

          {isTableVisible && (
            <div className={styles.scrollArea}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {Object.keys(asociadoData[0]).map((key) => (
                      <th key={key}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {asociadoData.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((val, j) => (
                        <td key={j}>{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
