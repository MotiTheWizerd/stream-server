const prisma = require('../db');

const INACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds

const checkInactiveUsers = async () => {
  try {
    const inactiveThresholdDate = new Date(Date.now() - INACTIVE_THRESHOLD);
    
    // Find and update all users who have been inactive
    await prisma.user.updateMany({
      where: {
        isOnline: true,
        lastActive: {
          lt: inactiveThresholdDate
        }
      },
      data: {
        isOnline: false
      }
    });
    
  } catch (error) {
    console.error('Inactivity checker error:', error);
  }
};

// Run the check every minute
const startInactivityChecker = () => {
  setInterval(checkInactiveUsers, 60 * 1000);
};

module.exports = { startInactivityChecker };
