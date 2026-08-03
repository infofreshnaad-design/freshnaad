const { PrismaClient } = require('@prisma/client');

let prisma;

const prismaOptions = {
  transactionOptions: {
    maxWait: 5000,
    timeout: 15000
  }
};

if (process.env.NODE_ENV === 'production') {
  if (!global.prisma) {
    global.prisma = new PrismaClient(prismaOptions);
  }
  prisma = global.prisma;
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient(prismaOptions);
  }
  prisma = global.prisma;
}

module.exports = prisma;
