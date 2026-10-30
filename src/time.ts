const TZ = 'Asia/Tokyo';

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const jstDate = (now: Date): string => dateFmt.format(now);
export const jstTime = (now: Date): string => timeFmt.format(now);
