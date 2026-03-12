import { useState } from "react"

export default function Home() {

  const [result,setResult] = useState(null)

  async function handleFile(e){

    const file = e.target.files[0]

    const text = await file.text()

    const response = await fetch("/api/analyze",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        file:text
      })
    })

    const data = await response.json()

    setResult(data)
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
