// @ts-ignore
import app from '../server/index.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default (req: any, res: any) => {
  app(req, res)
}


