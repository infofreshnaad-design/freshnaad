const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getDateRange = (filter, startDate, endDate, timezoneOffset = 0) => {
  const now = new Date();
  
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

async function main() {
  const dateRange = getDateRange('Today', null, null, -330);
  console.log("Date Range:", dateRange);
  try {
    const sales = await prisma.order.findMany({
      where: { createdAt: dateRange },
      include: { customer: true, payments: true },
      orderBy: { createdAt: 'desc' }
    });
    console.log("Success! Found", sales.length, "sales for Today (offset -330).");
  } catch (error) {
    console.error("Prisma Failed:", error.message);
  }
}

main().finally(() => prisma.$disconnect());
