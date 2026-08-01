const getDateRange = (filter, startDate, endDate, timezoneOffset = 0) => {
  const now = new Date(); // Aug 1 07:25 UTC
  console.log("Current Time (UTC):", now.toISOString());
  
  let start = new Date(now.getTime() - (timezoneOffset * 60000));
  start.setUTCHours(0, 0, 0, 0);
  let end = new Date(now.getTime() - (timezoneOffset * 60000));
  end.setUTCHours(23, 59, 59, 999);

  console.log("Calculated local start:", start.toISOString());

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

console.log("Today:", getDateRange('Today', null, null, -330));
console.log("Month:", getDateRange('Month', null, null, -330));
console.log("Week:", getDateRange('Week', null, null, -330));
