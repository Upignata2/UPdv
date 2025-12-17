export default async function handler(req: any, res: any) {
  res.status(200).json({ today: 0, month: 0, products: 0, customers: 0 })
}
