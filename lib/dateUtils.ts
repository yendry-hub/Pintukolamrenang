const JAKARTA_OFFSET = 7 * 60 * 60 * 1000 // UTC+7 in ms

export function getTodayStartJakarta(): Date {
  const now = new Date()
  const jakartaTime = now.getTime() + JAKARTA_OFFSET
  const jakartaDate = new Date(jakartaTime)
  const jakartaStartOfDay = new Date(Date.UTC(
    jakartaDate.getUTCFullYear(),
    jakartaDate.getUTCMonth(),
    jakartaDate.getUTCDate()
  ))
  return new Date(jakartaStartOfDay.getTime() - JAKARTA_OFFSET)
}

export function getTodayEndJakarta(): Date {
  const nextDay = new Date(getTodayStartJakarta())
  nextDay.setDate(nextDay.getDate() + 1)
  return nextDay
}
