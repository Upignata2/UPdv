export default async function handler(req: any, res: any) {
  // Mock users for now to fix 404
  res.status(200).json([])
}
