const getDateRange = (filter, startDate, endDate, timezoneOffset = 0) => {
  const now = new Date('2026-07-31T16:30:00.000Z'); // July 31 10 PM IST
  console.log("Current Time (UTC):", now.toISOString());
  
  let start = new Date(now.getTime() - (timezoneOffset * 60000));
  start.setUTCHours(0, 0, 0, 0);
  let end = new Date(now.getTime() - (timezoneOffset * 60000));
  end.setUTCHours(23, 59, 59, 999);

  if (filter === 'Today') {
  } else if (filter === 'Week') {
    const day = start.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setUTCDate(start.getUTCDate() - diff);
  } else if (filter === 'Month') {
    start.setUTCDate(1);
  } else if (filter === 'Custom' && startDate && endDate) {
    start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);
  } else {
    start = new Date('2020-01-01');
  }

  const queryStart = new Date(start.getTime() + (timezoneOffset * 60000));
  const queryEnd = new Date(end.getTime() + (timezoneOffset * 60000));

  return { gte: queryStart, lte: queryEnd };
};

console.log("Today (July 31 10 PM IST):", getDateRange('Today', null, null, -330));
console.log("Month (July 31 10 PM IST):", getDateRange('Month', null, null, -330));
console.log("Week (July 31 10 PM IST):", getDateRange('Week', null, null, -330));
