export function getSuggestedDeliveryDate(receivedAt: Date): string {
  const date = new Date(receivedAt);
  const day = date.getDay(); // 0=søndag, 1=mandag, 2=tirsdag ...

  let daysUntilThursday: number;

  if (day === 0) {
    daysUntilThursday = 4;
  } else if (day === 1) {
    daysUntilThursday = 3;
  } else {
    daysUntilThursday = 11 - day;
  }

  date.setDate(date.getDate() + daysUntilThursday);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
