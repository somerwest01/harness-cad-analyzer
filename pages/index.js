import { useState } from "react"
import DxfParser from "dxf-parser"

export default function Home() {

  const [result,setResult] = useState(null)

  async function handleFile(e){

    const file = e.target.files[0]

    const text = await file.text()

    const parser = new DxfParser()

    try{

      const dxf = parser.parseSync(text)

      const lines = []
      const texts = []

const connectors = texts.filter(t => {

  if(!t.text) return false

  const value = t.text.toUpperCase()

  return (
    value.startsWith("C") ||
    value.startsWith("J") ||
    value.startsWith("P")
  )

})      

      for(const entity of dxf.entities){

        if(entity.type === "LINE"){

          lines.push({
            start:entity.start,
            end:entity.end,
            layer:entity.layer
          })

        }

        if(entity.type === "LWPOLYLINE"){

          lines.push({
            vertices:entity.vertices,
            layer:entity.layer
          })

        }

        if(entity.type === "TEXT" || entity.type === "MTEXT"){

          texts.push({
            text:entity.text || entity.string,
            layer:entity.layer
          })

        }

      }

setResult({
  totalEntities:dxf.entities.length,
  lineCount:lines.length,
  textCount:texts.length,
  connectorCount:connectors.length,
  connectors,
  lines,
  texts
})

    }catch(err){

      console.error(err)

      alert("Error parsing DXF")

    }

  }

  return (

    <div style={{padding:"40px",fontFamily:"Arial"}}>

      <h1>Harness CAD Analyzer</h1>

      <p>Upload DXF file</p>

      <input type="file" onChange={handleFile}/>

      {result && (

        <div>

          <h2>Results</h2>

          <p>Total Entities: {result.totalEntities}</p>
          <p>Lines: {result.lineCount}</p>
          <p>Texts: {result.textCount}</p>

          <pre style={{maxHeight:"400px",overflow:"auto"}}>
            {JSON.stringify(result,null,2)}
          </pre>

        </div>

      )}

    </div>

  )
}
