import { parseDxf } from "../../lib/parseDxf"

export default function handler(req, res) {

  try {

    const { file } = req.body

    const result = parseDxf(file)

    res.status(200).json(result)

  } catch (err) {

    res.status(500).json({
      error: err.message
    })

  }

}
