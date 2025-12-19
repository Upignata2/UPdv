export function checkSubscriptionAlert(user) {
  if (!user.subscriptionExpiry) return null
  const now = Date.now()
  const expiry = new Date(user.subscriptionExpiry).getTime()
  const daysLeft = Math.ceil((expiry - now) / (1000*60*60*24))
  
  if (daysLeft <= -3) return { type: 'access_blocked', message: 'Acesso bloqueado. Assinatura expirou' }
  if (daysLeft <= 0 && daysLeft > -3) return { type: 'expiring_soon', message: 'Assinatura vencida. Acesso sera bloqueado em ' + (-daysLeft + 3) + ' dias' }
  if (daysLeft <= 3 && daysLeft > 0) return { type: 'expiring_soon', message: 'Assinatura vence em ' + daysLeft + ' dias. Renove agora' }
  return null
}
