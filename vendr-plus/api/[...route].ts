// @ts-ignore
import app from '../server/index.js'

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
}

export default async (req: any, res: any) => {
  return new Promise<void>((resolve, reject) => {
    app(req, res, (err?: any) => {
      if (err) reject(err)
      else resolve()
    })
  })
}
