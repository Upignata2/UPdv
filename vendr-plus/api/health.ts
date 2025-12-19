export default async (req: any, res: any) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' })
}
