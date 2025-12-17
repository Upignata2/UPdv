import app from '../../server/index.js'

export const config = {
  api: {
    bodyParser: false, // Let Express handle body parsing
    externalResolver: true, // Let Express handle response
  },
}

export default app
