import { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore
import app from '../../server/index.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default (req: VercelRequest, res: VercelResponse) => {
  app(req, res);
};

