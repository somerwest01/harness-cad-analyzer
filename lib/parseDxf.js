import DxfParser from "dxf-parser"

export function parseDxf(text) {

  const parser = new DxfParser()
  const dxf = parser.parseSync(text)

  const lines = []
  const texts = []

  for (const entity of dxf.entities) {

    if (entity.type === "LINE") {

      lines.push({
        start: entity.start,
        end: entity.end,
        layer: entity.layer
      })
    }

    if (entity.type === "LWPOLYLINE") {

      lines.push({
        vertices: entity.vertices,
        layer: entity.layer
      })
    }

    if (entity.type === "TEXT" || entity.type === "MTEXT") {

      texts.push({
        text: entity.text,
        layer: entity.layer,
        position: entity.startPoint || entity.position
      })
    }

  }

  return {
    totalEntities: dxf.entities.length,
    lineCount: lines.length,
    textCount: texts.length,
    lines,
    texts
  }

}
